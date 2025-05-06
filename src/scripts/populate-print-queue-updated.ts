// Node built-in modules first
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import util from 'util';

// External dependencies
import { OrderItem, PrintTaskStatus, Prisma, PrismaClient, Product } from '@prisma/client';
import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import z from 'zod';

// Internal/local imports
import { fixInvalidStlRenderStatus, getOrdersToProcess, OrderWithItemsAndProducts } from '../lib/order-processing';
import { fetchAndProcessAmazonCustomization } from '../lib/orders/amazon/customization';
import { getShipstationOrders, updateOrderItemsOptionsBatch, ShipStationOrder, ShipStationOrderItem } from '../lib/shared/shipstation'; // Added ShipStationOrder, ShipStationOrderItem
import { sendSystemNotification, ErrorSeverity, ErrorCategory } from '../lib/email/system-notifications';

// Initialize database connection
const prisma = new PrismaClient();

// Load environment variables
dotenv.config();

// Helper Variables for Logging Scope
let logStream: fsSync.WriteStream | null = null;

// Setup logger (initialize basic, level set after parsing args)
let logger: pino.Logger = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.multistream([
    { stream: process.stdout }
  ])
);

// --- Zod Schemas ---
const PersonalizationDetailSchema = z.object({
  customText: z.string().nullable(),
  color1: z.string().nullable(),
  color2: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  needsReview: z.boolean().optional().default(false),
  reviewReason: z.string().nullable(),
  annotation: z.string().nullable().optional(),
});

const ItemPersonalizationResultSchema = z.object({
  personalizations: z.array(PersonalizationDetailSchema),
  overallNeedsReview: z.boolean(),
  overallReviewReason: z.string().nullable(),
});

const AiOrderResponseSchema = z.object({
  itemPersonalizations: z.record(z.string(), ItemPersonalizationResultSchema),
});

// --- Types ---
interface OrderExtractionSuccess {
  success: true;
  data: z.infer<typeof AiOrderResponseSchema>;
  promptUsed: string;
  rawResponse: string;
  modelUsed: string | null;
}

interface OrderExtractionError {
  success: false;
  error: string;
  promptUsed: string | null;
  rawResponse: string | null;
  modelUsed: string | null;
}

interface OrderDebugInfo {
  orderId: number;
  orderNumber: string;
  marketplace: string | null;
  overallStatus: string;
  promptSent: string | null;
  rawResponseReceived: string | null;
  parsedResponse: z.infer<typeof AiOrderResponseSchema> | null;
  validationError: string | null;
  processingError: string | null;
  aiProvider: string | null;
  modelUsed: string | null;
  items: Array<{
    itemId: number;
    status: string;
    error?: string;
    createdTaskIds?: number[];
    generatedTaskCount?: number; // Added to track generated tasks
  }>;
}

// Simplified options with OpenAI as primary provider
interface ProcessingOptions {
  orderId?: string;
  limit?: number;
  openaiApiKey: string | null;
  openaiModel: string;
  systemPrompt: string;
  userPromptTemplate: string;
  debug: boolean;
  verbose: boolean;
  logLevel: string;
  debugFile: string | undefined;
  forceRecreate?: boolean;
  createPlaceholder: boolean;
  confirm?: boolean;
  clearAll?: boolean;
  dryRun?: boolean;
  preserveText?: boolean;
  shipstationSyncOnly?: boolean;
}

// Define a specific type for print setting options
interface PrintSettingOption {
  name: string;
  value: Prisma.JsonValue;
}

// --- Helper Functions ---
async function loadPromptFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown file load error';
    logger.error(`Failed to load prompt file: ${filePath} - ${errorMsg}`);
    throw new Error(`Could not load prompt file: ${filePath}`);
  }
}

async function appendToDebugLog(filePath: string | undefined, data: OrderDebugInfo): Promise<void> {
  if (!filePath) return;
  try {
    const logEntry = `\n--- Entry: ${new Date().toISOString()} ---\n${util.inspect(data, { depth: null, colors: false })}\n`;
    if (logStream) logStream.write(logEntry);
    await fs.appendFile(filePath, logEntry);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown debug log write error';
    logger.error(`Failed to write to debug log file ${filePath}: ${errorMsg}`);
  }
}

