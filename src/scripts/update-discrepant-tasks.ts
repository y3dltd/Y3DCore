// Purpose: Updates existing print tasks based on discrepancies identified
//          by the review script, using the latest AI logic.
//          Prioritizes safety: updates existing, creates new, warns on deletions needed.

import fs from 'fs/promises';

import { PrintOrderTask, PrintTaskStatus, Prisma, PrismaClient } from '@prisma/client'; // <-- Fix: Add PrintOrderTask and PrintTaskStatus
import dotenv from 'dotenv';
import pino from 'pino';
import z from 'zod';

// --- Add ShipStation Imports ---
import { getShipstationOrders, updateOrderItemsOptionsBatch } from '../lib/shared/shipstation';
// --- End ShipStation Imports ---
//"644" < AmazonURL
// --- !!! DEFINE TARGET ORDERS HERE !!! ---
// Add the Order IDs or ShipStation Order Numbers you want to process in this array.
// Leave this array empty to process ALL orders with placeholder tasks.
const TARGET_ORDER_IDS: string[] = [
    // "206-1779044-9720343", // Example: Amazon order with placeholder
];
// --- !!! DEFINE TARGET ORDERS HERE !!! ---
/*
    "510",
    "622",
    "621",
    "619",
    "618",
    "617",
    "615",
    "612",
    "611",
    "609",
    "608",
    "606",
    "599",
    "598",
    "597",
    "596",
    "588",
    "587",
    "586",
    "582",
    "580",
    "579",
    "577",
    "576",
    "574",
    "571",
    "570",
    "568",
    "562",
    "561",
    "551",
    "545",
    "543",
    "541", // Added back just in case, though log said no discrepancy
    "540",
    "538",
    "534",
    "532",
    "527",
    "510",
    "506",
    "503",
    "501",
    "498",
    "488",
    "486",
    "223",
    "218",
    "121",
    "65",
    "18",
    "16",
    "10"
*/
// --- !!! CONFIGURE OPTIONS HERE !!! ---
const DRY_RUN_MODE = false; // Set to false to apply changes, true to simulate
const LOG_LEVEL = 'trace'; // Set to 'debug', 'info', 'warn', 'error'
const OPENAI_MODEL = 'o4-mini';
const FORCE_SHIPSTATION_UPDATE = true; // Set to true to update ShipStation even if DB task didn't change
const LOG_RECOVERY_DETAILS = true; // Enhanced logging for recovery operations
const MAX_AUTO_ORDERS = 15; // Maximum number of orders to process when TARGET_ORDER_IDS is empty
// --- !!! CONFIGURE OPTIONS HERE !!! ---

// --- Types (Copied/adapted from populate-print-queue) ---
// Zod Schemas (ensure these match populate-print-queue)
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

// Processing Options for this script
interface UpdateOptions {
    orderIds: string[]; // Array of Order IDs or ShipStation Order Numbers
    openaiApiKey: string | null;
    openaiModel: string;
    systemPrompt: string;
    userPromptTemplate: string;
    logLevel: string;
    dryRun: boolean; // Add dry-run capability
}

// Type for fetched order data including tasks
type OrderWithItemsTasksAndProduct = Prisma.OrderGetPayload<{
    include: {
        items: {
            include: {
                product: true;
                printTasks: true;
            };
        };
    };
}>;

// --- Globals ---
const prisma = new PrismaClient();
dotenv.config();
let logger: pino.Logger;

// --- Helper Functions (Copied from populate-print-queue) ---
async function loadPromptFile(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown file load error';
        if (logger) logger.error(`Failed to load prompt file: ${filePath} - ${errorMsg}`);
        else console.error(`Failed to load prompt file: ${filePath} - ${errorMsg}`);
        throw new Error(`Could not load prompt file: ${filePath}`);
    }
}

// --- AI Extraction Logic (Copied from populate-print-queue) ---
// IMPORTANT: Ensure this is the full, up-to-date version from populate-print-queue.ts
async function extractOrderPersonalization(
    order: OrderWithItemsTasksAndProduct, // Use the correct type
    latestCustomerNotes: string | null, // Add parameter for potentially updated notes
    options: Pick<
        UpdateOptions,
        'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
    >
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
        customerNotes: latestCustomerNotes, // Use the passed-in notes
        items: simplifiedItems,
    };

    const inputDataJson = JSON.stringify(inputData, null, 2);
    const userPromptContent = options.userPromptTemplate.replace('{INPUT_DATA_JSON}', inputDataJson);
    const systemPromptContent = options.systemPrompt;
    const fullPromptForDebug = `System:\\n${systemPromptContent}\\n\\nUser:\\n${userPromptContent}`;

    logger.debug(`[AI Update][Order ${order.id}] Preparing extraction...`);
    logger.trace(`[AI Update][Order ${order.id}] Input Data JSON:\\n${inputDataJson}`);

    interface ApiMessage { role: 'system' | 'user'; content: string; }
    interface ResponseFormat { type: 'json_object'; }
    // For legacy OpenAI models, use max_tokens. For new models (e.g., o4-mini), use max_completion_tokens.
    type ApiPayload = {
        model: string;
        messages: ApiMessage[];
        temperature?: number; // Optional: only include for legacy models
        response_format: ResponseFormat;
        top_p?: number;
        frequency_penalty?: number;
        presence_penalty?: number;
        // Use one of the following depending on model:
        max_tokens?: number;
        max_completion_tokens?: number;
    };

    let rawResponse: string | null = null;
    const modelUsed = options.openaiModel;
    // Support for OpenAI API proxy (like LiteLLM) via environment variable
    const baseUrl = process.env.OPENAI_API_BASE_URL ?? 'https://api.openai.com/v1';
    const apiUrl = `${baseUrl}/chat/completions`;
    const apiKey = options.openaiApiKey;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    const startTime = Date.now();

    try {
        if (!apiKey) throw new Error('OpenAI API key missing');
        logger.info(`[AI Update][Order ${order.id}] Calling OpenAI (${modelUsed})...`);
        // Switch between max_tokens and max_completion_tokens depending on model name
        const isCompletionTokensModel = /o4-mini|gpt-4o|gpt-4.1|gpt-4-turbo|gpt-4o-mini/i.test(modelUsed);

        // For models like o4-mini, omit temperature (or set to 1 if required); for legacy models, set temperature as needed.
        const apiPayload: ApiPayload = {
            model: modelUsed,
            messages: [
                { role: 'system', content: systemPromptContent },
                { role: 'user', content: userPromptContent }
            ],
            ...(isCompletionTokensModel
                ? { max_completion_tokens: 4096 } // For o4-mini, gpt-4o, etc. (do not send temperature)
                : { max_tokens: 4096, temperature: 0.0, top_p: 1.0, frequency_penalty: 0.0, presence_penalty: 0.0 } // For legacy GPT-3/3.5/4
            ),
            response_format: { type: 'json_object' },
        };
        // End model-specific token param logic
        // Note: If o4-mini or future models require temperature=1 explicitly, add it here as temperature: 1
        logger.trace(`[AI Update][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`);
        const response = await fetch(apiUrl, { method: 'POST', headers: headers, body: JSON.stringify(apiPayload) });
        const duration = Date.now() - startTime;
        logger.info(`[AI Update][Order ${order.id}] Call response status: ${response.status} (${duration}ms).`);

        if (!response.ok) {
            const errorBody = await response.text();
            logger.error({ status: response.status, body: errorBody }, `[AI Update][Order ${order.id}] API error`);
            throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        rawResponse = result.choices?.[0]?.message?.content?.trim() ?? null;

        if (!rawResponse) {
            logger.warn({ result }, `[AI Update][Order ${order.id}] OpenAI returned empty response content.`);
            throw new Error('OpenAI returned empty response content.');
        }
        logger.debug(`[AI Update][Order ${order.id}] RAW RESPONSE Content:\n${rawResponse}`);
        logger.info(`[AI Update][Order ${order.id}] RAW RESPONSE Content:\n${rawResponse}`);

        let responseJson: unknown;
        try {
            const cleanedContent = rawResponse.replace(/^```json\\n?/, '').replace(/\\n?```$/, '');
            responseJson = JSON.parse(cleanedContent);
            logger.debug(`[AI Update][Order ${order.id}] Parsed JSON response.`);
        } catch (e) {
            logger.error({ err: e, rawResponse }, `[AI Update][Order ${order.id}] Failed to parse AI JSON`);
            throw new Error(`Failed to parse AI JSON: ${(e as Error).message}.`);
        }

        const validationResult = AiOrderResponseSchema.safeParse(responseJson);
        if (!validationResult.success) {
            const errorString = JSON.stringify(validationResult.error.format(), null, 2);
            logger.error(`[AI Update][Order ${order.id}] Zod validation failed: ${errorString}`);
            throw new Error(`AI response validation failed: ${errorString}`);
        }
        logger.info(`[AI Update][Order ${order.id}] AI response validated.`);

        // No DB logging needed for review script

        return { success: true, data: validationResult.data, promptUsed: fullPromptForDebug, rawResponse, modelUsed };
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown AI extraction error';
        logger.error(`[AI Update][Order ${order.id}] Extraction failed: ${errorMsg}`, error);
        // No DB logging needed for review script
        return { success: false, error: errorMsg, promptUsed: fullPromptForDebug, rawResponse, modelUsed };
    }
}

