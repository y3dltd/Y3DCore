"use strict";
// src/lib/order-processing-v2/orchestrator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOrderProcessingV2 = void 0;
const client_1 = require("@prisma/client");
const aiProcessor_1 = require("./aiProcessor");
const amazonExtractor_1 = require("./amazonExtractor");
const dbTasks_1 = require("./dbTasks");
const debugLogger_1 = require("./debugLogger"); // Assuming debugLogger utility exists or is created
const logger_1 = require("./logger");
const prompts_1 = require("./prompts");
const shipstationSync_1 = require("./shipstationSync");
// Placeholder for fetching orders - adapt logic from existing scripts as needed
// This likely needs more sophisticated logic based on options.orderId, options.limit etc.
// Reusing or adapting getOrdersToProcess from ../lib/order-processing is recommended.
async function getOrdersToProcessV2(prisma, options) {
    const logger = (0, logger_1.getLogger)();
    logger.info(`[getOrdersToProcessV2] Received args: orderId='${options.orderId}', limit=${options.limit}, forceRecreate=${options.forceRecreate}`);
    // Define the common include structure here
    const includeClause = {
        items: {
            include: {
                product: true,
                printTasks: true, // Include print tasks to check if they exist
            },
        },
        customer: true, // Include customer relation as required by OrderWithItemsAndProducts type
    };
    // Define the common orderBy structure using Prisma enum
    const orderByClause = {
        order_date: client_1.Prisma.SortOrder.desc,
    };
    if (options.orderId) {
        // --- MODIFIED LOGIC: Try DB ID (if numeric), then ShipStation Order Number, then ShipStation Order ID ---
        let foundOrders = [];
        // 1. Try parsing as integer and searching by database ID *only if the identifier consists purely of digits*
        const isNumeric = /^\d+$/.test(options.orderId); // Check if string contains only digits
        if (isNumeric) {
            const potentialId = parseInt(options.orderId, 10);
            // Double check isNaN just in case, though regex should cover it
            if (!isNaN(potentialId)) {
                logger.debug(`[getOrdersToProcessV2] Identifier '${options.orderId}' is numeric. Attempting to find order by database ID: ${potentialId}`);
                foundOrders = (await prisma.order.findMany({
                    where: { id: potentialId },
                    include: includeClause,
                    orderBy: orderByClause,
                }));
                if (foundOrders.length > 0) {
                    logger.info(`[getOrdersToProcessV2] Found order by database ID: ${potentialId}`);
                    return foundOrders; // Return immediately if found
                }
                logger.debug(`[getOrdersToProcessV2] No order found with database ID: ${potentialId}.`);
            }
        }
        else {
            logger.debug(`[getOrdersToProcessV2] Identifier '${options.orderId}' is not purely numeric. Skipping database ID search.`);
        }
        // 2. If not found by ID (or if identifier wasn't numeric), try by ShipStation Order Number
        logger.debug(`[getOrdersToProcessV2] Attempting to find order by ShipStation Order Number: ${options.orderId}`);
        foundOrders = (await prisma.order.findMany({
            where: { shipstation_order_number: options.orderId },
            include: includeClause,
            orderBy: orderByClause,
        }));
        if (foundOrders.length > 0) {
            logger.info(`[getOrdersToProcessV2] Found order by ShipStation Order Number: ${options.orderId}`);
            return foundOrders; // Return immediately if found
        }
        logger.debug(`[getOrdersToProcessV2] No order found with ShipStation Order Number: ${options.orderId}.`);
        // 3. If still not found, try by ShipStation Order ID
        logger.debug(`[getOrdersToProcessV2] Attempting to find order by ShipStation Order ID: ${options.orderId}`);
        foundOrders = (await prisma.order.findMany({
            where: { shipstation_order_id: options.orderId },
            include: includeClause,
            orderBy: orderByClause,
        }));
        if (foundOrders.length > 0) {
            logger.info(`[getOrdersToProcessV2] Found order by ShipStation Order ID: ${options.orderId}`);
        }
        else {
            // Log final failure after trying all applicable identifiers
            logger.warn(`No order found matching Database ID (if applicable), ShipStation Order Number, or ShipStation Order ID: ${options.orderId}`);
        }
        return foundOrders; // Return the result (which might be empty)
        // --- END MODIFIED LOGIC ---
    }
    else {
        // Default filtering when no specific ID/Number is provided
        logger.debug(`[getOrdersToProcessV2] No specific order identifier provided. Applying default filters.`);
        const where = {
            order_status: 'awaiting_shipment',
        };
        if (!options.forceRecreate) {
            logger.debug(`[getOrdersToProcessV2] forceRecreate is false. Filtering out items with existing tasks.`);
            where.items = {
                some: {
                    printTasks: {
                        none: {},
                    },
                },
            };
        }
        else {
            logger.debug(`[getOrdersToProcessV2] forceRecreate is true. Not filtering based on existing tasks.`);
        }
        const findManyArgs = {
            where,
            include: includeClause,
            orderBy: orderByClause,
        };
        if (options.limit !== undefined && options.limit > 0) {
            findManyArgs.take = options.limit;
        }
        // Explicitly cast the result here
        return prisma.order.findMany(findManyArgs);
    }
}
/**
 * Processes a single order through the v2 pipeline.
 * @param order - The order to process.
 * @param options - Processing options.
 * @param prompts - Loaded AI prompts.
 * @param prisma - Prisma client instance.
 * @returns A promise resolving to true if processing succeeded, false otherwise.
 */