async function confirmExecution(promptMessage: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${promptMessage} (yes/NO) `);
  rl.close();
  return answer.toLowerCase() === 'yes';
}

// --- Mock Script Logging ---
let runLogId: number | null = null;
const createRunLog = async (data: { scriptName: string }) => {
  logger.info('[Mock Log] Create Run Log:', data);
  runLogId = Date.now();
  return { id: runLogId };
};
const updateRunLog = async (id: number | null, data: { status: string; message?: string }) => {
  logger.info('[Mock Log] Update Run Log:', id, data);
};

// --- Replicated Helper Function ---
function extractCustomizationUrl(item: OrderItem): string | null {
  const printSettings = item.print_settings;
  if (!printSettings) return null;

  // Helper to check for the URL setting, case-insensitive for the name
  const isUrlSetting = (setting: Prisma.JsonValue): setting is { name: string; value: string } =>
    setting !== null &&
    typeof setting === 'object' &&
    !Array.isArray(setting) &&
    'name' in setting &&
    typeof setting.name === 'string' && // Ensure name is a string before lowercasing
    setting.name.toLowerCase() === 'customizedurl' && // Case-insensitive check
    'value' in setting &&
    typeof setting.value === 'string';

  if (Array.isArray(printSettings)) {
    const urlSetting = printSettings.find(isUrlSetting);
    return urlSetting ? urlSetting.value : null;
  } else if (typeof printSettings === 'object' && printSettings !== null) {
    // Check direct object property case-insensitively
    const record = printSettings as Record<string, unknown>;
    const key = Object.keys(record).find(k => k.toLowerCase() === 'customizedurl'); // Find key case-insensitively
    if (key && typeof record[key] === 'string') {
      return record[key] as string;
    }
    // Fallback check using the isUrlSetting helper (for objects structured like { name: '...', value: '...' })
    if (isUrlSetting(printSettings)) {
      return printSettings.value;
    }
  }
  return null;
}

// --- NEW HELPER FUNCTIONS ---
const isOptionObject = (opt: Prisma.JsonValue): opt is { name: string; value: Prisma.JsonValue } =>
  opt !== null && typeof opt === 'object' && !Array.isArray(opt) &&
  'name' in opt && typeof opt.name === 'string' && 'value' in opt;

// Helper function to extract color from print settings
function extractColorFromPrintSettings(item: OrderItem): string | null {
  if (!item.print_settings) return null;
  
  // Check for color in print settings
  if (Array.isArray(item.print_settings)) {
    const colorSetting = item.print_settings.find(setting =>
      isOptionObject(setting) &&
      (setting.name.toLowerCase().includes('color') ||
        setting.name.toLowerCase().includes('colour'))
    );

    if (colorSetting && isOptionObject(colorSetting) && typeof colorSetting.value === 'string') {
      return colorSetting.value;
    }
  }

  return null;
}

// Helper function to extract personalization data from eBay customer notes
function extractEbayPersonalizationData(
  customerNotes: string | null,
  item: OrderItem,
  product: Product | null
): {
  customText: string | null;
  color1: string | null;
  color2: string | null;
} {
  if (!customerNotes) return { customText: null, color1: null, color2: null };
  
  // Default return values
  let customText: string | null = null;
  let color1: string | null = null;
  let color2: string | null = null;
  
  // Extract product SKU or ID to match with notes
  const productSku = product?.sku || '';
  const productId = productSku.split('_')[1] || ''; // Extract ID part from SKU like wi_395107128418_6
  const productVariant = productSku.split('_')[2] || ''; // Extract variant part from SKU like wi_395107128418_6
  
  logger.debug(`[eBay][extractEbayPersonalizationData] Processing item with SKU=${productSku}, ID=${productId}, Variant=${productVariant}`);
  logger.debug(`[eBay][extractEbayPersonalizationData] Customer notes: ${customerNotes}`);
  
  // Parse the notes to extract personalization data
  // For eBay, we need to match the variant number with the color in the notes
  
  // First, let's extract all personalization blocks
  const personalizationBlocks: Array<{itemId: string, color: string, text: string}> = [];
  
  // Parse customer notes for eBay format
  const lines = customerNotes.split('\n');
  let currentItemId = '';
  let currentColor = '';
  let currentText = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    logger.debug(`[eBay][extractEbayPersonalizationData] Processing line: "${line}"`);
    
    if (line.startsWith('Item ID:')) {
      // If we already have data from a previous block, save it
      if (currentItemId && currentText) {
        personalizationBlocks.push({
          itemId: currentItemId,
          color: currentColor,
          text: currentText
        });
        logger.debug(`[eBay][extractEbayPersonalizationData] Added block: ID=${currentItemId}, Color=${currentColor}, Text=${currentText}`);
      }
      
      // Start a new block
      const itemIdMatch = line.match(/Item ID: (\d+)/);
      const colorMatch = line.match(/Color=([^,\n]+)/);
      
      currentItemId = itemIdMatch ? itemIdMatch[1] : '';
      currentColor = colorMatch ? colorMatch[1].trim() : '';
      currentText = '';
      
      logger.debug(`[eBay][extractEbayPersonalizationData] New block: ID=${currentItemId}, Color=${currentColor}`);
    } 
    else if (line.startsWith('Text:')) {
      // The text value is on this line after "Text:"
      currentText = line.substring(5).trim();
      logger.debug(`[eBay][extractEbayPersonalizationData] Found Text: "${currentText}"`);
    }
  }
  
  // Add the last block if it exists
  if (currentItemId && currentText) {
    personalizationBlocks.push({
      itemId: currentItemId,
      color: currentColor,
      text: currentText
    });
    logger.debug(`[eBay][extractEbayPersonalizationData] Added final block: ID=${currentItemId}, Color=${currentColor}, Text=${currentText}`);
  }
  
  logger.debug(`[eBay][extractEbayPersonalizationData] Extracted ${personalizationBlocks.length} personalization blocks`);
  
  // Now find the matching block for this product
  for (const block of personalizationBlocks) {
    logger.debug(`[eBay][extractEbayPersonalizationData] Checking block: ID=${block.itemId}, Color=${block.color}, Text=${block.text}`);
    
    // Check if this block matches our product
    const idMatches = productId === block.itemId;
    
    // Check if the color matches the variant
    const colorMatches = 
      // Direct match by variant number and color
      (productVariant === '6' && block.color === 'Light Blue') ||
      (productVariant === '15' && block.color === 'Rose Gold') ||
      // Or check if the color is in the print settings
      (Array.isArray(item.print_settings) && 
       item.print_settings.some(setting => 
         isOptionObject(setting) && 
         typeof setting.value === 'string' && 
         setting.value.toLowerCase() === block.color.toLowerCase()
       ));
    
    logger.debug(`[eBay][extractEbayPersonalizationData] Matching: ID=${idMatches}, Color=${colorMatches}, Product ID=${productId}, Variant=${productVariant}`);
    
    if (idMatches && colorMatches) {
      customText = block.text;
      color1 = block.color;
      logger.debug(`[eBay][extractEbayPersonalizationData] MATCH FOUND! Setting customText="${customText}", color1="${color1}"`);
      break;
    }
  }
  
  logger.debug(`[eBay][extractEbayPersonalizationData] Final result: customText="${customText}", color1="${color1}", color2="${color2}"`);
  return { customText, color1, color2 };
}

// MODIFIED: Added marketplace-specific logic for eBay, Amazon, and Etsy
async function extractCustomizationData(
  order: Prisma.OrderGetPayload<{ include: { items: { include: { product: true } } } }>,
  item: OrderItem,
  product: Product | null
): Promise<{
  customText: string | null;
  color1: string | null;
  color2: string | null;
  dataSource: 'AmazonURL' | 'ItemOptions' | 'CustomerNotes' | null;
  annotation: string;
}> {
  // --- Marketplace Detection ---
  const isAmazon = order.marketplace?.toLowerCase().includes('amazon');
  const isEbay = order.marketplace?.toLowerCase().includes('ebay');
  logger.info(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Marketplace='${order.marketplace}', IsAmazon=${isAmazon}, IsEbay=${isEbay}`);
  
  // Log customer notes for debugging
  if (order.customer_notes) {
    logger.info(`[Debug][extractCustomizationData] Order ${order.id} Customer Notes: ${order.customer_notes}`);
  } else {
    logger.info(`[Debug][extractCustomizationData] Order ${order.id} has no customer notes`);
  }

  // Use case-insensitive check and includes for broader matching (e.g., Amazon.com, Amazon.co.uk)
  if (isAmazon) {
    const amazonUrl = extractCustomizationUrl(item);
    logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Extracted amazonUrl='${amazonUrl}'`);
    if (amazonUrl) {
      logger.info(`[DB][Order ${order.id}][Item ${item.id}] Found Amazon CustomizedURL. Attempting to fetch...`);
      try {
        const amazonData = await fetchAndProcessAmazonCustomization(amazonUrl);
        logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: fetchAndProcessAmazonCustomization returned: ${JSON.stringify(amazonData)}`);
        if (amazonData) {
          logger.info(`[DB][Order ${order.id}][Item ${item.id}] Successfully processed Amazon URL.`);
          // REGKEY SKU rule: force uppercase registration text
          let processedCustomText = amazonData.customText;
          if (product?.sku?.toUpperCase().includes('REGKEY') && processedCustomText) {
            processedCustomText = processedCustomText.toUpperCase();
            logger.info(`[DB][Order ${order.id}][Item ${item.id}] REGKEY SKU detected, upper-casing custom text to '${processedCustomText}'.`);
          }
          return {
            customText: processedCustomText,
            color1: amazonData.color1,
            color2: amazonData.color2,
            dataSource: 'AmazonURL',
            annotation: 'Data from Amazon CustomizedURL',
          };
        } else {
          logger.warn(`[DB][Order ${order.id}][Item ${item.id}] Failed to process Amazon URL (fetch function returned null/undefined). Falling back.`);
          // Fall through to AI fallback below
        }
      } catch (amazonError) {
        logger.error(`[DB][Order ${order.id}][Item ${item.id}] Error during fetchAndProcessAmazonCustomization:`, amazonError);
        // Return null dataSource to indicate fallback needed due to error
        return {
          customText: null, // Ensure null is returned on error
          color1: null,
          color2: null,
          dataSource: null,
          annotation: `Error processing Amazon URL: ${amazonError instanceof Error ? amazonError.message : String(amazonError)}`.substring(0, 1000),
        };
      }
    } else {
      logger.debug(`[Debug][extractCustomizationData] Amazon order ${order.id}, Item ${item.id}: CustomizedURL extraction returned null. Falling back.`);
      // Fall through to AI fallback below
    }
  } else if (isEbay && order.customer_notes) {
    // --- eBay Customer Notes Extraction ---
    logger.info(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Processing eBay order with customer notes.`);
    
    try {
      // Log item details for debugging
      logger.info(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Product SKU=${product?.sku}, Name=${product?.name}`);
      logger.info(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Print Settings=${JSON.stringify(item.print_settings)}`);
      
      // Extract personalization data from eBay customer notes
      const ebayData = extractEbayPersonalizationData(order.customer_notes, item, product);
      
      logger.info(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: eBay extraction result: ${JSON.stringify(ebayData)}`);
      
      if (ebayData.customText) {
        logger.info(`[DB][Order ${order.id}][Item ${item.id}] Successfully extracted personalization from eBay customer notes.`);
        
        // REGKEY SKU rule: force uppercase registration text
        let processedCustomText = ebayData.customText;
        if (product?.sku?.toUpperCase().includes('REGKEY') && processedCustomText) {
          processedCustomText = processedCustomText.toUpperCase();
          logger.info(`[DB][Order ${order.id}][Item ${item.id}] REGKEY SKU detected, upper-casing custom text to '${processedCustomText}'.`);
        }
        
        return {
          customText: processedCustomText,
          color1: ebayData.color1 || extractColorFromPrintSettings(item),
          color2: ebayData.color2,
          dataSource: 'CustomerNotes',
          annotation: 'Data from eBay customer notes',
        };
      } else {
        logger.info(`[Debug][extractCustomizationData] eBay order ${order.id}, Item ${item.id}: No personalization found in customer notes. Falling back.`);
        // Fall through to AI fallback below
      }
    } catch (ebayError) {
      logger.error(`[DB][Order ${order.id}][Item ${item.id}] Error during eBay notes extraction:`, ebayError);
      // Fall through to AI fallback below
    }
  } else {
    logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Not identified as Amazon or eBay marketplace. Falling back.`);
    // Fall through to AI fallback below
  }

  // --- Fallback to AI ---
  logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Conditions not met for direct extraction. Falling back to AI.`);
  return {
    customText: null,
    color1: null,
    color2: null,
    dataSource: null, // Indicate fallback is needed
    annotation: 'Needs AI processing', // Annotation indicates AI is the intended next step
  };
}
