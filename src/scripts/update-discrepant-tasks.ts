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
const TARGET_ORDER_IDS: string[] = [
    "617", // Example
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
const OPENAI_MODEL = 'gpt-4.1';
const FORCE_SHIPSTATION_UPDATE = true; // Set to true to update ShipStation even if DB task didn't change
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
    interface ApiPayload { model: string; messages: ApiMessage[]; temperature: number; max_tokens: number; response_format: ResponseFormat; top_p?: number; frequency_penalty?: number; presence_penalty?: number; }

    let rawResponse: string | null = null;
    const modelUsed = options.openaiModel;
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    const apiKey = options.openaiApiKey;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
    const startTime = Date.now();

    try {
        if (!apiKey) throw new Error('OpenAI API key missing');
        logger.info(`[AI Update][Order ${order.id}] Calling OpenAI (${modelUsed})...`);
        const apiPayload: ApiPayload = { model: modelUsed, messages: [{ role: 'system', content: systemPromptContent }, { role: 'user', content: userPromptContent }], temperature: 0.0, top_p: 1.0, frequency_penalty: 0.0, presence_penalty: 0.0, max_tokens: 4096, response_format: { type: 'json_object' } };
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
    itemQuantity: number,
    existingTasks: PrintOrderTask[],
    aiPersonalizations: z.infer<typeof PersonalizationDetailSchema>[] | undefined,
    options: UpdateOptions,
    notesColor1: string | null, // Explicitly parsed color 1 from notes
    notesColor2: string | null  // Explicitly parsed color 2 from notes
): Promise<{ updated: number; created: number; warnings: string[]; aiTasksForShipStation: z.infer<typeof PersonalizationDetailSchema>[] }> {
    const warnings: string[] = [];
    let updatedCount = 0;
    let createdCount = 0;
    const aiData = aiPersonalizations ?? [];
    const aiCount = aiData.length;
    const dbCount = existingTasks.length;
    const finalAiTasksForShipStation: z.infer<typeof PersonalizationDetailSchema>[] = [];

    logger.debug(`[Update][Order ${orderId}][Item ${itemId}] Comparing ${dbCount} DB tasks with ${aiCount} AI suggestions. Explicit notes colors: C1=${notesColor1}, C2=${notesColor2}`);

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

    if (aiCount === dbCount) {
        logger.info(`[Update][Order ${orderId}][Item ${itemId}] Task counts match (${aiCount}). Updating existing tasks.`);
        for (let i = 0; i < aiCount; i++) {
            const dbTask = existingTasks[i];
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
            const dbTask = existingTasks[i];
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

        // Create new tasks
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
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}] Creating new task (index ${i}) with data: ${JSON.stringify(newTaskData)}`); // Added info log
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
            const dbTask = existingTasks[i];
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
            const dbTaskToDelete = existingTasks[i];
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

    return { updated: updatedCount, created: createdCount, warnings, aiTasksForShipStation: finalAiTasksForShipStation };
}

// --- Main Execution ---
async function main() {
    console.log("--- DEBUG: main() function started ---");
    const SCRIPT_NAME = 'update-discrepant-tasks';
    let cmdOptions: UpdateOptions;

    try {
        logger = pino({ level: LOG_LEVEL }, process.stdout);
        logger.info(`--- Script Start: ${new Date().toISOString()} ---`);

        const openaiApiKey = process.env.OPENAI_API_KEY ?? null;
        if (!openaiApiKey) throw new Error('OpenAI API key missing (check .env).');

        const orderIdInput = TARGET_ORDER_IDS.map(id => id.trim()).filter(id => id);
        if (orderIdInput.length === 0) {
            throw new Error("No target order IDs defined in the TARGET_ORDER_IDS variable at the top of the script.");
        }
        logger.info(`Processing ${orderIdInput.length} specified orders defined in script.`);

        logger.info('Loading base prompts...');
        const baseSystemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
        const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
        logger.info('Prompts loaded.');

        const reinforcementInstruction = `
# Additional Priority Instruction for this Run:
CRITICAL: Pay extra attention to the 'customerNotes' field. If you see lines explicitly defining colors like "Colour: [COLOR_NAME]" or "Secondary colour: [COLOR_NAME]", you MUST extract these values for color1 and color2 respectively, overriding any other color source for this item.
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

        logger.info('Fetching specified orders...');
        const orderIdFilters = cmdOptions.orderIds.map(id => {
            const isNumericId = /^\d+$/.test(id);
            return isNumericId ? { id: parseInt(id, 10) } : { shipstation_order_number: id };
        });

        const ordersToUpdate = await prisma.order.findMany({
            where: {
                OR: orderIdFilters,
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
        const notFoundIds = cmdOptions.orderIds.filter(id => {
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

        logger.info(`Found ${ordersToUpdate.length} orders to process.`);

        let totalUpdates = 0;
        let totalCreates = 0;
        const ordersWithWarnings: Record<number, string[]> = {};

        for (const order of ordersToUpdate) {
            logger.info(`--- Processing Order ID: ${order.id} (${order.shipstation_order_number || 'N/A'}) ---`);

            // --- Fetch latest notes from ShipStation --- START
            let latestCustomerNotes = order.customer_notes; // Default to DB notes
            if (order.shipstation_order_id) {
                logger.debug(`[Order ${order.id}] Fetching latest data from ShipStation (ID: ${order.shipstation_order_id})...`);
                try {
                    const ssOrderResp = await getShipstationOrders({ orderId: Number(order.shipstation_order_id) });
                    if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
                        const ssOrder = ssOrderResp.orders[0];
                        if (ssOrder.customerNotes !== order.customer_notes) {
                            logger.info(`[Order ${order.id}] Customer notes differ between DB and ShipStation. Using ShipStation notes for AI.`);
                            logger.trace({ dbNotes: order.customer_notes, ssNotes: ssOrder.customerNotes }, `[Order ${order.id}] Notes comparison`);
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

            const aiResult = await extractOrderPersonalization(order, latestCustomerNotes, cmdOptions); // Pass latest notes

            if (!aiResult.success || !aiResult.data) {
                logger.error(`[Order ${order.id}] Failed to get AI interpretation: ${aiResult.error || 'Unknown AI error'}. Skipping update.`);
                ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                ordersWithWarnings[order.id].push(`AI extraction failed: ${aiResult.error || 'Unknown AI error'}`);
                continue;
            }

            const aiItemPersonalizations = aiResult.data.itemPersonalizations;
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

                        const result = await applyAiUpdatesToTasks(
                            tx, order.id, item.id, item.quantity,
                            existingTasks, aiPersonalizationsForItem,
                            cmdOptions,
                            notesColor1,
                            notesColor2
                        );

                        totalUpdates += result.updated;
                        totalCreates += result.created;
                        if (result.updated > 0 || result.created > 0) {
                            dbUpdatesMadeThisOrder = true;
                        }
                        if (result.warnings.length > 0) {
                            ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                            ordersWithWarnings[order.id].push(...result.warnings.map(w => `Item ${item.id}: ${w}`));
                        }

                        if (!cmdOptions.dryRun && item.shipstationLineItemKey && result.aiTasksForShipStation.length > 0) {
                            const primaryAiTask = result.aiTasksForShipStation[0];
                            const ssOptions = [];
                            if (primaryAiTask.customText) ssOptions.push({ name: 'Name or Text', value: primaryAiTask.customText });
                            if (primaryAiTask.color1) ssOptions.push({ name: 'Colour 1', value: primaryAiTask.color1 });
                            if (primaryAiTask.color2) ssOptions.push({ name: 'Colour 2', value: primaryAiTask.color2 });

                            if (ssOptions.length > 0) {
                                logger.debug(`[Update][Order ${order.id}][Item ${item.id}] Staging ShipStation update with options: ${JSON.stringify(ssOptions)}`);
                                orderItemsToPatch[item.shipstationLineItemKey] = ssOptions;
                                orderPatchReasons.push(`${item.shipstationLineItemKey}(AI)`);
                            }
                        }
                    }
                }, { maxWait: 60000, timeout: 120000 });

                logger.info(`[Order ${order.id}] Successfully processed DB changes (if any). DB changes made: ${dbUpdatesMadeThisOrder}`);

                if (!cmdOptions.dryRun && Object.keys(orderItemsToPatch).length > 0 && order.shipstation_order_id && (dbUpdatesMadeThisOrder || FORCE_SHIPSTATION_UPDATE)) {
                    logger.info(`[ShipStation Batch][Order ${order.id}] Attempting to update ${Object.keys(orderItemsToPatch).length} items in ShipStation (DB Changed: ${dbUpdatesMadeThisOrder}, Force Flag: ${FORCE_SHIPSTATION_UPDATE})...`);

                    try {
                        const ssOrderResp = await getShipstationOrders({ orderId: Number(order.shipstation_order_id) });
                        if (ssOrderResp.orders && ssOrderResp.orders.length > 0) {
                            const auditNote = `AI Task Update ${new Date().toISOString()} -> ${orderPatchReasons.join(', ')}`;
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
