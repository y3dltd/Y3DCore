import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();
import { Command } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import pino from 'pino';
import { z } from 'zod';
import { getOrdersToProcess, OrderWithItemsAndProducts } from '../lib/order-processing';
import path from 'path';
import util from 'util';
// import OpenAI from 'openai'; // Import OpenAI - Use dynamically below
import readline from 'readline/promises'; // Keep for confirmExecution
import fsSync from 'fs'; // Keep for logStream

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
  orderId?: number;
  limit?: number;
  openaiApiKey: string | null;
  openaiModel: string;
  systemPrompt: string;
  userPromptTemplate: string;
  debug: boolean;
  logLevel: string;
  debugFile: string | undefined;
  forceRecreate?: boolean;
  createPlaceholder: boolean;
  confirm?: boolean;
  clearAll?: boolean;
  dryRun?: boolean;
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
const updateRunLog = async (id: number | null, data: { status: string, message?: string }) => {
  logger.info('[Mock Log] Update Run Log:', id, data);
};

// --- AI Extraction Logic (Order Level) ---
async function extractOrderPersonalization(
  order: OrderWithItemsAndProducts,
  options: Pick<
    ProcessingOptions,
    | 'openaiApiKey'
    | 'openaiModel'
    | 'systemPrompt'
    | 'userPromptTemplate'
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
  logger.debug(`[AI][Order ${order.id}] Prompt lengths: System=${systemPromptContent.length}, User=${userPromptContent.length}`);
  logger.debug(`[AI][Order ${order.id}] System Prompt:\n${systemPromptContent}`);
  logger.debug(`[AI][Order ${order.id}] User Prompt:\n${userPromptContent}`);

  // Define types for API interaction within this function scope
  interface ApiMessage {
    role: "system" | "user";
    content: string;
  }
  interface ResponseFormat {
    type: "json_object";
  }
  interface ApiPayload {
    model: string;
    messages: ApiMessage[];
    temperature: number;
    max_tokens: number;
    response_format: ResponseFormat;
  }

  let rawResponse: string | null = null;
  const modelUsed = options.openaiModel;
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  const apiKey = options.openaiApiKey;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  const startTime = Date.now();

  try {
    // Check for API key
    if (!apiKey) throw new Error('OpenAI API key missing');

    logger.info(`[AI][Order ${order.id}] Calling OpenAI (${modelUsed})...`);

    const apiPayload: ApiPayload = {
      model: modelUsed,
      messages: [{ role: 'system', content: systemPromptContent }, { role: 'user', content: userPromptContent }],
      temperature: 0.1,
      max_tokens: 4096, // Increased from 2048 to 4096 to handle larger responses
      response_format: { type: "json_object" },
    };

    // Use JSON.stringify for payload logging as it might be large/complex
    logger.debug({ provider: 'openai', url: apiUrl, headers: { ...headers, Authorization: '***' } }, `[AI][Order ${order.id}] Sending API Request`);
    logger.trace(`[AI][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`); // Log full payload at trace level

    // Make the API call
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(apiPayload),
    });

    const duration = Date.now() - startTime;
    logger.info(`[AI][Order ${order.id}] Call response status: ${response.status} (${duration}ms).`);

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, `[AI][Order ${order.id}] API error`);
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
        logger.warn(`[AI][Order ${order.id}] Detected truncated JSON response. Attempting to fix...`);
        // Find the last complete object by looking for the last closing brace of an item
        const lastCompleteObjectMatch = cleanedContent.match(/\}\s*\}\s*\}\s*\}[^\}]*$/g);
        if (lastCompleteObjectMatch) {
          // Add closing braces to complete the JSON structure
          contentToProcess = cleanedContent.substring(0, cleanedContent.lastIndexOf(lastCompleteObjectMatch[0]) + lastCompleteObjectMatch[0].length) + '\n  }\n}';
          logger.info(`[AI][Order ${order.id}] Fixed truncated JSON by adding closing braces.`);
        } else {
          // If we can't find a pattern to fix, try a more aggressive approach
          // Find the last complete item entry
          const lastItemMatch = cleanedContent.match(/"\d+"\s*:\s*\{[^\{\}]*"personalizations"\s*:\s*\[[^\[\]]*\][^\{\}]*\}/g);
          if (lastItemMatch && lastItemMatch.length > 0) {
            const lastItem = lastItemMatch[lastItemMatch.length - 1];
            const itemId = lastItem.match(/"(\d+)"/)?.[1];
            if (itemId) {
              // Reconstruct the JSON with only the items we have complete data for
              const truncationPoint = cleanedContent.lastIndexOf(lastItem) + lastItem.length;
              contentToProcess = cleanedContent.substring(0, truncationPoint) + '\n  }\n}';
              logger.info(`[AI][Order ${order.id}] Fixed truncated JSON by keeping complete items up to item ${itemId}.`);
            }
          }
        }
      }

      responseJson = JSON.parse(contentToProcess);
      logger.debug(`[AI][Order ${order.id}] Parsed JSON response.`);
      logger.debug(`[AI][Order ${order.id}] Parsed JSON Object:\n${JSON.stringify(responseJson, null, 2)}`);
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
        (sum, item) => sum + item.personalizations.length, 0
      );

      const needsReviewCount = Object.values(validationResult.data.itemPersonalizations).reduce(
        (sum, item) => sum + (item.overallNeedsReview ? 1 : 0), 0
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
          needsReviewCount
        }
      });
      logger.debug(`[AI][Order ${order.id}] AI call logged to database`);
    } catch (logError) {
      logger.error(`[AI][Order ${order.id}] Failed to log AI call to database: ${logError instanceof Error ? logError.message : String(logError)}`);
    }

    return { success: true, data: validationResult.data, promptUsed: fullPromptForDebug, rawResponse, modelUsed };

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
          needsReviewCount: 0
        }
      });
      logger.debug(`[AI][Order ${order.id}] Failed AI call logged to database`);
    } catch (logError) {
      logger.error(`[AI][Order ${order.id}] Failed to log AI error to database: ${logError instanceof Error ? logError.message : String(logError)}`);
    }

    return { success: false, error: errorMsg, promptUsed: fullPromptForDebug, rawResponse, modelUsed };
  }
}

