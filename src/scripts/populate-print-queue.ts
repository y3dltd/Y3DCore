// Node built-in modules first
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import util from 'util';

// External dependencies
import { OrderItem, PrintTaskStatus, Prisma, PrismaClient, Product } from '@prisma/client';
import { Command } from 'commander';
import { config } from 'dotenv';
import { pino } from 'pino';
import { z } from 'zod';

// Internal/local imports
import { fixInvalidStlRenderStatus, getOrdersToProcess, OrderWithItemsAndProducts } from '../lib/order-processing';
import { fetchAndProcessAmazonCustomization } from '../lib/orders/amazon/customization';
import { getShipstationOrders, updateOrderItemsOptionsBatch } from '../lib/shared/shipstation';

// Initialize database connection
const prisma = new PrismaClient();

// Load environment variables
config();

// Helper Variables for Logging Scope
let logStream: fsSync.WriteStream | null = null;

// Setup logger (initialize basic, level set after parsing args)
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
// MODIFIED: Remove all marketplace-specific logic to force AI fallback
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
  // --- Amazon URL Extraction ---
  const isAmazon = order.marketplace?.toLowerCase().includes('amazon');
  logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Marketplace='${order.marketplace}', IsAmazon=${isAmazon}`);

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
  } else {
    logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Not identified as Amazon marketplace. Falling back.`);
    // Fall through to AI fallback below
  }

  // --- Fallback to AI ---
  logger.debug(`[Debug][extractCustomizationData] Order ${order.id}, Item ${item.id}: Conditions not met for direct Amazon URL processing. Falling back to AI.`);
  return {
    customText: null,
    color1: null,
    color2: null,
    dataSource: null, // Indicate fallback is needed
    annotation: 'Needs AI processing', // Annotation indicates AI is the intended next step
  };
}