// --- Main Update Logic ---
async function applyAiUpdatesToTasks(
    tx: Prisma.TransactionClient,
    orderId: number,
    itemId: number,
    _itemQuantity: number, // Unused but kept for API compatibility
    existingTasks: PrintOrderTask[],
    aiPersonalizations: z.infer<typeof PersonalizationDetailSchema>[] | undefined,
    options: UpdateOptions,
    notesColor1: string | null, // Explicitly parsed color 1 from notes
    notesColor2: string | null,  // Explicitly parsed color 2 from notes
    extractedFromNotes: { customText: string | null; color1: string | null; color2: string | null; wasFound: boolean } | null = null
): Promise<{ updated: number; created: number; warnings: string[]; aiTasksForShipStation: z.infer<typeof PersonalizationDetailSchema>[]; recoveredFromNotes: boolean }> {
    const warnings: string[] = [];
    let updatedCount = 0;
    let createdCount = 0;
    let recoveredFromNotes = false; // Initialize recovery flag
    let aiData = aiPersonalizations ?? []; // Make aiData mutable
    const aiCount = aiData.length;
    const sortedDbTasks = [...existingTasks].sort((a, b) => (a.taskIndex ?? 0) - (b.taskIndex ?? 0));
    const dbCount = sortedDbTasks.length;
    const finalAiTasksForShipStation: z.infer<typeof PersonalizationDetailSchema>[] = [];

    logger.debug(`[Update][Order ${orderId}][Item ${itemId}] Comparing ${dbCount} DB tasks with ${aiCount} AI suggestions. Explicit notes colors: C1=${notesColor1}, C2=${notesColor2}`);

    // Check for placeholder tasks that need recovery
    const hasPlaceholderTasks = dbCount > 0 && sortedDbTasks.some(task =>
        task.custom_text === 'Placeholder - Review Needed' ||
        task.review_reason?.includes('No AI data for item')
    );

    // If we have placeholder tasks and extracted data from notes, use that
    if (hasPlaceholderTasks &&
        extractedFromNotes?.wasFound &&
        extractedFromNotes.customText) {

        logger.info(`[Order ${orderId}][Item ${itemId}] 🔄 RECOVERING DATA from internal notes: "${extractedFromNotes.customText}" with colors: ${extractedFromNotes.color1 || 'None'} / ${extractedFromNotes.color2 || 'None'}`);

        // Create a personalization from the notes data
        const recoveredPersonalization: z.infer<typeof PersonalizationDetailSchema> = {
            customText: extractedFromNotes.customText,
            color1: extractedFromNotes.color1 || notesColor1,
            color2: extractedFromNotes.color2 || notesColor2,
            quantity: sortedDbTasks.length > 0 ? sortedDbTasks[0].quantity : 1, // Use existing task quantity or default to 1
            needsReview: false, // Recovered data doesn't need review
            reviewReason: null,
            annotation: `Recovered from ShipStation internal notes at ${new Date().toISOString()}`
        };

        // If we found valid data in notes and the DB task was a placeholder,
        // ALWAYS prioritize the notes data, regardless of what AI returned.
        if (aiData.length === 0 ||
            (aiData.length > 0 &&
                (aiData[0].customText !== recoveredPersonalization.customText ||
                    aiData[0].color1 !== recoveredPersonalization.color1 ||
                    aiData[0].color2 !== recoveredPersonalization.color2))) {
            logger.warn(`[Order ${orderId}][Item ${itemId}] Prioritizing recovered notes data over AI result (${aiData.length > 0 ? `AI: ${JSON.stringify(aiData[0])}` : 'AI: No data'}).`);
        } else {
            logger.info(`[Order ${orderId}][Item ${itemId}] Recovered notes data matches AI data. Proceeding.`);
        }
        aiData = [recoveredPersonalization]; // Always use recovered details when DB was placeholder and notes are valid
        recoveredFromNotes = true;

    } else if (hasPlaceholderTasks && LOG_RECOVERY_DETAILS) {
        if (!extractedFromNotes?.wasFound) {
            logger.warn(`[Order ${orderId}][Item ${itemId}] Found placeholder tasks but couldn't find data in internal notes`);
        } else if (!extractedFromNotes.customText) {
            logger.warn(`[Order ${orderId}][Item ${itemId}] Found placeholder tasks but extracted text from notes was empty`);
        }
    }

    // Helper to get the AI task, potentially corrected by notes colors *for ShipStation*
    // The DB comparison logic below will handle the notes colors separately.
    const getCorrectedAiTaskForShipStation = (originalAiTask: z.infer<typeof PersonalizationDetailSchema>): z.infer<typeof PersonalizationDetailSchema> => {
        const correctedTask = { ...originalAiTask };
        if (notesColor1 !== null) {
            if (correctedTask.color1 !== notesColor1) {
                logger.debug(`[ShipStation Prep][Order ${orderId}][Item ${itemId}] Overriding AI color1 (${correctedTask.color1}) with notes color1 (${notesColor1}) for ShipStation payload`);
                correctedTask.color1 = notesColor1;
            }
        }
        if (notesColor2 !== null) {
            if (correctedTask.color2 !== notesColor2) {
                logger.debug(`[ShipStation Prep][Order ${orderId}][Item ${itemId}] Overriding AI color2 (${correctedTask.color2}) with notes color2 (${notesColor2}) for ShipStation payload`);
                correctedTask.color2 = notesColor2;
            }
        }
        return correctedTask;
    };

    // --- Always update existing tasks, then create any missing ones if AI returns more ---
    if (aiCount === dbCount) {
        logger.info(`[Update][Order ${orderId}][Item ${itemId}] AI returned the same number of tasks (${aiCount}) as exist in DB (${dbCount}). Updating existing tasks.`);
        for (let i = 0; i < dbCount; i++) {
            const dbTask = sortedDbTasks[i];
            const originalAiTask = aiData[i]; // Use original AI task for comparison base
            const updates: Prisma.PrintOrderTaskUpdateInput = {};
            let needsUpdate = false;

            // Determine the target state for DB update, prioritizing notes colors
            const targetCustomText = originalAiTask.customText;
            const targetColor1 = notesColor1 ?? originalAiTask.color1; // Prioritize notes
            const targetColor2 = notesColor2 ?? originalAiTask.color2; // Prioritize notes
            const targetQuantity = originalAiTask.quantity;
            const targetNeedsReview = originalAiTask.needsReview;
            const targetReviewReason = originalAiTask.reviewReason;
            const targetAnnotation = originalAiTask.annotation;

            // Compare DB state against the target state (which incorporates notes colors)
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.custom_text, target: targetCustomText }, 'Comparing custom_text');
            if (dbTask.custom_text !== targetCustomText) { updates.custom_text = targetCustomText; needsUpdate = true; }

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.color_1, target: targetColor1 }, 'Comparing color_1');
            if (dbTask.color_1 !== targetColor1) { updates.color_1 = targetColor1; needsUpdate = true; }

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.color_2, target: targetColor2 }, 'Comparing color_2');
            if (dbTask.color_2 !== targetColor2) { updates.color_2 = targetColor2; needsUpdate = true; }

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.quantity, target: targetQuantity }, 'Comparing quantity');
            if (dbTask.quantity !== targetQuantity) { updates.quantity = targetQuantity; needsUpdate = true; }

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.needs_review, target: targetNeedsReview }, 'Comparing needs_review');
            if (dbTask.needs_review !== targetNeedsReview) { updates.needs_review = targetNeedsReview; needsUpdate = true; }

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.review_reason, target: targetReviewReason }, 'Comparing review_reason');
            if (dbTask.review_reason !== targetReviewReason) { updates.review_reason = targetReviewReason; needsUpdate = true; }

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.annotation, target: targetAnnotation }, 'Comparing annotation');
            if (dbTask.annotation !== targetAnnotation) { updates.annotation = targetAnnotation; needsUpdate = true; }

            // Status update logic remains the same
            if (targetNeedsReview && dbTask.status !== PrintTaskStatus.completed) {
                if (dbTask.status !== PrintTaskStatus.pending) {
                    updates.status = PrintTaskStatus.pending;
                    needsUpdate = true;
                }
            }

            logger.debug({ orderId, itemId, taskIndex: i, needsUpdate }, 'Final needsUpdate check');
            if (needsUpdate) {
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Would update task with: ${JSON.stringify(updates)}`);
                } else {
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Updating task with: ${JSON.stringify(updates)}`); // Added info log
                    await tx.printOrderTask.update({
                        where: { id: dbTask.id },
                        data: updates,
                    });
                }
                updatedCount++;
            }
            // Prepare the task data for ShipStation, applying notes corrections if needed
            finalAiTasksForShipStation.push(getCorrectedAiTaskForShipStation(originalAiTask));
        }
    } else if (aiCount > dbCount) {
        logger.warn(`[Update][Order ${orderId}][Item ${itemId}] AI suggests more tasks (${aiCount}) than exist (${dbCount}). Updating existing and creating new.`);
        warnings.push(`AI suggests more tasks (${aiCount}) than exist (${dbCount}). Creating missing tasks.`);

        // Update existing tasks (similar logic as above)
        for (let i = 0; i < dbCount; i++) {
            const dbTask = sortedDbTasks[i];
            const originalAiTask = aiData[i];
            const updates: Prisma.PrintOrderTaskUpdateInput = {};
            let needsUpdate = false;

            const targetCustomText = originalAiTask.customText;
            const targetColor1 = notesColor1 ?? originalAiTask.color1;
            const targetColor2 = notesColor2 ?? originalAiTask.color2;
            const targetQuantity = originalAiTask.quantity;
            const targetNeedsReview = originalAiTask.needsReview;
            const targetReviewReason = originalAiTask.reviewReason;
            const targetAnnotation = originalAiTask.annotation;

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.custom_text, target: targetCustomText }, 'Comparing custom_text');
            if (dbTask.custom_text !== targetCustomText) { updates.custom_text = targetCustomText; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.color_1, target: targetColor1 }, 'Comparing color_1');
            if (dbTask.color_1 !== targetColor1) { updates.color_1 = targetColor1; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.color_2, target: targetColor2 }, 'Comparing color_2');
            if (dbTask.color_2 !== targetColor2) { updates.color_2 = targetColor2; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.quantity, target: targetQuantity }, 'Comparing quantity');
            if (dbTask.quantity !== targetQuantity) { updates.quantity = targetQuantity; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.needs_review, target: targetNeedsReview }, 'Comparing needs_review');
            if (dbTask.needs_review !== targetNeedsReview) { updates.needs_review = targetNeedsReview; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.review_reason, target: targetReviewReason }, 'Comparing review_reason');
            if (dbTask.review_reason !== targetReviewReason) { updates.review_reason = targetReviewReason; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.annotation, target: targetAnnotation }, 'Comparing annotation');
            if (dbTask.annotation !== targetAnnotation) { updates.annotation = targetAnnotation; needsUpdate = true; }

            if (targetNeedsReview && dbTask.status !== PrintTaskStatus.completed) {
                if (dbTask.status !== PrintTaskStatus.pending) {
                    updates.status = PrintTaskStatus.pending;
                    needsUpdate = true;
                }
            }

            logger.debug({ orderId, itemId, taskIndex: i, needsUpdate }, 'Final needsUpdate check');
            if (needsUpdate) {
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Would update task with: ${JSON.stringify(updates)}`);
                } else {
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Updating task with: ${JSON.stringify(updates)}`); // Added info log
                    await tx.printOrderTask.update({
                        where: { id: dbTask.id },
                        data: updates,
                    });
                }
                updatedCount++;
            }
            finalAiTasksForShipStation.push(getCorrectedAiTaskForShipStation(originalAiTask));
        }

        // --- Create new tasks if AI returned more than exist in DB ---
        const orderItem = await tx.orderItem.findUnique({ where: { id: itemId }, include: { order: true, product: true } });
        if (!orderItem || !orderItem.order || !orderItem.product) {
            warnings.push(`Could not find full OrderItem context for Item ${itemId} to create new tasks.`);
            logger.error(`[Update][Order ${orderId}][Item ${itemId}] Failed to fetch full item context for creating new tasks.`);
        } else {
            for (let i = dbCount; i < aiCount; i++) {
                const originalAiTask = aiData[i];
                // Use notes colors when creating the new task data
                const newTaskData: Prisma.PrintOrderTaskCreateInput = {
                    order: { connect: { id: orderId } },
                    orderItem: { connect: { id: itemId } },
                    product: { connect: { id: orderItem.productId } },
                    taskIndex: i,
                    shorthandProductName: orderItem.product.name?.substring(0, 100) ?? 'Unknown Product',
                    customer: orderItem.order.customerId ? { connect: { id: orderItem.order.customerId } } : undefined,
                    quantity: originalAiTask.quantity,
                    custom_text: originalAiTask.customText,
                    color_1: notesColor1 ?? originalAiTask.color1, // Prioritize notes
                    color_2: notesColor2 ?? originalAiTask.color2, // Prioritize notes
                    ship_by_date: orderItem.order.ship_by_date,
                    needs_review: originalAiTask.needsReview ?? false,
                    review_reason: originalAiTask.reviewReason,
                    status: PrintTaskStatus.pending,
                    marketplace_order_number: orderItem.order.shipstation_order_number,
                    annotation: originalAiTask.annotation ?? `Created by update script due to AI split`,
                };
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}] Would create new task (index ${i}) with data: ${JSON.stringify(newTaskData)}`);
                } else {
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}] Creating new task (index ${i}) with data: ${JSON.stringify(newTaskData)}`); // Log each creation
                    await tx.printOrderTask.create({ data: newTaskData });
                }
                createdCount++;
                finalAiTasksForShipStation.push(getCorrectedAiTaskForShipStation(originalAiTask));
            }
        }
    } else { // aiCount < dbCount
        logger.error(`[Update][Order ${orderId}][Item ${itemId}] MANUAL INTERVENTION REQUIRED: AI suggests fewer tasks (${aiCount}) than exist (${dbCount}). Only updating matching tasks.`);
        warnings.push(`MANUAL INTERVENTION REQUIRED: AI suggests fewer tasks (${aiCount}) than exist (${dbCount}). Existing tasks beyond index ${aiCount - 1} were not automatically deleted or modified unless PENDING.`);

        // Update matching tasks (similar logic as aiCount === dbCount)
        for (let i = 0; i < aiCount; i++) {
            const dbTask = sortedDbTasks[i];
            const originalAiTask = aiData[i];
            const updates: Prisma.PrintOrderTaskUpdateInput = {};
            let needsUpdate = false;

            const targetCustomText = originalAiTask.customText;
            const targetColor1 = notesColor1 ?? originalAiTask.color1;
            const targetColor2 = notesColor2 ?? originalAiTask.color2;
            const targetQuantity = originalAiTask.quantity;
            const targetNeedsReview = originalAiTask.needsReview;
            const targetReviewReason = originalAiTask.reviewReason;
            const targetAnnotation = originalAiTask.annotation;

            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.custom_text, target: targetCustomText }, 'Comparing custom_text');
            if (dbTask.custom_text !== targetCustomText) { updates.custom_text = targetCustomText; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.color_1, target: targetColor1 }, 'Comparing color_1');
            if (dbTask.color_1 !== targetColor1) { updates.color_1 = targetColor1; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.color_2, target: targetColor2 }, 'Comparing color_2');
            if (dbTask.color_2 !== targetColor2) { updates.color_2 = targetColor2; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.quantity, target: targetQuantity }, 'Comparing quantity');
            if (dbTask.quantity !== targetQuantity) { updates.quantity = targetQuantity; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.needs_review, target: targetNeedsReview }, 'Comparing needs_review');
            if (dbTask.needs_review !== targetNeedsReview) { updates.needs_review = targetNeedsReview; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.review_reason, target: targetReviewReason }, 'Comparing review_reason');
            if (dbTask.review_reason !== targetReviewReason) { updates.review_reason = targetReviewReason; needsUpdate = true; }
            logger.debug({ orderId, itemId, taskIndex: i, db: dbTask.annotation, target: targetAnnotation }, 'Comparing annotation');
            if (dbTask.annotation !== targetAnnotation) { updates.annotation = targetAnnotation; needsUpdate = true; }

            if (targetNeedsReview && dbTask.status !== PrintTaskStatus.completed) {
                if (dbTask.status !== PrintTaskStatus.pending) {
                    updates.status = PrintTaskStatus.pending;
                    needsUpdate = true;
                }
            }

            logger.debug({ orderId, itemId, taskIndex: i, needsUpdate }, 'Final needsUpdate check');
            if (needsUpdate) {
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Would update task with: ${JSON.stringify(updates)}`);
                } else {
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Updating task with: ${JSON.stringify(updates)}`); // Added info log
                    await tx.printOrderTask.update({
                        where: { id: dbTask.id },
                        data: updates,
                    });
                }
                updatedCount++;
            }
            finalAiTasksForShipStation.push(getCorrectedAiTaskForShipStation(originalAiTask));
        }

        // Handle extra DB tasks
        for (let i = aiCount; i < dbCount; i++) {
            const dbTaskToDelete = sortedDbTasks[i];
            // Only delete if the task is still PENDING, otherwise warn
            if (dbTaskToDelete.status === PrintTaskStatus.pending) {
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTaskToDelete.id}] Would DELETE this extra PENDING task because AI suggested fewer tasks.`);
                } else {
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTaskToDelete.id}] Deleting extra PENDING task (index ${i}) because AI suggested fewer tasks.`);
                    await tx.printOrderTask.delete({ where: { id: dbTaskToDelete.id } });
                    // Note: We don't increment updated/created counts for deletions
                }
            } else {
                const skipMsg = `MANUAL INTERVENTION REQUIRED: AI suggested fewer tasks, but existing task ${dbTaskToDelete.id} (index ${i}) has status '${dbTaskToDelete.status}' and was NOT deleted.`;
                logger.error(`[Update][Order ${orderId}][Item ${itemId}] ${skipMsg}`);
                warnings.push(skipMsg);
                // Add the existing task to ShipStation list if it wasn't deleted, using its current DB values
                finalAiTasksForShipStation.push({
                    customText: dbTaskToDelete.custom_text,
                    color1: dbTaskToDelete.color_1,
                    color2: dbTaskToDelete.color_2,
                    quantity: dbTaskToDelete.quantity,
                    needsReview: dbTaskToDelete.needs_review,
                    reviewReason: dbTaskToDelete.review_reason,
                    annotation: dbTaskToDelete.annotation,
                });
            }
        }
    }

    return {
        updated: updatedCount,
        created: createdCount,
        warnings,
        aiTasksForShipStation: finalAiTasksForShipStation,
        recoveredFromNotes // Include the flag in the return object
    };
}

