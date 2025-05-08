#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';

import { getLogger } from '@lib/shared/logging';
import { getShipstationOrders } from '@lib/shipstation';
import { ShipStationOrder as ImportedShipStationOrder } from '@lib/shipstation/types';

const logger = getLogger('handle-merged-orders');
const prisma = new PrismaClient();

interface ScriptOptions {
    dryRun: boolean;
    verbose: boolean;
    syncAll: boolean;
    force: boolean;
}

async function main(): Promise<void> {
    console.log('--- Starting Merged Order Handler ---');
    const options: ScriptOptions = {
        dryRun: process.argv.includes('--dry-run'),
        verbose: process.argv.includes('--verbose'),
        syncAll: process.argv.includes('--sync-all'),
        force: process.argv.includes('--force'),
    };

    if (options.dryRun) {
        console.log('DRY RUN MODE: No changes will be made to the database');
    }

    try {
        // Step 1: Find all orders with ShipStation IDs that haven't been marked as merged yet
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        console.log(`Default: Checking orders updated since ${tenDaysAgo.toISOString()} (past 10 days)`);
        console.log(`Use --sync-all to check all orders regardless of date`);

        const processableOrders = await prisma.order.findMany({
            where: {
                shipstation_order_id: { not: null },
                is_merged: false,
                // Only include orders from the past 10 days unless --sync-all is specified
                ...(options.syncAll ? {} : { updated_at: { gte: tenDaysAgo } }),
            },
            select: {
                id: true,
                shipstation_order_id: true,
                shipstation_order_number: true,
                marketplace: true,
                is_merged: true,
                merged_to_order_id: true,
                merged_from_order_ids: true,
                printTasks: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
            },
            take: options.syncAll ? undefined : 100, // Limit to 100 orders unless --sync-all is used
        });

        console.log(`Found ${processableOrders.length} orders to check for merge status`);

        let mergedSourceOrders = 0;
        let mergedDestinationOrders = 0;

        // Process orders in batches to avoid overloading ShipStation API
        for (const order of processableOrders) {
            try {
                if (!order.shipstation_order_id) continue;

                // Get the latest order data from ShipStation
                const ssOrderResponse = await getShipstationOrders({
                    orderId: Number(order.shipstation_order_id),
                });

                if (!ssOrderResponse?.orders?.length) {
                    logger.warn(`No ShipStation order found for ${order.shipstation_order_id}. Skipping.`);
                    continue;
                }

                const ssOrder = ssOrderResponse.orders[0] as ImportedShipStationOrder;
                const advancedOptions = (ssOrder.advancedOptions || {}) as Record<string, unknown>;

                // Use type-safe access to possibly undefined fields
                const mergedOrSplit = Boolean(advancedOptions.mergedOrSplit);
                const mergedIds = Array.isArray(advancedOptions.mergedIds) ? advancedOptions.mergedIds as number[] : [];
                const parentId = advancedOptions.parentId ? Number(advancedOptions.parentId) : null;

                // Case 1: This order has been merged into another order
                if (parentId) {
                    logger.info(`[Order ${order.id}] Found merged source order. Parent ID: ${parentId}`);

                    if (!options.dryRun) {
                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                is_merged: true,
                                merged_to_order_id: parentId,
                                printTasks: {
                                    updateMany: {
                                        where: { status: { in: ['pending', 'in_progress'] } },
                                        data: {
                                            annotation: `Merged to ShipStation order ID ${parentId}`,
                                            // Optionally mark as completed if you want to close them out
                                            // status: 'completed',
                                        }
                                    }
                                }
                            }
                        });
                        mergedSourceOrders++;
                    }
                }

                // Case 2: This is a destination order that contains merged orders
                if (mergedOrSplit && mergedIds.length > 0) {
                    logger.info(`[Order ${order.id}] Found merged destination order containing: ${mergedIds.join(', ')}`);

                    if (!options.dryRun) {
                        await prisma.order.update({
                            where: { id: order.id },
                            data: {
                                merged_from_order_ids: JSON.stringify(mergedIds)
                            }
                        });
                        mergedDestinationOrders++;

                        // Find the original source orders in our DB if they exist
                        const sourceOrders = await prisma.order.findMany({
                            where: {
                                shipstation_order_id: { in: mergedIds.map((id: number) => String(id)) }
                            },
                            include: {
                                printTasks: {
                                    where: { status: { in: ['pending', 'in_progress'] } }
                                }
                            }
                        });

                        logger.info(`[Order ${order.id}] Found ${sourceOrders.length} source orders in database`);

                        // Update any source orders we find
                        for (const sourceOrder of sourceOrders) {
                            await prisma.order.update({
                                where: { id: sourceOrder.id },
                                data: {
                                    is_merged: true,
                                    merged_to_order_id: order.id,
                                }
                            });
                        }
                    }
                }

            } catch (error) {
                // Create a record object for logging
                const errorRecord = error instanceof Error
                    ? { message: error.message, stack: error.stack }
                    : { message: String(error) };

                logger.error(`Error processing order ${order.id}:`, errorRecord);
            }
        }

        logger.info(`Processed ${processableOrders.length} orders`);
        logger.info(`Updated ${mergedSourceOrders} source orders that were merged into other orders`);
        logger.info(`Updated ${mergedDestinationOrders} destination orders that contain merged orders`);

    } catch (error) {
        console.error('Error in merged order handler:', error);
    } finally {
        await prisma.$disconnect();
    }

    console.log('--- Merged Order Handler Completed ---');
}

main().catch(e => {
    console.error('Script failed with error:', e);
    process.exit(1);
});
