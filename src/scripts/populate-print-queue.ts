// Node built-in modules first
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import util from 'util';

// External dependencies
import { OrderItem, PrintTaskStatus, Prisma, PrismaClient } from '@prisma/client';
import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import { z } from 'zod';
// import OpenAI from 'openai'; // Import OpenAI - Use dynamically below

// Internal/local imports
import { getOrdersToProcess, OrderWithItemsAndProducts } from '../lib/order-processing';
import { fetchAndProcessAmazonCustomization } from '../lib/orders/amazon/customization';
import { getShipstationOrders, updateOrderItemsOptionsBatch } from '../lib/shared/shipstation';

// Initialize database connection
const prisma = new PrismaClient();

// Load environment variables
dotenv.config();

// Helper Variables for Logging Scope - REMOVED original console variables
// const originalConsoleLog = console.log;
// const originalConsoleWarn = console.warn;
// const originalConsoleError = console.error;
let logStream: fsSync.WriteStream | null = null;

// Setup logger (initialize basic, level set after parsing args) - MODIFIED
// Initialize logger later, after logStream is created
let logger: pino.Logger;

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

type OrderExtractionResult = OrderExtractionSuccess | OrderExtractionError;

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
  }>;
}

// Simplified options with OpenAI as primary provider
interface ProcessingOptions {
  orderId?: string; // Changed type to string to accept any identifier
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
  preserveText?: boolean; // Added flag to preserve existing text values
  shipstationSyncOnly?: boolean; // Added flag to only sync ShipStation without changing DB
}

// --- Helper Functions ---
async function loadPromptFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown file load error'
    logger.error(`Failed to load prompt file: ${filePath} - ${errorMsg}`)
    throw new Error(`Could not load prompt file: ${filePath}`)
  }
}

async function appendToDebugLog(filePath: string | undefined, data: OrderDebugInfo): Promise<void> {
  if (!filePath) return;
  try {
    const logEntry = `\n--- Entry: ${new Date().toISOString()} ---\n${util.inspect(data, { depth: null, colors: false })}\n`;
    if (logStream) logStream.write(logEntry); // Also write debug data to main log file if stream exists
    await fs.appendFile(filePath, logEntry);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown debug log write error';
    logger.error(`Failed to write to debug log file ${filePath}: ${errorMsg}`);
    // REMOVED console.error(errorMsg);
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
/**
 * Extracts the customization URL from various print_settings formats.
 */
function extractCustomizationUrl(item: OrderItem): string | null {
  const printSettings = item.print_settings;

  if (!printSettings) return null;

  // Handle array format: [{name: 'CustomizedURL', value: 'https://...'}]
  if (Array.isArray(printSettings)) {
    const urlSetting = printSettings.find(
      setting =>
        setting &&
        typeof setting === 'object' &&
        'name' in setting &&
        setting.name === 'CustomizedURL'
    );
    if (
      urlSetting &&
      typeof urlSetting === 'object' &&
      'value' in urlSetting &&
      typeof urlSetting.value === 'string'
    ) {
      return urlSetting.value;
    }
  }
  // Handle object format: {CustomizedURL: 'https://...'}
  else if (typeof printSettings === 'object') {
    // Safer access for object format
    const settingsRecord = printSettings as Record<string, unknown>;
    if ('CustomizedURL' in settingsRecord && typeof settingsRecord.CustomizedURL === 'string') {
      return settingsRecord.CustomizedURL;
    }
  }

  // Log if URL couldn't be extracted but print_settings exist
  // logger.debug(`[Amazon Sync] Could not extract CustomizedURL from item ${item.id}`, { printSettings }); // Logger not available here
  return null;
}

// --- AI Extraction Logic (Order Level) ---
async function extractOrderPersonalization(
  order: OrderWithItemsAndProducts,
  options: Pick<
    ProcessingOptions,
    'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
  >
): Promise<OrderExtractionResult> {
  const simplifiedItems = order.items.map(item => ({
    itemId: item.id,
    quantityOrdered: item.quantity,
    productSku: item.product?.sku,
    productName: item.product?.name,
    printSettings: item.print_settings,
  }));

  const inputData = {
    orderId: order.id,
    orderNumber: order.shipstation_order_number,
    marketplace: order.marketplace,
    customerNotes: order.customer_notes,
    items: simplifiedItems,
  };

  const inputDataJson = JSON.stringify(inputData, null, 2);
  const userPromptContent = options.userPromptTemplate.replace('{INPUT_DATA_JSON}', inputDataJson);
  const systemPromptContent = options.systemPrompt;
  const fullPromptForDebug = `System:\n${systemPromptContent}\n\nUser:\n${userPromptContent}`;

  logger.debug(`[AI][Order ${order.id}] Preparing extraction...`);
  logger.trace(`[AI][Order ${order.id}] Input Data JSON:\n${inputDataJson}`);
  logger.debug(
    `[AI][Order ${order.id}] Prompt lengths: System=${systemPromptContent.length}, User=${userPromptContent.length}`
  );
  logger.debug(`[AI][Order ${order.id}] System Prompt:\n${systemPromptContent}`);
  logger.debug(`[AI][Order ${order.id}] User Prompt:\n${userPromptContent}`);

  // Define types for API interaction within this function scope
  interface ApiMessage {
    role: 'system' | 'user';
    content: string;
  }
  interface ResponseFormat {
    type: 'json_object';
  }
  interface ApiPayload {
    model: string;
    messages: ApiMessage[];
    temperature: number;
    max_tokens: number;
    response_format: ResponseFormat;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  }

  let rawResponse: string | null = null;
  const modelUsed = options.openaiModel;
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  const apiKey = options.openaiApiKey;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  const startTime = Date.now();

  try {
    // Check for API key
    if (!apiKey) throw new Error('OpenAI API key missing');

    logger.info(`[AI][Order ${order.id}] Calling OpenAI (${modelUsed})...`);

    const apiPayload: ApiPayload = {
      model: modelUsed,
      messages: [
        { role: 'system', content: systemPromptContent },
        { role: 'user', content: userPromptContent },
      ],
      temperature: 0.0,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      max_tokens: 4096, // Increased from 2048 to 4096 to handle larger responses
      response_format: { type: 'json_object' },
    };

    // Use JSON.stringify for payload logging as it might be large/complex
    logger.debug(
      { provider: 'openai', url: apiUrl, headers: { ...headers, Authorization: '***' } },
      `[AI][Order ${order.id}] Sending API Request`
    );
    logger.trace(`[AI][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`); // Log full payload at trace level

    // Make the API call
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(apiPayload),
    });

    const duration = Date.now() - startTime;
    logger.info(
      `[AI][Order ${order.id}] Call response status: ${response.status} (${duration}ms).`
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        { status: response.status, body: errorBody },
        `[AI][Order ${order.id}] API error`
      );
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    const result = await response.json();
    logger.debug({ response: result }, `[AI][Order ${order.id}] API Raw Response Object`);

    // Extract content from OpenAI response
    rawResponse = result.choices?.[0]?.message?.content?.trim() ?? null;

    // --- BEGIN ADDITION ---
    // Log the raw response specifically for the target order for easier debugging
    if (order.id === 29373) {
      logger.info(`[AI Raw Response for Order ${order.id}]:\n${rawResponse}`);
    }
    // --- END ADDITION ---

    if (!rawResponse) {
      logger.warn({ result }, `[AI][Order ${order.id}] OpenAI returned empty response content.`);
      throw new Error('OpenAI returned empty response content.');
    }
    logger.debug(`[AI][Order ${order.id}] RAW RESPONSE Content:\n${rawResponse}`);

    let responseJson: unknown;
    try {
      // Attempt to clean potential markdown fences (though JSON mode should prevent this)
      const cleanedContent = rawResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');

      // Check for truncated JSON and attempt to fix it
      let contentToProcess = cleanedContent;
      if (!cleanedContent.trim().endsWith('}')) {
        logger.warn(
          `[AI][Order ${order.id}] Detected truncated JSON response. Attempting to fix...`
        );
        // Find the last complete object by looking for the last closing brace of an item
        const lastCompleteObjectMatch = cleanedContent.match(/\}\s*\}\s*\}\s*\}[^\}]*$/g);
        if (lastCompleteObjectMatch) {
          // Add closing braces to complete the JSON structure
          contentToProcess =
            cleanedContent.substring(
              0,
              cleanedContent.lastIndexOf(lastCompleteObjectMatch[0]) +
              lastCompleteObjectMatch[0].length
            ) + '\n  }\n}';
          logger.info(`[AI][Order ${order.id}] Fixed truncated JSON by adding closing braces.`);
        } else {
          // If we can't find a pattern to fix, try a more aggressive approach
          // Find the last complete item entry
          const lastItemMatch = cleanedContent.match(
            /"\d+"\s*:\s*\{[^\{\}]*"personalizations"\s*:\s*\[[^\[\]]*\][^\{\}]*\}/g
          );
          if (lastItemMatch && lastItemMatch.length > 0) {
            const lastItem = lastItemMatch[lastItemMatch.length - 1];
            const itemId = lastItem.match(/"(\d+)"/)?.[1];
            if (itemId) {
              // Reconstruct the JSON with only the items we have complete data for
              const truncationPoint = cleanedContent.lastIndexOf(lastItem) + lastItem.length;
              contentToProcess = cleanedContent.substring(0, truncationPoint) + '\n  }\n}';
              logger.info(
                `[AI][Order ${order.id}] Fixed truncated JSON by keeping complete items up to item ${itemId}.`
              );
            }
          }
        }
      }

      responseJson = JSON.parse(contentToProcess);
      logger.debug(`[AI][Order ${order.id}] Parsed JSON response.`);
      logger.debug(
        `[AI][Order ${order.id}] Parsed JSON Object:\n${JSON.stringify(responseJson, null, 2)}`
      );
    } catch (e) {
      logger.error({ err: e, rawResponse }, `[AI][Order ${order.id}] Failed to parse AI JSON`);
      throw new Error(`Failed to parse AI JSON: ${(e as Error).message}.`); // Don't include raw response in error message
    }

    const validationResult = AiOrderResponseSchema.safeParse(responseJson);
    if (!validationResult.success) {
      const errorString = JSON.stringify(validationResult.error.format(), null, 2);
      logger.error(`[AI][Order ${order.id}] Zod validation failed: ${errorString}`);
      throw new Error(`AI response validation failed: ${errorString}`);
    }

    logger.info(`[AI][Order ${order.id}] AI response validated.`);

    // Log AI call to database
    try {
      const tasksGenerated = Object.values(validationResult.data.itemPersonalizations).reduce(
        (sum, item) => sum + item.personalizations.length,
        0
      );

      const needsReviewCount = Object.values(validationResult.data.itemPersonalizations).reduce(
        (sum, item) => sum + (item.overallNeedsReview ? 1 : 0),
        0
      );

      await prisma.aiCallLog.create({
        data: {
          scriptName: 'populate-print-queue',
          orderId: order.id,
          orderNumber: order.shipstation_order_number || null,
          marketplace: order.marketplace || null,
          aiProvider: 'openai',
          modelUsed: modelUsed || 'unknown',
          promptSent: fullPromptForDebug,
          rawResponse: rawResponse,
          processingTimeMs: Date.now() - startTime,
          success: true,
          tasksGenerated,
          needsReviewCount,
        },
      });
      logger.debug(`[AI][Order ${order.id}] AI call logged to database`);
    } catch (logError) {
      logger.error(
        `[AI][Order ${order.id}] Failed to log AI call to database: ${logError instanceof Error ? logError.message : String(logError)}`
      );
    }

    return {
      success: true,
      data: validationResult.data,
      promptUsed: fullPromptForDebug,
      rawResponse,
      modelUsed,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown AI extraction error';
    logger.error(`[AI][Order ${order.id}] Extraction failed: ${errorMsg}`, error);

    // Log failed AI call to database
    try {
      await prisma.aiCallLog.create({
        data: {
          scriptName: 'populate-print-queue',
          orderId: order.id,
          orderNumber: order.shipstation_order_number || null,
          marketplace: order.marketplace || null,
          aiProvider: 'openai',
          modelUsed: modelUsed || 'unknown',
          promptSent: fullPromptForDebug,
          rawResponse: rawResponse || '',
          processingTimeMs: Date.now() - startTime,
          success: false,
          errorMessage: errorMsg,
          tasksGenerated: 0,
          needsReviewCount: 0,
        },
      });
      logger.debug(`[AI][Order ${order.id}] Failed AI call logged to database`);
    } catch (logError) {
      logger.error(
        `[AI][Order ${order.id}] Failed to log AI error to database: ${logError instanceof Error ? logError.message : String(logError)}`
      );
    }

    return {
      success: false,
      error: errorMsg,
      promptUsed: fullPromptForDebug,
      rawResponse,
      modelUsed,
    };
  }
}