async function processSingleOrder(order, options, prompts, prisma) {
    const logger = (0, logger_1.getLogger)();
    logger.info(`--- [Orchestrator] Processing Order ${order.id} (${order.shipstation_order_number}) ---`);
    const startTime = Date.now();
    // Initialize Debug Info
    const orderDebugInfo = {
        orderId: order.id,
        orderNumber: order.shipstation_order_number ?? '',
        marketplace: order.marketplace,
        overallStatus: 'Starting',
        amazonExtractionAttempts: [],
        aiProcessingStatus: 'Not Started',
        aiModelUsed: options.openaiModel,
        aiPromptSent: null,
        aiRawResponseReceived: null,
        aiParsedResponse: null,
        aiValidationError: null,
        dbTransactionStatus: 'Not Started',
        dbTasksCreatedCount: 0,
        dbItemsNeedReviewCount: 0,
        shipstationSyncStatus: 'Not Started',
        shipstationItemsToUpdateCount: 0,
        shipstationUpdateResult: undefined,
        processingError: null,
        items: [], // Populated during DB phase
    };
    try {
        // --- Step 1: Pre-process Amazon URLs (In Memory) ---
        orderDebugInfo.overallStatus = 'Pre-processing Items';
        const amazonExtractionResults = new Map();
        const shipstationUpdateData = {};
        // Deep clone order to modify for AI without affecting original object used later
        const orderForAI = JSON.parse(JSON.stringify(order));
        for (const item of orderForAI.items) {
            const isAmazon = order.marketplace?.toLowerCase().includes('amazon') ||
                (order.shipstation_order_number && /^\d{3}-\d{7}-\d{7}$/.test(order.shipstation_order_number));
            let extractionResult = null;
            if (isAmazon) {
                logger.debug(`[Orchestrator][Order ${order.id}][Item ${item.id}] Attempting Amazon URL extraction.`);
                // Ensure product is passed as Product | null
                extractionResult = await (0, amazonExtractor_1.extractAmazonCustomizationData)(order.id, item, item.product ?? null);
                amazonExtractionResults.set(item.id, extractionResult);
                orderDebugInfo.amazonExtractionAttempts.push({ itemId: item.id, status: extractionResult.success ? 'Success' : 'Failed', result: extractionResult });
                if (extractionResult.success) {
                    logger.info(`[Orchestrator][Order ${order.id}][Item ${item.id}] Amazon extraction successful. Preparing data for AI and ShipStation.`);
                    // Modify item in orderForAI
                    item.preProcessedCustomText = extractionResult.customText;
                    item.preProcessedColor1 = extractionResult.color1;
                    item.preProcessedColor2 = extractionResult.color2;
                    item.preProcessedDataSource = 'AmazonURL';
                    // Prepare ShipStation update data (only if lineItemKey exists)
                    if (item.shipstationLineItemKey) {
                        const ssOptions = [];
                        if (extractionResult.customText)
                            ssOptions.push({ name: 'Name or Text', value: extractionResult.customText });
                        if (extractionResult.color1)
                            ssOptions.push({ name: 'Colour 1', value: extractionResult.color1 });
                        if (extractionResult.color2)
                            ssOptions.push({ name: 'Colour 2', value: extractionResult.color2 });
                        if (ssOptions.length > 0) {
                            shipstationUpdateData[item.shipstationLineItemKey] = ssOptions;
                        }
                    }
                    else {
                        logger.warn(`[Orchestrator][Order ${order.id}][Item ${item.id}] Cannot prepare ShipStation update: Missing shipstationLineItemKey.`);
                    }
                }
                else {
                    logger.warn(`[Orchestrator][Order ${order.id}][Item ${item.id}] Amazon extraction failed: ${extractionResult.annotation}`);
                    // No ShipStation data prepared, AI will use original data
                }
            }
            else {
                logger.debug(`[Orchestrator][Order ${order.id}][Item ${item.id}] Not an Amazon order item, skipping Amazon extraction.`);
                orderDebugInfo.amazonExtractionAttempts.push({ itemId: item.id, status: 'NotAttempted' });
                // No ShipStation data prepared from Amazon
            }
        }
        orderDebugInfo.shipstationItemsToUpdateCount = Object.keys(shipstationUpdateData).length; // Count items prepared for SS
        // --- Step 2: Call AI ---
        orderDebugInfo.overallStatus = 'Calling AI';
        orderDebugInfo.aiProcessingStatus = 'In Progress';
        await (0, debugLogger_1.appendToDebugLog)(options.debugFile, orderDebugInfo); // Log before potentially long call
        const aiResult = await (0, aiProcessor_1.extractPersonalizationWithAI)(orderForAI, {
            openaiApiKey: options.openaiApiKey,
            openaiModel: options.openaiModel,
            systemPrompt: prompts.systemPrompt,
            userPromptTemplate: prompts.userPromptTemplate,
        }, prisma);
        // Update debug info with AI results
        orderDebugInfo.aiModelUsed = aiResult.modelUsed ?? options.openaiModel;
        orderDebugInfo.aiPromptSent = aiResult.promptUsed;
        orderDebugInfo.aiRawResponseReceived = aiResult.rawResponse;
        if (!aiResult.success || !aiResult.data) {
            orderDebugInfo.aiProcessingStatus = 'Failed';
            orderDebugInfo.processingError = `AI Extraction Failed: ${aiResult.error}`;
            orderDebugInfo.overallStatus = 'Failed (AI Error)';
            logger.error(`[Orchestrator][Order ${order.id}] ${orderDebugInfo.processingError}`);
            await (0, debugLogger_1.appendToDebugLog)(options.debugFile, orderDebugInfo);
            return false; // Stop processing this order if AI fails
        }
        orderDebugInfo.aiProcessingStatus = 'Success';
        orderDebugInfo.aiParsedResponse = aiResult.data;
        orderDebugInfo.overallStatus = 'AI Complete, Starting DB Transaction';
        await (0, debugLogger_1.appendToDebugLog)(options.debugFile, orderDebugInfo);
        // --- Step 3: Database Transaction (DB Tasks + ShipStation Sync) ---
        if (options.dryRun) {
            logger.info(`[Dry Run][Orchestrator][Order ${order.id}] Skipping DB transaction and ShipStation sync.`);
            orderDebugInfo.dbTransactionStatus = 'Dry Run Skipped';
            orderDebugInfo.shipstationSyncStatus = 'Dry Run Skipped';
            orderDebugInfo.overallStatus = 'Completed (Dry Run)';
        }
        else {
            orderDebugInfo.dbTransactionStatus = 'In Progress';
            orderDebugInfo.shipstationSyncStatus = 'Pending DB';
            try {
                await prisma.$transaction(async (tx) => {
                    // Create/Update DB Tasks using AI results
                    const dbResult = await (0, dbTasks_1.createOrUpdateTasksInTransaction)(tx, order, // Pass original order for DB task creation context
                    aiResult.data, // AI data is guaranteed here
                    options, orderDebugInfo // Pass debug object to be updated by dbTasks
                    );
                    // dbTasks updates orderDebugInfo.dbTransactionStatus, counts, and item statuses internally
                    // Sync successful Amazon extractions to ShipStation
                    // Pass the pre-calculated shipstationUpdateData
                    const ssSyncSuccess = await (0, shipstationSync_1.syncAmazonDataToShipstation)(order.shipstation_order_id, order.shipstation_order_number, shipstationUpdateData, // Only data from successful Amazon extractions
                    options, orderDebugInfo // Pass debug object to be updated by shipstationSync
                    );
                    // shipstationSync updates orderDebugInfo.shipstationSyncStatus and shipstationUpdateResult
                    if (!ssSyncSuccess) {
                        // Decide if ShipStation sync failure should roll back the transaction
                        // For now, let's log it but not fail the whole order just for SS sync failure
                        logger.warn(`[Orchestrator][Order ${order.id}] ShipStation sync failed, but DB transaction will proceed.`);
                        // Optionally throw here to roll back: throw new Error('ShipStation sync failed');
                    }
                }, { maxWait: 120000, timeout: 300000 }); // Adjust timeouts as needed
                logger.info(`[Orchestrator][Order ${order.id}] DB Transaction committed successfully.`);
                // Statuses inside orderDebugInfo should be updated by the functions called within the transaction
                if (!orderDebugInfo.processingError) { // Avoid overwriting earlier errors
                    orderDebugInfo.overallStatus = 'Completed';
                }
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error(`[Orchestrator][Order ${order.id}] Transaction failed: ${errorMsg}`, error);
                orderDebugInfo.dbTransactionStatus = 'Failed (Transaction Error)';
                orderDebugInfo.shipstationSyncStatus = 'Skipped (Transaction Failed)'; // SS sync didn't run or was rolled back
                orderDebugInfo.processingError = `Transaction failed: ${errorMsg}`;
                orderDebugInfo.overallStatus = 'Failed (Transaction Error)';
                await (0, debugLogger_1.appendToDebugLog)(options.debugFile, orderDebugInfo);
                return false; // Transaction failed
            }
        }
        // --- Final Logging ---
        const duration = Date.now() - startTime;
        logger.info(`--- [Orchestrator] Finished Order ${order.id}. Status: ${orderDebugInfo.overallStatus}. Duration: ${duration}ms ---`);
        await (0, debugLogger_1.appendToDebugLog)(options.debugFile, orderDebugInfo);
        return !orderDebugInfo.processingError; // Return true if no processing error was recorded
    }
    catch (error) {
        // Catch unexpected errors during orchestration
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Orchestrator][Order ${order.id}] UNEXPECTED ERROR during processing: ${errorMsg}`, error);
        orderDebugInfo.processingError = `Unexpected Orchestrator Error: ${errorMsg}`;
        orderDebugInfo.overallStatus = 'Failed (Orchestrator Error)';
        await (0, debugLogger_1.appendToDebugLog)(options.debugFile, orderDebugInfo);
        return false;
    }
}
/**
 * Main function to run the order processing workflow.
 * @param options - Processing options from command line or config.
 * @param prisma - Prisma client instance.
 */
async function runOrderProcessingV2(options, prisma) {
    const SCRIPT_NAME = 'populate-print-queue-v2';
    // Logger initialization should happen in the entry script, but getLogger can be used here
    const logger = (0, logger_1.getLogger)(); // Assumes logger is initialized by the calling script
    let scriptRunSuccess = true;
    let finalMessage = 'Script finished.';
    let totalOrdersProcessed = 0;
    let totalOrdersFailed = 0;
    const failedOrderIds = [];
    try {
        // Load prompts (assuming logger is ready)
        const prompts = await (0, prompts_1.loadPrompts)();
        // Fetch orders
        logger.info('[Orchestrator] Finding orders to process...');
        const ordersToProcess = await getOrdersToProcessV2(prisma, options);
        logger.info(`[Orchestrator] Found ${ordersToProcess.length} orders.`);
        if (ordersToProcess.length === 0) {
            logger.info('[Orchestrator] No orders found matching criteria. Exiting.');
            finalMessage = 'No orders found to process.';
            return; // Exit early
        }
        // Process each order
        for (const order of ordersToProcess) {
            totalOrdersProcessed++;
            // --- Implement --force-recreate logic: Delete existing tasks ---
            if (options.forceRecreate) {
                logger.info(`[Orchestrator][Order ${order.id}] --force-recreate enabled. Deleting existing print tasks for this order.`);
                try {
                    const deleteResult = await prisma.printOrderTask.deleteMany({
                        where: {
                            orderId: order.id,
                        },
                    });
                    logger.info(`[Orchestrator][Order ${order.id}] Deleted ${deleteResult.count} existing print tasks.`);
                }
                catch (deleteError) {
                    const errorMsg = deleteError instanceof Error ? deleteError.message : String(deleteError);
                    logger.error(`[Orchestrator][Order ${order.id}] Failed to delete existing print tasks: ${errorMsg}`, deleteError);
                    // Decide if deletion failure should stop processing this order.
                    // For now, we'll log and continue, but this might need adjustment.
                    // If continuing, the upsert might recreate tasks, which might be acceptable depending on exact requirements.
                }
            }
            // --- End --force-recreate logic ---
            const success = await processSingleOrder(order, options, prompts, prisma);
            if (!success) {
                totalOrdersFailed++;
                failedOrderIds.push(order.id);
            }
        }
        // Final summary
        scriptRunSuccess = totalOrdersFailed === 0;
        finalMessage = `Processed ${totalOrdersProcessed} orders. Succeeded: ${totalOrdersProcessed - totalOrdersFailed}, Failed: ${totalOrdersFailed}.`;
        if (totalOrdersFailed > 0) {
            finalMessage += ` Failed Order IDs: [${failedOrderIds.join(', ')}]`;
        }
        logger.info(`[Orchestrator] Workflow finished. ${finalMessage}`);
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Orchestrator] SCRIPT FAILED (Unhandled Exception): ${errorMsg}`, error);
        scriptRunSuccess = false;
        finalMessage = `Script failed fatally: ${errorMsg}`;
    }
    finally {
        logger.info(`--- [Orchestrator] Script End ---`);
        logger.info(finalMessage);
        // Log stream closing should happen in the entry script
        // closeLogStream();
        // process.exit(scriptRunSuccess ? 0 : 1); // Exit code handled by entry script
    }
}
exports.runOrderProcessingV2 = runOrderProcessingV2;
