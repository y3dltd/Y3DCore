"use strict";
// Node built-in modules first
import fsCallback from 'node:fs'; // For createWriteStream
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import util from 'node:util';

// External dependencies
import { Prisma, PrismaClient, PrintTaskStatus } from '@prisma/client'; // Assuming PrintTaskStatus is the enum
import { Command } from 'commander';
import { config } from 'dotenv';
import fetch from 'node-fetch'; // Added node-fetch
import pino from 'pino'; // Default import, assuming pino v7+ with own types
import type { Response as FetchResponse } from 'node-fetch'; // Type for node-fetch response
import { z } from 'zod';

// Internal/local imports
import { fixInvalidStlRenderStatus, getOrdersToProcess, OrderWithItemsAndProducts } from '../lib/order-processing';
import { getShipstationOrders, updateOrderItemsOptionsBatch } from '../lib/shared/shipstation';
import { simplifyProductName, productNameMappings } from '@lib/product-mapping';
import {
  OPENAI_API_URL,
  DEFAULT_OPENAI_MODEL,
  MAX_AI_TOKENS,
  DEFAULT_SYSTEM_PROMPT_PATH,
  DEFAULT_USER_PROMPT_PATH,
  PRISMA_TRANSACTION_MAX_WAIT,
  PRISMA_TRANSACTION_TIMEOUT,
  SCRIPT_LOG_DIR
} from '../lib/constants'; // Adjust path as necessary
import { fetchAndProcessAmazonCustomization } from '../lib/orders/amazon/customization'; // Added import

// --- Constants --- (These are now imported)
// const OPENAI_API_URL = ...;
// ... (remove all duplicated constant definitions here) ...

// Initialize single Prisma Client instance
const prisma = new PrismaClient();
const isPrismaConnected = false;

// Load environment variables
config();

// Module-level logger for very early use or if main logger setup fails
let logger: pino.Logger = pino({ level: 'warn' }); // Initial basic logger

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
interface OrderDebugInfo {
  orderId: number;
  orderNumber: string;
  marketplace: string | null;
  overallStatus: string;
  promptSent: string | null;
  rawResponseReceived: string | null;
  parsedResponse: z.infer<typeof AiOrderResponseSchema> | null;
  processingError: string | null;
  aiProvider: string | null;
  modelUsed: string | null;
  items: Array<{
    itemId: number;
    status: string;
    error?: string;
    createdTaskIds: number[];
  }>;
  forceRecreate?: boolean;
  preserveText?: boolean;
  skipAi?: boolean;
}

interface ProcessingOptions {
  orderId?: string;
  limit?: number;
  days?: number;
  openaiApiKey: string | null;
  openaiModel: string;
  systemPrompt: string;
  userPromptTemplate: string;
  systemPromptFile?: string;
  userPromptFile?: string;
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
  skipAi?: boolean;
  syncToShipstation?: boolean;
  shipstationSyncOnly?: boolean;
}

// Define local interfaces for AI prompt data structure
interface AiOrderItemOption {
  name: string;
  value: string;
}

interface AiOrderItemData {
  id: string; // This will be lineItemKey
  sku?: string | null;
  name?: string; // Simplified name
  quantity: number;
  options?: AiOrderItemOption[] | null;
  productName?: string | null; // Original product name
  productId?: number | null;
  // Properties to hold directly extracted Amazon data
  _amazonDataProcessed?: boolean;
  _amazonCustomText?: string | null;
  _amazonColor1?: string | null;
  _amazonColor2?: string | null;
  _amazonDataSource?: 'AmazonURL';
}

interface AiPromptShippingAddress {
  name?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
}

interface AiPromptData {
  orderId: number;
  orderNumber: string;
  orderDate: string;
  marketplace: string;
  customerNotes?: string | null;
  internalNotes?: string | null;
  items: AiOrderItemData[];
  shippingAddress: AiPromptShippingAddress;
}

// Define a simpler type for what taskDetailsToCreate will actually hold
interface TaskPersonalizationData {
  custom_text: string | null;
  color_1: string | null;
  color_2?: string | null | undefined;
  quantity: number;
  needs_review?: boolean;
  review_reason?: string | null;
  status: PrintTaskStatus;
  annotation?: string | null | undefined;
}

// --- Define local interface for Amazon Personalization Data ---
interface AmazonPersonalization {
  text: string | null;
  color1: string | null;
  color2: string | null;
  // Add other fields if known, e.g., quantity, sku, etc.
}

// --- Helper Functions ---
// Modify helpers to accept a logger instance
async function loadPromptFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown file load error';
    logger.error({ filePath, err: error }, `Failed to load prompt file: ${filePath} - ${errorMsg}`);
    throw new Error(`Could not load prompt file: ${filePath}`);
  }
}

async function appendToDebugLog(filePath: string | undefined, data: OrderDebugInfo): Promise<void> {
  if (!filePath) return;
  try {
    const logEntry = `\n--- Entry: ${new Date().toISOString()} ---\n${util.inspect(data, { depth: null, colors: false })}\n`;
    await fs.appendFile(filePath, logEntry);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown debug log write error';
    logger.error({ filePath, err: error }, `Failed to write to debug log file ${filePath}: ${errorMsg}`);
  }
}