// --- Database Task Creation Logic ---
async function createOrUpdateTasksInTransaction(
  tx: Prisma.TransactionClient,
  order: OrderWithItemsAndProducts,
  aiData: z.infer<typeof AiOrderResponseSchema>, // AI data is still needed as fallback
  options: ProcessingOptions,
  orderDebugInfo: OrderDebugInfo
): Promise<{ tasksCreatedCount: number; tasksSkippedCount: number; itemsNeedReviewCount: number }> {
  logger.info(`[DB][Order ${order.id}] Upserting tasks in transaction...`);
  let tasksCreatedCount = 0;
  const tasksSkippedCount = 0; // This variable seems unused, consider removing if not needed later
  let itemsNeedReviewCount = 0;

  // Load existing task data if we need to preserve text
  let existingTaskData: Record<
    number,
    Array<{ custom_text: string | null; color_1: string | null; color_2: string | null }>
  > = {};
  if (options.preserveText) {
    logger.info(
      `[DB][Order ${order.id}] Preserve text flag enabled. Loading existing task data...`
    );
    existingTaskData = await getExistingTaskData(tx, order.id);
  }

  // Collect ShipStation option patches to send in one batch call per order
  const itemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
  const patchReasons: string[] = [];

  for (const item of order.items) {
    const orderItemId = item.id;
    const productId = item.productId;
    const product = item.product;
    const shorthandName = product?.name?.substring(0, 100) ?? 'Unknown Product';

    let itemDebugEntry = orderDebugInfo.items.find(i => i.itemId === item.id);
    if (!itemDebugEntry) {
      itemDebugEntry = { itemId: item.id, status: 'Processing Transaction', createdTaskIds: [] };
      orderDebugInfo.items.push(itemDebugEntry);
    } else {
      itemDebugEntry.status = 'Processing Transaction';
      itemDebugEntry.createdTaskIds = [];
    }

    // --- Start Refactored Logic ---
    let dataSource: 'AmazonURL' | 'AI' | 'Placeholder' | 'eBaySpecial' | 'Skipped' = 'AI'; // Default to AI
    let finalCustomText: string | null = null;
    let finalColor1: string | null = null;
    let finalColor2: string | null = null;
    let finalQuantity: number = item.quantity; // Default to item quantity
    let finalNeedsReview: boolean = false;
    let finalReviewReason: string | null = null;
    const finalAnnotation: string | null = null;
    const taskDetailsToCreate: Array<
      Omit<
        Prisma.PrintOrderTaskCreateInput,
        | 'order'
        | 'orderItem'
        | 'product'
        | 'customer'
        | 'taskIndex'
        | 'shorthandProductName'
        | 'marketplace_order_number'
        | 'ship_by_date'
      >
    > = [];

    // 1. Check for Amazon URL
    if (order.marketplace?.toLowerCase().includes('amazon')) {
      const customizedUrl = extractCustomizationUrl(item);
      if (customizedUrl) {
        logger.info(
          `[DB][Order ${order.id}][Item ${orderItemId}] Found Amazon CustomizedURL. Attempting to fetch...`
        );
        try {
          const amazonData = await fetchAndProcessAmazonCustomization(customizedUrl);
          if (amazonData) {
            // REGKEY SKU rule: force uppercase registration text once for all subsequent use
            if (product?.sku?.toUpperCase().includes('REGKEY') && amazonData.customText) {
              amazonData.customText = amazonData.customText.toUpperCase();
              logger.info(
                `[DB][Order ${order.id}][Item ${orderItemId}] REGKEY SKU detected, upper‑casing custom text to '${amazonData.customText}'.`
              );
            }

            // --- Update ShipStation Item Options ---
            if (!options.dryRun) {
              // Ensure we have the necessary IDs and data to update ShipStation
              if (
                order.shipstation_order_id &&
                item.shipstationLineItemKey &&
                (amazonData.customText || amazonData.color1 || amazonData.color2)
              ) {
                // Check all potential data points
                logger.info(
                  `[ShipStation Update][Order ${order.id}][Item ${item.id}] Preparing to update item options. Fetching current order details...`
                );
                try {
                  // Fetch the full order details from ShipStation first
                  const ssOrderResponse = await getShipstationOrders({
                    orderId: Number(order.shipstation_order_id),
                  });

                  if (
                    ssOrderResponse &&
                    ssOrderResponse.orders &&
                    ssOrderResponse.orders.length > 0
                  ) {
                    const ssOrder = ssOrderResponse.orders[0];
                    // *** Log the fetched ShipStation order for debugging ***
                    logger.debug(
                      { fetchedSsOrder: ssOrder },
                      `[ShipStation Update][Order ${order.id}] Fetched ShipStation order details.`
                    );

                    // *** REMOVED check for order status ***
                    // Construct the options array using consistent names ("Colour 1", "Colour 2", "Name or Text")
                    const ssOptions = [];
                    if (amazonData.customText) {
                      // Use the same name as the AI path for consistency
                      ssOptions.push({ name: 'Name or Text', value: amazonData.customText });
                    }
                    if (amazonData.color1) {
                      // Use the same name as the AI path
                      ssOptions.push({ name: 'Colour 1', value: amazonData.color1 });
                    }
                    // Add color2 if it exists, using the consistent name
                    if (amazonData.color2) {
                      ssOptions.push({ name: 'Colour 2', value: amazonData.color2 });
                    }

                    if (ssOptions.length > 0) {
                      itemsToPatch[item.shipstationLineItemKey] = ssOptions;
                      patchReasons.push(item.shipstationLineItemKey);
                    }
                  } else {
                    logger.error(
                      `[ShipStation Update][Order ${order.id}][Item ${item.id}] Failed to fetch order details from ShipStation.`
                    );
                  }
                } catch (fetchOrUpdateError) {
                  logger.error(
                    `[ShipStation Update][Order ${order.id}][Item ${item.id}] Error during ShipStation fetch or update process:`,
                    fetchOrUpdateError
                  );
                }
              } else {
                logger.warn(
                  `[ShipStation Update][Order ${order.id}][Item ${item.id}] Cannot update ShipStation item options: Missing required IDs or extracted data.`
                );
              }
            } else {
              // Log dry run intention
              if (
                order.shipstation_order_id &&
                item.shipstationLineItemKey &&
                (amazonData.customText || amazonData.color1 || amazonData.color2)
              ) {
                logger.info(
                  `[Dry Run][ShipStation Update][Order ${order.id}][Item ${item.id}] Would fetch order and attempt to update item options.`
                );
              }
            }
            // --- End ShipStation Item Options Update ---
            logger.info(
              `[DB][Order ${order.id}][Item ${orderItemId}] Successfully processed Amazon URL.`
            );

            // Check if we need to preserve existing text
            let customText = amazonData.customText;
            if (
              options.preserveText &&
              existingTaskData[orderItemId] &&
              existingTaskData[orderItemId].length > 0
            ) {
              const existingTask = existingTaskData[orderItemId][0];
              if (existingTask.custom_text) {
                customText = existingTask.custom_text;
                logger.info(
                  `[DB][Order ${order.id}][Item ${orderItemId}] Preserving existing text: "${customText}" instead of "${amazonData.customText}"`
                );
              }
            }

            // Use Amazon data directly - Assuming single task per item from URL for now
            taskDetailsToCreate.push({
              custom_text: customText, // Use preserved text if available
              color_1: amazonData.color1,
              color_2: amazonData.color2,
              quantity: item.quantity, // Use original item quantity
              needs_review: false,
              review_reason: null,
              status: PrintTaskStatus.pending,
              annotation:
                options.preserveText && customText !== amazonData.customText
                  ? 'Data from Amazon CustomizedURL (text preserved from existing task)'
                  : 'Data from Amazon CustomizedURL',
            });
            dataSource = 'AmazonURL';
          } else {
            logger.warn(
              `[DB][Order ${order.id}][Item ${orderItemId}] Failed to process Amazon URL. Falling back to AI/Placeholder.`
            );
            finalNeedsReview = true;
            finalReviewReason = 'Failed Amazon URL fetch';
            dataSource = 'Placeholder'; // Mark as placeholder if URL fetch fails
          }
        } catch (amazonError) {
          logger.error(
            `[DB][Order ${order.id}][Item ${orderItemId}] Error fetching/processing Amazon URL:`,
            amazonError
          );
          finalNeedsReview = true;
          finalReviewReason =
            `Error processing Amazon URL: ${amazonError instanceof Error ? amazonError.message : String(amazonError)}`.substring(
              0,
              1000
            );
          dataSource = 'Placeholder'; // Mark as placeholder on error
        }
      }

      // 2. eBay Special Case (Only if not already processed by Amazon URL)
      if (
        dataSource !== 'AmazonURL' &&
        order.marketplace?.toLowerCase().includes('ebay') &&
        order.customer_notes?.includes('Personalisation:')
      ) {
        // Attempt eBay special case logic (simplified for integration)
        logger.info(
          `[Order ${order.id}][Item ${orderItemId}] Attempting eBay special case parsing...`
        );
        // ... (Keep the eBay parsing logic from lines 428-543 here) ...
        // If successful, populate taskDetailsToCreate and set dataSource = 'eBaySpecial'
        // For brevity, assuming the existing eBay logic populates taskDetailsToCreate correctly if a match is found
        // Need to adapt the existing logic slightly to push to taskDetailsToCreate instead of directly upserting
        // --- Start eBay Logic Adaptation ---
        const customerNotes = order.customer_notes || '';
        let itemColor = null;
        if (
          item.print_settings &&
          typeof item.print_settings === 'object' &&
          Array.isArray(item.print_settings)
        ) {
          const colorSetting = item.print_settings.find(
            s => typeof s === 'object' && s !== null && 'name' in s && s.name === 'Color'
          );
          if (colorSetting && typeof colorSetting === 'object' && 'value' in colorSetting)
            itemColor = String(colorSetting.value);
        }
        if (!itemColor && product?.name) {
          const colorMatch = product.name.match(/\[(.*?)\]/);
          if (colorMatch && colorMatch[1]) itemColor = colorMatch[1];
        }

        if (itemColor) {
          const personalizations: { variationId: string; text: string }[] = [];
          const regex = /Item ID: \d+ Variation: (\d+)[\s\S]*?Text: ([^\n]+)/g;
          let match;
          while ((match = regex.exec(customerNotes)) !== null)
            personalizations.push({ variationId: match[1], text: match[2].trim() });

          const itemIndex = order.items.findIndex(i => i.id === orderItemId);
          if (itemIndex >= 0 && itemIndex < personalizations.length) {
            const personalization = personalizations[itemIndex];

            // Check if we need to preserve existing text
            let customText = personalization.text;
            if (
              options.preserveText &&
              existingTaskData[orderItemId] &&
              existingTaskData[orderItemId].length > 0
            ) {
              const existingTask = existingTaskData[orderItemId][0];
              if (existingTask.custom_text) {
                customText = existingTask.custom_text;
                logger.info(
                  `[DB][Order ${order.id}][Item ${orderItemId}] Preserving existing text: "${customText}" instead of "${personalization.text}"`
                );
              }
            }

            logger.info(
              `[Order ${order.id}][Item ${orderItemId}] eBay Special Case: Matched personalization by position.`
            );
            taskDetailsToCreate.push({
              custom_text: customText, // Use preserved text if available
              color_1: itemColor,
              color_2: null,
              quantity: item.quantity,
              needs_review: false,
              review_reason: null,
              status: PrintTaskStatus.pending,
              annotation:
                options.preserveText && customText !== personalization.text
                  ? 'Data from eBay Customer Notes (Special Case, text preserved from existing task)'
                  : 'Data from eBay Customer Notes (Special Case)',
            });
            dataSource = 'eBaySpecial';
          }
        }
        // --- End eBay Logic Adaptation ---
      }

      // 3. AI Data Fallback / Primary Source (if not handled by Amazon/eBay)
      if (dataSource === 'AI') {
        const itemResult = aiData.itemPersonalizations[item.id.toString()];
        if (!itemResult || itemResult.personalizations.length === 0) {
          const reason = !itemResult ? 'No AI data for item' : 'AI returned zero personalizations';
          logger.warn(
            `[Order ${order.id}][Item ${orderItemId}] No AI data found. Creating placeholder.`
          );
          dataSource = 'Placeholder';
          finalNeedsReview = true;
          finalReviewReason = reason.substring(0, 1000);
          finalCustomText = 'Placeholder - Review Needed';
          finalColor1 = null;
          finalColor2 = null;
          finalQuantity = item.quantity;
          taskDetailsToCreate.push({
            custom_text: finalCustomText,
            color_1: finalColor1,
            color_2: finalColor2,
            quantity: finalQuantity,
            needs_review: finalNeedsReview,
            review_reason: finalReviewReason,
            status: PrintTaskStatus.pending,
            annotation: finalAnnotation,
          });
        } else {
          logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Using AI data.`);
          let itemRequiresReview = itemResult.overallNeedsReview || false;
          const itemReviewReasons: string[] = itemResult.overallReviewReason
            ? [itemResult.overallReviewReason]
            : [];
          let totalQuantityFromAI = 0;
          itemResult.personalizations.forEach(p => (totalQuantityFromAI += p.quantity));
          if (totalQuantityFromAI !== item.quantity) {
            logger.warn(
              `[Order ${order.id}][Item ${orderItemId}] REVIEW NEEDED: AI Quantity Mismatch!`
            );
            itemRequiresReview = true;
            itemReviewReasons.push(
              `Qty Mismatch (AI: ${totalQuantityFromAI}, Order: ${item.quantity})`
            );
          }

          // ShipStation update logic moved below, after successful task upsert
          for (let i = 0; i < itemResult.personalizations.length; i++) {
            const detail = itemResult.personalizations[i];
            const combinedNeedsReview = itemRequiresReview || detail.needsReview;
            const detailReason = detail.needsReview ? detail.reviewReason : null;
            const annotationReason =
              combinedNeedsReview && detail.annotation ? `Annotation: ${detail.annotation}` : null;
            const reviewReasonCombined =
              Array.from(
                new Set([
                  ...itemReviewReasons,
                  ...(detailReason ? [detailReason] : []),
                  ...(annotationReason ? [annotationReason] : []),
                ])
              )
                .filter(Boolean)
                .join('; ')
                .substring(0, 1000) || null;

            // Check if we need to preserve existing text
            let customText = detail.customText;
            let annotation = detail.annotation;

            if (
              options.preserveText &&
              existingTaskData[orderItemId] &&
              i < existingTaskData[orderItemId].length
            ) {
              const existingTask = existingTaskData[orderItemId][i];
              if (existingTask.custom_text) {
                customText = existingTask.custom_text;
                const preservedTextMessage = `Preserved original text: "${customText}" instead of AI-suggested: "${detail.customText}"`;
                logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] ${preservedTextMessage}`);
                annotation = annotation
                  ? `${annotation}; ${preservedTextMessage}`
                  : preservedTextMessage;
              }
            }

            if (detail.annotation) {
              logger.info(
                `[AI Annotation][Order ${order.id}][Item ${orderItemId}]: ${detail.annotation}`
              );
            }

            taskDetailsToCreate.push({
              custom_text: customText, // Use preserved text if available
              color_1: detail.color1,
              color_2: detail.color2,
              quantity: detail.quantity,
              needs_review: combinedNeedsReview,
              review_reason: reviewReasonCombined,
              status: PrintTaskStatus.pending,
              annotation: annotation, // Use updated annotation that includes the preserved text info
            });
            if (combinedNeedsReview) itemsNeedReviewCount++;
          }
          itemDebugEntry.status = itemRequiresReview ? 'Success (Needs Review)' : 'Success'; // Set status based on AI review flag
        }
      } else if (dataSource === 'Placeholder' && taskDetailsToCreate.length === 0) {
        // Ensure placeholder is created if Amazon fetch failed and no AI fallback occurred

        // Check if we need to preserve existing text even for placeholder
        let customText = 'Placeholder - Review Needed';
        if (
          options.preserveText &&
          existingTaskData[orderItemId] &&
          existingTaskData[orderItemId].length > 0
        ) {
          const existingTask = existingTaskData[orderItemId][0];
          if (existingTask.custom_text) {
            customText = existingTask.custom_text;
            logger.info(
              `[DB][Order ${order.id}][Item ${orderItemId}] Preserving existing text for placeholder: "${customText}"`
            );
          }
        }

        taskDetailsToCreate.push({
          custom_text: customText,
          color_1: null,
          color_2: null,
          quantity: item.quantity,
          needs_review: true,
          review_reason: finalReviewReason ?? 'Placeholder due to processing error',
          status: PrintTaskStatus.pending,
          annotation:
            options.preserveText && customText !== 'Placeholder - Review Needed'
              ? 'Placeholder with preserved text from existing task'
              : null,
        });
        itemsNeedReviewCount++;
        itemDebugEntry.status = 'Placeholder Created';
      } else if (dataSource === 'AmazonURL' || dataSource === 'eBaySpecial') {
        itemDebugEntry.status = 'Success (' + dataSource + ')';
      } else {
        itemDebugEntry.status = 'Skipped (Unknown Reason)'; // Should not happen ideally
      }

      // 4. Upsert Tasks based on collected details
      itemDebugEntry.createdTaskIds = [];
      let currentTaskIndex = 0;
      for (const taskDetail of taskDetailsToCreate) {
        const taskData: Prisma.PrintOrderTaskCreateInput = {
          order: { connect: { id: order.id } },
          orderItem: { connect: { id: orderItemId } },
          product: { connect: { id: productId } },
          taskIndex: currentTaskIndex,
          shorthandProductName: shorthandName,
          customer: order.customerId ? { connect: { id: order.customerId } } : undefined,
          quantity: taskDetail.quantity,
          custom_text: taskDetail.custom_text,
          color_1: taskDetail.color_1,
          color_2: taskDetail.color_2,
          ship_by_date: order.ship_by_date,
          needs_review: taskDetail.needs_review,
          review_reason: taskDetail.review_reason,
          status: taskDetail.status, // Should be PrintTaskStatus.pending
          marketplace_order_number: order.shipstation_order_number,
          annotation: taskDetail.annotation, // Add annotation
        };

        if (options.dryRun) {
          logger.info(
            `[Dry Run][Order ${order.id}][Item ${orderItemId}] Would upsert task ${currentTaskIndex} from ${dataSource}. Review: ${taskDetail.needs_review}`
          );
        } else {
          try {
            const upsertData = {
              where: {
                orderItemId_taskIndex: { orderItemId: orderItemId, taskIndex: currentTaskIndex },
              },
              update: {
                shorthandProductName: taskData.shorthandProductName,
                custom_text: taskData.custom_text,
                color_1: taskData.color_1,
                color_2: taskData.color_2,
                quantity: taskData.quantity,
                needs_review: taskData.needs_review,
                review_reason: taskData.review_reason,
                status: taskData.status, // Use enum
                ship_by_date: taskData.ship_by_date,
                marketplace_order_number: taskData.marketplace_order_number,
                annotation: taskData.annotation, // Add annotation to update
              },
              create: taskData,
            };
            logger.debug(
              `[DB][Order ${order.id}][Item ${orderItemId}][Task ${currentTaskIndex}] Preparing to UPSERT task from ${dataSource} with data:`,
              upsertData
            );
            const task = await tx.printOrderTask.upsert(upsertData);
            logger.info(
              `[DB][Order ${order.id}][Item ${orderItemId}][Task ${currentTaskIndex}] Upserted task ${task.id} from ${dataSource}.`
            );

            // --- BEGIN ShipStation Update (Post Task Upsert) ---
            // Update Shipstation only if the task came from AI and upsert succeeded
            if (dataSource === 'AI' && item.shipstationLineItemKey && order.shipstation_order_id) {
              if (options.dryRun) {
                logger.info(
                  `[Dry Run][ShipStation Update][Order ${order.id}][Item ${orderItemId}][Task ${task.id}] Would fetch order and attempt to update item options using task data.`
                );
              } else {
                logger.info(
                  `[ShipStation Update][Order ${order.id}][Item ${orderItemId}][Task ${task.id}] Task upserted, preparing ShipStation update...`
                );
                try {
                  // Fetch fresh order data from ShipStation *before* updating
                  const ssOrderResponse = await getShipstationOrders({
                    orderId: Number(order.shipstation_order_id),
                  });
                  if (
                    ssOrderResponse &&
                    ssOrderResponse.orders &&
                    ssOrderResponse.orders.length > 0
                  ) {
                    const ssOrder = ssOrderResponse.orders[0];
                    logger.debug(
                      { fetchedSsOrder: ssOrder },
                      `[ShipStation Update][Order ${order.id}][Item ${orderItemId}] Fetched ShipStation order details.`
                    );

                    // Construct options from the task data that was just saved
                    const ssOptions = [];
                    if (taskDetail.custom_text) {
                      ssOptions.push({ name: 'Name or Text', value: taskDetail.custom_text });
                    }
                    if (taskDetail.color_1) {
                      ssOptions.push({ name: 'Colour 1', value: taskDetail.color_1 });
                    }
                    if (taskDetail.color_2) {
                      ssOptions.push({ name: 'Colour 2', value: taskDetail.color_2 });
                    }

                    if (ssOptions.length > 0) {
                      itemsToPatch[item.shipstationLineItemKey] = ssOptions;
                      patchReasons.push(item.shipstationLineItemKey);
                    }
                  } else {
                    logger.error(
                      `[ShipStation Update][Order ${order.id}][Item ${orderItemId}][Task ${task.id}] Failed to fetch order details from ShipStation.`
                    );
                  }
                } catch (fetchOrUpdateError) {
                  // Log failure but don't throw, allow transaction to commit task data
                  logger.error(
                    `[ShipStation Update][Order ${order.id}][Item ${orderItemId}][Task ${task.id}] Error during ShipStation fetch or update process:`,
                    fetchOrUpdateError
                  );
                }
              }
            } else if (
              dataSource === 'AI' &&
              (!item.shipstationLineItemKey || !order.shipstation_order_id)
            ) {
              logger.warn(
                `[ShipStation Update][Order ${order.id}][Item ${orderItemId}] Skipping update for AI task: Missing shipstationLineItemKey or shipstation_order_id.`
              );
            }
            // --- END ShipStation Update (Post Task Upsert) ---
            tasksCreatedCount++;
            itemDebugEntry.createdTaskIds.push(task.id);
          } catch (e) {
            logger.error(
              `[DB][Order ${order.id}][Item ${orderItemId}] FAILED upsert task ${currentTaskIndex} from ${dataSource}:`,
              e
            );
            itemDebugEntry.status = 'Failed'; // Update item status on failure
            itemDebugEntry.error = e instanceof Error ? e.message : String(e);
            // Decide whether to throw or just log and continue with next item/order
            throw e; // Re-throwing will rollback the transaction for the whole order
          }
        }
        currentTaskIndex++;
      }
      logger.info(
        `[DB][Order ${order.id}][Item ${orderItemId}] Processed. Tasks: ${currentTaskIndex}. Status: ${itemDebugEntry.status}`
      );

      // --- End Refactored Logic ---
    } // End item loop

    // Batch ShipStation update once per order
    if (!options.dryRun && Object.keys(itemsToPatch).length > 0 && order.shipstation_order_id) {
      try {
        const ssOrderResp = await getShipstationOrders({ orderId: Number(order.shipstation_order_id) });
        if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
          const auditNote = `AI sync ${new Date().toISOString()} -> ${patchReasons.join(', ')}`;
          await updateOrderItemsOptionsBatch(ssOrderResp.orders[0], itemsToPatch, auditNote);
        }
      } catch (batchErr) {
        logger.error(`[ShipStation Batch][Order ${order.id}] Error during batch update`, batchErr);
      }
    }
  } // End item loop
  return { tasksCreatedCount, tasksSkippedCount, itemsNeedReviewCount };
}

