// Purpose: Updates existing print tasks based on current AI logic for specified orders.
//          Order IDs are defined in the TARGET_ORDER_IDS variable below.
//          Prioritizes safety: updates existing, creates new, warns on deletions needed.

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

import type { PrintOrderTask as PrintTask } from '@prisma/client';
import { PrintTaskStatus, Prisma, PrismaClient } from '@prisma/client';
// REMOVED: import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import z from 'zod';

// --- !!! DEFINE TARGET ORDERS HERE !!! ---
// Add the Order IDs or ShipStation Order Numbers you want to process in this array.
const TARGET_ORDER_IDS: string[] = [
    "647", // Example: Process order with DB ID 647
    // "25-12960-54710", // Example: Process order with ShipStation number
    // Add more IDs/numbers separated by commas
];
// --- !!! DEFINE TARGET ORDERS HERE !!! ---

// --- !!! CONFIGURE OPTIONS HERE !!! ---
const DRY_RUN_MODE = true; // Set to false to apply changes, true to simulate
const LOG_LEVEL = 'info'; // 'debug', 'info', 'warn', 'error'
const OPENAI_MODEL = 'gpt-4.1-mini';
// --- !!! CONFIGURE OPTIONS HERE !!! ---


// --- Types (Copied/adapted from populate-print-queue) ---
// Zod Schemas
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
const _AiOrderResponseSchema = z.object({
    itemPersonalizations: z.record(z.string(), ItemPersonalizationResultSchema),
});

// Processing Options for this script - Simplified as commander is removed
interface UpdateOptions {
    orderIds: string[];
    openaiApiKey: string | null;
    openaiModel: string;
    systemPrompt: string;
    userPromptTemplate: string;
    logLevel: string;
    dryRun: boolean;
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
let logStream: fsSync.WriteStream | null = null;

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
    order: OrderWithItemsTasksAndProduct,
    options: Pick<
        UpdateOptions,
        'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
    >
): Promise<{ success: boolean; data?: z.infer<typeof _AiOrderResponseSchema>; error?: string; promptUsed: string | null; rawResponse: string | null; modelUsed: string | null }> {
    // ... (Paste the full, correct implementation of extractOrderPersonalization here) ...
    // Placeholder to avoid excessive length, ensure you copy the real one
    logger.warn(`[AI Update][Order ${order.id}] Using placeholder AI function - replace with full implementation!`);
    return { success: false, error: "Placeholder AI function used", promptUsed: null, rawResponse: null, modelUsed: options.openaiModel };
}