// Re-insert confirmExecution function definition
async function confirmExecution(promptMessage: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${promptMessage} (yes/NO) `);
  rl.close();
  return answer.toLowerCase() === 'yes';
}

let runLogId: number | null = null;
const createRunLog = async (data: { scriptName: string }) => {
  logger.info({ data }, '[Mock Log] Create Run Log:');
  runLogId = Date.now();
  return { id: runLogId };
};
const updateRunLog = async (id: number | null, data: { status: string; message?: string }) => {
  logger.info({ id, data }, '[Mock Log] Update Run Log:');
};

// --- Helper Function for ShipStation Personalized Details String ---
function buildPersonalizedDetailsString(
  personalizations: Array<z.infer<typeof PersonalizationDetailSchema>>,
  lineItemKeyForLog: string,
  orderIdForLog: number
): string {
  if (!personalizations || personalizations.length === 0) {
    logger.info(`[Util][Order ${orderIdForLog}][Item ${lineItemKeyForLog}] No personalizations to build details string from.`);
    return "No personalization details extracted.";
  }
  const personalizedDetailStrings: string[] = [];
  for (const p of personalizations) {
    const text = p.customText || 'N/A';
    const color1 = p.color1;
    const color2 = p.color2 ? ` / ${p.color2}` : '';
    personalizedDetailStrings.push(`${text} (${color1 || 'N/A'}${color2})`);
  }
  let combinedDetailsString = personalizedDetailStrings.join(', ');
  const MAX_LEN_SHIPSTATION_OPTION = 200;
  const TRUNCATION_SUFFIX = '... (See Packing List)';
  if (combinedDetailsString.length > MAX_LEN_SHIPSTATION_OPTION) {
    combinedDetailsString = combinedDetailsString.substring(0, MAX_LEN_SHIPSTATION_OPTION - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
  }
  logger.info(`[Util][Order ${orderIdForLog}][Item ${lineItemKeyForLog}] Built personalized details string: "${combinedDetailsString}"`);
  return combinedDetailsString;
}

// --- Replicated Helper Function ---
// Define more specific types for print_settings
interface PrintSettingOption {
  name: string;
  value: string;
}

type PrintSettings = PrintSettingOption | PrintSettingOption[] | Record<string, string> | null;

// Function to extract the customization URL from item print_settings
function extractCustomizationUrl(item: OrderWithItemsAndProducts['items'][number]): string | null {
  const printSettings: PrintSettings = item.print_settings as PrintSettings;
  // Log the print_settings being processed by this function at a debug level
  logger.debug({
    orderId: item.orderId, // Assuming OrderItem has orderId, if not, this needs context 
    itemId: item.id,
    shipstationLineItemKey: item.shipstationLineItemKey,
    printSettings
  }, `[extractCustomizationUrl] Processing item ${item.id} with print_settings.`);

  if (!printSettings) {
    logger.debug(`[extractCustomizationUrl][Item ${item.id}] No print_settings found.`);
    return null;
  }

  // Helper to check for the URL setting, case-insensitive for the name
  const isUrlSetting = (setting: unknown): setting is PrintSettingOption =>
    setting !== null &&
    typeof setting === 'object' &&
    !Array.isArray(setting) &&
    'name' in setting &&
    typeof (setting as PrintSettingOption).name === 'string' &&
    (setting as PrintSettingOption).name.toLowerCase() === 'customizedurl' && // Case-insensitive check
    'value' in setting &&
    typeof (setting as PrintSettingOption).value === 'string';

  if (Array.isArray(printSettings)) {
    const urlSetting = printSettings.find(isUrlSetting);
    return urlSetting ? urlSetting.value : null;
  } else if (typeof printSettings === 'object' && printSettings !== null) {
    // Check direct object property case-insensitively
    const record = printSettings as Record<string, unknown>; // Use unknown for initial dynamic access
    const key = Object.keys(record).find(k => k.toLowerCase() === 'customizedurl'); // Find key case-insensitively
    if (key && typeof record[key] === 'string') {
      return record[key] as string;
    }
    // Fallback check using the isUrlSetting helper (for objects structured like { name: '...', value: '...' })
    if (isUrlSetting(printSettings)) {
      return printSettings.value;
    }
  }
  logger.debug(`[extractCustomizationUrl][Item ${item.id}] No CustomizedURL found in print_settings.`);
  return null;
}

// --- NEW HELPER FUNCTIONS (Amazon Specific Data Extraction) ---
interface DirectExtractionResult {
  customText: string | null;
  color1: string | null;
  color2: string | null;
  dataSource: 'AmazonURL' | 'CustomerNotes' | null; // 'CustomerNotes' might be added later
  annotation: string | null;
  needsReview?: boolean;
  reviewReason?: string | null;
}

async function extractDirectItemData(
  order: OrderWithItemsAndProducts,
  item: OrderWithItemsAndProducts['items'][number],
  product: OrderWithItemsAndProducts['items'][number]['product']
): Promise<DirectExtractionResult> {
  logger.info({ orderId: order.id, itemId: item.id, shipstationLineItemKey: item.shipstationLineItemKey }, `[DirectExtract] Entered for item.`);
  // --- Amazon URL Extraction Logic ---
  const isAmazon = order.marketplace?.toLowerCase().includes('amazon');
  logger.info({ orderId: order.id, itemId: item.id, marketplace: order.marketplace, isAmazonResult: isAmazon }, `[DirectExtract] Checked isAmazon.`);
  logger.debug(`[DirectExtract][Order ${order.id}][Item ${item.id}] Marketplace='${order.marketplace}', IsAmazon=${isAmazon}`);

  if (isAmazon) {
    // Log the raw print_settings for the item when it's an Amazon order
    logger.info({
      orderId: order.id,
      itemId: item.id,
      shipstationLineItemKey: item.shipstationLineItemKey,
      printSettingsFromItem: item.print_settings
    }, `[DirectExtract][Order ${order.id}][Item ${item.id}] Amazon item. Raw print_settings before calling extractCustomizationUrl.`);

    const amazonUrl = extractCustomizationUrl(item);
    logger.debug(`[DirectExtract][Order ${order.id}][Item ${item.id}] Extracted amazonUrl='${amazonUrl}'`);

    if (amazonUrl) {
      logger.info(`[DB][Order ${order.id}][Item ${item.id}] Found Amazon CustomizedURL. Attempting to fetch...`);
      try {
        const amazonData = await fetchAndProcessAmazonCustomization(amazonUrl);
        logger.debug(`[DirectExtract][Order ${order.id}][Item ${item.id}] fetchAndProcessAmazonCustomization returned: ${JSON.stringify(amazonData)}`);

        if (amazonData) {
          logger.info(`[DB][Order ${order.id}][Item ${item.id}] Successfully processed Amazon URL.`);
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
          logger.warn(`[DB][Order ${order.id}][Item ${item.id}] Failed to process Amazon URL (fetch function returned null/undefined). Will fall back to AI.`);
          // Fall through to AI fallback by returning dataSource: null
        }
      } catch (amazonError) {
        const errorMsg = amazonError instanceof Error ? amazonError.message : String(amazonError);
        logger.error({ err: amazonError, orderId: order.id, itemId: item.id }, `[DB][Order ${order.id}][Item ${item.id}] Error during fetchAndProcessAmazonCustomization: ${errorMsg}`);
        return {
          customText: null,
          color1: null,
          color2: null,
          dataSource: null, // Indicates fallback to AI needed due to error
          annotation: `Error processing Amazon URL: ${errorMsg}`.substring(0, 1000),
          needsReview: true,
          reviewReason: `Amazon URL Error: ${errorMsg}`.substring(0, 255),
        };
      }
    } else {
      logger.debug(`[DirectExtract][Order ${order.id}][Item ${item.id}] Amazon order but CustomizedURL extraction returned null. Will fall back to AI.`);
      // Fall through to AI fallback by returning dataSource: null
    }
  } else {
    logger.debug(`[DirectExtract][Order ${order.id}][Item ${item.id}] Not identified as Amazon marketplace. Will fall back to AI.`);
    // Fall through to AI fallback by returning dataSource: null
  }

  // Default fallback: indicates that AI processing is needed
  return {
    customText: null,
    color1: null,
    color2: null,
    dataSource: null,
    annotation: 'Needs AI processing',
  };
}

// --- AI Extraction Logic (Order Level) --- Replace Placeholder
async function extractOrderPersonalization(
  order: OrderWithItemsAndProducts,
  options: Pick<
    ProcessingOptions,
    'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate' | 'forceRecreate' | 'preserveText' | 'dryRun'
  >
): Promise<{
  success: boolean;
  aiResponseData?: z.infer<typeof AiOrderResponseSchema>; // Renamed from data to aiResponseData
  itemsSentToAi: AiOrderItemData[]; // Added this to return the itemsForPrompt array
  error?: string;
  promptUsed: string | null;
  rawResponse: string | null;
  modelUsed: string | null;
}> {
  // type OrderItemWithProduct = Prisma.OrderItemGetPayload<{ include: { product: true } }>; // Removed unused type

  const itemsForPrompt: AiOrderItemData[] = []; // Initialize array

  for (const orderItem of order.items) {
    if (orderItem.shipstationLineItemKey == null) {
      logger.warn({ orderId: order.id, itemId: orderItem.id }, 'Skipping item with null shipstationLineItemKey for AI prompt.');
      continue;
    }

    const simplifiedName = simplifyProductName(
      orderItem.product?.name ?? '',
      productNameMappings
    );

    const currentItemData: AiOrderItemData = {
      id: orderItem.shipstationLineItemKey,
      sku: orderItem.product?.sku ?? '',
      name: simplifiedName,
      quantity: orderItem.quantity,
      options: [], // Initialize options
      productName: orderItem.product?.name,
      productId: orderItem.product?.id,
    };

    // Amazon Customization URL Check
    const customizedUrl = extractCustomizationUrl(orderItem);
    if (customizedUrl && order.marketplace?.toLowerCase() === 'amazon') { // Made marketplace check case-insensitive
      logger.info({ orderId: order.id, itemId: orderItem.id, url: customizedUrl }, `[AI Prep] Found Amazon customization URL for item ${orderItem.id}. Fetching...`);
      try {
        const amazonDataResult = await fetchAndProcessAmazonCustomization(customizedUrl);
        // Cast to unknown first, then to the desired array type, as suggested by the linter
        const amazonDataArray = amazonDataResult as unknown as AmazonPersonalization[] | undefined;

        if (amazonDataArray && amazonDataArray.length > 0) {
          const firstAmazonPersonalization = amazonDataArray[0];
          currentItemData._amazonDataProcessed = true;
          currentItemData._amazonCustomText = firstAmazonPersonalization.text;
          currentItemData._amazonColor1 = firstAmazonPersonalization.color1;
          currentItemData._amazonColor2 = firstAmazonPersonalization.color2;
          currentItemData._amazonDataSource = 'AmazonURL';
          logger.info({ orderId: order.id, itemId: orderItem.id, extracted: firstAmazonPersonalization }, `[AI Prep] Successfully extracted data directly from Amazon URL for item ${orderItem.id}. This data will be prioritized.`);

          // Still populate currentItemData.options for the AI prompt as a fallback or for context,
          // but the _amazon flags will ensure we use the direct data.
          currentItemData.options = [
            { name: 'Name or Text', value: firstAmazonPersonalization.text || '' },
            { name: 'Colour 1', value: firstAmazonPersonalization.color1 || '' },
          ];
          if (firstAmazonPersonalization.color2) {
            currentItemData.options.push({ name: 'Colour 2', value: firstAmazonPersonalization.color2 });
          }
        } else {
          logger.warn({ orderId: order.id, itemId: orderItem.id }, `[AI Prep] Amazon customization URL for item ${orderItem.id} yielded no data.`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error({ orderId: order.id, itemId: orderItem.id, err: errorMsg }, `[AI Prep] Error processing Amazon customization URL for item ${orderItem.id}: ${errorMsg}`);
        // Do not set _amazonDataProcessed = true if fetching failed
      }
    } else {
      // Populate options from print_settings if not an Amazon URL case or URL processing failed
      let mappedOptions: Array<{ name: string; value: string }> = [];
      if (orderItem.print_settings) {
        if (Array.isArray(orderItem.print_settings)) {
          try {
            mappedOptions = (orderItem.print_settings as unknown as PrintSettingOption[])
              .map(opt => ({
                name: String(opt.name ?? ''),
                value: String(opt.value ?? ''),
              }))
              .filter(opt => opt.name && opt.value);
          } catch (e) {
            logger.warn({ orderId: order.id, itemId: orderItem.id, printSettings: orderItem.print_settings, error: e }, `[AI Prep] Could not parse array print_settings for item ${orderItem.id}`);
          }
        } else if (typeof orderItem.print_settings === 'object' && orderItem.print_settings !== null && 'options' in orderItem.print_settings && Array.isArray((orderItem.print_settings as { options: unknown[] }).options)) {
          try {
            mappedOptions = ((orderItem.print_settings as { options: unknown[] }).options as unknown as PrintSettingOption[])
              .map(opt => ({
                name: String(opt.name ?? ''),
                value: String(opt.value ?? ''),
              }))
              .filter(opt => opt.name && opt.value);
          } catch (e) {
            logger.warn({ orderId: order.id, itemId: orderItem.id, printSettings: orderItem.print_settings, error: e }, `[AI Prep] Could not parse object.options print_settings for item ${orderItem.id}`);
          }
        } else if (typeof orderItem.print_settings === 'object' && orderItem.print_settings !== null) {
          // Handle case where print_settings is an object but not the expected array or {options: array}
          logger.warn({ orderId: order.id, itemId: orderItem.id, printSettings: orderItem.print_settings }, `[AI Prep] Unhandled print_settings object structure for item ${orderItem.id}`);
        }
      }
      currentItemData.options = mappedOptions;
    }
    itemsForPrompt.push(currentItemData);
  }


  if (itemsForPrompt.length === 0 && !order.customer_notes && !order.internal_notes) {
    logger.info(`[AI][Order ${order.id}] No items with lineItemKeys found to send to AI, or all items lack product info for prompt.`);
    return {
      success: true, // Or false, depending on desired behavior for no items
      itemsSentToAi: itemsForPrompt, // Return empty or processed itemsForPrompt
      promptUsed: null,
      rawResponse: "No items sent to AI.",
      modelUsed: null,
    };
  }

  const inputData: AiPromptData = {
    orderId: order.id, // Changed to be the numeric database ID
    orderNumber: order.shipstation_order_number ?? 'N/A', // Provide default if null
    orderDate: order.order_date ? order.order_date.toISOString() : new Date().toISOString(), // Handle potential null before toISOString()
    marketplace: order.marketplace ?? 'Unknown',
    customerNotes: order.customer_notes,
    internalNotes: order.internal_notes,
    items: itemsForPrompt,
    shippingAddress: {
      name: order.customer?.name ?? '',
      street1: order.customer?.street1 ?? '',
      street2: order.customer?.street2 ?? '',
      city: order.customer?.city ?? '',
      state: order.customer?.state ?? '',
      postalCode: order.customer?.postal_code ?? '',
      country: order.customer?.country_code ?? '', // Use country_code from Customer
      phone: order.customer?.phone ?? '',
    },
  };

  const inputDataJson = JSON.stringify(inputData, null, 2);
  const userPromptContent = options.userPromptTemplate.replace('{INPUT_DATA_JSON}', inputDataJson);
  let systemPromptContent = options.systemPrompt;

  // Conditionally modify the system prompt if forceRecreate is true
  if (options.forceRecreate) {
    let forceRecreateInstruction = `\n\nIMPORTANT: The user is manually forcing the recreation of these tasks (force-recreate flag is active).`;
    if (options.preserveText) {
      forceRecreateInstruction += ` The 'customText' field will be preserved from existing data, so focus on accurately extracting other details like colors and quantities. Do not flag items for review based on customText ambiguity if it seems complex but present; assume it is correct. When re-evaluating, if customer notes provide a specific color for a name that strongly conflicts with the Gender-Based Name Color Assignment Guidelines (e.g., a typically female name with 'Red', or a typically male name with 'Pink'), you should DISREGARD the conflicting color from the customer notes for that specific name, even though text is preserved. Instead, assign a color strictly based on the Gender-Based Name Color Assignment Guidelines. Flag this action for review by setting 'needsReview: true' and 'reviewReason: "Force-recreate (preserve text): Disregarded conflicting customer note color \\'[OriginalColorFromNote]\\\' for name \\'[Name]\\\' and applied gender-guideline color \\'[NewGuidelineColor]\\'. Verify."'.`;
    } else {
      forceRecreateInstruction += ` Re-evaluate all personalizations from scratch. When re-evaluating, if customer notes provide a specific color for a name that strongly conflicts with the Gender-Based Name Color Assignment Guidelines (e.g., a typically female name with 'Red', or a typically male name with 'Pink'), you should DISREGARD the conflicting color from the customer notes for that specific name. Instead, assign a color strictly based on the Gender-Based Name Color Assignment Guidelines. Flag this action for review by setting 'needsReview: true' and 'reviewReason: "Force-recreate: Disregarded conflicting customer note color \\'[OriginalColorFromNote]\\\' for name \\'[Name]\\\' and applied gender-guideline color \\'[NewGuidelineColor]\\'. Verify."'. Do NOT flag other items for review (set needsReview: false) unless there is critical missing information that completely prevents processing.`;
    }
    systemPromptContent += forceRecreateInstruction;
    logger.info(
      {
        orderId: order.id,
        forceRecreate: options.forceRecreate,
        preserveText: options.preserveText
      },
      `[AI][Order ${order.id}] Appended force-recreate instruction to system prompt.`
    );
  }

  const fullPromptForDebug = `System:\n${systemPromptContent}\n\nUser:\n${userPromptContent}`;

  logger.debug(`[AI][Order ${order.id}] Preparing extraction...`);
  logger.trace(`[AI][Order ${order.id}] Input Data JSON:\n${inputDataJson}`);
  logger.debug(
    `[AI][Order ${order.id}] Prompt lengths: System=${systemPromptContent.length}, User=${userPromptContent.length}`
  );
  // Avoid logging full prompts at debug level if they are large or sensitive
  // logger.debug(`[AI][Order ${order.id}] System Prompt:\n${systemPromptContent}`);
  // logger.debug(`[AI][Order ${order.id}] User Prompt:\n${options.userPromptTemplate.replace('{INPUT_DATA_JSON}', inputDataJson)}`);

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
  const apiKey = options.openaiApiKey;
  const startTime = Date.now();

  try {
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
      max_tokens: MAX_AI_TOKENS,
      response_format: { type: 'json_object' },
    };

    logger.debug(
      { provider: 'openai', url: OPENAI_API_URL, headers: 'Authorization HIDDEN' }, // Redacted headers
      `[AI][Order ${order.id}] Sending API Request`
    );
    logger.trace(`[AI][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(apiPayload),
    }) as FetchResponse;

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

    // Log token usage if available
    if (result.usage) {
      logger.info(
        {
          orderId: order.id,
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
          modelUsed: modelUsed
        },
        `[AI][Order ${order.id}] Token usage`
      );
    }

    rawResponse = result.choices?.[0]?.message?.content?.trim() ?? null;

    if (rawResponse) {
      logger.info(`[AI][Order ${order.id}] Extracted Raw Response Content (first 500 chars): ${rawResponse.substring(0, 500)}`);
    } else {
      logger.warn(`[AI][Order ${order.id}] Raw Response Content IS NULL after parsing choices.`);
    }

    if (!rawResponse) {
      logger.warn({ result }, `[AI][Order ${order.id}] OpenAI returned empty response content.`);
      throw new Error('OpenAI returned empty response content.');
    }
    logger.debug(`[AI][Order ${order.id}] RAW RESPONSE Content:\n${rawResponse}`);

    let responseJson: unknown;
    try {
      const cleanedContent = rawResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      const contentToProcess = cleanedContent;
      // Add JSON fixing logic if needed (from previous versions)
      // ... (Truncated JSON fixing logic can be re-inserted here if necessary)
      responseJson = JSON.parse(contentToProcess);
      logger.debug(`[AI][Order ${order.id}] Parsed JSON response.`);
    } catch (e) {
      logger.error({ err: e, rawResponse }, `[AI][Order ${order.id}] Failed to parse AI JSON`);
      throw new Error(`Failed to parse AI JSON: ${(e as Error).message}.`);
    }

    const validationResult = AiOrderResponseSchema.safeParse(responseJson);
    if (!validationResult.success) {
      const errorString = JSON.stringify(validationResult.error.format(), null, 2);
      logger.error(`[AI][Order ${order.id}] Zod validation failed: ${errorString}`);
      throw new Error(`AI response validation failed: ${errorString}`);
    }

    logger.info(`[AI][Order ${order.id}] AI response validated.`);

    if (!options.dryRun) {
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
            promptSent: fullPromptForDebug, // Consider truncating if too long
            rawResponse: rawResponse, // Consider truncating if too long
            processingTimeMs: Date.now() - startTime,
            success: true,
            tasksGenerated,
            needsReviewCount,
            // tokenUsagePrompt: result.usage?.prompt_tokens, // Example if DB field existed
            // tokenUsageCompletion: result.usage?.completion_tokens, // Example if DB field existed
            // tokenUsageTotal: result.usage?.total_tokens, // Example if DB field existed
          },
        });
        logger.debug(
          {
            orderId: order.id,
            forceRecreate: options.forceRecreate,
            preserveText: options.preserveText
          },
          `[AI][Order ${order.id}] AI call logged to database with processing flags.`
        );
      } catch (logError) {
        logger.error(
          `[AI][Order ${order.id}] Failed to log AI call to database: ${logError instanceof Error ? logError.message : String(logError)}`
        );
      }
    }

    return {
      success: true,
      aiResponseData: validationResult.data,
      itemsSentToAi: itemsForPrompt,
      promptUsed: fullPromptForDebug,
      rawResponse,
      modelUsed,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown AI extraction error';
    logger.error(`[AI][Order ${order.id}] Extraction failed: ${errorMsg}`, error);

    if (!options.dryRun) {
      try {
        await prisma.aiCallLog.create({
          data: {
            scriptName: 'populate-print-queue',
            orderId: order.id,
            orderNumber: order.shipstation_order_number || null,
            marketplace: order.marketplace || null,
            aiProvider: 'openai',
            modelUsed: modelUsed || 'unknown',
            promptSent: fullPromptForDebug, // Consider truncating
            rawResponse: rawResponse || '', // Consider truncating
            processingTimeMs: Date.now() - startTime,
            success: false,
            errorMessage: errorMsg,
            tasksGenerated: 0,
            needsReviewCount: 0,
            // tokenUsagePrompt: result.usage?.prompt_tokens, // Example if DB field existed
            // tokenUsageCompletion: result.usage?.completion_tokens, // Example if DB field existed
            // tokenUsageTotal: result.usage?.total_tokens, // Example if DB field existed
          },
        });
        logger.debug(
          {
            orderId: order.id,
            forceRecreate: options.forceRecreate,
            preserveText: options.preserveText,
            error: errorMsg
          },
          `[AI][Order ${order.id}] Failed AI call logged to database with processing flags.`
        );
      } catch (logError) {
        logger.error(
          `[AI][Order ${order.id}] Failed to log AI error to database: ${logError instanceof Error ? logError.message : String(logError)}`
        );
      }
    }

    return {
      success: false,
      error: errorMsg,
      itemsSentToAi: itemsForPrompt,
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
  aiData: z.infer<typeof AiOrderResponseSchema> | undefined, // Now can be undefined if AI skipped
  options: ProcessingOptions,
  orderDebugInfo: OrderDebugInfo,
  originalItemsForPrompt: AiOrderItemData[]
): Promise<{ tasksCreatedCount: number; tasksSkippedCount: number; itemsNeedReviewCount: number }> {
  let tasksCreatedCount = 0;
  let tasksSkippedCount = 0;
  let itemsNeedReviewCount = 0;

  // Create a map for easy lookup of original item data including _amazon flags
  const originalItemsMap = new Map<string, AiOrderItemData>();
  originalItemsForPrompt.forEach(item => {
    if (item.id) { // id is shipstationLineItemKey
      originalItemsMap.set(item.id, item);
    }
  });

  const itemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
  const patchReasons: string[] = [];

  for (const item of order.items) {
    const orderItemId = item.id;
    logger.info({ orderId: order.id, itemId: orderItemId, shipstationLineItemKey: item.shipstationLineItemKey }, `[createOrUpdateTasksInTransaction] Processing item in loop.`);
    const preservedTexts = new Map<number, string | null>();
    const product = item.product; // Get product from the item

    // --- Preserve Text Logic (Placeholder for now) ---
    if (options.forceRecreate && !options.dryRun) {
      // Fetch existing tasks if preserveText is also true, before deleting
      if (options.preserveText) {
        const existingTasks = await tx.printOrderTask.findMany({
          where: { orderItemId: orderItemId },
          select: { taskIndex: true, custom_text: true },
          orderBy: { taskIndex: 'asc' },
        });
        existingTasks.forEach(task => preservedTexts.set(task.taskIndex, task.custom_text));
        logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Preserved text for ${existingTasks.length} tasks before deletion.`);
      }

      logger.info(`[DB-DEBUG][Order ${order.id}][Item ${orderItemId}] PRE-DELETE: Attempting to delete tasks where orderItemId = ${orderItemId}.`);
      const { count } = await tx.printOrderTask.deleteMany({
        where: { orderItemId: orderItemId },
      });
      logger.info(`[DB-DEBUG][Order ${order.id}][Item ${orderItemId}] POST-DELETE: Deleted ${count} tasks for orderItemId = ${orderItemId}.`);
    } else if (options.forceRecreate && options.dryRun) {
      logger.info(`[Dry Run][Order ${order.id}][Item ${orderItemId}] Would delete existing tasks due to forceRecreate.`);
      if (options.preserveText) {
        logger.info(`[Dry Run][Order ${order.id}][Item ${orderItemId}] Would fetch and preserve text before deletion.`);
        // In a real scenario, you might simulate fetching to see if tasks exist
      }
    }

    let itemDebugEntry = orderDebugInfo.items.find(i => i.itemId === item.id);
    if (!itemDebugEntry) {
      itemDebugEntry = { itemId: item.id, status: 'Pending Transaction Logic', createdTaskIds: [] };
      orderDebugInfo.items.push(itemDebugEntry);
    } else {
      itemDebugEntry.status = 'Starting Transaction Logic';
      itemDebugEntry.createdTaskIds = [];
    }

    const taskDetailsToCreate: TaskPersonalizationData[] = [];
    let finalDataSource: string | null = null; // Will be 'AmazonURL', 'AI_Direct', 'Placeholder', etc.
    const lineItemKey = item.shipstationLineItemKey;

    // --- Try Direct Extraction First (e.g., Amazon URL) ---
    const directExtractionResult = await extractDirectItemData(order, item, product);
    finalDataSource = directExtractionResult.dataSource;

    if (directExtractionResult.dataSource === 'AmazonURL') {
      logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Using data from ${directExtractionResult.dataSource}. Annotation: ${directExtractionResult.annotation}`);
      let customTextToUse = directExtractionResult.customText;
      let annotationToUse = directExtractionResult.annotation;

      // Preserve text if applicable (even for direct extraction)
      if (options.forceRecreate && options.preserveText) {
        // This logic for fetching existing tasks for preserveText during forceRecreate
        // should have already run and populated preservedTexts map if --force-recreate was used
        // For now, assume preservedTexts might be empty or we need to fetch if not already done.
        // Simplified: if preservedTexts.get(0) exists for taskIndex 0.
        const existingTextForTask0 = preservedTexts.get(0);
        if (existingTextForTask0) {
          customTextToUse = existingTextForTask0;
          const preservedMsg = `Preserving existing text: "${customTextToUse}" (was: "${directExtractionResult.customText}")`;
          logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] ${preservedMsg}`);
          annotationToUse = `${annotationToUse || ''} (${preservedMsg})`.trim();
        }
      }

      taskDetailsToCreate.push({
        custom_text: customTextToUse,
        color_1: directExtractionResult.color1,
        color_2: directExtractionResult.color2,
        quantity: item.quantity || 1,
        needs_review: directExtractionResult.needsReview || false,
        review_reason: directExtractionResult.reviewReason || null,
        status: PrintTaskStatus.pending,
        annotation: annotationToUse,
      });
      if (itemDebugEntry) itemDebugEntry.status = `Success (${directExtractionResult.dataSource})`;

      // ShipStation sync logic for AmazonURL data
      if (lineItemKey && order.shipstation_order_id && (directExtractionResult.customText || directExtractionResult.color1 || directExtractionResult.color2)) {
        const ssOptions = [];
        if (directExtractionResult.customText) ssOptions.push({ name: 'Name or Text', value: directExtractionResult.customText });
        if (directExtractionResult.color1) ssOptions.push({ name: 'Colour 1', value: directExtractionResult.color1 });
        if (directExtractionResult.color2) ssOptions.push({ name: 'Colour 2', value: directExtractionResult.color2 });

        if (ssOptions.length > 0) {
          if (options.dryRun) {
            logger.info(`[Dry Run][ShipStation Update][Order ${order.id}][Item ${orderItemId}] Would update SS item options from ${directExtractionResult.dataSource} with ${JSON.stringify(ssOptions)}`);
          } else {
            itemsToPatch[lineItemKey] = ssOptions;
            patchReasons.push(`${lineItemKey}(${directExtractionResult.dataSource})`);
            logger.info(`[ShipStation Update][Order ${order.id}][Item ${orderItemId}] Prepared item options from ${directExtractionResult.dataSource} for SS patch.`);
          }
        }
      }

    } else {
      // --- Fallback to AI or Placeholder Logic ---
      logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] No direct data found or direct extraction failed (DataSource: ${directExtractionResult.dataSource}). Falling back to AI/Placeholder.`);
      finalDataSource = 'AI'; // Default assumption if not AmazonURL
      const itemPzResult = lineItemKey ? aiData?.itemPersonalizations[lineItemKey] : undefined;

      if (options.skipAi || (itemPzResult && itemPzResult.personalizations && itemPzResult.personalizations.length > 0)) {
        if (options.skipAi) {
          logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] AI processing skipped via --skip-ai. Will create placeholder if enabled.`);
          finalDataSource = 'Skipped_AI';
        } else if (itemPzResult) { // Ensure itemPzResult is not undefined
          itemPzResult.personalizations.forEach((p: z.infer<typeof PersonalizationDetailSchema>, _taskIndex) => {
            const taskDataForArray: TaskPersonalizationData = {
              custom_text: p.customText,
              color_1: p.color1,
              color_2: p.color2,
              quantity: p.quantity || 1,
              needs_review: p.needsReview || itemPzResult.overallNeedsReview || false,
              review_reason: p.reviewReason || itemPzResult.overallReviewReason,
              status: PrintTaskStatus.pending,
              annotation: p.annotation,
            };
            taskDetailsToCreate.push(taskDataForArray);
          });
          finalDataSource = 'AI_Direct';
          if (itemDebugEntry) itemDebugEntry.status = 'AI Data Parsed';
        }
      } else {
        logger.warn({ orderId: order.id, itemId: orderItemId, lineItemKey }, "No AI personalizations found for line item.");
        if (options.createPlaceholder) {
          logger.info({ orderId: order.id, itemId: orderItemId }, "Creating placeholder task as 'createPlaceholder' is true.");
          let placeholderReason = `No AI personalizations for lineItemKey ${lineItemKey}. Check order notes/options.`;
          if (directExtractionResult.dataSource === null && directExtractionResult.annotation && directExtractionResult.annotation !== 'Needs AI processing') {
            placeholderReason = directExtractionResult.annotation; // Use error from direct extraction if available
          }
          taskDetailsToCreate.push({
            custom_text: 'Placeholder - Check Order Details',
            color_1: null,
            color_2: null,
            quantity: item.quantity || 1,
            needs_review: true,
            review_reason: placeholderReason.substring(0, 1000),
            status: PrintTaskStatus.pending,
          });
          finalDataSource = 'Placeholder';
          if (itemDebugEntry) itemDebugEntry.status = 'Placeholder Creation';
        } else {
          logger.warn(
            `[DB][Order ${order.id}][Item ${orderItemId}] No AI personalizations and 'createPlaceholder' is false. No task will be created for this item.`
          );
          finalDataSource = 'Skipped_No_Data';
          if (itemDebugEntry) itemDebugEntry.status = 'Skipped - No Placeholder';
        }
      }

      // ShipStation sync logic for AI data (Personalized Details)
      if (lineItemKey && finalDataSource === 'AI_Direct' && aiData?.itemPersonalizations && order.shipstation_order_id) {
        const personalizationsForThisKey = aiData.itemPersonalizations[lineItemKey]?.personalizations;
        const detailsString = buildPersonalizedDetailsString(personalizationsForThisKey || [], lineItemKey, order.id);
        if (personalizationsForThisKey && personalizationsForThisKey.length > 0) {
          const ssOptions = [{ name: 'Personalized Details', value: detailsString }];
          if (options.dryRun) {
            logger.info(`[Dry Run][ShipStation Update][Order ${order.id}][Item ${orderItemId}] Would update SS item options from AI_Direct with ${JSON.stringify(ssOptions)}`);
          } else {
            itemsToPatch[lineItemKey] = ssOptions;
            patchReasons.push(`${lineItemKey}(AI-PD)`);
            logger.info(`[ShipStation Update][Order ${order.id}][Item ${orderItemId}] Prepared item options from AI_Direct for SS patch.`);
          }
        }
      }
    }

    if (taskDetailsToCreate.length > 0) {
      for (let taskIndex = 0; taskIndex < taskDetailsToCreate.length; taskIndex++) {
        const detail = taskDetailsToCreate[taskIndex];
        const textToUse = (options.forceRecreate && options.preserveText && preservedTexts.get(taskIndex)) || detail.custom_text;

        // Data for the 'update' part of upsert - should only contain fields that can be updated
        const updatePayload = {
          custom_text: textToUse,
          color_1: detail.color_1,
          color_2: detail.color_2,
          quantity: detail.quantity,
          needs_review: detail.needs_review,
          review_reason: detail.review_reason,
          status: detail.status,
          annotation: detail.annotation,
          // Ensure all other updatable fields from PrintOrderTask are here
          shorthandProductName: item.product?.name ? (item.product.name.length > 100 ? item.product.name.substring(0, 97) + '...' : item.product.name) : 'Unknown',
          ship_by_date: order.ship_by_date,
          marketplace_order_number: order.shipstation_order_number,
        };

        const whereClause = {
          orderItemId_taskIndex: {
            orderItemId: orderItemId,
            taskIndex: taskIndex,
          },
        };

        // Data for the 'create' part of upsert - contains all required fields for a new task
        const createPayload = {
          ...updatePayload, // Contains custom_text, color_1, color_2, quantity, needs_review, review_reason, status, annotation, shorthandProductName, ship_by_date, marketplace_order_number
          orderItemId: orderItemId,
          productId: item.productId,
          // Fields below are specific to 'create' and not in 'updatePayload' or are essential FKs
          taskIndex: taskIndex,
          orderId: order.id,
          // customerId is not directly in updatePayload, handle if needed for create:
          // customerId: order.customerId, // Example: if you need to set it explicitly or connect
        };

        logger.info({
          orderId: order.id,
          itemId: orderItemId,
          taskIndex,
          finalDataSource,
          where: whereClause,
          updateData: updatePayload,
          createData: createPayload
        }, `[DB-DEBUG][Order ${order.id}][Item ${orderItemId}][TaskIdx ${taskIndex}] PRE-UPSERT: Details.`);

        try {
          const upsertedTask = await tx.printOrderTask.upsert({
            where: whereClause,
            update: updatePayload,
            create: createPayload,
          });
          tasksCreatedCount++;
          if (detail.needs_review) { // Check the source detail that determined the task's review status
            itemsNeedReviewCount++;
          }
          if (itemDebugEntry) itemDebugEntry.createdTaskIds.push(upsertedTask.id);
          logger.info({
            orderId: order.id,
            itemId: orderItemId,
            taskIndex,
            upsertedTaskId: upsertedTask.id,
            customText: upsertedTask.custom_text,
            color1: upsertedTask.color_1,
            status: finalDataSource
          }, `[DB-DEBUG][Order ${order.id}][Item ${orderItemId}][TaskIdx ${taskIndex}] POST-UPSERT: Upserted task ID ${upsertedTask.id}. Status: Task ${tasksCreatedCount - 1} Upserted`);
          if (itemDebugEntry) itemDebugEntry.status = 'Task ' + taskIndex + ' Upserted';

        } catch (dbError) {
          logger.error({
            orderId: order.id,
            itemId: orderItemId,
            taskIndex,
            error: dbError,
            where: whereClause,
            updateData: updatePayload,
            createData: createPayload
          }, `[DB-DEBUG][Order ${order.id}][Item ${orderItemId}][TaskIdx ${taskIndex}] UPSERT FAILED`);
          if (itemDebugEntry) {
            itemDebugEntry.status = 'Task ' + taskIndex + ' Upsert Failed';
            itemDebugEntry.error = dbError instanceof Error ? dbError.message : String(dbError);
          }
        }
      }
    } else {
      // This block executes if taskDetailsToCreate is empty for the current item.
      // This means neither direct extraction nor AI/Placeholder logic resulted in tasks.
      tasksSkippedCount++;
      logger.info(
        `[DB][Order ${order.id}][Item ${orderItemId}] No tasks generated (direct, AI, or placeholder). Incrementing tasksSkippedCount.`
      );
      if (itemDebugEntry) {
        itemDebugEntry.status = 'Skipped - No Tasks Generated';
      }
    }
  }

  // Conditional ShipStation Sync Logic (Data Preparation part for dry run)
  if (options.syncToShipstation && options.dryRun && order.shipstation_order_id) {
    logger.info({ orderId: order.id }, "[Dry Run] Preparing ShipStation sync data...");
    if (Object.keys(itemsToPatch).length > 0) {
      // Construct auditNoteForInternalNotes for dry run log
      const packingListLines_dryRun: string[] = [];
      let taskCounter_dryRun = 1;
      if (aiData?.itemPersonalizations) {
        for (const ssOrderItemId_str of Object.keys(aiData.itemPersonalizations)) {
          const itemPers = aiData.itemPersonalizations[ssOrderItemId_str];
          if (itemPers && itemPers.personalizations) {
            for (const pers of itemPers.personalizations) {
              const text = pers.customText || 'N/A';
              const color1 = pers.color1 || '';
              const color2 = pers.color2 ? ` / ${pers.color2} ` : '';
              packingListLines_dryRun.push(`${taskCounter_dryRun++}. ${text} (${color1}${color2})`);
            }
          }
        }
      }
      const packingListHeader_dryRun = `PACKING LIST(Order #${order.shipstation_order_number || 'N/A'}): `;
      const packingListString_dryRun = packingListLines_dryRun.length > 0 ? packingListLines_dryRun.join('\n') : "No specific personalizations found by AI for packing list.";
      const originalCustomerNotes_dryRun = order.customer_notes || 'No customer notes provided.';
      const syncDetails_dryRun = `Automated Task Sync(Dry Run) ${new Date().toISOString()} -> ${patchReasons.join(', ')} `;
      const auditNoteForInternalNotes_dryRun = `${packingListHeader_dryRun} \n${packingListString_dryRun} \n-- -\nOriginal Customer Notes: \n${originalCustomerNotes_dryRun} \n-- -
            ${syncDetails_dryRun} `;

      logger.info({ orderId: order.id, itemsToPatch, auditNote: auditNoteForInternalNotes_dryRun },
        "[Dry Run] Would update ShipStation with items and internalNotes.");
    } else {
      logger.info({ orderId: order.id }, "[Dry Run] No item options prepared for ShipStation patching (itemsToPatch is empty).");
    }
  }

  // Actual ShipStation Sync Logic (executes if NOT dryRun)
  if (options.syncToShipstation && !options.dryRun && Object.keys(itemsToPatch).length > 0 && order.shipstation_order_id) {
    try {
      const ssOrderResp = await getShipstationOrders({ orderId: Number(order.shipstation_order_id) });
      if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
        // --- START logic for Packing List in internalNotes (from previous successful edit) ---
        const packingListLines: string[] = [];
        let currentTaskNumberForPackingList = 1;
        if (aiData?.itemPersonalizations) {
          for (const ssOrderItemId_str of Object.keys(aiData.itemPersonalizations)) {
            const itemPers = aiData.itemPersonalizations[ssOrderItemId_str];
            if (itemPers && itemPers.personalizations) {
              for (const pers of itemPers.personalizations) {
                const text = pers.customText || 'N/A';
                const color1 = pers.color1 || '';
                const color2 = pers.color2 ? ` / ${pers.color2} ` : '';
                packingListLines.push(`${currentTaskNumberForPackingList}. ${text} (${color1}${color2})`);
                currentTaskNumberForPackingList++;
              }
            }
          }
        }

        const packingListHeader = `PACKING LIST(Order #${order.shipstation_order_number || 'N/A'}): `;
        const packingListString = packingListLines.length > 0 ? packingListLines.join('\n') : "No specific personalizations found by AI.";

        const fetchedSsOrder = ssOrderResp.orders[0];
        const originalCustomerNotes = fetchedSsOrder.customerNotes || order.customer_notes || 'No customer notes provided.';

        const syncDetails = `Automated Task Sync ${new Date().toISOString()} -> ${patchReasons.join(', ')} `;

        const auditNoteForInternalNotes = `${packingListHeader} \n${packingListString} \n-- -\nOriginal Customer Notes: \n${originalCustomerNotes} \n-- -\n${syncDetails} `;
        // --- END logic for Packing List in internalNotes ---

        await updateOrderItemsOptionsBatch(fetchedSsOrder, itemsToPatch, auditNoteForInternalNotes);
        logger.info(`[ShipStation Batch][Order ${order.id}] Successfully updated items: ${patchReasons.join(', ')} `);
      } else {
        logger.error(`[ShipStation Batch][Order ${order.id}] Failed to fetch SS order for batch update.`);
      }
    } catch (batchErr) {
      logger.error(`[ShipStation Batch][Order ${order.id}] Error during batch update`, batchErr);
    }
  } else if (options.syncToShipstation && Object.keys(itemsToPatch).length === 0 && order.shipstation_order_id) {
    logger.info(`[ShipStation Update][Order ${order.id}] No item options were prepared for patching, though sync was enabled.Internal notes not updated.`);
  } else if (options.syncToShipstation && !order.shipstation_order_id) {
    logger.warn(`[ShipStation Update][Order ${order.id}] Sync to ShipStation was enabled, but the order is missing a ShipStation Order ID.Skipping sync.`);
  }

  logger.info(`[DB-DEBUG][Order ${order.id}] END OF createOrUpdateTasksInTransaction: tasksCreatedCount=${tasksCreatedCount}, itemsNeedReviewCount=${itemsNeedReviewCount}`);
  return { tasksCreatedCount, tasksSkippedCount, itemsNeedReviewCount };
}

// --- Add new function to sync existing tasks to ShipStation ---
async function syncExistingTasksToShipstation(
  orderId: number,
  options: ProcessingOptions
): Promise<{ updatedCount: number; failedCount: number }> {
  logger.info(`[ShipStation Sync] Starting sync of existing tasks for order ${orderId}...`);
  const itemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
  const patchReasons: string[] = [];
  let updatedCount = 0;
  let failedCount = 0;

  try {
    const orderDetails = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        shipstation_order_id: true,
        shipstation_order_number: true,
        customer_notes: true, // Added for internalNotes
        internal_notes: true, // Added for internalNotes reference if needed
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
      `[ShipStation Sync] Found order ${orderId} with ShipStation order ID ${orderDetails.shipstation_order_id} and order number ${orderDetails.shipstation_order_number} `
    );

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

    if (
      ssOrder.orderStatus &&
      (ssOrder.orderStatus.toLowerCase() === 'shipped' ||
        ssOrder.orderStatus.toLowerCase() === 'fulfilled')
    ) {
      logger.warn(
        `[ShipStation Sync] ⚠️ WARNING: Order ${orderId} (${orderDetails.shipstation_order_number}) is already marked as "${ssOrder.orderStatus}" in ShipStation.`
      );
      logger.warn(
        `[ShipStation Sync] ShipStation usually prevents modifications to shipped orders.Updates may not take effect.`
      );

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

    // --- START: Logic for consolidated "Personalized Details" and Packing List for internalNotes ---
    const allOrderPackingListLines: string[] = [];

    for (const item of orderDetails.items) {
      if (!item.shipstationLineItemKey) {
        logger.warn(
          `[ShipStation Sync][Item ${item.id}] Missing ShipStation line item key.Skipping personalized details generation.`
        );
        failedCount++; // Count as failed for personalized details part
        continue;
      }

      if (item.printTasks.length === 0) {
        logger.info(
          `[ShipStation Sync][Item ${item.id}] No print tasks.Skipping personalized details generation for this item.`
        );
        // Not necessarily a failure of the whole sync, but no details to add for this item
        continue;
      }

      // Use loop index for numbering packing list lines
      item.printTasks.forEach((task, index) => {
        const detail = task.custom_text || 'N/A';
        const color1 = task.color_1;
        const color2 = task.color_2 ? ` / ${task.color_2}` : '';
        const taskDetailString = `${detail} (${color1 || 'N/A'}${color2})`;
        allOrderPackingListLines.push(`${index + 1}. ${taskDetailString} `);
      });

      const taskPersonalizations: Array<z.infer<typeof PersonalizationDetailSchema>> = item.printTasks.map(task => ({
        customText: task.custom_text,
        color1: task.color_1,
        color2: task.color_2,
        quantity: 1,
        needsReview: false,
        reviewReason: null,
        annotation: null,
      }));

      // buildPersonalizedDetailsString uses module-scoped logger
      const detailsString = buildPersonalizedDetailsString(taskPersonalizations, item.shipstationLineItemKey, orderDetails.id);

      if (taskPersonalizations.length > 0) {
        const ssOption = { name: 'Personalized Details', value: detailsString };
        itemsToPatch[item.shipstationLineItemKey] = [ssOption];
        patchReasons.push(`${item.shipstationLineItemKey} (PD - Sync)`);
        if (!options.dryRun) updatedCount++;
      } else {
        logger.info(
          `[ShipStation Sync][Item ${item.id}] No details extracted from tasks for line item key ${item.shipstationLineItemKey}.`
        );
      }
    }

    const packingListHeader = `PACKING LIST(Order #${orderDetails.shipstation_order_number || 'N/A'}): `;
    const packingListString = allOrderPackingListLines.length > 0
      ? allOrderPackingListLines.join('\n')
      : "No specific personalizations found in tasks.";

    const originalCustomerNotes = ssOrder.customerNotes || orderDetails.customer_notes || 'No customer notes provided.';

    const syncDetails = `Automated Task Sync(Existing) ${new Date().toISOString()} -> ${patchReasons.join(', ')} `;

    const finalAuditNoteForInternalNotes = `${packingListHeader} \n${packingListString} \n-- -\nOriginal Customer Notes: \n${originalCustomerNotes} \n-- -\n${syncDetails} `;
    // --- END: Logic for consolidated "Personalized Details" and Packing List for internalNotes ---

    if (options.dryRun) {
      if (Object.keys(itemsToPatch).length > 0) {
        logger.info(
          { orderId, itemsToPatch, internalNotesPreview: finalAuditNoteForInternalNotes }, // Use the actual finalAuditNoteForInternalNotes
          `[Dry Run][ShipStation Sync - Only] Would update ShipStation order ${orderDetails?.shipstation_order_id} with items and internalNotes.`
        );
      } else {
        logger.info({ orderId }, `[Dry Run][ShipStation Sync - Only] No items require updates for order ${orderId}.`);
      }
    } else if (Object.keys(itemsToPatch).length > 0 && ssOrder) { // Ensure ssOrder is defined for live update
      try {
        await updateOrderItemsOptionsBatch(ssOrder, itemsToPatch, finalAuditNoteForInternalNotes);
        logger.info(
          `[ShipStation Sync] Successfully updated items in ShipStation for order ${orderId}: ${patchReasons.join(', ')} and internalNotes.`
        );
        // updatedCount is already managed per item successfully patched
      } catch (batchErr) {
        logger.error(`[ShipStation Sync][Order ${orderId}] Batch update error`, batchErr);
        failedCount += Object.keys(itemsToPatch).length; // All items in this batch failed
        updatedCount -= Object.keys(itemsToPatch).length; // Revert optimistic count
        if (updatedCount < 0) updatedCount = 0;
      }
    } else {
      logger.info(`[ShipStation Sync] No item options to update in ShipStation for order ${orderId}.Internal notes were not updated as no item changes were pending.`);
    }

    logger.info(
      `[ShipStation Sync] Completed sync for order ${orderId}.Items prepared / updated: ${updatedCount}, Items failed: ${failedCount} `
    );
    return { updatedCount, failedCount };
  } catch (error) {
    logger.error(
      { err: error, orderId },
      `[ShipStation Sync] Failed to sync order ${orderId}: ${error instanceof Error ? error.message : String(error)} `
    );
    failedCount = Math.max(failedCount, 1); // Ensure at least one failure if error occurs here
  }
  return { updatedCount, failedCount };
}

// --- Main Execution ---
async function main() {
  const SCRIPT_NAME = 'populate-print-queue';
  let scriptRunSuccess = true;
  let finalMessage = 'Script finished.';
  let mainTryCatchError: Error | null = null;
  let isPrismaConnected = false;
  let fileLogStream: fsCallback.WriteStream | null = null;
  let shuttingDown = false;

  // Counters
  let totalOrdersProcessed = 0;
  let totalOrdersFailed = 0;
  let totalTasksCreated = 0;
  const failedOrderIds: number[] = [];

  // STEP 1: Full Logger Initialization (re-assigns module-scoped logger)
  const logDir = path.join(process.cwd(), SCRIPT_LOG_DIR);
  const logFilePath = path.join(logDir, `${SCRIPT_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  try {
    await fs.mkdir(logDir, { recursive: true });
    fileLogStream = fsCallback.createWriteStream(logFilePath, { flags: 'a' });
    logger = pino( // Re-assigns the module-scoped logger
      { level: 'info' }, // Default level
      pino.multistream([{ stream: process.stdout }, { stream: fileLogStream }])
    );
  } catch (logSetupError: unknown) {
    const setupErr = logSetupError instanceof Error ? logSetupError : new Error(String(logSetupError));
    (logger || console).error({ err: setupErr, stack: setupErr.stack }, "Critical error setting up logger!");
    if (!fileLogStream) logger = pino({ level: 'info' }); // Fallback to stdout if file stream failed
  }

  // STEP 2: Define cleanupAndExit (uses module-scoped logger)
  async function cleanupAndExit(errorForCleanup: Error | null, triggerEvent: string) {
    if (shuttingDown) { /* ... */ return; }
    shuttingDown = true;
    const isErrorCondition = !!errorForCleanup || !scriptRunSuccess;
    const finalExitCode = isErrorCondition ? 1 : 0;
    logger.info({ triggerEvent, error: errorForCleanup?.message, finalExitCode }, `Shutdown sequence started.`);
    if (isPrismaConnected) { /* ... disconnect prisma ... */ }
    if (typeof logger.flush === 'function') { /* ... flush logger ... */ }
    if (fileLogStream && !fileLogStream.destroyed) { /* ... close fileLogStream ... */ }
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(finalExitCode);
  }

  // STEP 3: Attach Signal Handlers (call cleanupAndExit)
  process.on('uncaughtException', (_errCaught) => { // Prefixed with _
    // Use console.error as logger itself might be compromised or in an unstable state
    (logger || console).fatal({ err: _errCaught, stack: _errCaught.stack }, 'UNCAUGHT EXCEPTION!');
    mainTryCatchError = _errCaught;
    scriptRunSuccess = false;
    cleanupAndExit(_errCaught, 'uncaughtException');
  });
  process.on('unhandledRejection', (_reason) => { // Prefixed with _
    const err = _reason instanceof Error ? _reason : new Error(String(_reason));
    (logger || console).fatal({ err, stack: err.stack }, 'UNHANDLED REJECTION!');
    mainTryCatchError = err;
    scriptRunSuccess = false;
    cleanupAndExit(err, 'unhandledRejection');
  });
  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal =>
    process.on(signal, () => {
      (logger || console).warn(`Received ${signal}. Shutting down gracefully...`);
      scriptRunSuccess = false; // Signal means not a full success
      // Pass a new error object for signals, as there isn't an existing error object
      cleanupAndExit(new Error(`Received signal: ${signal} `), signal);
    })
  );

  // STEP 4: Main Try-Catch-Finally Block
  try {
    // STEP 4a: Commander Setup & Parse (AFTER logger is fully init)
    const program = new Command();
    program
      .name(SCRIPT_NAME)
      .description('Fetch orders and create print tasks via AI.')
      .option('-o, --order-id <id>', 'Process order by DB ID, ShipStation Order Number, or ShipStation Order ID', String)
      .option('-l, --limit <number>', 'Limit orders fetched', val => parseInt(val, 10))
      .option('--days <number>', 'Limit orders to those created in the last X days', val => parseInt(val, 10))
      .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
      .option('--openai-model <model>', 'OpenAI model', DEFAULT_OPENAI_MODEL)
      .option('--system-prompt-file <path>', 'Path to system prompt file', DEFAULT_SYSTEM_PROMPT_PATH)
      .option('--user-prompt-file <path>', 'Path to user prompt template file', DEFAULT_USER_PROMPT_PATH)
      .option('--debug', 'Enable debug logging', false)
      .option('--verbose', 'Enable verbose logging', false)
      .option('--log-level <level>', 'Set log level', 'info')
      .option('-f, --force-recreate', 'Delete existing tasks first', false)
      .option('--create-placeholder', 'Create placeholder on AI fail or if AI is skipped', true)
      .option('-y, --confirm', 'Skip confirmation prompts', false)
      .option('--clear-all', 'Delete ALL tasks first (requires confirm)', false)
      .option('--dry-run', 'Simulate without DB changes', false)
      .option('--preserve-text', 'Keep existing custom text/names when recreating tasks', false)
      .option('--skip-ai', 'Skip AI extraction step', false)
      .option('--sync-to-shipstation', 'Enable ShipStation synchronization during processing', false)
      .option('--shipstation-sync-only', 'Only sync existing DB tasks to ShipStation without changing DB', false)
      .option('--debug-file <path>', 'Path for detailed debug log file (requires --order-id)', String);
    program.parse(process.argv);
    const cmdOptions = program.opts<ProcessingOptions>();

    if (cmdOptions.verbose) logger.level = 'debug';
    else if (cmdOptions.logLevel) logger.level = cmdOptions.logLevel;

    logger.info(`-- - Script Start: ${new Date().toISOString()} --- `);
    logger.info(`Logging to file: ${logFilePath} `);
    logger.info(`Effective logger level: ${logger.level} `);
    logger.info(`Parsed CLI Options: ${JSON.stringify({ ...cmdOptions, openaiApiKey: '***' })} `);

    cmdOptions.systemPrompt = await loadPromptFile(cmdOptions.systemPromptFile || DEFAULT_SYSTEM_PROMPT_PATH);
    cmdOptions.userPromptTemplate = await loadPromptFile(cmdOptions.userPromptFile || DEFAULT_USER_PROMPT_PATH);
    logger.info(`Prompts loaded.`);

    if (!cmdOptions.openaiApiKey) throw new Error('OpenAI API key missing.');

    await prisma.$connect();
    isPrismaConnected = true;
    logger.info('DB connected.');

    await createRunLog({ scriptName: SCRIPT_NAME });
    await fixInvalidStlRenderStatus(prisma);

    logger.info('Finding orders...');
    const ordersToProcess = await getOrdersToProcess(prisma, cmdOptions.orderId, cmdOptions.limit, cmdOptions.forceRecreate);
    logger.info({ count: ordersToProcess.length }, `Orders to process found.`);

    for (const order of ordersToProcess) {
      totalOrdersProcessed++;
      logger.info({ orderId: order.id, orderNumber: order.shipstation_order_number, marketplace: order.marketplace }, `-- - Processing Order ${order.id} (Marketplace: ${order.marketplace}) --- `);

      let orderProcessingSuccess = true; // Flag for this specific order
      // Initialize variables that will hold results from AI extraction or defaults
      let itemsSentToAiForTransaction: AiOrderItemData[] = [];
      let aiDataForTransaction: z.infer<typeof AiOrderResponseSchema> = { itemPersonalizations: {} };

      if (cmdOptions.shipstationSyncOnly) {
        logger.info({ orderId: order.id }, `ShipStation sync - only mode enabled.Skipping AI extraction and DB updates.`);
        try {
          const { updatedCount, failedCount } = await syncExistingTasksToShipstation(order.id, cmdOptions);
          logger.info({ orderId: order.id, updatedCount, failedCount }, `ShipStation sync completed for order.`);
        } catch (syncErr: unknown) {
          const actualSyncError = syncErr instanceof Error ? syncErr : new Error(String(syncErr));
          logger.error({ orderId: order.id, err: actualSyncError, stack: actualSyncError.stack }, `ShipStation sync - only failed for order.`);
          totalOrdersFailed++;
          failedOrderIds.push(order.id);
          orderProcessingSuccess = false;
        }
        continue; // Move to the next order
      }

      const orderDebugInfo: OrderDebugInfo = {
        orderId: order.id,
        orderNumber: order.shipstation_order_number ?? '',
        marketplace: order.marketplace,
        overallStatus: 'Starting',
        promptSent: null,
        rawResponseReceived: null,
        parsedResponse: null,
        processingError: null,
        aiProvider: 'openai',
        modelUsed: cmdOptions.openaiModel,
        items: [],
        forceRecreate: cmdOptions.forceRecreate,
        preserveText: cmdOptions.preserveText,
        skipAi: cmdOptions.skipAi,
      };

      try {
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);
        orderDebugInfo.overallStatus = 'Extracting AI Data';

        if (cmdOptions.skipAi) {
          logger.info({ orderId: order.id }, 'Skipping AI extraction as per --skip-ai flag.');
          orderDebugInfo.overallStatus = 'AI Skipped';
          // itemsSentToAiForTransaction remains []
          // aiDataForTransaction remains { itemPersonalizations: {} }
        } else {
          const extractionResult = await extractOrderPersonalization(order, {
            openaiApiKey: cmdOptions.openaiApiKey,
            openaiModel: cmdOptions.openaiModel,
            systemPrompt: cmdOptions.systemPrompt,
            userPromptTemplate: cmdOptions.userPromptTemplate,
            forceRecreate: cmdOptions.forceRecreate,
            preserveText: cmdOptions.preserveText,
            dryRun: cmdOptions.dryRun
          });
          itemsSentToAiForTransaction = extractionResult.itemsSentToAi; // Populate here
          orderDebugInfo.promptSent = extractionResult.promptUsed;
          orderDebugInfo.rawResponseReceived = extractionResult.rawResponse;
          orderDebugInfo.modelUsed = extractionResult.modelUsed ?? cmdOptions.openaiModel;

          if (!extractionResult.success || !extractionResult.aiResponseData) {
            const aiErrorMsg = extractionResult.error || 'AI extraction returned no data';
            orderDebugInfo.processingError = aiErrorMsg;
            logger.error({ orderId: order.id, err: aiErrorMsg }, 'AI Extraction Failed');
            orderDebugInfo.overallStatus = 'AI Extraction Failed';
            if (cmdOptions.createPlaceholder) {
              logger.info({ orderId: order.id }, 'Proceeding with placeholder creation due to AI failure.');
              // aiDataForTransaction remains { itemPersonalizations: {} }, placeholder logic is in createOrUpdateTasksInTransaction
            } else {
              throw new Error(aiErrorMsg); // This will be caught by the outer catch for this order
            }
          } else {
            aiDataForTransaction = extractionResult.aiResponseData; // Assign successful AI response
            orderDebugInfo.parsedResponse = aiDataForTransaction;
            orderDebugInfo.overallStatus = 'AI Data Extracted';
          }
        }
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);

        if (cmdOptions.dryRun) {
          logger.info({ orderId: order.id }, '[Dry Run] Simulating task creation/DB upserts...');
          const itemsToLogForDryRun = itemsSentToAiForTransaction; // Use the correctly populated variable
          const aiDataToLogForDryRun = aiDataForTransaction;    // Use the correctly populated variable
          logger.info({ orderId: order.id, itemsCount: itemsToLogForDryRun.length, hasAiData: !!aiDataToLogForDryRun }, '[Dry Run] Data that would be used for tasks (summary).');
          if (itemsToLogForDryRun.some((item: AiOrderItemData) => item._amazonDataProcessed)) {
            logger.info({ orderId: order.id }, '[Dry Run] Contains items with directly extracted Amazon data.');
          }
          if (aiDataToLogForDryRun && Object.keys(aiDataToLogForDryRun.itemPersonalizations).length > 0) {
            logger.info({ orderId: order.id, aiData: aiDataToLogForDryRun }, '[Dry Run] AI data that would be used for tasks (detail if present).');
          }
          orderDebugInfo.overallStatus = 'Dry Run Complete';
        } else {
          orderDebugInfo.overallStatus = 'Starting DB Transaction';
          // aiDataForTransaction is already populated from the block above
          const { tasksCreatedCount: currentTasks } = await prisma.$transaction(
            async (tx) => {
              const itemsToPassToTransaction = itemsSentToAiForTransaction;       // Use the correctly populated variable
              // aiDataForTransaction holds AI response or default, so it's fine to pass directly
              return createOrUpdateTasksInTransaction(tx, order, aiDataForTransaction, cmdOptions, orderDebugInfo, itemsToPassToTransaction);
            },
            {
              maxWait: PRISMA_TRANSACTION_MAX_WAIT,
              timeout: PRISMA_TRANSACTION_TIMEOUT
            }
          );
          totalTasksCreated += currentTasks;
          logger.info({ orderId: order.id, tasksCreated: currentTasks }, 'DB Transaction finished.');
          if (!orderDebugInfo.processingError) orderDebugInfo.overallStatus = 'Transaction Committed';
        }
      } catch (orderProcessingError: unknown) { // Typed as unknown
        orderProcessingSuccess = false;
        const actualError = orderProcessingError instanceof Error ? orderProcessingError : new Error(String(orderProcessingError));
        logger.error({ orderId: order.id, err: actualError, stack: actualError.stack }, `Error processing order ${order.id}.`);
        orderDebugInfo.processingError = actualError.message;
        orderDebugInfo.overallStatus = 'Processing Failed';
        // Placeholder creation logic if AI failed or this block is hit, was more complex before, ensure it's correct
        if (cmdOptions.createPlaceholder) {
          logger.info({ orderId: order.id }, 'Creating placeholder task as order processing failed and createPlaceholder is true.');
          // This part might need access to `taskDetailsToCreate` and `finalDataSource` if they were defined in this scope
          // For now, just logging. If tasks need to be created here, that logic needs to be in scope.
        }
      } finally {
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);
        logger.info({ orderId: order.id, finalItemStatus: orderDebugInfo.overallStatus }, `-- - Finished Order ${order.id} --- `);
        if (!orderProcessingSuccess) {
          totalOrdersFailed++;
          failedOrderIds.push(order.id);
        }
      }
    } // End of for...of loop for orders

    finalMessage = `Processed ${totalOrdersProcessed} orders.Succeeded: ${totalOrdersProcessed - totalOrdersFailed}.Failed: ${totalOrdersFailed}. Tasks Upserted: ${totalTasksCreated}.`;
    if (totalOrdersFailed > 0) finalMessage += ` Failed Order IDs: [${failedOrderIds.join(', ')}]`;
    scriptRunSuccess = totalOrdersFailed === 0;
    if (runLogId) await updateRunLog(runLogId, { status: scriptRunSuccess ? 'success' : 'partial_success' });

  } catch (error: unknown) {
    mainTryCatchError = error instanceof Error ? error : new Error(String(error));
    (logger || console).error({ err: mainTryCatchError, stack: mainTryCatchError.stack }, `SCRIPT FAILED: ${mainTryCatchError.message} `);
    scriptRunSuccess = false;
    finalMessage = `Script FAILED: ${mainTryCatchError.message} `;
    if (runLogId) try { await updateRunLog(runLogId, { status: 'failed', message: mainTryCatchError.message }); } catch (e) { (logger || console).error('Failed to update run log on error', e); }
  } finally {
    (logger || console).info(`-- - Script End-- - `);
    (logger || console).info(finalMessage);
    await cleanupAndExit(mainTryCatchError, mainTryCatchError ? 'errorInMainFinally' : 'normalCompletionFinally');
  }
}

void main().catch(err => {
  (logger || console).error("Catastrophic error in main function execution (outer catch):", err);
  if (isPrismaConnected) { prisma.$disconnect().catch(e => console.error('Catastrophic disconnect error', e)); }
  process.exit(1);
});