// --- Adding new helper function to store task data ---
async function getExistingTaskData(
  tx: Prisma.TransactionClient,
  orderId: number
): Promise<
  Record<
    number,
    Array<{ custom_text: string | null; color_1: string | null; color_2: string | null }>
  >
> {
  const existingTasks = await tx.printOrderTask.findMany({
    where: { orderId },
    select: {
      id: true,
      orderItemId: true,
      custom_text: true,
      color_1: true,
      color_2: true,
    },
  });

  // Create a map of item ID to existing values
  return existingTasks.reduce(
    (acc, task) => {
      if (!acc[task.orderItemId]) acc[task.orderItemId] = [];
      acc[task.orderItemId].push({
        custom_text: task.custom_text,
        color_1: task.color_1,
        color_2: task.color_2,
      });
      return acc;
    },
    {} as Record<
      number,
      Array<{ custom_text: string | null; color_1: string | null; color_2: string | null }>
    >
  );
}

// --- Add new function to sync existing tasks to ShipStation ---
async function syncExistingTasksToShipstation(
  orderId: number,
  options: ProcessingOptions
): Promise<{ updatedCount: number; failedCount: number }> {
  logger.info(`[ShipStation Sync] Starting sync of existing tasks for order ${orderId}...`);
  // Collect option changes so we can fire a single batch PATCH at the end
  const itemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
  const patchReasons: string[] = [];
  let updatedCount = 0;
  let failedCount = 0;

  try {
    // Fetch order details first to ensure we have shipstation_order_id
    const orderDetails = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        shipstation_order_id: true,
        shipstation_order_number: true,
        items: {
          select: {
            id: true,
            shipstationLineItemKey: true,
            product: {
              select: {
                id: true,
                name: true,
              },
            },
            // Fixed field name from printOrderTasks to printTasks
            printTasks: {
              select: {
                id: true,
                custom_text: true,
                color_1: true,
                color_2: true,
                taskIndex: true,
              },
              orderBy: {
                taskIndex: 'asc',
              },
            },
          },
        },
      },
    });

    if (!orderDetails) {
      throw new Error(`Order with ID ${orderId} not found in database`);
    }

    if (!orderDetails.shipstation_order_id) {
      throw new Error(`Order ${orderId} missing ShipStation order ID`);
    }

    logger.info(
      `[ShipStation Sync] Found order ${orderId} with ShipStation order ID ${orderDetails.shipstation_order_id} and order number ${orderDetails.shipstation_order_number}`
    );

    // Fetch the full order details from ShipStation
    const ssOrderResponse = await getShipstationOrders({
      orderId: Number(orderDetails.shipstation_order_id),
    });
    if (!ssOrderResponse || !ssOrderResponse.orders || ssOrderResponse.orders.length === 0) {
      throw new Error(
        `Failed to fetch order ${orderDetails.shipstation_order_id} details from ShipStation`
      );
    }

    const ssOrder = ssOrderResponse.orders[0];
    logger.debug(
      { fetchedSsOrder: ssOrder },
      `[ShipStation Sync] Fetched ShipStation order details.`
    );

    // Check if order is shipped - ADD WARNING FOR SHIPPED ORDERS
    if (
      ssOrder.orderStatus &&
      (ssOrder.orderStatus.toLowerCase() === 'shipped' ||
        ssOrder.orderStatus.toLowerCase() === 'fulfilled')
    ) {
      logger.warn(
        `[ShipStation Sync] ⚠️ WARNING: Order ${orderId} (${orderDetails.shipstation_order_number}) is already marked as "${ssOrder.orderStatus}" in ShipStation.`
      );
      logger.warn(
        `[ShipStation Sync] ShipStation usually prevents modifications to shipped orders. Updates may not take effect.`
      );

      // If not running in confirm mode, ask for confirmation
      if (!options.confirm && !options.dryRun) {
        if (
          !(await confirmExecution(
            `Continue attempting to update shipped order ${orderDetails.shipstation_order_number}? Updates may not take effect.`
          ))
        ) {
          logger.info(`[ShipStation Sync] Skipping shipped order ${orderId} by user request.`);
          return { updatedCount: 0, failedCount: 0 };
        }
        logger.info(
          `[ShipStation Sync] Proceeding with shipped order ${orderId} sync as requested.`
        );
      }
    }

    // Process each item that has tasks and shipstation line item key
    for (const item of orderDetails.items) {
      if (!item.shipstationLineItemKey) {
        logger.warn(
          `[ShipStation Sync] Item ${item.id} missing ShipStation line item key. Skipping.`
        );
        failedCount++;
        continue;
      }

      if (item.printTasks.length === 0) {
        logger.warn(`[ShipStation Sync] Item ${item.id} has no print tasks. Skipping.`);
        failedCount++;
        continue;
      }

      // Use the first task's data (most items only have one task)
      // If there are multiple tasks, we currently can't represent that in ShipStation
      // so we use the first task's data
      const task = item.printTasks[0];

      // Construct options from the task data
      const ssOptions = [];
      if (task.custom_text !== null) {
        logger.info(
          `[ShipStation Sync] Item ${item.id} task ${task.id} has custom_text: "${task.custom_text}"`
        );
        ssOptions.push({ name: 'Name or Text', value: task.custom_text });
      } else {
        logger.warn(`[ShipStation Sync] Item ${item.id} task ${task.id} has null custom_text`);
      }

      if (task.color_1 !== null) {
        logger.info(
          `[ShipStation Sync] Item ${item.id} task ${task.id} has color_1: "${task.color_1}"`
        );
        ssOptions.push({ name: 'Colour 1', value: task.color_1 });
      }

      if (task.color_2 !== null) {
        logger.info(
          `[ShipStation Sync] Item ${item.id} task ${task.id} has color_2: "${task.color_2}"`
        );
        ssOptions.push({ name: 'Colour 2', value: task.color_2 });
      }

      if (ssOptions.length === 0) {
        logger.warn(
          `[ShipStation Sync] Item ${item.id} task ${task.id} has no data to sync. Skipping.`
        );
        failedCount++;
        continue;
      }

      // Log the actual options being sent to ShipStation
      logger.info(
        `[ShipStation Sync] Will send options for item ${item.id} (line item key: ${item.shipstationLineItemKey}): ${JSON.stringify(ssOptions)}`
      );

      if (options.dryRun) {
        logger.info(
          `[Dry Run][ShipStation Sync] Would update ShipStation item ${item.id} with options: ${JSON.stringify(ssOptions)}`
        );
        updatedCount++;
        continue;
      }

      // Accumulate for batch update inside syncExistingTasks path too
      if (ssOptions.length > 0) {
        itemsToPatch[item.shipstationLineItemKey] = ssOptions;
        patchReasons.push(item.shipstationLineItemKey);
      }
    }

    // Send the accumulated batch update once
    if (!options.dryRun && Object.keys(itemsToPatch).length > 0) {
      try {
        const auditNote = `Task sync ${new Date().toISOString()} -> ${patchReasons.join(', ')}`;
        await updateOrderItemsOptionsBatch(ssOrder, itemsToPatch, auditNote);
        updatedCount += Object.keys(itemsToPatch).length;
      } catch (batchErr) {
        logger.error(`[ShipStation Sync] Batch update error`, batchErr);
        failedCount += Object.keys(itemsToPatch).length;
      }
    }

    logger.info(
      `[ShipStation Sync] Completed sync for order ${orderId}. Updated: ${updatedCount}, Failed: ${failedCount}`
    );
    return { updatedCount, failedCount };
  } catch (error) {
    logger.error(
      `[ShipStation Sync] Failed to sync order ${orderId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return { updatedCount, failedCount: failedCount + 1 };
  }
}

// --- Main Execution ---
async function main() {
  const SCRIPT_NAME = 'populate-print-queue';
  let scriptRunSuccess = true,
    finalMessage = 'Script finished.';
  let totalOrdersProcessed = 0,
    totalOrdersFailed = 0,
    totalTasksCreated = 0;
  const failedOrderIds: number[] = [];
  let prisma: PrismaClient | null = null;

  try {
    // Setup file logging stream
    const logDir = path.join(process.cwd(), 'logs');
    const logFilePath = path.join(
      logDir,
      `${SCRIPT_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    );
    await fs.mkdir(logDir, { recursive: true });
    logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });

    // Setup Pino logger to use multistream - MOVED & MODIFIED
    logger = pino(
      { level: 'info' },
      pino.multistream([
        { stream: logStream }, // Write JSON logs to file
        { stream: process.stdout }, // Write JSON logs to console
        // TODO: Consider pino-pretty for console output if desired later
      ])
    );

    logger.info(`--- Script Start: ${new Date().toISOString()} ---`);
    logger.info(`Logging to file: ${logFilePath}`);

    // --- REMOVED Manual Arg Parsing for orderId ---

    // Argument Parsing (Commander for others)
    const program = new Command();
    program
      .name(SCRIPT_NAME)
      .description('Fetch orders and create print tasks via AI.')
      // Use Commander to parse the order ID directly as a string
      .option(
        '-o, --order-id <id>',
        'Process specific order by DB ID, ShipStation Order Number, or ShipStation Order ID',
        String
      )
      .option('-l, --limit <number>', 'Limit orders fetched', val => parseInt(val, 10))
      .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
      .option('--openai-model <model>', 'OpenAI model', 'gpt-4.1-mini')
      .option('--debug', 'Enable debug logging', false) // Boolean flag (presence implies true) - Added default false
      .option('--verbose', 'Enable verbose logging', false) // Boolean flag (presence implies true) - Added default false
      .option('--log-level <level>', 'Set log level', 'info')
      .option('-f, --force-recreate', 'Delete existing tasks first', false) // Boolean flag (presence implies true) - Added default false
      .option('--create-placeholder', 'Create placeholder on AI fail', true) // Boolean flag (with default true - keep default here)
      .option('-y, --confirm', 'Skip confirmation prompts', false) // Boolean flag (presence implies true) - Added default false
      .option('--clear-all', 'Delete ALL tasks first (requires confirm)', false) // Boolean flag (presence implies true) - Added default false
      .option('--dry-run', 'Simulate without DB changes', false) // Boolean flag (presence implies true) - Added default false
      .option('--preserve-text', 'Keep existing custom text/names when recreating tasks', false) // New flag to prevent overwriting existing text
      .option(
        '--shipstation-sync-only',
        'Only sync existing DB tasks to ShipStation without changing DB',
        false
      ) // New flag for ShipStation-only updates
      .option('--debug-file <path>', 'Path for detailed debug log file (requires --order-id)');

    // Log raw argv before parsing (use info level to ensure visibility regardless of logger level)
    logger.info({ argv: process.argv }, 'Raw process.argv before commander parse');

    // Direct extraction of --order-id from process.argv (before commander parsing)
    let directOrderId: string | undefined = undefined;
    for (let i = 0; i < process.argv.length - 1; i++) {
      if ((process.argv[i] === '--order-id' || process.argv[i] === '-o') && process.argv[i + 1]) {
        directOrderId = process.argv[i + 1];
        logger.info(`Directly extracted --order-id from process.argv: ${directOrderId}`);
        break;
      }
    }

    // Slice argv to exclude node executable and script path before parsing
    program.parse(process.argv.slice(2));

    // Get options directly from Commander
    const cmdOptions = program.opts<ProcessingOptions>(); // Use the interface type

    // Use directly extracted order ID if commander didn't find it
    if (!cmdOptions.orderId && directOrderId) {
      logger.info(
        `Order ID not found in parsed args. Using directly extracted value: ${directOrderId}`
      );
      cmdOptions.orderId = directOrderId;
    }

    // Set logger level from options (after initialization)
    if (cmdOptions.verbose) {
      logger.level = 'debug';
    } else {
      logger.level = cmdOptions.logLevel;
    }

    // Validate OpenAI API key
    if (!cmdOptions.openaiApiKey) throw new Error('OpenAI API key missing.');
    // Validate debug file dependency
    if (cmdOptions.debugFile && !cmdOptions.orderId) {
      logger.warn('--debug-file requires --order-id, disabling file debug.');
      cmdOptions.debugFile = undefined;
    }

    // Load Prompts
    logger.info('Loading prompts...');
    const systemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
    const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
    logger.info('Prompts loaded.');

    // Prepare options for AI processing
    const processingOptionsForAI: Pick<
      ProcessingOptions,
      'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
    > = {
      openaiApiKey: cmdOptions.openaiApiKey ?? null,
      openaiModel: cmdOptions.openaiModel,
      systemPrompt,
      userPromptTemplate,
    };

    // Log the options parsed by commander
    logger.info(
      `Commander Parsed Options (opts): ${JSON.stringify({ ...cmdOptions, openaiApiKey: '***' })}`
    );
    if (cmdOptions.dryRun) logger.info('--- DRY RUN MODE ---');
    if (cmdOptions.debug) logger.debug('Debug mode enabled.');

    // Initialize Prisma
    prisma = new PrismaClient();
    await prisma.$connect();
    logger.info('DB connected.');

    // Create Run Log
    await createRunLog({ scriptName: SCRIPT_NAME });

    // Pre-processing: Clear All
    if (cmdOptions.clearAll) {
      if (
        !cmdOptions.confirm &&
        !(await confirmExecution('CONFIRM: Delete ALL print tasks? This cannot be undone.'))
      ) {
        logger.info('Aborted by user.');
        process.exit(0);
      }
      if (cmdOptions.dryRun) {
        logger.info('[Dry Run] Would clear all tasks from PrintOrderTask table.');
      } else {
        logger.info('[DB] Clearing all tasks from PrintOrderTask table...');
        const { count } = await prisma.printOrderTask.deleteMany({});
        logger.info(`[DB] Deleted ${count} tasks.`);
      }
    }

    // Pre-processing: Force Recreate for specific order
    // Use the orderId directly from cmdOptions (which is now a string)
    if (cmdOptions.forceRecreate && cmdOptions.orderId && !cmdOptions.dryRun) {
      // Need to find the order first to get its internal ID for deletion
      logger.info(
        `[DB] Force recreate enabled for order identifier '${cmdOptions.orderId}'. Finding order to delete tasks...`
      );
      const ordersToDelete = await getOrdersToProcess(prisma, cmdOptions.orderId, 1, true); // Find the order first
      if (ordersToDelete.length > 0) {
        const orderDbId = ordersToDelete[0].id;
        logger.info(`[DB] Found order with DB ID ${orderDbId}. Deleting existing tasks...`);
        const { count } = await prisma.printOrderTask.deleteMany({
          where: { orderId: orderDbId }, // Delete by the actual database ID
        });
        logger.info(`[DB] Deleted ${count} tasks for order DB ID ${orderDbId}.`);
      } else {
        logger.warn(
          `[DB] Force recreate specified, but could not find order with identifier '${cmdOptions.orderId}' to delete tasks for.`
        );
      }
    }

    // Find Orders
    logger.info('Finding orders...');
    // Pass the orderId string directly from cmdOptions
    const ordersToProcess = await getOrdersToProcess(
      prisma,
      cmdOptions.orderId,
      cmdOptions.limit,
      cmdOptions.forceRecreate
    );
    logger.info(`Found ${ordersToProcess.length} orders.`);
    if (ordersToProcess.length > 0) {
      logger.debug(
        `First order ID: ${ordersToProcess[0].id}, Order Number: ${ordersToProcess[0].shipstation_order_number}`
      );
    } else if (cmdOptions.orderId) {
      // This log is now handled within getOrdersToProcess
      // logger.warn(`No order found with identifier: ${cmdOptions.orderId}`);
    }

    // Process Orders
    for (const order of ordersToProcess) {
      totalOrdersProcessed++;
      logger.info(`--- Processing Order ${order.id} (${order.shipstation_order_number}) ---`);

      // Handle ShipStation sync-only mode
      if (cmdOptions.shipstationSyncOnly) {
        logger.info(
          `[Order ${order.id}] ShipStation sync-only mode enabled. Skipping AI extraction and DB updates.`
        );
        try {
          const { updatedCount, failedCount } = await syncExistingTasksToShipstation(
            order.id,
            cmdOptions
          );
          logger.info(
            `[Order ${order.id}] ShipStation sync completed. Updated: ${updatedCount}, Failed: ${failedCount}`
          );
          continue; // Skip the rest of the processing for this order
        } catch (error) {
          logger.error(
            `[Order ${order.id}] ShipStation sync failed: ${error instanceof Error ? error.message : String(error)}`
          );
          totalOrdersFailed++;
          failedOrderIds.push(order.id);
          continue; // Skip the rest of the processing for this order
        }
      }

      const effectiveModelUsed = cmdOptions.openaiModel;

      const orderDebugInfo: OrderDebugInfo = {
        orderId: order.id,
        orderNumber: order.shipstation_order_number ?? '',
        marketplace: order.marketplace,
        overallStatus: 'Starting',
        promptSent: null,
        rawResponseReceived: null,
        parsedResponse: null,
        validationError: null,
        processingError: null,
        aiProvider: 'openai',
        modelUsed: effectiveModelUsed,
        items: [],
      };

      try {
        // AI Call (Order Level) - Still call AI first to get data for non-Amazon or as fallback
        orderDebugInfo.overallStatus = 'Extracting AI Data';
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);
        const extractionResult = await extractOrderPersonalization(order, processingOptionsForAI);
        orderDebugInfo.promptSent = extractionResult.promptUsed;
        orderDebugInfo.rawResponseReceived = extractionResult.rawResponse;
        orderDebugInfo.aiProvider = 'openai';
        orderDebugInfo.modelUsed = extractionResult.modelUsed ?? orderDebugInfo.modelUsed;

        if (!extractionResult.success) {
          logger.error(
            `[Order ${order.id}] AI Extraction Failed: ${(extractionResult as OrderExtractionError).error}`
          );
          orderDebugInfo.overallStatus = 'Extraction Failed';
          orderDebugInfo.processingError = (extractionResult as OrderExtractionError).error;
        } else {
          orderDebugInfo.overallStatus = 'AI Data Extracted, Starting DB Transaction';
          orderDebugInfo.parsedResponse = extractionResult.data;
        }

        // DB Transaction - Now handles Amazon URL check, AI fallback, and task creation
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);

        if (cmdOptions.dryRun) {
          logger.info(`[Dry Run][Order ${order.id}] Simulating task creation/upserts...`);
          orderDebugInfo.overallStatus = 'Dry Run Complete';
        } else {
          // Pass relevant cmdOptions to createOrUpdateTasksInTransaction
          const transactionOptions: ProcessingOptions = {
            dryRun: cmdOptions.dryRun,
            openaiApiKey: null,
            openaiModel: '',
            systemPrompt: '',
            userPromptTemplate: '',
            debug: cmdOptions.debug,
            logLevel: cmdOptions.logLevel,
            debugFile: cmdOptions.debugFile,
            createPlaceholder: cmdOptions.createPlaceholder,
            preserveText: cmdOptions.preserveText, // Pass the preserveText flag to the transaction
            verbose: cmdOptions.verbose, // Add missing verbose property
          };
          const { tasksCreatedCount /* tasksSkippedCount, itemsNeedReviewCount */ } =
            await prisma.$transaction(
              async tx => {
                return await createOrUpdateTasksInTransaction(
                  tx,
                  order,
                  extractionResult.success ? extractionResult.data : { itemPersonalizations: {} },
                  transactionOptions,
                  orderDebugInfo
                );
              },
              { maxWait: 120000, timeout: 300000 }
            );
          logger.info(
            `[Order ${order.id}] DB Transaction finished. Tasks upserted: ${tasksCreatedCount}.`
          );
          totalTasksCreated += tasksCreatedCount;
          if (!orderDebugInfo.processingError) {
            orderDebugInfo.overallStatus = 'Transaction Committed';
          }
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!orderDebugInfo.processingError) {
          logger.error(`[Order ${order.id}] FAILED: ${errorMsg}`, error);
          orderDebugInfo.processingError = errorMsg;
        } else {
          logger.error(`[Order ${order.id}] FAILED (additional error): ${errorMsg}`, error);
        }
        totalOrdersFailed++;
        failedOrderIds.push(order.id);
        orderDebugInfo.overallStatus = 'Processing Failed';
      } finally {
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);
        logger.info(`--- Finished Order ${order.id}. Status: ${orderDebugInfo.overallStatus} ---`);
      }
    } // End order loop

    // Final Summary
    scriptRunSuccess = totalOrdersFailed === 0;
    finalMessage = `Processed ${totalOrdersProcessed} orders. Failed: ${totalOrdersFailed}. Tasks Upserted: ${totalTasksCreated}.`;
    if (totalOrdersFailed > 0) finalMessage += ` Failed IDs: [${failedOrderIds.join(', ')}]`;
    await updateRunLog(runLogId, { status: scriptRunSuccess ? 'success' : 'partial_success' });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('SCRIPT FAILED (Unhandled Exception)', error);
    scriptRunSuccess = false;
    finalMessage = `Script failed fatally: ${errorMsg}`;
    if (runLogId !== null) {
      try {
        await updateRunLog(runLogId, { status: 'failed', message: errorMsg });
      } catch {
        /* Ignore */
      }
    }
  } finally {
    logger.info(`--- Script End ---`);
    logger.info(finalMessage);
    if (prisma) {
      try {
        await prisma.$disconnect();
        logger.info('DB disconnected.');
      } catch (e) {
        logger.error('DB disconnect error', e);
      }
    }
    if (logStream) logStream.end();
    process.exit(scriptRunSuccess ? 0 : 1);
  }
}

