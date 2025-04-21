// src/lib/order-processing-v2/dbTasks.ts

import { PrintTaskStatus, Prisma, PrismaClient } from '@prisma/client';
import { getLogger } from './logger';
import type {
    AiOrderResponse,
    OrderDebugInfoV2,
    OrderWithItemsAndProducts,
    ProcessingOptionsV2,
} from './types';

type PrismaTransactionClient = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

interface ExistingTaskData {
    custom_text: string | null;
    color_1: string | null;
    color_2: string | null;
    // Add other fields if needed for preservation logic
}

/**
 * Fetches existing task data for an order, grouped by order item ID.
 * Used for the --preserve-text functionality.
 * @param tx - The Prisma transaction client.
 * @param orderId - The database ID of the order.
 * @returns A promise resolving to a record mapping orderItemId to an array of existing task data.
 */
async function getExistingTaskData(
    tx: PrismaTransactionClient,
    orderId: number
): Promise<Record<number, ExistingTaskData[]>> {
    const logger = getLogger();
    logger.debug(`[DBTasks][Order ${orderId}] Fetching existing task data for preserveText...`);
    const existingTasks = await tx.printOrderTask.findMany({
        where: { orderId },
        select: {
            orderItemId: true,
            taskIndex: true, // Select taskIndex to sort later if needed
            custom_text: true,
            color_1: true,
            color_2: true,
            // Select other fields if preservation logic expands
        },
        orderBy: {
            taskIndex: 'asc', // Ensure tasks are ordered correctly for preservation logic
        },
    });

    return existingTasks.reduce(
        (acc, task) => {
            if (!acc[task.orderItemId]) {
                acc[task.orderItemId] = [];
            }
            // Ensure tasks are added in the correct order based on taskIndex
            acc[task.orderItemId][task.taskIndex] = {
                custom_text: task.custom_text,
                color_1: task.color_1,
                color_2: task.color_2,
            };
            return acc;
        },
        {} as Record<number, ExistingTaskData[]>
    );
}


/**
 * Creates or updates PrintOrderTask records within a database transaction based on AI results.
 * @param tx - The Prisma transaction client.
 * @param order - The original order data with items and products.
 * @param aiData - The validated response from the AI processor.
 * @param options - Processing options, including flags like preserveText and dryRun.
 * @param orderDebugInfo - The debug object to update with processing status.
 * @returns A promise resolving to statistics about the operation.
 */