// Extract personalization from internal notes - for single item personalization
function extractPersonalizationFromInternalNotes(
    internalNote: string | null
): { customText: string | null; color1: string | null; color2: string | null; wasFound: boolean } {
    if (!internalNote) {
        return { customText: null, color1: null, color2: null, wasFound: false };
    }

    // Look for AI personalization sections in notes - try multiple patterns
    const patterns = [
        // Pattern 1: AI personalized line followed by text on next line
        /🤖 AI personali[sz]ed (?:\d+) item(?:s)?\s*\n([^\n]+)/i,
        // Pattern 2: Text after emoji on same line
        /🤖 AI personali[sz]ed (?:\d+) item(?:s)?:?\s*([^\n]+)/i,
        // Pattern 3: Generic personalization line
        /AI personali[sz]ed:?\s*([^\n]+)/i,
        // Pattern 4: First line with color pattern directly
        /([^(]+)\s*\(\s*([^\/\)]+)(?:\s*\/\s*([^\/\)]+))?\s*\)/
    ];

    let personalizationLine = '';
    for (const pattern of patterns) {
        const match = internalNote.match(pattern);
        if (match && match[1]) {
            personalizationLine = match[1].trim();
            if (LOG_RECOVERY_DETAILS) logger.info(`Found personalization in notes using pattern: "${personalizationLine}"`);
            break;
        }
    }

    if (!personalizationLine) {
        if (LOG_RECOVERY_DETAILS) logger.debug(`No single personalization pattern found in internal notes`);
        return { customText: null, color1: null, color2: null, wasFound: false };
    }

    // Extract color information using common patterns
    let customText = personalizationLine;
    let color1: string | null = null;
    let color2: string | null = null;

    // Look for patterns like "Name (Color1 / Color2)" or "Name (Color1)"
    const colorMatch = personalizationLine.match(/^(.*?)\s*\(\s*([^\/\)]+)(?:\s*\/\s*([^\/\)]+))?\s*\)$/);

    if (colorMatch) {
        customText = colorMatch[1].trim();
        color1 = colorMatch[2].trim();
        color2 = colorMatch[3]?.trim() || null;
        if (LOG_RECOVERY_DETAILS) logger.info(`Extracted from internal notes: Text="${customText}", Color1="${color1}", Color2="${color2 || 'None'}"`);
    } else {
        // If no color pattern, assume the whole line is the text
        customText = personalizationLine;
        if (LOG_RECOVERY_DETAILS) logger.info(`Extracted from internal notes: Text="${customText}" (no colors found)`);
    }

    return { customText, color1, color2, wasFound: !!customText };
}

