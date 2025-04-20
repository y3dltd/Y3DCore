// filepath: /home/jayson/y3dhub/src/scripts/review-existing-tasks.ts
// Purpose: Re-evaluate existing print tasks using the latest AI logic
//          and log discrepancies for manual review. Does NOT modify data.

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import util from 'util';

import { PrintTask, Prisma, PrismaClient } from '@prisma/client';
import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import z from 'zod';

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

const AiOrderResponseSchema = z.object({
    itemPersonalizations: z.record(z.string(), ItemPersonalizationResultSchema),
});

// Processing Options
interface ProcessingOptions {
    limit?: number;
    openaiApiKey: string | null;
    openaiModel: string;
    systemPrompt: string;
    userPromptTemplate: string;
    verbose: boolean;
    logLevel: string;
    orderId?: string; // Allow filtering by specific order for testing
}

// Type for fetched order data including tasks
type OrderWithItemsTasksAndProduct = Prisma.OrderGetPayload<{
    include: {
        items: {
            include: {
                product: true;
                printTasks: true; // Include existing tasks for comparison
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
// IMPORTANT: Ensure this is the full, up-to-date version
async function extractOrderPersonalization(
    order: OrderWithItemsTasksAndProduct, // Use the correct type
    options: Pick<
        ProcessingOptions,
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

    logger.debug(`[AI Review][Order ${order.id}] Preparing extraction...`);
    logger.trace(`[AI Review][Order ${order.id}] Input Data JSON:\\n${inputDataJson}`);

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
        logger.info(`[AI Review][Order ${order.id}] Calling OpenAI (${modelUsed})...`);
        const apiPayload: ApiPayload = { model: modelUsed, messages: [{ role: 'system', content: systemPromptContent }, { role: 'user', content: userPromptContent }], temperature: 0.0, top_p: 1.0, frequency_penalty: 0.0, presence_penalty: 0.0, max_tokens: 4096, response_format: { type: 'json_object' } };
        logger.trace(`[AI Review][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`);
        const response = await fetch(apiUrl, { method: 'POST', headers: headers, body: JSON.stringify(apiPayload) });
        const duration = Date.now() - startTime;
        logger.info(`[AI Review][Order ${order.id}] Call response status: ${response.status} (${duration}ms).`);

        if (!response.ok) {
            const errorBody = await response.text();
            logger.error({ status: response.status, body: errorBody }, `[AI Review][Order ${order.id}] API error`);
            throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        rawResponse = result.choices?.[0]?.message?.content?.trim() ?? null;

        if (!rawResponse) {
            logger.warn({ result }, `[AI Review][Order ${order.id}] OpenAI returned empty response content.`);
            throw new Error('OpenAI returned empty response content.');
        }
        logger.debug(`[AI Review][Order ${order.id}] RAW RESPONSE Content:\\n${rawResponse}`);

        let responseJson: unknown;
        try {
            const cleanedContent = rawResponse.replace(/^```json\\n?/, '').replace(/\\n?```$/, '');
            responseJson = JSON.parse(cleanedContent);
            logger.debug(`[AI Review][Order ${order.id}] Parsed JSON response.`);
        } catch (e) {
            logger.error({ err: e, rawResponse }, `[AI Review][Order ${order.id}] Failed to parse AI JSON`);
            throw new Error(`Failed to parse AI JSON: ${(e as Error).message}.`);
        }

        const validationResult = AiOrderResponseSchema.safeParse(responseJson);
        if (!validationResult.success) {
            const errorString = JSON.stringify(validationResult.error.format(), null, 2);
            logger.error(`[AI Review][Order ${order.id}] Zod validation failed: ${errorString}`);
            throw new Error(`AI response validation failed: ${errorString}`);
        }
        logger.info(`[AI Review][Order ${order.id}] AI response validated.`);

        // No DB logging needed for review script

        return { success: true, data: validationResult.data, promptUsed: fullPromptForDebug, rawResponse, modelUsed };
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown AI extraction error';
        logger.error(`[AI Review][Order ${order.id}] Extraction failed: ${errorMsg}`, error);
        // No DB logging needed for review script
        return { success: false, error: errorMsg, promptUsed: fullPromptForDebug, rawResponse, modelUsed };
    }
}

// --- Comparison Logic ---
// Modify to return structured discrepancy info
function compareTasks(
    orderId: number,
    itemId: number,
    existingTasks: PrintTask[],
    aiPersonalizations: z.infer<typeof PersonalizationDetailSchema>[] | undefined
): { hasDiscrepancy: boolean; details: string[]; aiSuggestion?: any; dbTasks?: any } {
    const discrepancies: string[] = [];
    const aiData = aiPersonalizations ?? []; // Use empty array if undefined
    const aiCount = aiData.length;
    const dbCount = existingTasks.length;

    // 1. Compare counts
    if (aiCount !== dbCount) {
        discrepancies.push(`Task count mismatch: DB has ${dbCount}, AI suggests ${aiCount}`);
    }

    // 2. Compare content
    const maxCompare = Math.min(aiCount, dbCount);
    for (let i = 0; i < maxCompare; i++) {
        const dbTask = existingTasks[i];
        const aiTask = aiData[i];

        // Normalize null/undefined/empty strings for comparison? Optional.
        const dbText = dbTask.custom_text ?? null;
        const aiText = aiTask.customText ?? null;
        const dbColor1 = dbTask.color_1 ?? null;
        const aiColor1 = aiTask.color1 ?? null;
        const dbColor2 = dbTask.color_2 ?? null;
        const aiColor2 = aiTask.color2 ?? null;

        if (dbText !== aiText) {
            discrepancies.push(`Task ${i}: Text mismatch: DB='${dbText}', AI='${aiText}'`);
        }
        if (dbColor1 !== aiColor1) {
            discrepancies.push(`Task ${i}: Color1 mismatch: DB='${dbColor1}', AI='${aiColor1}'`);
        }
        if (dbColor2 !== aiColor2) {
            discrepancies.push(`Task ${i}: Color2 mismatch: DB='${dbColor2}', AI='${aiColor2}'`);
        }
        if (dbTask.quantity !== aiTask.quantity) {
            discrepancies.push(`Task ${i}: Quantity mismatch: DB=${dbTask.quantity}, AI=${aiTask.quantity}`);
        }
        if (dbTask.needs_review !== aiTask.needsReview) {
            discrepancies.push(`Task ${i}: Review flag mismatch: DB=${dbTask.needs_review}, AI=${aiTask.needsReview}`);
        }
        // Optionally compare reviewReason
        // if (dbTask.review_reason !== aiTask.reviewReason) { ... }
    }

    const hasDiscrepancy = discrepancies.length > 0;

    // Return structured data only if discrepancies exist
    if (hasDiscrepancy) {
        return {
            hasDiscrepancy: true,
            details: discrepancies,
            aiSuggestion: aiData, // Include raw data for logging
            dbTasks: existingTasks.map(t => ({ // Select relevant fields
                custom_text: t.custom_text,
                color_1: t.color_1,
                color_2: t.color_2,
                quantity: t.quantity,
                needs_review: t.needs_review,
                review_reason: t.review_reason,
                annotation: t.annotation
            }))
        };
    } else {
        return { hasDiscrepancy: false, details: [] };
    }
}


// --- Main Execution ---
async function main() {
    const SCRIPT_NAME = 'review-existing-tasks';
    let cmdOptions: ProcessingOptions;

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
            .description('Re-evaluate existing print tasks using current AI logic and log discrepancies.')
            .option('-l, --limit <number>', 'Limit orders processed', val => parseInt(val, 10))
            .option('--openai-api-key <key>', 'OpenAI API Key', process.env.OPENAI_API_KEY)
            .option('--openai-model <model>', 'OpenAI model', 'gpt-4.1-mini') // Use same default as populate script
            .option('--verbose', 'Enable verbose logging', false)
            .option('--log-level <level>', 'Set log level', 'info')
            .option('--order-id <id>', 'Process only a specific order by DB ID or ShipStation Order Number'); // For testing

        program.parse(process.argv.slice(2));
        const rawOptions = program.opts();

        if (rawOptions.verbose) logger.level = 'debug';
        else logger.level = rawOptions.logLevel;

        if (!rawOptions.openaiApiKey) throw new Error('OpenAI API key missing.');

        // Load Prompts
        logger.info('Loading prompts...');
        const systemPrompt = await loadPromptFile('src/lib/ai/prompts/prompt-system-optimized.txt');
        const userPromptTemplate = await loadPromptFile('src/lib/ai/prompts/prompt-user-template-optimized.txt');
        logger.info('Prompts loaded.');

        cmdOptions = { ...rawOptions, systemPrompt, userPromptTemplate }; // Combine raw options with loaded prompts
        logger.info(`Options: ${JSON.stringify({ ...cmdOptions, openaiApiKey: '***', systemPrompt: '...', userPromptTemplate: '...' })}`);


        // Fetch Orders with Existing Tasks
        logger.info('Fetching orders with existing tasks (awaiting_shipment or on_hold)...');
        const whereClause: Prisma.OrderWhereInput = {
            OR: [
                { order_status: 'awaiting_shipment' },
                { order_status: 'on_hold' },
            ],
            printTasks: { some: {} }, // Ensure order has at least one print task
        };

        // Add orderId filter if provided
        if (cmdOptions.orderId) {
            const isNumericId = /^\d+$/.test(cmdOptions.orderId);
            if (isNumericId) {
                whereClause.id = parseInt(cmdOptions.orderId, 10);
            } else {
                whereClause.shipstation_order_number = cmdOptions.orderId;
            }
            logger.info(`Filtering for specific order: ${cmdOptions.orderId}`);
        }


        const ordersToReview = await prisma.order.findMany({
            where: whereClause,
            include: {
                items: {
                    include: {
                        product: true,
                        printTasks: { // Include existing tasks here
                            orderBy: { taskIndex: 'asc' } // Ensure consistent order
                        },
                    },
                },
            },
            take: cmdOptions.limit, // Apply limit if provided
            orderBy: { id: 'desc' } // Process recent orders first potentially
        });

        logger.info(`Found ${ordersToReview.length} orders with tasks to review.`);

        // Process Orders
        let ordersWithDiscrepancies = 0;
        for (const order of ordersToReview) {
            logger.info(`--- Reviewing Order ID: ${order.id} (${order.shipstation_order_number || 'N/A'}) ---`);
            const aiResult = await extractOrderPersonalization(order, cmdOptions);

            if (!aiResult.success || !aiResult.data) {
                logger.error(`[Order ${order.id}] Failed to get AI interpretation: ${aiResult.error || 'Unknown AI error'}`);
                continue; // Skip comparison if AI fails
            }

            const aiItemPersonalizations = aiResult.data.itemPersonalizations;
            let orderHasDiscrepancy = false;
            const orderOutputLog: string[] = []; // Collect output for the order

            // Compare each item
            for (const item of order.items) {
                const existingTasks = item.printTasks;
                const aiPersonalizations = aiItemPersonalizations[item.id.toString()]?.personalizations;

                const comparisonResult = compareTasks(order.id, item.id, existingTasks, aiPersonalizations);

                if (comparisonResult.hasDiscrepancy) {
                    orderHasDiscrepancy = true;
                    // Format output for this item
                    orderOutputLog.push(`  Item ID: ${item.id}`);
                    comparisonResult.details.forEach(d => orderOutputLog.push(`    DISCREPANCY: ${d}`));
                    // Optionally add raw data to the log string
                    orderOutputLog.push(`    AI Suggestion (${comparisonResult.aiSuggestion?.length ?? 0} tasks):`);
                    orderOutputLog.push(`      ${util.inspect(comparisonResult.aiSuggestion, { depth: 2, colors: false })}`);
                    orderOutputLog.push(`    Existing Tasks (${comparisonResult.dbTasks?.length ?? 0} tasks):`);
                    orderOutputLog.push(`      ${util.inspect(comparisonResult.dbTasks, { depth: 2, colors: false })}`);
                    orderOutputLog.push(`  --- End Item ${item.id} ---`);
                }
            }

            // Print the collected output for the order if discrepancies were found
            if (orderHasDiscrepancy) {
                ordersWithDiscrepancies++;
                console.log(`\n=== DISCREPANCIES FOUND: Order ID: ${order.id} (${order.shipstation_order_number || 'N/A'}) ===`);
                orderOutputLog.forEach(line => console.log(line));
                console.log(`=== END Order ID: ${order.id} ===`);
            } else {
                logger.info(`[Order ${order.id}] No significant discrepancies found.`);
            }

        } // End order loop

        logger.info('--- Review Complete ---');
        logger.info(`Processed ${ordersToReview.length} orders.`);
        logger.info(`${ordersWithDiscrepancies} orders had discrepancies logged to console.`);

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
