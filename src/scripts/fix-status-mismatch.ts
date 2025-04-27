import { PrismaClient } from '@prisma/client';
import { Command } from 'commander';

import { cleanShippedOrderTasks } from '@/lib/actions/print-queue-actions';
import { logger } from '@/lib/shared/logging';
import { getShipstationOrders } from '@/lib/shipstation/api';

const prisma = new PrismaClient();

interface ScriptOptions {
    orderId?: number;
    fix: boolean;
    verbose: boolean;
}

async function checkAndFixStatus(options: ScriptOptions) {
    const { orderId, fix, verbose } = options;

    // Query for the order
    const where = orderId ? { id: orderId } : { shipstation_order_id: { not: null } };

    logger.info(`Checking order status${orderId ? ` for order ID ${orderId}` : 's'}...`);

    const orders = await prisma.order.findMany({
        where,
        select: {
            id: true,
            shipstation_order_id: true,
            shipstation_order_number: true,
            order_status: true, // Internal status
            marketplace: true,
            customerId: true,
            items: {
                select: {
                    id: true,
                    productId: true,
                    shipstationLineItemKey: true,
                    printTasks: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                },
            },
        },
    });

    if (orders.length === 0) {
        logger.info(`No orders found${orderId ? ` with ID ${orderId}` : ''}.`);
        return { ordersChecked: 0, ordersUpdated: 0, tasksUpdated: 0 };
    }

    logger.info(`Found ${orders.length} order(s) to check.`);

    let ordersUpdated = 0;
    let tasksUpdated = 0;

    for (const order of orders) {
        try {
            logger.info(`Checking order ${order.id} (ShipStation ${order.shipstation_order_number || 'unknown'})...`);

            if (!order.shipstation_order_id) {
                logger.warn(`Order ${order.id} has no ShipStation order ID. Skipping.`);
                continue;
            }

            // Get current status from ShipStation
            const ssOrderResponse = await getShipstationOrders({
                orderId: Number(order.shipstation_order_id)
            });

            if (!ssOrderResponse?.orders?.length) {
                logger.warn(`No ShipStation order found for ID ${order.shipstation_order_id}. Skipping.`);
                continue;
            }

            const ssOrder = ssOrderResponse.orders[0];
            const ssStatus = ssOrder.orderStatus?.toLowerCase();
            const dbStatus = order.order_status;

            logger.info(`Order ${order.id}: ShipStation status = "${ssStatus}", DB status = "${dbStatus}"`);

            // Map ShipStation status to internal status
            // Add or adjust mappings based on your system
            const statusMapping: Record<string, string> = {
                'awaiting_payment': 'awaiting_payment',
                'awaiting_shipment': 'awaiting_shipment',
                'awaiting shipping': 'awaiting_shipment',
                'shipped': 'shipped',
                'cancelled': 'cancelled',
                'on_hold': 'on_hold',
            };

            const mappedStatus = statusMapping[ssStatus] || dbStatus;

            if (mappedStatus !== dbStatus) {
                logger.info(`Status mismatch! ShipStation has "${ssStatus}" (maps to "${mappedStatus}"), DB has "${dbStatus}"`);

                if (fix) {
                    // Update the order status
                    await prisma.order.update({
                        where: { id: order.id },
                        data: { order_status: mappedStatus }
                    });

                    logger.info(`✓ Updated order ${order.id} status from "${dbStatus}" to "${mappedStatus}"`);
                    ordersUpdated++;
                } else {
                    // Log if it's a dry run and status would change
                    logger.info(`Would update order ${order.id} status from "${dbStatus}" to "${mappedStatus}" (dry run).`);
                }
            } else {
                // Log if status is already correct
                logger.info(`✓ Order ${order.id} status is correct: "${dbStatus}"`);
            }

            // --- Moved Task Update Logic ---
            // Always check/update tasks if the final status is shipped/cancelled, even if order status didn't change
            if ((mappedStatus === 'shipped' || mappedStatus === 'cancelled') && order.items.length > 0) {
                logger.info(`Order ${order.id} is ${mappedStatus}. Checking print tasks...`);
                // Find tasks to update
                const taskIdsToUpdate: number[] = [];
                for (const item of order.items) {
                    for (const task of item.printTasks) {
                        if (task.status === 'pending' || task.status === 'in_progress') {
                            taskIdsToUpdate.push(task.id);
                        }
                    }
                }

                if (taskIdsToUpdate.length > 0) {
                    if (fix) {
                        // Update tasks
                        const newStatus = mappedStatus === 'shipped' ? 'completed' : 'cancelled';
                        await prisma.printOrderTask.updateMany({
                            where: { id: { in: taskIdsToUpdate } },
                            data: {
                                status: newStatus,
                                updated_at: new Date()
                            }
                        });
                        tasksUpdated += taskIdsToUpdate.length;
                        logger.info(`✓ Updated ${taskIdsToUpdate.length} print tasks to ${newStatus}.`);
                    } else {
                        // Log dry run for tasks
                        logger.info(`Would update ${taskIdsToUpdate.length} print tasks to ${mappedStatus === 'shipped' ? 'completed' : 'cancelled'} (dry run).`);
                    }
                } else {
                    logger.info(`No pending or in-progress print tasks found for order ${order.id} to update.`);
                }
            }
            // --- End Moved Task Update Logic ---


            // Show additional order info in verbose mode
            if (verbose) {
                logger.info(`Order Details for ${order.id}:`);
                logger.info(`- ShipStation Order Number: ${ssOrder.orderNumber}`);
                logger.info(`- Marketplace: ${order.marketplace || 'Unknown'}`);
                logger.info(`- Order Date: ${ssOrder.orderDate}`);
                logger.info(`- Items: ${order.items.length}`);
                logger.info(`- Print Tasks: ${order.items.reduce((total, item) => total + item.printTasks.length, 0)}`);
            }
        } catch (error) {
            logger.error(`Error processing order ${order.id}:`, { error });
        }
    }

    // Run cleanup if any orders were updated to shipped/cancelled
    if (fix && ordersUpdated > 0) {
        logger.info('Running cleanup for shipped/cancelled orders...');
        const cleanupResult = await cleanShippedOrderTasks();
        logger.info(`Cleanup result: ${JSON.stringify(cleanupResult)}`);
    }

    return {
        ordersChecked: orders.length,
        ordersUpdated,
        tasksUpdated
    };
}

async function main() {
    const program = new Command();

    program
        .name('fix-status-mismatch')
        .description('Check and fix mismatches between ShipStation order status and database order status.')
        .option('-o, --order-id <id>', 'Specific order ID to check', val => parseInt(val))
        .option('-f, --fix', 'Apply fixes (without this flag, runs in dry-run mode)', false)
        .option('-v, --verbose', 'Show detailed information', false)
        .action(async (options: ScriptOptions) => {
            try {
                logger.info('Starting status mismatch check...');
                const result = await checkAndFixStatus(options);

                logger.info('Status check complete:');
                logger.info(`- Orders checked: ${result.ordersChecked}`);
                logger.info(`- Orders updated: ${result.ordersUpdated}`);
                logger.info(`- Print tasks updated: ${result.tasksUpdated}`);

                if (!options.fix && result.ordersChecked > 0) {
                    logger.info('Run with --fix to apply the changes.');
                }
            } catch (error) {
                logger.error('Error in script execution:', { error });
            } finally {
                await prisma.$disconnect();
            }
        });

    await program.parseAsync(process.argv);
}

main();