// Extract multiple personalizations from multi-item orders
function extractMultiplePersonalizationsFromNotes(
    internalNote: string | null
): Array<{ customText: string | null; color1: string | null; color2: string | null; wasFound: boolean }> {
    if (!internalNote) {
        return [];
    }

    // Check if this is a multi-item personalization section
    const aiSectionMatch = internalNote.match(/🤖 AI personali[sz]ed (\d+) items?/i);
    if (!aiSectionMatch || typeof aiSectionMatch.index !== 'number') { // Ensure index is valid
        // Not a standard multi-item format, try single item extraction
        const singleResult = extractPersonalizationFromInternalNotes(internalNote);
        return singleResult.wasFound ? [singleResult] : [];
    }

    // Try to determine how many items we expect
    const expectedItemCount = parseInt(aiSectionMatch[1], 10) || 0;
    if (LOG_RECOVERY_DETAILS) logger.debug(`Found multi-item personalization section, expecting ${expectedItemCount} items`);

    const results: Array<{ customText: string | null; color1: string | null; color2: string | null; wasFound: boolean }> = [];

    // Get the content *after* the header line
    const contentAfterHeader = internalNote.substring(aiSectionMatch.index + aiSectionMatch[0].length);
    const lines = contentAfterHeader.split('\n');

    // Regex to match the personalization pattern: Text (Color1 / Color2) or Text (Color1)
    const colorPattern = /^\s*([^(]+?)\s*\(\s*([^\/\)]+)(?:\s*\/\s*([^\/\)]+))?\s*\)\s*$/;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines or lines that are clearly not personalizations
        if (!trimmedLine || trimmedLine.includes('Task sync') || trimmedLine.includes('AmazonURL')) {
            continue;
        }

        const match = trimmedLine.match(colorPattern);

        if (match) {
            const customText = match[1]?.trim() || null;
            const color1 = match[2]?.trim() || null;
            const color2 = match[3]?.trim() || null;

            if (customText && color1) {
                if (LOG_RECOVERY_DETAILS) logger.info(`Found multi-item personalization: Text="${customText}", Color1="${color1}", Color2="${color2 || 'None'}"`);
                results.push({
                    customText,
                    color1,
                    color2,
                    wasFound: true
                });
            } else if (customText && !color1 && LOG_RECOVERY_DETAILS) {
                // Handle lines that might just be text without colors after the header
                logger.info(`Found fallback multi-item personalization (text only): "${customText}"`);
                results.push({ customText, color1: null, color2: null, wasFound: true });
            }
        } else {
            // Handle lines that might just be text without colors after the header
            if (trimmedLine) { // Check again if it's non-empty after trimming
                if (LOG_RECOVERY_DETAILS) logger.info(`Found fallback multi-item personalization (text only): "${trimmedLine}"`);
                results.push({ customText: trimmedLine, color1: null, color2: null, wasFound: true });
            }
        }
    }

    if (results.length === 0) {
        if (LOG_RECOVERY_DETAILS) logger.warn(`Could not extract personalization data from multi-item notes section lines`);
    } else if (results.length !== expectedItemCount && expectedItemCount > 0) {
        if (LOG_RECOVERY_DETAILS) logger.warn(`Expected ${expectedItemCount} items but found ${results.length} personalizations in notes lines`);
    }

    // Remove the fallback logic from the previous version as it's now integrated above
    // if (results.length === 0 && aiSectionMatch && typeof aiSectionMatch.index === 'number') { ... }

    return results;
}