export async function createOrUpdateTasksInTransaction(
    tx: PrismaTransactionClient,
    order: OrderWithItemsAndProducts,
    aiData: AiOrderResponse,
    options: Pick<ProcessingOptionsV2, 'dryRun' | 'preserveText' | 'createPlaceholder'>,
    orderDebugInfo: OrderDebugInfoV2 // Pass the main debug object
): Promise<{ tasksCreatedCount: number; tasksSkippedCount: number; itemsNeedReviewCount: number }> {
    const logger = getLogger();
    logger.info(`[DBTasks][Order ${order.id}] Upserting tasks in transaction...`);

    let tasksCreatedCount = 0;
    const tasksSkippedCount = 0; // Placeholder, implement if skipping logic is added
    let itemsNeedReviewCount = 0;

    // Fetch existing task data if preserving text
    let existingTaskData: Record<number, ExistingTaskData[]> = {};
    if (options.preserveText) {
        logger.info(`[DBTasks][Order ${order.id}] Preserve text flag enabled. Loading existing task data...`);
        existingTaskData = await getExistingTaskData(tx, order.id);
        logger.debug(`[DBTasks][Order ${order.id}] Existing task data loaded:`, Object.keys(existingTaskData));
    }

    // Fetch the order within the transaction to ensure data consistency
    // Although we pass `order`, fetching again ensures we operate on the latest committed state within the tx scope
    const orderInTx = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: { include: { product: true } }, customer: true },
    });


    for (const item of orderInTx.items) {
        const orderItemId = item.id;
        const productId = item.productId;
        const product = item.product;
        const shorthandName = product?.name?.substring(0, 100) ?? 'Unknown Product';

        // Find or create the debug entry for this item
        let itemDebugEntry = orderDebugInfo.items.find(i => i.itemId === item.id);
        if (!itemDebugEntry) {
            itemDebugEntry = {
                itemId: item.id,
                status: 'Processing DB Tasks',
                createdTaskIds: [],
                shipstationUpdatePrepared: false, // Initialize SS fields
                shipstationUpdateDataSource: 'None',
            };
            orderDebugInfo.items.push(itemDebugEntry);
        } else {
            itemDebugEntry.status = 'Processing DB Tasks';
            itemDebugEntry.createdTaskIds = []; // Reset task IDs for this run
        }

        const taskDetailsToCreate: Array<
            Omit<
                Prisma.PrintOrderTaskCreateInput,
                | 'order' | 'orderItem' | 'product' | 'customer' // Relations handled by connect
                | 'taskIndex' | 'shorthandProductName' | 'marketplace_order_number' | 'ship_by_date' // Added later
            > & { taskIndex: number } // Include taskIndex for sorting/upsert logic
        > = [];

        const itemAiResult = aiData.itemPersonalizations[item.id.toString()];

        if (!itemAiResult || itemAiResult.personalizations.length === 0) {
            const reason = !itemAiResult ? 'No AI data for item' : 'AI returned zero personalizations';
            logger.warn(`[DBTasks][Order ${order.id}][Item ${orderItemId}] ${reason}.`);

            if (options.createPlaceholder) {
                logger.info(`[DBTasks][Order ${order.id}][Item ${orderItemId}] Creating placeholder task.`);
                itemDebugEntry.status = 'Placeholder Created';
                itemsNeedReviewCount++;

                let customText = 'Placeholder - Review Needed';
                let placeholderAnnotation = 'Placeholder created: ' + reason;
                const existingTasksForItem = existingTaskData[orderItemId];

                // Apply preserveText to placeholder
                if (options.preserveText && existingTasksForItem && existingTasksForItem[0]?.custom_text) {
                    customText = existingTasksForItem[0].custom_text;
                    const preservedMsg = `Preserving existing text for placeholder: "${customText}"`;
                    logger.info(`[DBTasks][Order ${order.id}][Item ${orderItemId}] ${preservedMsg}`);
                    placeholderAnnotation = `${placeholderAnnotation} (${preservedMsg})`;
                }

                taskDetailsToCreate.push({
                    taskIndex: 0, // Only one placeholder task
                    custom_text: customText,
                    color_1: null,
                    color_2: null,
                    quantity: item.quantity, // Use original item quantity for placeholder
                    needs_review: true,
                    review_reason: reason.substring(0, 1000),
                    status: PrintTaskStatus.pending,
                    annotation: placeholderAnnotation,
                });
            } else {
                logger.warn(`[DBTasks][Order ${order.id}][Item ${orderItemId}] Skipping task creation as createPlaceholder is false.`);
                itemDebugEntry.status = 'Skipped (No AI Data)';
            }
        } else {
            // Process AI results
            logger.info(`[DBTasks][Order ${order.id}][Item ${orderItemId}] Processing ${itemAiResult.personalizations.length} AI personalization(s).`);
            let itemRequiresReview = itemAiResult.overallNeedsReview || false;
            const itemReviewReasons: string[] = itemAiResult.overallReviewReason
                ? [itemAiResult.overallReviewReason]
                : [];

            // Validate quantity
            let totalQuantityFromAI = 0;
            itemAiResult.personalizations.forEach(p => (totalQuantityFromAI += p.quantity));
            if (totalQuantityFromAI !== item.quantity) {
                const qtyMsg = `Qty Mismatch (AI Total: ${totalQuantityFromAI}, Order Item: ${item.quantity})`;
                logger.warn(`[DBTasks][Order ${order.id}][Item ${orderItemId}] REVIEW NEEDED: ${qtyMsg}`);
                itemRequiresReview = true;
                itemReviewReasons.push(qtyMsg);
            }

            for (let i = 0; i < itemAiResult.personalizations.length; i++) {
                const detail = itemAiResult.personalizations[i];
                const combinedNeedsReview = itemRequiresReview || detail.needsReview || false; // Ensure boolean
                const detailReason = detail.needsReview ? detail.reviewReason : null;
                const annotationReason =
                    combinedNeedsReview && detail.annotation ? `Annotation: ${detail.annotation}` : null;

                const reviewReasonCombined = Array.from(
                    new Set([
                        ...itemReviewReasons,
                        ...(detailReason ? [detailReason] : []),
                        ...(annotationReason ? [annotationReason] : []),
                    ])
                )
                    .filter(Boolean) // Remove null/empty strings
                    .join('; ')
                    .substring(0, 1000) || null; // Ensure null if empty

                let customText = detail.customText;
                let annotation = detail.annotation;
                const existingTasksForItem = existingTaskData[orderItemId];

                // Apply preserveText logic
                if (options.preserveText && existingTasksForItem && i < existingTasksForItem.length && existingTasksForItem[i]?.custom_text) {
                    const existingText = existingTasksForItem[i].custom_text;
                    if (existingText !== customText) { // Only log/annotate if text actually changed
                        const preservedTextMessage = `Preserved original text: "${existingText}" instead of AI: "${customText}"`;
                        logger.info(`[DBTasks][Order ${order.id}][Item ${orderItemId}][Task ${i}] ${preservedTextMessage}`);
                        annotation = annotation ? `${annotation}; ${preservedTextMessage}` : preservedTextMessage;
                    }
                    customText = existingText; // Use existing text
                }

                if (detail.annotation) {
                    logger.info(`[DBTasks][AI Annotation][Order ${order.id}][Item ${orderItemId}][Task ${i}]: ${detail.annotation}`);
                }

                taskDetailsToCreate.push({
                    taskIndex: i,
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

        // --- Perform Upserts ---
        itemDebugEntry.createdTaskIds = []; // Reset before upserting
        for (const taskDetail of taskDetailsToCreate) {
            const taskData: Prisma.PrintOrderTaskCreateInput = {
                order: { connect: { id: orderInTx.id } },
                orderItem: { connect: { id: orderItemId } },
                product: { connect: { id: productId } },
                taskIndex: taskDetail.taskIndex,
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
                // Ensure default values are handled by Prisma or set explicitly if needed
                stl_render_state: 'pending', // Explicitly set default if not relying on schema default
                render_retries: 0,
            };

            if (options.dryRun) {
                logger.info(
                    `[Dry Run][DBTasks][Order ${order.id}][Item ${orderItemId}] Would upsert task ${taskDetail.taskIndex}. Review: ${taskDetail.needs_review}`
                );
                // Simulate adding a fake ID for debug log consistency in dry run
                itemDebugEntry.createdTaskIds.push(-(taskDetail.taskIndex + 1));
                tasksCreatedCount++; // Count simulated creations in dry run
            } else {
                try {
                    const upsertData = {
                        where: {
                            orderItemId_taskIndex: { orderItemId: orderItemId, taskIndex: taskDetail.taskIndex },
                        },
                        update: { // Select fields to update
                            shorthandProductName: taskData.shorthandProductName,
                            custom_text: taskData.custom_text,
                            color_1: taskData.color_1,
                            color_2: taskData.color_2,
                            quantity: taskData.quantity,
                            needs_review: taskData.needs_review,
                            review_reason: taskData.review_reason,
                            status: taskData.status, // Allow status update if needed
                            ship_by_date: taskData.ship_by_date,
                            marketplace_order_number: taskData.marketplace_order_number,
                            annotation: taskData.annotation,
                            // Do NOT update stl_render_state or stl_path here unless intended
                        },
                        create: taskData, // Use full taskData for creation
                    };
                    logger.debug(
                        `[DBTasks][Order ${order.id}][Item ${orderItemId}][Task ${taskDetail.taskIndex}] Preparing to UPSERT task with data:`,
                        upsertData // Be mindful of logging sensitive data
                    );

                    const task = await tx.printOrderTask.upsert(upsertData);

                    logger.info(
                        `[DBTasks][Order ${order.id}][Item ${orderItemId}][Task ${taskDetail.taskIndex}] Upserted task ${task.id}.`
                    );
                    tasksCreatedCount++;
                    itemDebugEntry.createdTaskIds.push(task.id);

                } catch (e: unknown) {
                    const errorMsg = e instanceof Error ? e.message : String(e);
                    logger.error(
                        `[DBTasks][Order ${order.id}][Item ${orderItemId}] FAILED upsert task ${taskDetail.taskIndex}: ${errorMsg}`,
                        e
                    );
                    itemDebugEntry.status = 'Failed DB Upsert';
                    itemDebugEntry.error = errorMsg;
                    // Re-throw the error to fail the transaction
                    throw new Error(`Failed to upsert task for item ${orderItemId}, taskIndex ${taskDetail.taskIndex}: ${errorMsg}`, { cause: e });
                }
            }
        }
        logger.info(
            `[DBTasks][Order ${order.id}][Item ${orderItemId}] Finished DB processing. Status: ${itemDebugEntry.status}`
        );
    } // End item loop

    orderDebugInfo.dbTransactionStatus = 'Tasks Upserted'; // Update overall status if loop completes
    orderDebugInfo.dbTasksCreatedCount = tasksCreatedCount;
    orderDebugInfo.dbItemsNeedReviewCount = itemsNeedReviewCount;

    return { tasksCreatedCount, tasksSkippedCount, itemsNeedReviewCount };
}
