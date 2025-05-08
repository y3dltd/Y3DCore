// Node built-in modules first
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import util from 'util';

// External dependencies
import { Prisma, PrismaClient } from '@prisma/client';
import { Command } from 'commander';
import { config } from 'dotenv';
import { pino } from 'pino';
import { z } from 'zod';

// Internal/local imports
import { fixInvalidStlRenderStatus, getOrdersToProcess, OrderWithItemsAndProducts } from '../lib/order-processing';
import { getShipstationOrders, updateOrderItemsOptionsBatch } from '../lib/shared/shipstation';
import { simplifyProductName, productNameMappings } from '@lib/product-mapping'; // Added import

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
    createdTaskIds: number[]; // Made non-optional
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

// --- AI Extraction Logic (Order Level) --- Replace Placeholder
async function extractOrderPersonalization(
  order: OrderWithItemsAndProducts,
  options: Pick<
    ProcessingOptions,
    'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
  > & { forceRecreate?: boolean }
): Promise<{ success: boolean; data?: z.infer<typeof AiOrderResponseSchema>; error?: string; promptUsed: string | null; rawResponse: string | null; modelUsed: string | null }> {
  type OrderItemWithProduct = Prisma.OrderItemGetPayload<{ include: { product: true } }>;

  const itemsForPrompt: AiOrderItemData[] = order.items
    .filter((orderItem: OrderItemWithProduct) => orderItem.lineItemKey != null)
    .map((orderItem: OrderItemWithProduct): AiOrderItemData => {
      const simplifiedName = simplifyProductName(
        orderItem.product?.name ?? orderItem.name ?? '',
        productNameMappings
      );
      return {
        id: orderItem.lineItemKey!, // lineItemKey is non-null due to filter
        sku: orderItem.product?.sku ?? orderItem.sku,
        name: simplifiedName,
        quantity: orderItem.quantity,
        options: orderItem.options?.map((opt: { name: string; value: string; }) => ({ name: opt.name, value: opt.value })) ?? [],
        productName: orderItem.product?.name,
        productId: orderItem.product?.id,
      };
    });

  if (itemsForPrompt.length === 0) {
    logger.info(`[AI][Order ${order.id}] No items with lineItemKeys found to send to AI, or all items lack product info for prompt.`);
    return { 
      success: true, 
      data: { itemPersonalizations: {} }, 
      promptUsed: null, 
      rawResponse: null, 
      modelUsed: null 
    };
  }

  const inputData: AiPromptData = {
    orderId: order.id,
    orderNumber: order.shipstation_order_number,
    orderDate: order.orderDate.toISOString(),
    marketplace: order.marketplace,
    customerNotes: order.customer_notes,
    internalNotes: order.internal_notes,
    items: itemsForPrompt,
    shippingAddress: {
      name: order.shipToName,
      street1: order.shipToStreet1,
      street2: order.shipToStreet2,
      city: order.shipToCity,
      state: order.shipToState,
      postalCode: order.shipToPostalCode,
      country: order.shipToCountry,
      phone: order.shipToPhone,
    },
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
  const orderInTx: OrderWithItemsAndProducts = await tx.order.findUniqueOrThrow({
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

  const itemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
  const patchReasons: string[] = [];

  for (const item of orderInTx.items) {
    const orderItemId = item.id;

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
    let finalDataSource: string | null = 'AI'; // Default assumption

    const lineItemKey = item.shipstationLineItemKey;
    const itemPzResult = lineItemKey ? aiData.itemPersonalizations[lineItemKey] : undefined;

    if (itemPzResult && itemPzResult.personalizations && itemPzResult.personalizations.length > 0) {
      itemPzResult.personalizations.forEach((p: z.infer<typeof PersonalizationDetailSchema>) => {
        taskDetailsToCreate.push({
          custom_text: p.customText,
          color_1: p.color1,
          color_2: p.color2,
          quantity: p.quantity || 1, // Default quantity to 1 if not provided
          needs_review: p.needsReview || itemPzResult.overallNeedsReview || false,
          review_reason: p.reviewReason || itemPzResult.overallReviewReason,
          status: 'pending', // Corrected: 'needs_review' is a boolean field, status should be valid PrintTaskStatus
          annotation: p.annotation,
        });
      });
      finalDataSource = 'AI_Direct';
    } else {
      // Case: No AI personalizations for this item (either AI didn't return it, or key mismatch, or AI processing failed at order level)
      logger.warn(
        `[DB][Order ${orderInTx.id}][Item ${orderItemId}] No AI personalizations found for lineItemKey ${lineItemKey}.`
      );
      if (options.createPlaceholder) {
        logger.info(`[DB][Order ${orderInTx.id}][Item ${orderItemId}] Creating placeholder task as 'createPlaceholder' is true.`);
        taskDetailsToCreate.push({
          custom_text: 'Placeholder - Check Order Details',
          quantity: item.quantity || 1,
          needs_review: true,
          review_reason: `No AI personalizations for lineItemKey ${lineItemKey}. AI data for order might be missing or incomplete.`, 
          status: 'pending', // Corrected: 'needs_review' is true, status should be valid PrintTaskStatus
        });
        finalDataSource = 'Placeholder';
      } else {
        logger.warn(
            `[DB][Order ${orderInTx.id}][Item ${orderItemId}] No AI personalizations and 'createPlaceholder' is false. No task will be created for this item.`
        );
        finalDataSource = 'Skipped_No_AI_Data';
      }
    }

    // --- REPLACEMENT LOGIC for populating itemsToPatch with 'Personalized Details' ---
    if (item.shipstationLineItemKey && aiData?.itemPersonalizations && orderInTx.shipstation_order_id) {
      const lineItemKey = item.shipstationLineItemKey; // Ensured not null by the if condition
      const personalizationsForThisKey = aiData.itemPersonalizations[lineItemKey]?.personalizations;

      if (personalizationsForThisKey && personalizationsForThisKey.length > 0) {
        const personalizedDetailStrings: string[] = [];
        for (const p of personalizationsForThisKey) {
          let detail = p.customText || 'N/A';
          const color1 = p.color1;
          const color2 = p.color2 ? ` / ${p.color2}` : '';
          personalizedDetailStrings.push(`${detail} (${color1}${color2})`);
        }

        let combinedDetailsString = personalizedDetailStrings.join(', ');
        const maxLen = 200;
        const truncationSuffix = '... (See Packing List)';

        if (combinedDetailsString.length > maxLen) {
          combinedDetailsString = combinedDetailsString.substring(0, maxLen - truncationSuffix.length) + truncationSuffix;
        }

        const ssOptions = [{ name: 'Personalized Details', value: combinedDetailsString }];

        itemsToPatch[lineItemKey] = ssOptions;
        patchReasons.push(`${lineItemKey}(AI-PD)`); // PD for Personalized Details

        logger.info(
          `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}] Preparing 'Personalized Details' for ShipStation line item key ${lineItemKey}. Value: "${combinedDetailsString}"`
        );
      } else {
        logger.info(
          `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}] No AI personalizations found for line item key ${lineItemKey} to create 'Personalized Details'.`
        );
      }
    } else if (item.shipstationLineItemKey && orderInTx.shipstation_order_id) {
      logger.info(
        `[ShipStation Update][Order ${orderInTx.id}][Item ${orderItemId}] No AI data available for lineItemKey ${lineItemKey} to create 'Personalized Details'.`
      );
    }
    // --- END REPLACEMENT LOGIC ---

    let currentTaskIndex = 0; // Initialize task index for this item

    for (const taskDetail of taskDetailsToCreate) {
      const taskData: Prisma.PrintOrderTaskCreateInput = {
        order: { connect: { id: orderInTx.id } },
        orderItem: { connect: { id: orderItemId } },
        product: { connect: { id: item.productId } }, 
        taskIndex: currentTaskIndex, 
        shorthandProductName: item.product?.name ? (item.product.name.length > 100 ? item.product.name.substring(0, 97) + '...' : item.product.name) : 'Unknown',
        customer: orderInTx.customerId ? { connect: { id: orderInTx.customerId } } : undefined,
        custom_text: taskDetail.custom_text,
        color_1: taskDetail.color_1,
        color_2: taskDetail.color_2,
        quantity: taskDetail.quantity,
        needs_review: taskDetail.needs_review,
        review_reason: taskDetail.review_reason,
        status: taskDetail.status,
        annotation: taskDetail.annotation,
      };

      if (taskDetail.needs_review) itemsNeedReviewCount++; // Reinstate counter logic

      if (options.dryRun) {
        logger.info(
          `[Dry Run][Order ${order.id}][Item ${orderItemId}] Would upsert task ${currentTaskIndex} from ${finalDataSource}. Review: ${taskDetail.needs_review}`
        );
      } else {
        try {
          const upsertData = {
            where: {
              orderItemId_taskIndex: { orderItemId: orderItemId, taskIndex: currentTaskIndex }, // Use currentTaskIndex
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
          tasksCreatedCount++; // Reinstate counter logic
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
      currentTaskIndex++; // Increment task index
    }
    logger.info(
      `[DB][Order ${orderInTx.id}][Item ${orderItemId}] Processed. Tasks: ${currentTaskIndex}. Status: ${itemDebugEntry.status}`
    );
  }

  if (!options.dryRun && Object.keys(itemsToPatch).length > 0 && orderInTx.shipstation_order_id) {
    try {
      const ssOrderResp = await getShipstationOrders({ orderId: Number(orderInTx.shipstation_order_id) });
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
                const color2 = pers.color2 ? ` / ${pers.color2}` : '';
                packingListLines.push(`${currentTaskNumberForPackingList}. ${text} (${color1}${color2})`);
                currentTaskNumberForPackingList++;
              }
            }
          }
        }

        const packingListHeader = `PACKING LIST (Order #${orderInTx.shipstation_order_number || 'N/A'}):`;
        const packingListString = packingListLines.length > 0 ? packingListLines.join('\n') : "No specific personalizations found by AI.";
        
        const fetchedSsOrder = ssOrderResp.orders[0];
        const originalCustomerNotes = fetchedSsOrder.customerNotes || orderInTx.customer_notes || 'No customer notes provided.';

        const syncDetails = `Automated Task Sync ${new Date().toISOString()} -> ${patchReasons.join(', ')}`;
        
        const auditNoteForInternalNotes = `${packingListHeader}\n${packingListString}\n---\nOriginal Customer Notes:\n${originalCustomerNotes}\n---\n${syncDetails}`;
        // --- END logic for Packing List in internalNotes ---
        
        await updateOrderItemsOptionsBatch(fetchedSsOrder, itemsToPatch, auditNoteForInternalNotes);
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

    // --- START: Logic for consolidated "Personalized Details" and Packing List for internalNotes ---
    const allOrderPackingListLines: string[] = [];
    let globalTaskCounterForPackingList = 1;

    for (const item of orderDetails.items) {
      if (!item.shipstationLineItemKey) {
        logger.warn(
          `[ShipStation Sync][Item ${item.id}] Missing ShipStation line item key. Skipping personalized details generation.`
        );
        failedCount++; // Count as failed for personalized details part
        continue;
      }

      if (item.printTasks.length === 0) {
        logger.info(
          `[ShipStation Sync][Item ${item.id}] No print tasks. Skipping personalized details generation for this item.`
        );
        // Not necessarily a failure of the whole sync, but no details to add for this item
        continue;
      }

      const personalizedDetailStrings: string[] = [];
      item.printTasks.forEach(task => {
        const detail = task.custom_text || 'N/A'; // Changed let to const
        const color1 = task.color_1;
        const color2 = task.color_2 ? ` / ${task.color_2}` : '';
        const taskDetailString = `${detail} (${color1 || 'N/A'}${color2})`;
        personalizedDetailStrings.push(taskDetailString);

        // Add to global packing list for internalNotes
        allOrderPackingListLines.push(`${globalTaskCounterForPackingList}. ${taskDetailString}`);
        globalTaskCounterForPackingList++;
      });

      if (personalizedDetailStrings.length > 0) {
        let combinedDetailsString = personalizedDetailStrings.join(', ');
        const maxLen = 200;
        const truncationSuffix = '... (See Packing List)';

        if (combinedDetailsString.length > maxLen) {
          combinedDetailsString = combinedDetailsString.substring(0, maxLen - truncationSuffix.length) + truncationSuffix;
        }

        const ssOption = { name: 'Personalized Details', value: combinedDetailsString };
        itemsToPatch[item.shipstationLineItemKey] = [ssOption]; // Replace if exists or add new
        patchReasons.push(`${item.shipstationLineItemKey}(PD-Sync)`);
        logger.info(
          `[ShipStation Sync][Item ${item.id}] Prepared 'Personalized Details' for ShipStation line item key ${item.shipstationLineItemKey}. Value: "${combinedDetailsString}"`
        );
        if (!options.dryRun) updatedCount++; // Count successful preparation for update
      } else {
        logger.info(
          `[ShipStation Sync][Item ${item.id}] No details extracted from tasks for line item key ${item.shipstationLineItemKey}.`
        );
      }
    }

    const packingListHeader = `PACKING LIST (Order #${orderDetails.shipstation_order_number || 'N/A'}):`;
    const packingListString = allOrderPackingListLines.length > 0 
        ? allOrderPackingListLines.join('\n') 
        : "No specific personalizations found in tasks.";
    
    const originalCustomerNotes = ssOrder.customerNotes || orderDetails.customer_notes || 'No customer notes provided.';

    const syncDetails = `Automated Task Sync (Existing) ${new Date().toISOString()} -> ${patchReasons.join(', ')}`;
    
    const finalAuditNoteForInternalNotes = `${packingListHeader}\n${packingListString}\n---\nOriginal Customer Notes:\n${originalCustomerNotes}\n---\n${syncDetails}`;
    // --- END: Logic for consolidated "Personalized Details" and Packing List for internalNotes ---

    if (options.dryRun) {
      if (Object.keys(itemsToPatch).length > 0) {
         logger.info(
          `[Dry Run][ShipStation Sync] Would update ShipStation order ${orderDetails.shipstation_order_id} with items: ${JSON.stringify(itemsToPatch)} and internalNotes (packing slip summary):\n${finalAuditNoteForInternalNotes}`
        );
        // For dry run, updatedCount is already incremented per item successfully prepared
      } else {
        logger.info(`[Dry Run][ShipStation Sync] No items require updates for order ${orderId}.`);
      }
    } else if (Object.keys(itemsToPatch).length > 0) {
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
      logger.info(`[ShipStation Sync] No item options to update in ShipStation for order ${orderId}. Internal notes were not updated as no item changes were pending.`);
    }

    logger.info(
      `[ShipStation Sync] Completed sync for order ${orderId}. Items prepared/updated: ${updatedCount}, Items failed: ${failedCount}`
    );
    return { updatedCount, failedCount };
  } catch (error) {
    logger.error(
      `[ShipStation Sync] Failed to sync order ${orderId}: ${error instanceof Error ? error.message : String(error)}`
    );
    // If a general error occurs, it's one failure for the whole order sync attempt.
    // Individual item failures are counted within the loop.
    return { updatedCount, failedCount: Math.max(failedCount, 1) }; 
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
    logger.info(`Effective logger level: ${logger.level}`);

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