// --- Main Update Logic ---
async function applyAiUpdatesToTasks(
    tx: Prisma.TransactionClient,
    orderId: number,
    itemId: number,
    _itemQuantity: number, // Pass item quantity for context (unused)
    existingTasks: PrintTask[],
    aiPersonalizations: z.infer<typeof PersonalizationDetailSchema>[] | undefined,
    options: UpdateOptions // Pass simplified options
): Promise<{ updated: number; created: number; warnings: string[] }> {
    const warnings: string[] = [];
    let updatedCount = 0;
    let createdCount = 0;
    const aiData = aiPersonalizations ?? [];
    const aiCount = aiData.length;
    const dbCount = existingTasks.length;

    logger.debug(`[Update][Order ${orderId}][Item ${itemId}] Comparing ${dbCount} DB tasks with ${aiCount} AI suggestions.`);

    if (aiCount === dbCount) {
        // --- Case 1: Same number of tasks ---
        logger.info(`[Update][Order ${orderId}][Item ${itemId}] Task counts match (${aiCount}). Updating existing tasks.`);
        for (let i = 0; i < aiCount; i++) {
            const dbTask = existingTasks[i];
            const aiTask = aiData[i];
            const updates: Prisma.PrintOrderTaskUpdateInput = {};
            let needsUpdate = false;

            // Compare fields and stage updates
            if (dbTask.custom_text !== aiTask.customText) { updates.custom_text = aiTask.customText; needsUpdate = true; }
            if (dbTask.color_1 !== aiTask.color1) { updates.color_1 = aiTask.color1; needsUpdate = true; }
            if (dbTask.color_2 !== aiTask.color2) { updates.color_2 = aiTask.color2; needsUpdate = true; }
            if (dbTask.quantity !== aiTask.quantity) { updates.quantity = aiTask.quantity; needsUpdate = true; }
            if (dbTask.needs_review !== aiTask.needsReview) { updates.needs_review = aiTask.needsReview; needsUpdate = true; }
            if (dbTask.review_reason !== aiTask.reviewReason) { updates.review_reason = aiTask.reviewReason; needsUpdate = true; }
            if (dbTask.annotation !== aiTask.annotation) { updates.annotation = aiTask.annotation; needsUpdate = true; } // Also update annotation

            // Status update logic
            if (aiTask.needsReview && dbTask.status !== PrintTaskStatus.completed) {
                if (dbTask.status !== PrintTaskStatus.pending) {
                    updates.status = PrintTaskStatus.pending;
                    needsUpdate = true;
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Setting status to PENDING because AI flags needsReview.`);
                } else if (!dbTask.needs_review) { // Only log if status is already pending but review flag changed
                    logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Keeping status PENDING, AI flags needsReview.`);
                }
            } else if (!aiTask.needsReview && dbTask.needs_review) {
                logger.info(`[Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] AI suggests review no longer needed. Status (${dbTask.status}) unchanged.`);
                // We only update the flag/reason, not the status automatically back from pending
            }


            if (needsUpdate) {
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Would update task with: ${JSON.stringify(updates)}`);
                } else {
                    await tx.printOrderTask.update({
                        where: { id: dbTask.id },
                        data: updates,
                    });
                }
                updatedCount++;
            }
        }
    } else if (aiCount > dbCount) {
        // --- Case 2: AI suggests more tasks (e.g., split) ---
        logger.warn(`[Update][Order ${orderId}][Item ${itemId}] AI suggests more tasks (${aiCount}) than exist (${dbCount}). Updating existing and creating new.`);
        warnings.push(`AI suggests more tasks (${aiCount}) than exist (${dbCount}). Creating missing tasks.`);

        // Update existing tasks first
        for (let i = 0; i < dbCount; i++) {
            const dbTask = existingTasks[i];
            const aiTask = aiData[i];
            // Apply same update logic as Case 1
            const updates: Prisma.PrintOrderTaskUpdateInput = {};
            let needsUpdate = false;
            if (dbTask.custom_text !== aiTask.customText) { updates.custom_text = aiTask.customText; needsUpdate = true; }
            if (dbTask.color_1 !== aiTask.color1) { updates.color_1 = aiTask.color1; needsUpdate = true; }
            if (dbTask.color_2 !== aiTask.color2) { updates.color_2 = aiTask.color2; needsUpdate = true; }
            if (dbTask.quantity !== aiTask.quantity) { updates.quantity = aiTask.quantity; needsUpdate = true; }
            if (dbTask.needs_review !== aiTask.needsReview) { updates.needs_review = aiTask.needsReview; needsUpdate = true; }
            if (dbTask.review_reason !== aiTask.reviewReason) { updates.review_reason = aiTask.reviewReason; needsUpdate = true; }
            if (dbTask.annotation !== aiTask.annotation) { updates.annotation = aiTask.annotation; needsUpdate = true; }
            if (aiTask.needsReview && dbTask.status !== PrintTaskStatus.completed) {
                if (dbTask.status !== PrintTaskStatus.pending) { updates.status = PrintTaskStatus.pending; needsUpdate = true; }
            }
            if (needsUpdate) {
                if (options.dryRun) { logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Would update task with: ${JSON.stringify(updates)}`); }
                else { await tx.printOrderTask.update({ where: { id: dbTask.id }, data: updates }); }
                updatedCount++;
            }
        }

        // Create new tasks for the remainder
        const orderItem = await tx.orderItem.findUnique({ where: { id: itemId }, include: { order: true, product: true } }); // Need order/product context
        if (!orderItem || !orderItem.order || !orderItem.product) {
            warnings.push(`Could not find full OrderItem context for Item ${itemId} to create new tasks.`);
            logger.error(`[Update][Order ${orderId}][Item ${itemId}] Failed to fetch full item context for creating new tasks.`);
        } else {
            for (let i = dbCount; i < aiCount; i++) {
                const aiTask = aiData[i];
                const newTaskData: Prisma.PrintOrderTaskCreateInput = {
                    order: { connect: { id: orderId } },
                    orderItem: { connect: { id: itemId } },
                    product: { connect: { id: orderItem.productId } },
                    taskIndex: i, // Assign next available index
                    shorthandProductName: orderItem.product.name?.substring(0, 100) ?? 'Unknown Product',
                    customer: orderItem.order.customerId ? { connect: { id: orderItem.order.customerId } } : undefined,
                    quantity: aiTask.quantity,
                    custom_text: aiTask.customText,
                    color_1: aiTask.color1,
                    color_2: aiTask.color2,
                    ship_by_date: orderItem.order.ship_by_date,
                    needs_review: aiTask.needsReview ?? false,
                    review_reason: aiTask.reviewReason,
                    status: PrintTaskStatus.pending, // New tasks start as pending
                    marketplace_order_number: orderItem.order.shipstation_order_number,
                    annotation: aiTask.annotation ?? `Created by update script due to AI split`,
                };
                if (options.dryRun) {
                    logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}] Would create new task (index ${i}) with data: ${JSON.stringify(newTaskData)}`);
                } else {
                    await tx.printOrderTask.create({ data: newTaskData });
                }
                createdCount++;
            }
        }

    } else { // aiCount < dbCount
        // --- Case 3: AI suggests fewer tasks ---
        logger.error(`[Update][Order ${orderId}][Item ${itemId}] MANUAL INTERVENTION REQUIRED: AI suggests fewer tasks (${aiCount}) than exist (${dbCount}). Only updating matching tasks.`);
        warnings.push(`MANUAL INTERVENTION REQUIRED: AI suggests fewer tasks (${aiCount}) than exist (${dbCount}). Existing tasks beyond index ${aiCount - 1} were not automatically deleted.`);

        // Update the tasks that *do* have a corresponding AI suggestion
        for (let i = 0; i < aiCount; i++) {
            const dbTask = existingTasks[i];
            const aiTask = aiData[i];
            // Apply same update logic as Case 1
            const updates: Prisma.PrintOrderTaskUpdateInput = {};
            let needsUpdate = false;
            if (dbTask.custom_text !== aiTask.customText) { updates.custom_text = aiTask.customText; needsUpdate = true; }
            if (dbTask.color_1 !== aiTask.color1) { updates.color_1 = aiTask.color1; needsUpdate = true; }
            if (dbTask.color_2 !== aiTask.color2) { updates.color_2 = aiTask.color2; needsUpdate = true; }
            if (dbTask.quantity !== aiTask.quantity) { updates.quantity = aiTask.quantity; needsUpdate = true; }
            if (dbTask.needs_review !== aiTask.needsReview) { updates.needs_review = aiTask.needsReview; needsUpdate = true; }
            if (dbTask.review_reason !== aiTask.reviewReason) { updates.review_reason = aiTask.reviewReason; needsUpdate = true; }
            if (dbTask.annotation !== aiTask.annotation) { updates.annotation = aiTask.annotation; needsUpdate = true; }
            if (aiTask.needsReview && dbTask.status !== PrintTaskStatus.completed) {
                if (dbTask.status !== PrintTaskStatus.pending) { updates.status = PrintTaskStatus.pending; needsUpdate = true; }
            }
            if (needsUpdate) {
                if (options.dryRun) { logger.warn(`[Dry Run][Update][Order ${orderId}][Item ${itemId}][Task ${dbTask.id}] Would update task with: ${JSON.stringify(updates)}`); }
                else { await tx.printOrderTask.update({ where: { id: dbTask.id }, data: updates }); }
                updatedCount++;
            }
        }
        // DO NOT delete the extra dbTasks[aiCount] onwards automatically
    }

    return { updated: updatedCount, created: createdCount, warnings };
}


// --- Main Execution ---
async function main() {
    const SCRIPT_NAME = 'update-discrepant-tasks';
    let cmdOptions: UpdateOptions; // Define cmdOptions here

    try {
        // Setup Logger
        const logDir = path.join(process.cwd(), 'logs');
        const logFilePath = path.join(logDir, `${SCRIPT_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
        await fs.mkdir(logDir, { recursive: true });
        logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });
        logger = pino({ level: LOG_LEVEL }, pino.multistream([{ stream: logStream }, { stream: process.stdout }])); // Use LOG_LEVEL constant
        logger.info(`--- Script Start: ${new Date().toISOString()} ---`);
        logger.info(`Logging to file: ${logFilePath}`);

        // REMOVED Argument Parsing section

        // Use hardcoded/env values for options
        const openaiApiKey = process.env.OPENAI_API_KEY ?? null;
        if (!openaiApiKey) throw new Error('OpenAI API key missing (check .env).');

        const orderIdInput = TARGET_ORDER_IDS.map(id => id.trim()).filter(id => id);
        if (orderIdInput.length === 0) {
            throw new Error("No target order IDs defined in the TARGET_ORDER_IDS variable at the top of the script.");
        }
        logger.info(`Processing ${orderIdInput.length} specified orders defined in script.`);

        // Load Prompts
        logger.info('Loading prompts...');
        const systemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
        const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
        logger.info('Prompts loaded.');

        // Construct options object
        cmdOptions = {
            orderIds: orderIdInput,
            openaiApiKey,
            openaiModel: OPENAI_MODEL,
            systemPrompt,
            userPromptTemplate,
            // verbose: LOG_LEVEL === 'debug', // Removed verbose option as it's not in UpdateOptions
            logLevel: LOG_LEVEL,
            dryRun: DRY_RUN_MODE,
        };
        if (cmdOptions.dryRun) logger.warn('--- DRY RUN MODE ENABLED ---');


        // Fetch Specified Orders
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

        // Process Orders
        let totalUpdates = 0;
        let totalCreates = 0;
        const ordersWithWarnings: Record<number, string[]> = {};

        for (const order of ordersToUpdate) {
            logger.info(`--- Processing Order ID: ${order.id} (${order.shipstation_order_number || 'N/A'}) ---`);

            // Get AI Interpretation
            const aiResult = await extractOrderPersonalization(order, cmdOptions);

            if (!aiResult.success || !aiResult.data) {
                logger.error(`[Order ${order.id}] Failed to get AI interpretation: ${aiResult.error || 'Unknown AI error'}. Skipping update.`);
                ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                ordersWithWarnings[order.id].push(`AI extraction failed: ${aiResult.error || 'Unknown AI error'}`);
                continue;
            }

            const aiItemPersonalizations = aiResult.data.itemPersonalizations;

            try {
                // Perform updates within a transaction
                await prisma.$transaction(async (tx) => {
                    for (const item of order.items) {
                        const existingTasks = item.printTasks; // Already fetched
                        const aiPersonalizations = aiItemPersonalizations[item.id.toString()]?.personalizations;

                        const result = await applyAiUpdatesToTasks(tx, order.id, item.id, item.quantity, existingTasks, aiPersonalizations, cmdOptions);

                        totalUpdates += result.updated;
                        totalCreates += result.created;
                        if (result.warnings.length > 0) {
                            ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                            ordersWithWarnings[order.id].push(...result.warnings.map(w => `Item ${item.id}: ${w}`));
                        }
                    }
                }, { maxWait: 60000, timeout: 120000 }); // Adjust timeouts if needed

                logger.info(`[Order ${order.id}] Successfully processed and committed changes (if any).`);

            } catch (error) {
                logger.error(`[Order ${order.id}] Transaction failed: ${error instanceof Error ? error.message : String(error)}`, error);
                ordersWithWarnings[order.id] = ordersWithWarnings[order.id] || [];
                ordersWithWarnings[order.id].push(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } // End order loop

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
        const _errorMsg = error instanceof Error ? error.message : String(error);
        if (logger) logger.error('SCRIPT FAILED', error);
        else console.error('SCRIPT FAILED', error);
        process.exitCode = 1; // Indicate failure
    } finally {
        if (prisma) await prisma.$disconnect();
        if (logger) logger.info('DB disconnected. Script finished.');
        else console.log('DB disconnected. Script finished.');
        if (logStream) logStream.end();
    }
}

void main();