// Find the best matching personalization for an item by comparing to ShipStation values
function findBestMatchingPersonalization(
    item: Prisma.OrderItemGetPayload<{ include: { product: true } }>, // Use correct type
    personalizations: Array<{ customText: string | null; color1: string | null; color2: string | null; wasFound: boolean }>,
    existingTasks: PrintOrderTask[]
): { customText: string | null; color1: string | null; color2: string | null; wasFound: boolean } | null {
    // If we have only one personalization or none, return it
    if (personalizations.length <= 1) {
        return personalizations[0] || null;
    }

    // First, filter out any placeholder-like entries
    const isPlaceholder = (text: string | null): boolean => {
        if (!text) return true;
        return text === 'Placeholder - Review Needed' ||
            text.includes('Task sync') ||
            text.includes('DB Task Update') ||
            text.includes('Y3D AI – Happy');
    };

    // Prioritize non-placeholder personalizations (that have valid data)
    const validPersonalizations = personalizations.filter(p => p.wasFound && p.customText && !isPlaceholder(p.customText));

    if (validPersonalizations.length > 0) {
        // Find the one that looks most like personalization (has both text and at least one color)
        const bestPersonalization = validPersonalizations.find(p => p.color1 || p.color2) || validPersonalizations[0];
        logger.info(`[Order ${item.orderId}][Item ${item.id}] Found valid personalization in notes: "${bestPersonalization.customText}" with colors: ${bestPersonalization.color1 || 'None'}/${bestPersonalization.color2 || 'None'}`);
        return bestPersonalization;
    }

    // Check if we can match with existing task values
    if (existingTasks.length > 0) {
        const task = existingTasks[0]; // Assume first task is primary for the item

        // Try to find an exact match for the existing task
        for (const p of personalizations) {
            // Skip empty personalizations
            if (!p.wasFound || !p.customText) continue;

            // If one of the values matches, this is likely the right personalization
            if (
                (task.custom_text && task.custom_text === p.customText) ||
                (task.color_1 && task.color_1 === p.color1) ||
                (task.color_2 && task.color_2 === p.color2)
            ) {
                logger.info(`Found matching personalization for item ${item.id} based on database task values`);
                return p;
            }
        }
    }

    // If no match found, check if print_settings has info we can match
    if (item.print_settings) {
        const settings = item.print_settings as Record<string, unknown>;
        const customText = typeof settings?.custom_text === 'string' ? settings.custom_text : null;
        const color1 = typeof settings?.color_1 === 'string' ? settings.color_1 : null;
        const color2 = typeof settings?.color_2 === 'string' ? settings.color_2 : null;

        // Try to find a match with print_settings
        for (const p of personalizations) {
            if (!p.wasFound || !p.customText) continue;

            if (
                (customText && customText === p.customText) ||
                (color1 && color1 === p.color1) ||
                (color2 && color2 === p.color2)
            ) {
                logger.info(`Found matching personalization for item ${item.id} based on print_settings`);
                return p;
            }
        }
    }

    // If multiple personalizations and no match, we need a better strategy.
    // For now, return null and let the main logic decide (maybe use AI result).
    // A better approach might involve matching based on item SKU or position if possible.
    logger.warn(`Multiple personalizations found for item ${item.id}, but no clear match. Cannot reliably select one from notes alone.`);
    return null; // Return null if no reliable match is found
}