// --- Database Task Creation Logic ---
async function createOrUpdateTasksInTransaction(
  tx: Prisma.TransactionClient,
  order: OrderWithItemsAndProducts,
  aiData: z.infer<typeof AiOrderResponseSchema>,
  options: ProcessingOptions,
  orderDebugInfo: OrderDebugInfo
): Promise<{ tasksCreatedCount: number, tasksSkippedCount: number, itemsNeedReviewCount: number }> {
  logger.info(`[DB][Order ${order.id}] Upserting tasks in transaction...`);
  let tasksCreatedCount = 0;
  const tasksSkippedCount = 0;
  let itemsNeedReviewCount = 0;

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

    const itemResult = aiData.itemPersonalizations[item.id.toString()];

    if (options.forceRecreate && !options.dryRun) {
      logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Deleting existing tasks (--force-recreate)...`);
      try {
        const { count } = await tx.printOrderTask.deleteMany({ where: { orderItemId: orderItemId } });
        logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Deleted ${count} tasks.`);
      } catch (e) {
        logger.error(`[DB][Order ${order.id}][Item ${orderItemId}] FAILED to delete tasks:`, e);
        throw e;
      }
    }

// Special case for eBay orders with multiple personalizations in customer notes
if (order.marketplace?.toLowerCase().includes('ebay') &&
    order.customer_notes?.includes('Personalisation:') &&
    (!itemResult || itemResult.personalizations.length === 0 ||
     (itemResult.personalizations.length === 1 && itemResult.personalizations[0].customText === null))) {

  logger.info(`[Order ${order.id}][Item ${orderItemId}] Special case: eBay order with multiple personalizations.`);

  // Parse customer notes to find personalization for this item
  const customerNotes = order.customer_notes || '';
  let itemColor = null;

  // Try to find color from print_settings
  if (item.print_settings && typeof item.print_settings === 'object' && Array.isArray(item.print_settings)) {
    const colorSetting = item.print_settings.find(s => typeof s === 'object' && s !== null && 'name' in s && s.name === 'Color');
    if (colorSetting && typeof colorSetting === 'object' && 'value' in colorSetting) {
      itemColor = String(colorSetting.value);
    }
  }

  // If not found, try to extract from product name
  if (!itemColor && product?.name) {
    const colorMatch = product.name.match(/\[(.*?)\]/);
    if (colorMatch && colorMatch[1]) {
      itemColor = colorMatch[1];
    }
  }

  if (itemColor) {
    // Extract all personalizations from customer notes
    const personalizations: { variationId: string; text: string }[] = [];
    const regex = /Item ID: \d+ Variation: (\d+)[\s\S]*?Text: ([^\n]+)/g;
    let match;

    while ((match = regex.exec(customerNotes)) !== null) {
      personalizations.push({
        variationId: match[1],
        text: match[2].trim()
      });
    }

    logger.info(`[Order ${order.id}][Item ${orderItemId}] Found ${personalizations.length} personalizations in customer notes.`);

    // Try to match personalization to item based on position in the order
    const itemIndex = order.items.findIndex(i => i.id === orderItemId);

    if (itemIndex >= 0 && itemIndex < personalizations.length) {
      const personalization = personalizations[itemIndex];
      const customText = personalization.text;

      logger.info(`[Order ${order.id}][Item ${orderItemId}] Matched personalization by position: ${customText} (${itemColor}).`);

      const taskData: Prisma.PrintOrderTaskCreateInput = {
        order: { connect: { id: order.id } }, orderItem: { connect: { id: orderItemId } }, product: { connect: { id: productId } },
        taskIndex: 0, customer: order.customerId ? { connect: { id: order.customerId } } : undefined,
        quantity: item.quantity, custom_text: customText, color_1: itemColor, color_2: null,
        needs_review: false, review_reason: null, status: 'pending',
        marketplace_order_number: order.shipstation_order_number, shorthandProductName: shorthandName, ship_by_date: order.ship_by_date,
      };

      if (options.dryRun) {
        logger.info(`[Dry Run][Order ${order.id}][Item ${orderItemId}] Would create task with custom text: ${customText}, color: ${itemColor}.`);
        itemDebugEntry.status = 'Success (Special Case)';
        tasksCreatedCount++;
      } else {
        try {
          // Check if a task already exists for this item
          const existingTask = await tx.printOrderTask.findFirst({
            where: {
              orderItemId,
              taskIndex: 0
            }
          });

          if (existingTask) {
            // Update the existing task
            const task = await tx.printOrderTask.update({
              where: {
                id: existingTask.id
              },
              data: {
                custom_text: customText,
                color_1: itemColor,
                color_2: null,
                needs_review: false,
                review_reason: null,
                status: 'pending'
              }
            });
            logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Updated task ${task.id}.`);
            itemDebugEntry.status = 'Success (Special Case - Updated)';
            if (itemDebugEntry.createdTaskIds) {
              itemDebugEntry.createdTaskIds.push(task.id);
            } else {
              itemDebugEntry.createdTaskIds = [task.id];
            }
            tasksCreatedCount++;
          } else {
            // Create a new task
            const task = await tx.printOrderTask.create({ data: taskData });
            logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Created task ${task.id}.`);
            itemDebugEntry.status = 'Success (Special Case - Created)';
            if (itemDebugEntry.createdTaskIds) {
              itemDebugEntry.createdTaskIds.push(task.id);
            } else {
              itemDebugEntry.createdTaskIds = [task.id];
            }
            tasksCreatedCount++;
          }
        } catch (e) {
          logger.error(`[DB][Order ${order.id}][Item ${orderItemId}] FAILED to create task:`, e);
          itemDebugEntry.status = 'Failed';
          itemDebugEntry.error = e instanceof Error ? e.message : String(e);
          throw e;
        }
      }
      continue;
    }
  }
  continue;
}

    if (!itemResult || itemResult.personalizations.length === 0) {
      const reason = !itemResult ? "No AI data for item" : "AI returned zero personalizations";
      logger.warn(`[Order ${order.id}][Item ${orderItemId}] Skipping task creation: ${reason}.`);
      itemDebugEntry.status = `Skipped (${reason})`; itemDebugEntry.error = reason;
      if (options.createPlaceholder && !itemResult) {
        itemsNeedReviewCount++;
        const placeholderData: Prisma.PrintOrderTaskCreateInput = {
          order: { connect: { id: order.id } }, orderItem: { connect: { id: orderItemId } }, product: { connect: { id: productId } },
          taskIndex: 0, customer: order.customerId ? { connect: { id: order.customerId } } : undefined,
          quantity: item.quantity, custom_text: "Placeholder - Review Needed", color_1: null, color_2: null,
          needs_review: true, review_reason: reason.substring(0, 1000), status: 'pending',
          marketplace_order_number: order.shipstation_order_number, shorthandProductName: shorthandName, ship_by_date: order.ship_by_date,
        };
        if (options.dryRun) logger.info(`[Dry Run][Order ${order.id}][Item ${orderItemId}] Would create placeholder task.`);
        else {
          try {
            logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Creating placeholder task...`);
            logger.debug(`[DB][Order ${order.id}][Item ${orderItemId}] Placeholder Data:`, placeholderData);
            const task = await tx.printOrderTask.upsert({ where: { orderItemId_taskIndex: { orderItemId: orderItemId, taskIndex: 0 } }, update: { needs_review: true, review_reason: reason, custom_text: "Placeholder", status: 'pending', quantity: item.quantity }, create: placeholderData });
            itemDebugEntry.status = 'Placeholder Created'; itemDebugEntry.createdTaskIds = [task.id]; tasksCreatedCount++;
          } catch (e) { logger.error(`[DB][Order ${order.id}][Item ${orderItemId}] FAILED placeholder task:`, e); throw e; }
        }
      }
      continue;
    }

    let currentTaskIndex = 0;
    let totalQuantityFromAI = 0;
    let itemRequiresReview = itemResult.overallNeedsReview || false;
    const itemReviewReasons: string[] = itemResult.overallReviewReason ? [itemResult.overallReviewReason] : [];
    itemResult.personalizations.forEach(p => totalQuantityFromAI += p.quantity);
    if (totalQuantityFromAI !== item.quantity) { logger.warn(`[Order ${order.id}][Item ${orderItemId}] REVIEW NEEDED: Quantity Mismatch!`); itemRequiresReview = true; itemReviewReasons.push(`Qty Mismatch`); }

    itemDebugEntry.createdTaskIds = [];
    for (const detail of itemResult.personalizations) {
      // Create a single task with the correct quantity instead of multiple tasks with quantity 1
      const combinedNeedsReview = itemRequiresReview || detail.needsReview;
      const detailReason = detail.needsReview ? detail.reviewReason : null;
      const annotationReason = combinedNeedsReview && detail.annotation ? `Annotation: ${detail.annotation}` : null;
      const finalReviewReason = Array.from(new Set([...itemReviewReasons, ...(detailReason ? [detailReason] : []), ...(annotationReason ? [annotationReason] : [])])).filter(Boolean).join('; ').substring(0, 1000) || null;
        // if (detail.annotation) logger.debug(`[DB][Order ${order.id}][Item ${orderItemId}][Task ${currentTaskIndex}] AI Annotation: "${detail.annotation}"`);
        // Log annotation if present (changed to info level for better visibility)
        if (detail.annotation) {
          logger.info(`[AI Annotation][Order ${order.id}][Item ${orderItemId}][TaskIndex ${currentTaskIndex}]: ${detail.annotation}`);
        }

        const taskData: Prisma.PrintOrderTaskCreateInput = {
          order: { connect: { id: order.id } }, orderItem: { connect: { id: orderItemId } }, product: { connect: { id: productId } },
          taskIndex: currentTaskIndex, shorthandProductName: shorthandName,
          customer: order.customerId ? { connect: { id: order.customerId } } : undefined,
          quantity: detail.quantity, custom_text: detail.customText, color_1: detail.color1, color_2: detail.color2,
          ship_by_date: order.ship_by_date,
          needs_review: combinedNeedsReview,
          review_reason: finalReviewReason,
          status: 'pending',
          marketplace_order_number: order.shipstation_order_number,
        };

        if (options.dryRun) logger.info(`[Dry Run][Order ${order.id}][Item ${orderItemId}] Would upsert task ${currentTaskIndex}. Review: ${combinedNeedsReview}`);
        else {
          try {
            logger.debug(`[DB][Order ${order.id}][Item ${orderItemId}][Task ${currentTaskIndex}] Upsert Data:`, taskData);
            const task = await tx.printOrderTask.upsert({
              where: { orderItemId_taskIndex: { orderItemId: orderItemId, taskIndex: currentTaskIndex } },
              update: {
                shorthandProductName: taskData.shorthandProductName, custom_text: taskData.custom_text,
                color_1: taskData.color_1, color_2: taskData.color_2, quantity: taskData.quantity,
                needs_review: taskData.needs_review,
                review_reason: taskData.review_reason,
                status: 'pending',
                ship_by_date: taskData.ship_by_date, marketplace_order_number: taskData.marketplace_order_number,
              },
              create: taskData
            });
            tasksCreatedCount++; itemDebugEntry.createdTaskIds.push(task.id);
          } catch (e) { logger.error(`[DB][Order ${order.id}][Item ${orderItemId}] FAILED upsert task ${currentTaskIndex}:`, e); throw e; }
        }
        currentTaskIndex++;
    }
    if (itemRequiresReview) itemsNeedReviewCount++;
    itemDebugEntry.status = itemRequiresReview ? 'Success (Needs Review)' : 'Success';
    logger.info(`[DB][Order ${order.id}][Item ${orderItemId}] Processed. Tasks: ${currentTaskIndex}. Status: ${itemDebugEntry.status}`);
  }
  return { tasksCreatedCount, tasksSkippedCount, itemsNeedReviewCount };
}

// --- Main Execution ---
async function main() {
  const SCRIPT_NAME = 'populate-print-queue';
  let scriptRunSuccess = true, finalMessage = 'Script finished.';
  let totalOrdersProcessed = 0, totalOrdersFailed = 0, totalTasksCreated = 0;
  const failedOrderIds: number[] = [];
  let prisma: PrismaClient | null = null;

  try {
    // Setup file logging stream
    const logDir = path.join(process.cwd(), 'logs');
    const logFilePath = path.join(logDir, `${SCRIPT_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    await fs.mkdir(logDir, { recursive: true });
    logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });

    // Setup Pino logger to use multistream - MOVED & MODIFIED
    logger = pino({ level: 'info' }, pino.multistream([
      { stream: logStream }, // Write JSON logs to file
      { stream: process.stdout } // Write JSON logs to console
      // TODO: Consider pino-pretty for console output if desired later
    ]));

    logger.info(`--- Script Start: ${new Date().toISOString()} ---`);
    logger.info(`Logging to file: ${logFilePath}`);

    // Argument Parsing
    const program = new Command();
    program
      .name(SCRIPT_NAME)
      .description('Fetch orders and create print tasks via AI.')
      .option('-o, --order-id <id>', 'Process specific order DB ID', (val) => parseInt(val, 10))
      .option('-l, --limit <number>', 'Limit orders fetched', (val) => parseInt(val, 10), 10) // Changed default back to 10
      .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
      .option('--openai-model <model>', 'OpenAI model', 'gpt-4o-mini')
      .option('--debug', 'Enable debug logging', false)
      .option('--log-level <level>', 'Set log level', 'info')
      .option('-f, --force-recreate', 'Delete existing tasks first', false)
      .option('--create-placeholder', 'Create placeholder on AI fail', true)
      .option('-y, --confirm', 'Skip confirmation prompts', false)
      .option('--clear-all', 'Delete ALL tasks first (requires confirm)', false)
      .option('--dry-run', 'Simulate without DB changes', false)
      .option('--debug-file <path>', 'Path for detailed debug log file (requires --order-id)')
      .parse(process.argv);
    const cmdOptions = program.opts();

    // Set logger level from options (after initialization)
    logger.level = cmdOptions.logLevel;

    // Validate OpenAI API key
    if (!cmdOptions.openaiApiKey) throw new Error('OpenAI API key missing.');
    if (cmdOptions.debugFile && !cmdOptions.orderId) { logger.warn('--debug-file requires --order-id, disabling file debug.'); cmdOptions.debugFile = undefined; }

    // Load Prompts
    logger.info('Loading prompts...');
    const systemPrompt = await loadPromptFile('src/scripts/prompt-system-optimized.txt');
    const userPromptTemplate = await loadPromptFile('src/scripts/prompt-user-template-optimized.txt');
    logger.info('Prompts loaded.');

    // Create options object
    const options: ProcessingOptions = {
      orderId: cmdOptions.orderId,
      limit: cmdOptions.limit,
      openaiApiKey: cmdOptions.openaiApiKey ?? null,
      openaiModel: cmdOptions.openaiModel,
      systemPrompt,
      userPromptTemplate,
      debug: cmdOptions.debug ?? false,
      logLevel: cmdOptions.logLevel,
      debugFile: cmdOptions.debugFile,
      forceRecreate: cmdOptions.forceRecreate ?? false,
      createPlaceholder: cmdOptions.createPlaceholder ?? true,
      confirm: cmdOptions.confirm ?? false,
      clearAll: cmdOptions.clearAll ?? false,
      dryRun: cmdOptions.dryRun ?? false,
    };
    logger.info(`Effective Options: ${JSON.stringify({ ...options, openaiApiKey: '***' })}`);
    if (options.dryRun) logger.info('--- DRY RUN MODE ---');
    if (options.debug) logger.debug('Debug mode enabled.');

    // Initialize Prisma
    prisma = new PrismaClient();
    await prisma.$connect();
    logger.info('DB connected.');

    // Create Run Log
    await createRunLog({ scriptName: SCRIPT_NAME });

    // Pre-processing: Clear All
    if (options.clearAll) {
      if (!options.confirm && !await confirmExecution('CONFIRM: Delete ALL print tasks?')) { logger.info('Aborted.'); process.exit(0); }
      if (options.dryRun) { logger.info('[Dry Run] Would clear all tasks.'); }
      else { logger.info('[DB] Clearing all tasks...'); const { count } = await prisma.printOrderTask.deleteMany({}); logger.info(`[DB] Deleted ${count} tasks.`); }
    }

    // Find Orders
    logger.info('Finding orders...');
    const orderIdString = options.orderId ? options.orderId.toString() : undefined;
    const ordersToProcess = await getOrdersToProcess(prisma, orderIdString, options.limit);
    logger.info(`Found ${ordersToProcess.length} orders.`);

    // Process Orders
    for (const order of ordersToProcess) {
      totalOrdersProcessed++;
      logger.info(`--- Processing Order ${order.id} (${order.shipstation_order_number}) ---`);
      // Using OpenAI as the only provider
      const effectiveModelUsed = options.openaiModel;

      const orderDebugInfo: OrderDebugInfo = {
        orderId: order.id, orderNumber: order.shipstation_order_number ?? '', marketplace: order.marketplace,
        overallStatus: 'Starting', promptSent: null, rawResponseReceived: null, parsedResponse: null,
        validationError: null, processingError: null, aiProvider: 'openai',
        modelUsed: effectiveModelUsed, items: [],
      };

      try {
        // AI Call (Order Level)
        orderDebugInfo.overallStatus = 'Extracting AI Data';
        await appendToDebugLog(options.debugFile, orderDebugInfo);
        const extractionResult = await extractOrderPersonalization(order, options);
        orderDebugInfo.promptSent = extractionResult.promptUsed;
        orderDebugInfo.rawResponseReceived = extractionResult.rawResponse;
        // Using OpenAI as the only provider
        orderDebugInfo.aiProvider = 'openai';
        orderDebugInfo.modelUsed = extractionResult.modelUsed ?? orderDebugInfo.modelUsed;

        if (!extractionResult.success) {
          throw new Error(`AI Extraction Failed: ${extractionResult.error}`); // Throw error to handle below
        }

        // DB Transaction
        orderDebugInfo.overallStatus = 'AI Data Extracted, Starting DB Transaction';
        orderDebugInfo.parsedResponse = extractionResult.data;
        await appendToDebugLog(options.debugFile, orderDebugInfo);

        if (options.dryRun) {
          logger.info(`[Dry Run][Order ${order.id}] Simulating task upserts...`);
          let simulatedTasks = 0;
          Object.values(extractionResult.data.itemPersonalizations).forEach((itemRes: z.infer<typeof ItemPersonalizationResultSchema>) => {
            simulatedTasks += itemRes.personalizations.reduce((sum: number, p: z.infer<typeof PersonalizationDetailSchema>) => sum + p.quantity, 0);
          });
          totalTasksCreated += simulatedTasks;
          logger.info(`[Dry Run][Order ${order.id}] Simulation complete. Est. Tasks: ${simulatedTasks}`);
          orderDebugInfo.overallStatus = 'Dry Run Complete';
        } else {
          const { tasksCreatedCount, /* tasksSkippedCount, itemsNeedReviewCount */ } = await prisma.$transaction(async (tx) => {
            return await createOrUpdateTasksInTransaction(tx, order, extractionResult.data, options, orderDebugInfo);
          }, { maxWait: 120000, timeout: 300000 }); // Increased timeout to 5 minutes (300000ms) and maxWait to 2 minutes (120000ms)
          logger.info(`[Order ${order.id}] DB Transaction finished. Tasks upserted: ${tasksCreatedCount}.`);
          totalTasksCreated += tasksCreatedCount;
          orderDebugInfo.overallStatus = 'Transaction Committed';
        }

      } catch (error: unknown) {
        // Handle errors for this specific order (AI failure, placeholder failure, transaction failure)
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Order ${order.id}] FAILED: ${errorMsg}`, error);
        totalOrdersFailed++;
        failedOrderIds.push(order.id);
        orderDebugInfo.overallStatus = orderDebugInfo.overallStatus.includes('Extracting') ? 'Extraction Failed' : 'Processing Failed';
        orderDebugInfo.processingError = errorMsg;
        // Attempt placeholder creation if AI failed and option enabled
        if (orderDebugInfo.overallStatus === 'Extraction Failed' && options.createPlaceholder) {
          logger.warn(`[Order ${order.id}] Attempting placeholders after AI failure...`);
          try {
            await prisma.$transaction(async (tx) => {
              await createOrUpdateTasksInTransaction(tx, order, { itemPersonalizations: {} }, options, orderDebugInfo);
            }, { maxWait: 120000, timeout: 300000 }); // Increased timeout to 5 minutes (300000ms) and maxWait to 2 minutes (120000ms)
            orderDebugInfo.overallStatus = 'Placeholder Tasks Created';
            logger.info(`[Order ${order.id}] Placeholder tasks created/updated.`);
          } catch (placeholderTxError: unknown) {
            const phErrorMsg = placeholderTxError instanceof Error ? placeholderTxError.message : String(placeholderTxError);
            logger.error(`[Order ${order.id}] Placeholder Transaction FAILED: ${phErrorMsg}`, placeholderTxError);
            orderDebugInfo.overallStatus = 'Placeholder Creation Failed';
            orderDebugInfo.processingError += `; Placeholder TX Failed: ${phErrorMsg}`;
          }
        }
      } finally {
        await appendToDebugLog(options.debugFile, orderDebugInfo);
        logger.info(`--- Finished Order ${order.id}. Status: ${orderDebugInfo.overallStatus} ---`);
      }
    } // End order loop

    // Final Summary
    scriptRunSuccess = totalOrdersFailed === 0;
    finalMessage = `Processed ${totalOrdersProcessed} orders. Failed: ${totalOrdersFailed}. Tasks Upserted: ${totalTasksCreated}.`;
    if (totalOrdersFailed > 0) finalMessage += ` Failed IDs: [${failedOrderIds.join(', ')}]`;
    await updateRunLog(runLogId, { status: scriptRunSuccess ? 'success' : 'partial_success' });

  } catch (error) {
    // Catch top-level errors (init, prompt loading, fatal DB connection, etc.)
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("SCRIPT FAILED (Unhandled Exception)", error);
    scriptRunSuccess = false;
    finalMessage = `Script failed fatally: ${errorMsg}`;
    if (runLogId !== null) { try { await updateRunLog(runLogId, { status: 'failed', message: errorMsg }); } catch { /* Ignore */ } }
  } finally {
    logger.info(`--- Script End ---`);
    logger.info(finalMessage);
    if (prisma) { try { await prisma.$disconnect(); logger.info('DB disconnected.'); } catch (e) { logger.error("DB disconnect error", e); } }
    if (logStream) logStream.end(); // Ensure stream is closed
    process.exit(scriptRunSuccess ? 0 : 1);
  }
}

void main();