// Display help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage:
  npx tsx src/scripts/populate-print-queue.ts [options]

Options:
  --order-id <id>           Process specific order by ID, ShipStation Order Number, or ShipStation Order ID
  --limit <number>          Limit orders fetched (no default; fetch all orders)
  --openai-api-key <key>    OpenAI API Key (default: env OPENAI_API_KEY)
  --openai-model <model>    OpenAI model (default: gpt-4.1-mini)
  --debug                   Enable debug logging
  --verbose                 Enable verbose logging
  --log-level <level>       Set log level (default: info)
  -f, --force-recreate      Delete existing tasks first
  --create-placeholder      Create placeholder on AI fail (default: true)
  -y, --confirm             Skip confirmation prompts
  --clear-all               Delete ALL tasks first (requires confirm)
  --dry-run                 Simulate without DB changes
  --preserve-text           Keep existing custom text/names when recreating tasks
                            (prevents AI from overwriting correct names)
  --shipstation-sync-only   Only sync existing DB tasks to ShipStation without changing DB
  --debug-file <path>       Path for detailed debug log file (requires --order-id)
  
Examples:
  # Process specific order with force recreate but preserve existing text
  npx tsx src/scripts/populate-print-queue.ts --order-id 202-7013581-4597156 -f --preserve-text
  
  # Process latest 5 orders in dry run mode
  npx tsx src/scripts/populate-print-queue.ts --limit 5 --dry-run
  `);
  process.exit(0);
}

void main();
