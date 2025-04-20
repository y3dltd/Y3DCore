// filepath: /home/jayson/y3dhub/src/scripts/update-discrepant-tasks.ts
// Purpose: Updates existing print tasks based on discrepancies identified
//          by the review script, using the latest AI logic.
//          Prioritizes safety: updates existing, creates new, warns on deletions needed.

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { PrintTask, PrintTaskStatus, Prisma, PrismaClient } from '@prisma/client';
import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import z from 'zod';

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
    verbose: boolean;
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
        logger.debug(`[AI Update][Order ${order.id}] RAW RESPONSE Content:\\n${rawResponse}`);

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
    itemQuantity: number, // Pass item quantity for context
    existingTasks: PrintTask[],
    aiPersonalizations: z.infer<typeof PersonalizationDetailSchema>[] | undefined,
    options: UpdateOptions
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
            const updates: Prisma.PrintTaskUpdateInput = {};
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
            const updates: Prisma.PrintTaskUpdateInput = {};
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
            const updates: Prisma.PrintTaskUpdateInput = {};
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
    let cmdOptions: UpdateOptions;

    try {
        // Setup Logger
        const logDir = path.join(process.cwd(), 'logs');
        const logFilePath = path.join(logDir, `${SCRIPT_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
        await fs.mkdir(logDir, { recursive: true });
        logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });
        logger = pino({ level: 'info' }, pino.multistream([{ stream: logStream }, { stream: process.stdout }]));
        logger.info(`--- Script Start: ${new Date().toISOString()} ---`);
        logger.info(`Logging to file: ${logFilePath}`);

        // Argument Parsing
        const program = new Command();
        program
            .name(SCRIPT_NAME)
            .description('Updates existing print tasks based on current AI logic for specified orders.')
            .requiredOption('-o, --order-ids <ids>', 'Comma-separated list of Order IDs or ShipStation Order Numbers to process')
            .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
            .option('--openai-model <model>', 'OpenAI model', 'gpt-4.1-mini')
            .option('--verbose', 'Enable verbose logging', false)
            .option('--log-level <level>', 'Set log level', 'info')
            .option('--dry-run', 'Simulate changes without modifying the database', false);

        program.parse(process.argv.slice(2));
        const rawOptions = program.opts();

        if (rawOptions.verbose) logger.level = 'debug';
        else logger.level = rawOptions.logLevel;

        if (!rawOptions.openaiApiKey) throw new Error('OpenAI API key missing.');

        // Parse order IDs
        const orderIdInput: string[] = rawOptions.orderIds.split(',').map((id: string) => id.trim()).filter((id: string) => id);
        if (orderIdInput.length === 0) {
            throw new Error("No valid order IDs provided via --order-ids argument.");
        }
        logger.info(`Processing ${orderIdInput.length} specified orders.`);

        // Load Prompts
        logger.info('Loading prompts...');
        const systemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
        const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
        logger.info('Prompts loaded.');

        cmdOptions = { ...rawOptions, systemPrompt, userPromptTemplate, orderIds: orderIdInput }; // Combine options
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
                // Optionally add status filter if needed, but review script should pre-filter
                // AND: {
                //     OR: [ { order_status: 'awaiting_shipment' }, { order_status: 'on_hold' } ]
                // }
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
        const notFoundIds = cmdOptions.orderIds.filter(id => !foundIds.includes(parseInt(id)) && !ordersToUpdate.some(o => o.shipstation_order_number === id));
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
        const errorMsg = error instanceof Error ? error.message : String(error);
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