// --- Main Execution ---
async function main() {
    console.log("--- DEBUG: main() function started ---");
    const _SCRIPT_NAME = 'update-discrepant-tasks';
    let cmdOptions: UpdateOptions;
    let recoveredOrdersCount = 0; // Initialize counters
    let recoveredTasksCount = 0;
    const ordersWithRecovery: number[] = []; // Track orders recovered

    try {
        logger = pino({ level: LOG_LEVEL }, process.stdout);
        logger.info(`--- Script Start: ${new Date().toISOString()} ---`);

        const openaiApiKey = process.env.OPENAI_API_KEY ?? null;
        if (!openaiApiKey) throw new Error('OpenAI API key missing (check .env).');

        const orderIdInput = TARGET_ORDER_IDS.map(id => id.trim()).filter(id => id);

        // --- MODIFICATION START: Add auto-discovery of placeholder orders ---
        let ordersToUpdate: OrderWithItemsTasksAndProduct[] = [];

        if (orderIdInput.length === 0) {
            logger.info('No target order IDs specified. Searching for orders with placeholder tasks...');

            // Find orders with placeholder tasks that match our type
            const placeholderOrders = await prisma.order.findMany({
                where: {
                    // Only include orders awaiting shipment
                    order_status: 'awaiting_shipment',
                    items: {
                        some: {
                            printTasks: {
                                some: {
                                    OR: [
                                        { custom_text: 'Placeholder - Review Needed' },
                                        { review_reason: { contains: 'No AI data for item' } }
                                    ]
                                }
                            }
                        }
                    }
                },
                include: {
                    items: {
                        include: {
                            product: true,
                            printTasks: { orderBy: { taskIndex: 'asc' } },
                        },
                    },
                },
                orderBy: [{ created_at: 'desc' }], // Using correct field name created_at
                take: MAX_AUTO_ORDERS, // Limit to prevent processing too many at once
            });

            logger.info(`Found ${placeholderOrders.length} orders with placeholder tasks (limited to ${MAX_AUTO_ORDERS} max).`);
            ordersToUpdate = placeholderOrders as OrderWithItemsTasksAndProduct[]; // Ensure correct type assignment

            // Summarize the orders for logging
            if (placeholderOrders.length > 0) {
                const orderSummary = placeholderOrders.map(o => {
                    // Safely access items with appropriate type assertions
                    const items = (o as unknown as { items?: Array<{ id: number }> }).items || [];
                    const itemsLength = items.length;
                    return `ID: ${o.id}, ShipStation: ${o.shipstation_order_number || 'N/A'}, Items: ${itemsLength}`;
                }).join('\n  ');
                logger.info(`Orders to process:\n  ${orderSummary}`);
            }
        } else {
            logger.info(`Processing ${orderIdInput.length} specified orders defined in script.`);

            // Corrected logic: Build an OR condition for each ID, checking relevant fields
            const orderIdConditions = orderIdInput.map(id => {
                const conditions: Prisma.OrderWhereInput[] = [
                    { shipstation_order_number: id },
                    { shipstation_order_id: id },
                    { order_key: id }
                ];
                // If the ID is purely numeric, also check the primary id column
                const numericId = parseInt(id, 10);
                if (!isNaN(numericId) && /^\d+$/.test(id)) {
                    conditions.push({ id: numericId });
                }
                // Return a structure where ANY of these fields matching the ID is sufficient
                return { OR: conditions };
            });

            ordersToUpdate = await prisma.order.findMany({
                where: {
                    // The final OR combines the conditions for each ID from the map above
                    OR: orderIdConditions,
                },
                include: {
                    items: {
                        include: {
                            product: true,
                            printTasks: { orderBy: { taskIndex: 'asc' } },
                        },
                    },
                },
            });

            console.log(`--- DEBUG: Found ${ordersToUpdate.length} orders matching criteria ---`);
            if (ordersToUpdate.length > 0) {
                console.log(`--- DEBUG: First found order ID: ${ordersToUpdate[0].id} ---`);
            }

            const foundIds = ordersToUpdate.map(o => o.id);
            const notFoundIds = orderIdInput.filter(id => {
                const isNumericId = /^\d+$/.test(id);
                if (isNumericId) {
                    return !foundIds.includes(parseInt(id, 10));
                } else {
                    return !ordersToUpdate.some(o => o.shipstation_order_number === id);
                }
            });
            if (notFoundIds.length > 0) {
                logger.warn(`Could not find the following specified orders: ${notFoundIds.join(', ')}`);
            }
        }
        // --- MODIFICATION END ---

        logger.info(`Found ${ordersToUpdate.length} orders to process.`);

        logger.info('Loading base prompts...');
        const baseSystemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
        const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
        logger.info('Prompts loaded.');

        const reinforcementInstruction = `
# Additional Priority Instruction for this Run (HIGH):

1. **Color Override** – If the "customerNotes" field contains explicit lines such as "Colour:" / "Color:" / "Primary Colour:" or "Secondary colour:" / "Colour 2:", ALWAYS use those values for 'color1' / 'color2', overriding any other source.

2. **Quantity Integrity (NEW RULE)** – For every item in the input JSON:
   • Let 'expected_quantity' = 'quantityOrdered'.
   • You MUST return exactly expected_quantity personalization objects and no more.
   • If expected_quantity is 1, NEVER split the text into multiple personalization objects — even if multiple names or lines are present. Return exactly one object with 'quantity' = 1.
   • Only consider splitting when expected_quantity > 1 and strong evidence exists (e.g., clearly numbered/bulleted multi-line notes AND the number of lines equals expected_quantity).

3. **Mismatch Handling** – If after processing you believe the parsed quantity does not equal expected_quantity, do NOT create extra personalization objects. Instead:
   • Return one object with 'needsReview' = true and 'reviewReason' = "QUANTITY_MISMATCH".
   • Set 'overallNeedsReview' to true with 'overallReviewReason' = "QUANTITY_MISMATCH".

Follow these rules strictly. Returning the wrong number of personalization objects breaks downstream logic.
`;
        const systemPrompt = reinforcementInstruction + "\n\n" + baseSystemPrompt;
        logger.info('Added reinforcement instruction to system prompt for this run.');

        cmdOptions = {
            orderIds: orderIdInput,
            openaiApiKey,
            openaiModel: OPENAI_MODEL,
            systemPrompt,
            userPromptTemplate,
            logLevel: LOG_LEVEL,
            dryRun: DRY_RUN_MODE,
        };
        if (cmdOptions.dryRun) logger.warn('--- DRY RUN MODE ENABLED ---');

        let totalUpdates = 0;
        let totalCreates = 0;
        const ordersWithWarnings: Record<number, string[]> = {};

        for (const order of ordersToUpdate) {
            logger.info(`--- Processing Order ID: ${order.id} (${order.shipstation_order_number || 'N/A'}) ---`);

            // --- Fetch latest notes from ShipStation --- START
            let latestCustomerNotes = order.customer_notes; // Default to DB notes
            let internalNote: string | null = null; // Variable for internal notes
            if (order.shipstation_order_id) {
                logger.debug(`[Order ${order.id}] Fetching latest data from ShipStation (ID: ${order.shipstation_order_id})...`);
                try {
                    const ssOrderResp = await getShipstationOrders({ orderId: Number(order.shipstation_order_id) });
                    if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
                        const ssOrder = ssOrderResp.orders[0];
                        internalNote = ssOrder.internalNotes || null; // Store internal notes
                        if (internalNote && LOG_RECOVERY_DETAILS) {
                            logger.debug(`[Order ${order.id}] Internal notes found: "${internalNote.substring(0, 150)}..."`);
                        } else if (!internalNote && LOG_RECOVERY_DETAILS) {
                            logger.debug(`[Order ${order.id}] No internal notes found.`);
                        }

                        if (ssOrder.customerNotes !== order.customer_notes) {
                            logger.info(`[Order ${order.id}] Customer notes differ between DB and ShipStation. Using ShipStation notes.`);
                            if (LOG_RECOVERY_DETAILS) logger.trace({ dbNotes: order.customer_notes, ssNotes: ssOrder.customerNotes }, `[Order ${order.id}] Notes comparison`);
                            latestCustomerNotes = ssOrder.customerNotes;
                        } else {
                            logger.debug(`[Order ${order.id}] Notes match between DB and ShipStation.`);
                        }
                    } else {
                        logger.warn(`[Order ${order.id}] Could not find order ${order.shipstation_order_id} in ShipStation to fetch latest notes.`);
                    }
                } catch (ssError) {
                    logger.warn(`[Order ${order.id}] Failed to fetch latest notes from ShipStation: ${ssError instanceof Error ? ssError.message : String(ssError)}. Using notes from DB.`);
                }
            } else {
                logger.debug(`[Order ${order.id}] No ShipStation Order ID found, using notes from DB.`);
            }
            // --- Fetch latest notes from ShipStation --- END

            // Extract ALL personalizations found in internal notes
            const allPersonalizations = extractMultiplePersonalizationsFromNotes(internalNote);
            if (LOG_RECOVERY_DETAILS) logger.debug(`[Order ${order.id}] Extracted ${allPersonalizations.length} personalizations from internal notes.`);

            const aiResult = await extractOrderPersonalization(order, latestCustomerNotes, cmdOptions); // Pass latest notes

            if (!aiResult.success || !aiResult.data) {
                logger.error(`[Order ${order.id}] Failed to get AI interpretation: ${aiResult.error || 'Unknown AI error'}. Will attempt recovery from notes if possible.`);
                ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                ordersWithWarnings[order.id].push(`AI extraction failed: ${aiResult.error || 'Unknown AI error'}`);
                // Don't continue; let the applyAiUpdatesToTasks handle potential recovery
            }

            const aiItemPersonalizations = aiResult.data?.itemPersonalizations ?? {}; // Handle case where AI fails
            const orderItemsToPatch: Record<string, Array<{ name: string; value: string | null }>> = {};
            const orderPatchReasons: string[] = [];
            let dbUpdatesMadeThisOrder = false;

            // --- Explicit notes parsing for DB comparison --- START
            let notesColor1: string | null = null;
            let notesColor2: string | null = null;
            if (latestCustomerNotes) { // Use latest notes for parsing here too
                const notes = latestCustomerNotes;
                const color1Match = notes.match(/^(?:Colour|Color|Primary Colour):\s*(.+)$/im);
                const color2Match = notes.match(/^(?:Secondary colour|Color 2):\s*(.+)$/im);
                if (color1Match && color1Match[1]) {
                    notesColor1 = color1Match[1].trim();
                    logger.debug(`[Notes Parse][Order ${order.id}] Found color1 '${notesColor1}' in latest notes.`);
                }
                if (color2Match && color2Match[1]) {
                    notesColor2 = color2Match[1].trim();
                    logger.debug(`[Notes Parse][Order ${order.id}] Found color2 '${notesColor2}' in latest notes.`);
                }
            }
            // --- Explicit notes parsing for DB comparison --- END

            try {
                await prisma.$transaction(async (tx) => {
                    for (const item of order.items) {
                        const existingTasks = item.printTasks;
                        const aiPersonalizationsForItem = aiItemPersonalizations[item.id.toString()]?.personalizations;

                        // Find the best matching personalization for this item from internal notes
                        let extractedPersonalization: { customText: string | null; color1: string | null; color2: string | null; wasFound: boolean } | null = null;
                        if (allPersonalizations.length > 0) {
                            extractedPersonalization = findBestMatchingPersonalization(
                                item,
                                allPersonalizations,
                                existingTasks
                            );

                            if (extractedPersonalization && LOG_RECOVERY_DETAILS) {
                                logger.info(`[Order ${order.id}][Item ${item.id}] Using personalization from internal notes: "${extractedPersonalization.customText}"`);
                            } else if (allPersonalizations.length > 0 && LOG_RECOVERY_DETAILS) {
                                logger.warn(`[Order ${order.id}][Item ${item.id}] Could not reliably match item to internal note personalization. AI result will be used.`);
                            }
                        }

                        const result = await applyAiUpdatesToTasks(
                            tx, order.id, item.id, item.quantity,
                            existingTasks, aiPersonalizationsForItem,
                            cmdOptions,
                            notesColor1,
                            notesColor2,
                            extractedPersonalization // Pass the matched personalization
                        );

                        totalUpdates += result.updated;
                        totalCreates += result.created;
                        if (result.updated > 0 || result.created > 0) {
                            dbUpdatesMadeThisOrder = true;
                        }

                        // Track recovery stats
                        if (result.recoveredFromNotes) {
                            recoveredTasksCount += result.updated; // Count updated tasks as recovered

                            // Only count each order once for the order summary
                            if (!ordersWithRecovery.includes(order.id)) {
                                recoveredOrdersCount++;
                                ordersWithRecovery.push(order.id);
                            }
                        }

                        if (result.warnings.length > 0) {
                            ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                            ordersWithWarnings[order.id].push(...result.warnings.map(w => `Item ${item.id}: ${w}`));
                        }

                        // --- Prepare ShipStation updates ---
                        if (!cmdOptions.dryRun && item.shipstationLineItemKey && result.aiTasksForShipStation.length > 0) {
                            // Use the first task's details for ShipStation options (most common case)
                            const primaryTask = result.aiTasksForShipStation[0];
                            const ssOptions = [];
                            if (primaryTask.customText) ssOptions.push({ name: 'Name or Text', value: primaryTask.customText });
                            if (primaryTask.color1) ssOptions.push({ name: 'Colour 1', value: primaryTask.color1 });
                            if (primaryTask.color2) ssOptions.push({ name: 'Colour 2', value: primaryTask.color2 });

                            if (ssOptions.length > 0) {
                                logger.debug(`[Update][Order ${order.id}][Item ${item.id}] Staging ShipStation update with options: ${JSON.stringify(ssOptions)}`);
                                orderItemsToPatch[item.shipstationLineItemKey] = ssOptions;
                                // Determine the source for the patch reason
                                let patchSource = 'AI';
                                if (result.recoveredFromNotes) patchSource = 'NotesRecovery';
                                else if (notesColor1 || notesColor2) patchSource = 'NotesOverride';
                                orderPatchReasons.push(`${item.shipstationLineItemKey}(${patchSource})`);
                            }
                        }
                    }
                }, { maxWait: 60000, timeout: 120000 });

                logger.info(`[Order ${order.id}] Successfully processed DB changes (if any). DB changes made: ${dbUpdatesMadeThisOrder}`);

                // --- ShipStation Batch Update ---
                if (!cmdOptions.dryRun && Object.keys(orderItemsToPatch).length > 0 && order.shipstation_order_id && (dbUpdatesMadeThisOrder || FORCE_SHIPSTATION_UPDATE)) {
                    logger.info(`[ShipStation Batch][Order ${order.id}] Attempting to update ${Object.keys(orderItemsToPatch).length} items in ShipStation (DB Changed: ${dbUpdatesMadeThisOrder}, Force Flag: ${FORCE_SHIPSTATION_UPDATE})...`);

                    try {
                        const ssOrderResp = await getShipstationOrders({ orderId: Number(order.shipstation_order_id) });
                        if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
                            const auditNote = `DB Task Update ${new Date().toISOString()} -> ${orderPatchReasons.join(', ')}`;
                            await updateOrderItemsOptionsBatch(ssOrderResp.orders[0], orderItemsToPatch, auditNote);
                            logger.info(`[ShipStation Batch][Order ${order.id}] Successfully updated items: ${orderPatchReasons.join(', ')}`);
                        } else {
                            logger.error(`[ShipStation Batch][Order ${order.id}] Failed to fetch SS order for batch update.`);
                            ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                            ordersWithWarnings[order.id].push(`Failed to fetch SS order ${order.shipstation_order_id} for batch update.`);
                        }
                    } catch (batchErr) {
                        logger.error(`[ShipStation Batch][Order ${order.id}] Error during batch update`, batchErr);
                        ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                        ordersWithWarnings[order.id].push(`ShipStation batch update failed: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
                    }
                } else if (Object.keys(orderItemsToPatch).length > 0) {
                    logger.info(`[ShipStation Batch][Order ${order.id}] Skipping ShipStation update (DryRun=${cmdOptions.dryRun}, HasSSID=${!!order.shipstation_order_id}, DB Changed=${dbUpdatesMadeThisOrder}, ForceFlag=${FORCE_SHIPSTATION_UPDATE}).`);
                }

            } catch (error) {
                logger.error(`[Order ${order.id}] Transaction failed: ${error instanceof Error ? error.message : String(error)}`, error);
                ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                ordersWithWarnings[order.id].push(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        logger.info('--- Update Script Complete ---');
        logger.info(`Processed ${ordersToUpdate.length} specified orders.`);
        logger.info(`Total tasks updated: ${totalUpdates}`);
        logger.info(`Total new tasks created: ${totalCreates}`);
        if (Object.keys(ordersWithWarnings).length > 0) {
            logger.warn('--- Orders with Warnings/Manual Intervention Needed ---');
            for (const orderIdStr in ordersWithWarnings) {
                const orderId = parseInt(orderIdStr, 10);
                logger.warn(`Order ID ${orderId}:`);
                ordersWithWarnings[orderId].forEach(warn => logger.warn(`  - ${warn}`));
            }
        } else {
            logger.info('No warnings requiring manual intervention were logged.');
        }

        // Add recovery operations summary
        logger.info('--- Recovery Summary ---');
        if (recoveredOrdersCount > 0) {
            logger.info(`Successfully recovered data for ${recoveredOrdersCount} orders (${recoveredTasksCount} tasks).`);
        } else {
            logger.info('No placeholder tasks were recovered from internal notes.');
        }

        if (DRY_RUN_MODE) {
            logger.warn('--- DRY RUN MODE ACTIVE ---');
            logger.warn('No changes were made to the database or ShipStation.');
            logger.warn('Review the logs above for potential updates.');
            logger.warn('To apply changes, set DRY_RUN_MODE = false at the top of the script and re-run.');
        }

    } catch (error) {
        if (logger) logger.error('SCRIPT FAILED', error);
        else console.error('SCRIPT FAILED', error);
        process.exitCode = 1;
    } finally {
        if (prisma) await prisma.$disconnect();
        if (logger) logger.info('DB disconnected. Script finished.');
        else console.log('DB disconnected. Script finished.');
    }
}

void main();