// --- AI Extraction Logic (Order Level) --- Replace Placeholder
async function extractOrderPersonalization(
  order: OrderWithItemsAndProducts,
  options: Pick<
    ProcessingOptions,
    'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
  > & { forceRecreate?: boolean } // Added forceRecreate to options type
): Promise<{ success: boolean; data?: z.infer<typeof AiOrderResponseSchema>; error?: string; promptUsed: string | null; rawResponse: string | null; modelUsed: string | null }> {
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
  let systemPromptContent = options.systemPrompt; // Use let to allow modification

  // Conditionally modify the system prompt if forceRecreate is true
  if (options.forceRecreate) {
    const forceRecreateInstruction = `\n\nIMPORTANT: The user is manually forcing the recreation of these tasks (force-recreate flag is active). Do NOT flag items for review (set needsReview: false) unless there is critical missing information that completely prevents processing (e.g., no text provided for a personalized item). Assume the user is aware and intends to proceed with the data as provided or extracted.`;
    systemPromptContent += forceRecreateInstruction;
    logger.info(`[AI][Order ${order.id}] Appended force-recreate instruction to system prompt.`);
  }

  const fullPromptForDebug = `System:\n${systemPromptContent}\n\nUser:\n${userPromptContent}`;

  logger.debug(`[AI][Order ${order.id}] Preparing extraction...`);
  logger.trace(`[AI][Order ${order.id}] Input Data JSON:\n${inputDataJson}`);
  logger.debug(
    `[AI][Order ${order.id}] Prompt lengths: System=${systemPromptContent.length}, User=${userPromptContent.length}`
  );
  // Avoid logging full prompts at debug level if they are large or sensitive
  // logger.debug(`[AI][Order ${order.id}] System Prompt:\n${systemPromptContent}`);
  // logger.debug(`[AI][Order ${order.id}] User Prompt:\n${userPromptContent}`);

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
    if (!apiKey) throw new Error('OpenAI API key missing');

    logger.info(`[AI][Order ${order.id}] Calling OpenAI (${modelUsed})...`);

    const apiPayload: ApiPayload = {
      model: modelUsed,
      messages: [
        { role: 'system', content: systemPromptContent }, // Use potentially modified system prompt
        { role: 'user', content: userPromptContent },
      ],
      temperature: 0.0,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    };

    logger.debug(
      { provider: 'openai', url: apiUrl, headers: { ...headers, Authorization: '***' } },
      `[AI][Order ${order.id}] Sending API Request`
    );
    logger.trace(`[AI][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`);

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

    rawResponse = result.choices?.[0]?.message?.content?.trim() ?? null;

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
  aiData: z.infer<typeof AiOrderResponseSchema>,
  options: ProcessingOptions,
  orderDebugInfo: OrderDebugInfo
): Promise<{ tasksCreatedCount: number; tasksSkippedCount: number; itemsNeedReviewCount: number }> {
  const orderInTx = await tx.order.findUniqueOrThrow({
    where: { id: order.id },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  logger.info(`[DB][Order ${order.id}] Upserting tasks in transaction...`);
  let tasksCreatedCount = 0;
  const tasksSkippedCount = 0;
  let itemsNeedReviewCount = 0;

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

  const itemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
  const patchReasons: string[] = [];

  for (const item of orderInTx.items) {
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
    let finalDataSource: string | null = null;

    const extractedData = await extractCustomizationData(orderInTx, item, product);
    finalDataSource = extractedData.dataSource;

    if (extractedData.dataSource) {
      logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Using data from ${extractedData.dataSource}. Annotation: ${extractedData.annotation}`);

      let customTextToUse = extractedData.customText;
      let annotationToUse = extractedData.annotation;
      if (
        options.preserveText &&
        existingTaskData[orderItemId] &&
        existingTaskData[orderItemId].length > 0
      ) {
        const existingTask = existingTaskData[orderItemId][0];
        if (existingTask.custom_text) {
          customTextToUse = existingTask.custom_text;
          const preservedMsg = `Preserving existing text: "${customTextToUse}" instead of "${extractedData.customText}"`;
          logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] ${preservedMsg}`);
          annotationToUse = `${annotationToUse} (${preservedMsg})`;
        }
      }

      taskDetailsToCreate.push({
        custom_text: customTextToUse,
        color_1: extractedData.color1,
        color_2: extractedData.color2,
        quantity: item.quantity,
        needs_review: false,
        review_reason: null,
        status: PrintTaskStatus.pending,
        annotation: annotationToUse,
      });
      itemDebugEntry.status = `Success (${extractedData.dataSource})`;

      if (!options.dryRun && extractedData.dataSource !== 'CustomerNotes') {
        if (
          orderInTx.shipstation_order_id &&
          item.shipstationLineItemKey &&
          (extractedData.customText || extractedData.color1 || extractedData.color2)
        ) {
          logger.info(
            `[ShipStation Update][Order ${order.id}][Item ${item.id}] Preparing to update item options from ${extractedData.dataSource}.`
          );
          try {
            const ssOrderResponse = await getShipstationOrders({ orderId: Number(orderInTx.shipstation_order_id) });
            if (ssOrderResponse?.orders?.length > 0) {
              const ssOptions = [];
              if (extractedData.customText) ssOptions.push({ name: 'Name or Text', value: extractedData.customText });
              if (extractedData.color1) ssOptions.push({ name: 'Colour 1', value: extractedData.color1 });
              if (extractedData.color2) ssOptions.push({ name: 'Colour 2', value: extractedData.color2 });

              if (ssOptions.length > 0) {
                itemsToPatch[item.shipstationLineItemKey] = ssOptions;
                patchReasons.push(`${item.shipstationLineItemKey}(${extractedData.dataSource})`);
              }
            } else {
              logger.error(`[ShipStation Update][Order ${order.id}][Item ${item.id}] Failed to fetch SS order details.`);
            }
          } catch (fetchOrUpdateError) {
            logger.error(`[ShipStation Update][Order ${order.id}][Item ${item.id}] Error during SS fetch/update:`, fetchOrUpdateError);
          }
        } else {
          logger.warn(`[ShipStation Update][Order ${order.id}][Item ${item.id}] Cannot update SS item options from ${extractedData.dataSource}: Missing required IDs or data.`);
        }
      } else if (options.dryRun && extractedData.dataSource !== 'CustomerNotes') {
        if (orderInTx.shipstation_order_id && item.shipstationLineItemKey && (extractedData.customText || extractedData.color1 || extractedData.color2)) {
          logger.info(`[Dry Run][ShipStation Update][Order ${order.id}][Item ${item.id}] Would update SS item options from ${extractedData.dataSource}.`);
        }
      }
    } else {
      finalDataSource = 'AI';
      logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] No direct data found, falling back to AI.`);
      const itemResult = aiData.itemPersonalizations[item.id.toString()];
      if (!itemResult || itemResult.personalizations.length === 0) {
        const reason = !itemResult ? 'No AI data for item' : 'AI returned zero personalizations';
        logger.warn(
          `[Order ${order.id}][Item ${orderItemId}] ${reason}. Creating placeholder.`
        );
        finalDataSource = 'Placeholder';
        itemDebugEntry.status = 'Placeholder Created';
        itemsNeedReviewCount++;

        let customText = 'Placeholder - Review Needed';
        let placeholderAnnotation = 'Placeholder created: ' + reason;
        if (
          options.preserveText &&
          existingTaskData[orderItemId] &&
          existingTaskData[orderItemId].length > 0
        ) {
          const existingTask = existingTaskData[orderItemId][0];
          if (existingTask.custom_text) {
            customText = existingTask.custom_text;
            const preservedMsg = `Preserving existing text for placeholder: "${customText}"`;
            logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] ${preservedMsg}`);
            placeholderAnnotation = `${placeholderAnnotation} (${preservedMsg})`;
          }
        }

        taskDetailsToCreate.push({
          custom_text: customText,
          color_1: null,
          color_2: null,
          quantity: item.quantity,
          needs_review: true,
          review_reason: reason.substring(0, 1000),
          status: PrintTaskStatus.pending,
          annotation: placeholderAnnotation,
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
            custom_text: customText,
            color_1: detail.color1,
            color_2: detail.color2,
            quantity: detail.quantity,
            needs_review: combinedNeedsReview,
            review_reason: reviewReasonCombined,
            status: PrintTaskStatus.pending,
            annotation: annotation,
          });
          if (combinedNeedsReview) itemsNeedReviewCount++;
        }
        itemDebugEntry.status = itemRequiresReview ? 'Success (Needs Review)' : 'Success (AI)';
      }
    }

    itemDebugEntry.createdTaskIds = [];
    let currentTaskIndex = 0;

    for (const taskDetail of taskDetailsToCreate) {
      const taskData: Prisma.PrintOrderTaskCreateInput = {
        order: { connect: { id: orderInTx.id } },
        orderItem: { connect: { id: orderItemId } },
        product: { connect: { id: productId } },
        taskIndex: currentTaskIndex,
        shorthandProductName: shorthandName,
        customer: orderInTx.customerId ? { connect: { id: orderInTx.customerId } } : undefined,
        quantity: taskDetail.quantity,
        custom_text: taskDetail.custom_text,
        color_1: taskDetail.color_1,
        color_2: taskDetail.color_2,
        ship_by_date: orderInTx.ship_by_date,
        needs_review: taskDetail.needs_review,
        review_reason: taskDetail.review_reason,
        status: taskDetail.status,
        marketplace_order_number: orderInTx.shipstation_order_number,
        annotation: taskDetail.annotation,
      };

      if (options.dryRun) {
        logger.info(
          `[Dry Run][Order ${order.id}][Item ${orderItemId}] Would upsert task ${currentTaskIndex} from ${finalDataSource}. Review: ${taskDetail.needs_review}`
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
              status: taskData.status,
              ship_by_date: taskData.ship_by_date,
              marketplace_order_number: taskData.marketplace_order_number,
              annotation: taskData.annotation,
            },
            create: taskData,
          };
          logger.debug(
            `[DB][Order ${order.id}][Item ${orderItemId}][Task ${currentTaskIndex}] Preparing to UPSERT task from ${finalDataSource} with data:`,
            upsertData
          );
          const task = await tx.printOrderTask.upsert(upsertData);
          logger.info(
            `[DB][Order ${order.id}][Item ${orderItemId}][Task ${currentTaskIndex}] Upserted task ${task.id} from ${finalDataSource}.`
          );

          if (finalDataSource === 'AI' && item.shipstationLineItemKey && orderInTx.shipstation_order_id) {
            if (options.dryRun) {
              logger.info(
                `[Dry Run][ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}][Task ${task.id}] Would fetch order and attempt to update item options using AI task data.`
              );
            } else {
              logger.info(
                `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}][Task ${task.id}] AI Task upserted, preparing ShipStation update...`
              );
              try {
                const ssOrderResponse = await getShipstationOrders({
                  orderId: Number(orderInTx.shipstation_order_id),
                });
                if (
                  ssOrderResponse &&
                  ssOrderResponse.orders &&
                  ssOrderResponse.orders.length > 0
                ) {
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
                    patchReasons.push(`${item.shipstationLineItemKey}(AI)`);
                  }
                } else {
                  logger.error(
                    `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}][Task ${task.id}] Failed to fetch order details from ShipStation for AI update.`
                  );
                }
              } catch (fetchOrUpdateError) {
                logger.error(
                  `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}][Task ${task.id}] Error during ShipStation fetch or update process for AI task:`,
                  fetchOrUpdateError
                );
              }
            }
          } else if (
            finalDataSource === 'AI' &&
            (!item.shipstationLineItemKey || !orderInTx.shipstation_order_id)
          ) {
            logger.warn(
              `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}] Skipping update for AI task: Missing shipstationLineItemKey or shipstation_order_id.`
            );
          }
          tasksCreatedCount++;
          itemDebugEntry.createdTaskIds.push(task.id);
        } catch (e) {
          logger.error(
            `[DB][Order ${orderInTx.id}][Item ${orderItemId}] FAILED upsert task ${currentTaskIndex} from ${finalDataSource}:`,
            e
          );
          itemDebugEntry.status = 'Failed';
          itemDebugEntry.error = e instanceof Error ? e.message : String(e);
          throw e;
        }
      }
      currentTaskIndex++;
    }
    logger.info(
      `[DB][Order ${orderInTx.id}][Item ${orderItemId}] Processed. Tasks: ${currentTaskIndex}. Status: ${itemDebugEntry.status}`
    );
  }

  if (!options.dryRun && Object.keys(itemsToPatch).length > 0 && orderInTx.shipstation_order_id) {
    try {
      const ssOrderResp = await getShipstationOrders({ orderId: Number(orderInTx.shipstation_order_id) });
      if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
        const auditNote = `Task sync ${new Date().toISOString()} -> ${patchReasons.join(', ')}`;
        await updateOrderItemsOptionsBatch(ssOrderResp.orders[0], itemsToPatch, auditNote);
        logger.info(`[ShipStation Batch][Order ${orderInTx.id}] Successfully updated items: ${patchReasons.join(', ')}`);
      } else {
        logger.error(`[ShipStation Batch][Order ${orderInTx.id}] Failed to fetch SS order for batch update.`);
      }
    } catch (batchErr) {
      logger.error(`[ShipStation Batch][Order ${orderInTx.id}] Error during batch update`, batchErr);
    }
  }
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
      `[ShipStation Sync] Found order ${orderId} with ShipStation order ID ${orderDetails.shipstation_order_id} and order number ${orderDetails.shipstation_order_number}`
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
        `[ShipStation Sync] ShipStation usually prevents modifications to shipped orders. Updates may not take effect.`
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

      const task = item.printTasks[0];

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

      if (ssOptions.length > 0) {
        itemsToPatch[item.shipstationLineItemKey] = ssOptions;
        patchReasons.push(item.shipstationLineItemKey);
      }
    }

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
    const logDir = path.join(process.cwd(), 'logs');
    const logFilePath = path.join(
      logDir,
      `${SCRIPT_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    );
    await fs.mkdir(logDir, { recursive: true });
    logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });

    logger = pino(
      { level: 'info' },
      pino.multistream([
        { stream: logStream },
        { stream: process.stdout },
      ])
    );

    logger.info(`--- Script Start: ${new Date().toISOString()} ---`);
    logger.info(`Logging to file: ${logFilePath}`);

    const program = new Command();
    program
      .name(SCRIPT_NAME)
      .description('Fetch orders and create print tasks via AI.')
      .option(
        '-o, --order-id <id>',
        'Process specific order by DB ID, ShipStation Order Number, or ShipStation Order ID',
        String
      )
      .option('-l, --limit <number>', 'Limit orders fetched', val => parseInt(val, 10))
      .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
      .option('--openai-model <model>', 'OpenAI model', 'gpt-4.1-mini')
      .option('--debug', 'Enable debug logging', false)
      .option('--verbose', 'Enable verbose logging', false)
      .option('--log-level <level>', 'Set log level', 'info')
      .option('-f, --force-recreate', 'Delete existing tasks first', false)
      .option('--create-placeholder', 'Create placeholder on AI fail', true)
      .option('-y, --confirm', 'Skip confirmation prompts', false)
      .option('--clear-all', 'Delete ALL tasks first (requires confirm)', false)
      .option('--dry-run', 'Simulate without DB changes', false)
      .option('--preserve-text', 'Keep existing custom text/names when recreating tasks', false)
      .option(
        '--shipstation-sync-only',
        'Only sync existing DB tasks to ShipStation without changing DB',
        false
      )
      .option('--debug-file <path>', 'Path for detailed debug log file (requires --order-id)', String);

    logger.info({ argv: process.argv }, 'Raw process.argv before commander parse');

    let directOrderId: string | undefined = undefined;

    // First check for --order-id=value format
    for (let i = 0; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg.startsWith('--order-id=')) {
        directOrderId = arg.split('=')[1];
        logger.info(`Directly extracted --order-id=value from process.argv: ${directOrderId}`);
        break;
      }
    }

    // If not found, check for --order-id value format
    if (!directOrderId) {
      for (let i = 0; i < process.argv.length - 1; i++) {
        if ((process.argv[i] === '--order-id' || process.argv[i] === '-o') && process.argv[i + 1]) {
          directOrderId = process.argv[i + 1];
          logger.info(`Directly extracted --order-id value from process.argv: ${directOrderId}`);
          break;
        }
      }
    }

    program.parse(process.argv.slice(2));

    const cmdOptions = program.opts<ProcessingOptions>();

    if (!cmdOptions.orderId && directOrderId) {
      logger.info(
        `Order ID not found in parsed args. Using directly extracted value: ${directOrderId}`
      );
      cmdOptions.orderId = directOrderId;
    }

    if (cmdOptions.verbose) {
      logger.level = 'debug';
    } else {
      logger.level = cmdOptions.logLevel;
    }

    if (!cmdOptions.openaiApiKey) throw new Error('OpenAI API key missing.');
    if (cmdOptions.debugFile && !cmdOptions.orderId) {
      logger.warn('--debug-file requires --order-id, disabling file debug.');
      cmdOptions.debugFile = undefined;
    }

    logger.info('Loading prompts...');
    const systemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
    const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
    logger.info('Prompts loaded.');

    logger.info(
      `Commander Parsed Options (opts): ${JSON.stringify({ ...cmdOptions, openaiApiKey: '***' })}`
    );
    if (cmdOptions.dryRun) logger.info('--- DRY RUN MODE ---');
    if (cmdOptions.debug) logger.debug('Debug mode enabled.');

    prisma = new PrismaClient();
    await prisma.$connect();
    logger.info('DB connected.');

    // Fix any invalid StlRenderStatus values before proceeding
    try {
      const fixedCount = await fixInvalidStlRenderStatus(prisma);
      if (fixedCount > 0) {
        logger.info(`Fixed ${fixedCount} PrintOrderTask records with invalid stl_render_state values`);
      }
    } catch (fixError) {
      logger.warn(`Unable to fix invalid StlRenderStatus values: ${fixError instanceof Error ? fixError.message : String(fixError)}`);
    }

    await createRunLog({ scriptName: SCRIPT_NAME });

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

    if (cmdOptions.forceRecreate && cmdOptions.orderId && !cmdOptions.dryRun) {
      logger.info(
        `[DB] Force recreate enabled for order identifier '${cmdOptions.orderId}'. Finding order to delete tasks...`
      );
      const ordersToDelete = await getOrdersToProcess(prisma, cmdOptions.orderId, 1, true);
      if (ordersToDelete.length > 0) {
        const orderDbId = ordersToDelete[0].id;
        logger.info(`[DB] Found order with DB ID ${orderDbId}. Deleting existing tasks...`);
        const { count } = await prisma.printOrderTask.deleteMany({
          where: { orderId: orderDbId },
        });
        logger.info(`[DB] Deleted ${count} tasks for order DB ID ${orderDbId}.`);
      } else {
        logger.warn(
          `[DB] Force recreate specified, but could not find order with identifier '${cmdOptions.orderId}' to delete tasks for.`
        );
      }
    }

    logger.info('Finding orders...');
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
      logger.warn(`No processable orders found for specified Order ID: ${cmdOptions.orderId}`);
    }

    for (const order of ordersToProcess) {
      totalOrdersProcessed++;
      logger.info(`--- Processing Order ${order.id} (${order.shipstation_order_number}) ---`);

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
          continue;
        } catch (error) {
          logger.error(
            `[Order ${order.id}] ShipStation sync failed: ${error instanceof Error ? error.message : String(error)}`
          );
          totalOrdersFailed++;
          failedOrderIds.push(order.id);
          continue;
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
        orderDebugInfo.overallStatus = 'Extracting AI Data';
        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);
        // Pass the forceRecreate flag when calling the function
        const extractionResult = await extractOrderPersonalization(order, {
          openaiApiKey: cmdOptions.openaiApiKey ?? null,
          openaiModel: cmdOptions.openaiModel,
          systemPrompt, // Pass the loaded base system prompt
          userPromptTemplate, // Pass the loaded user template
          forceRecreate: cmdOptions.forceRecreate // Pass the flag here
        });
        orderDebugInfo.promptSent = extractionResult.promptUsed;
        orderDebugInfo.rawResponseReceived = extractionResult.rawResponse;
        orderDebugInfo.aiProvider = 'openai';
        orderDebugInfo.modelUsed = extractionResult.modelUsed ?? orderDebugInfo.modelUsed;

        let aiDataForTransaction: z.infer<typeof AiOrderResponseSchema> = { itemPersonalizations: {} };
        if (!extractionResult.success) {
          logger.error(
            `[Order ${order.id}] AI Extraction Failed: ${extractionResult.error}`
          );
          orderDebugInfo.overallStatus = 'Extraction Failed';
          orderDebugInfo.processingError = extractionResult.error ?? null;
        } else if (extractionResult.data) {
          orderDebugInfo.overallStatus = 'AI Data Extracted, Starting DB Transaction';
          orderDebugInfo.parsedResponse = extractionResult.data;
          aiDataForTransaction = extractionResult.data;
        }

        await appendToDebugLog(cmdOptions.debugFile, orderDebugInfo);

        if (cmdOptions.dryRun) {
          logger.info(`[Dry Run][Order ${order.id}] Simulating task creation/upserts...`);
          orderDebugInfo.overallStatus = 'Dry Run Complete';
        } else {
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
            preserveText: cmdOptions.preserveText,
            verbose: cmdOptions.verbose,
          };
          const { tasksCreatedCount } =
            await prisma.$transaction(
              async tx => {
                return await createOrUpdateTasksInTransaction(
                  tx,
                  order,
                  aiDataForTransaction,
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
    }

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
      } catch (updateError) {
        logger.error('Failed to update runLog with failure status during main error handling:', updateError);
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

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage:
  npx tsx src/scripts/populate-print-queue.ts [options]

Options:
  --order-id <id>           Process specific order by ID, ShipStation Order Number, or ShipStation Order ID
  --limit <number>          Limit orders fetched (no default; fetch all orders)
  --openai-api-key <key>    OpenAI API Key (default: env OPENAI_API_KEY)
  --openai-model <model>    OpenAI model (default: gpt-4-turbo)
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
