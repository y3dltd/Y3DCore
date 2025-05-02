"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const logging_1 = require("@/lib/shared/logging");
// Initialize Prisma client
const prisma = new client_1.PrismaClient();
// Load environment variables
dotenv_1.default.config();
// Log script start
logging_1.logger.info('print-tasks.ts script started');
// Helper function to handle async commands and logging
async function runCommand(commandName, handler) {
    logging_1.logger.info(`[${commandName}] Starting command...`);
    try {
        await handler();
        logging_1.logger.info(`[${commandName}] Command completed successfully.`);
        process.exit(0);
    }
    catch (error) {
        logging_1.logger.error(`[${commandName}] Command failed:`, { error });
        process.exit(1);
    }
}
// Create and configure the CLI
const cli = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .scriptName('print-tasks')
    .command('create', 'Create print tasks from orders', yargs => {
    return yargs
        .option('order-id', {
        alias: 'o',
        describe: 'Process a specific order by ID',
        type: 'number',
    })
        .option('days-back', {
        alias: 'd',
        describe: 'Process orders from the last N days',
        type: 'number',
        default: 2,
    })
        .option('hours', {
        alias: 'h',
        describe: 'Process orders from the last N hours (overrides days-back)',
        type: 'number',
    })
        .option('limit', {
        alias: 'l',
        describe: 'Limit the number of orders to process',
        type: 'number',
        default: 10,
    })
        .option('force-recreate', {
        alias: 'f',
        describe: 'Force recreation of existing tasks',
        type: 'boolean',
        default: false,
    })
        .option('create-placeholder', {
        alias: 'p',
        describe: 'Create placeholder tasks for orders without personalization data',
        type: 'boolean',
        default: false,
    })
        .option('verbose', {
        alias: 'v',
        describe: 'Show verbose output',
        type: 'boolean',
        default: false,
    })
        .option('dry-run', {
        describe: "Don't make any changes to the database",
        type: 'boolean',
        default: false,
    });
}, async (argv) => {
    await runCommand('Create', async () => {
        logging_1.logger.info('Creating print tasks with options:', {
            orderId: argv.orderId,
            daysBack: argv.daysBack,
            hours: argv.hours,
            limit: argv.limit,
            forceRecreate: argv.forceRecreate,
            createPlaceholder: argv.createPlaceholder,
            dryRun: argv.dryRun,
        });
        // Calculate date threshold
        const dateThreshold = new Date();
        if (argv.hours) {
            dateThreshold.setHours(dateThreshold.getHours() - argv.hours);
        }
        else {
            dateThreshold.setDate(dateThreshold.getDate() - argv.daysBack);
        }
        // Get the orders to process
        let orderQuery = {};
        if (argv.orderId) {
            orderQuery = { id: argv.orderId };
        }
        else {
            orderQuery = {
                created_at: {
                    gte: dateThreshold,
                },
            };
        }
        const orders = await prisma.order.findMany({
            where: orderQuery,
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
            take: argv.limit,
        });
        const count = await prisma.order.count({
            where: orderQuery,
        });
        logging_1.logger.info(`Found ${count} orders to process. Will process up to ${argv.limit} orders.`);
        if (argv.dryRun) {
            logging_1.logger.info(`[DRY RUN] Would process ${orders.length} orders to create print tasks.`);
            return;
        }
        // Process all the found orders and create print tasks
        let tasksCreated = 0;
        let tasksSkipped = 0;
        let needsReviewCount = 0;
        for (const order of orders) {
            logging_1.logger.info(`Processing order ${order.id} (${order.shipstation_order_number || 'No SS Number'})...`);
            // Here we would normally call the AI service and process the response
            // For now, implement a simplified version that creates basic print tasks
            for (const item of order.items) {
                // Skip if tasks already exist and we're not force recreating
                if (!argv.forceRecreate) {
                    const existingTasks = await prisma.printOrderTask.findMany({
                        where: { orderItemId: item.id },
                    });
                    if (existingTasks.length > 0) {
                        logging_1.logger.info(`Skipping item ${item.id} - tasks already exist`);
                        tasksSkipped += existingTasks.length;
                        continue;
                    }
                }
                // Create a basic print task (in a real implementation, this would use the AI data)
                try {
                    // Extract values from print_settings if available
                    const print_settings = item.print_settings;
                    const customText = typeof print_settings?.custom_text === 'string' ? print_settings.custom_text : null;
                    const color_1 = typeof print_settings?.color_1 === 'string' ? print_settings.color_1 : null;
                    const color_2 = typeof print_settings?.color_2 === 'string' ? print_settings.color_2 : null;
                    const task = await prisma.printOrderTask.create({
                        data: {
                            orderId: order.id,
                            orderItemId: item.id,
                            productId: item.productId,
                            shorthandProductName: item.product?.name || 'Unknown Product',
                            status: 'pending',
                            custom_text: customText,
                            color_1: color_1,
                            color_2: color_2,
                            quantity: item.quantity || 1,
                            needs_review: argv.createPlaceholder,
                            review_reason: argv.createPlaceholder
                                ? 'Placeholder task - needs verification'
                                : null,
                            taskIndex: 0,
                        },
                    });
                    logging_1.logger.info(`Created print task ${task.id} for item ${item.id}`);
                    tasksCreated++;
                    if (argv.createPlaceholder) {
                        needsReviewCount++;
                    }
                }
                catch (error) {
                    logging_1.logger.error(`Failed to create print task for item ${item.id}:`, { error });
                }
            }
        }
        logging_1.logger.info(`Command completed: ${tasksCreated} tasks created, ${tasksSkipped} tasks skipped, ${needsReviewCount} tasks need review`);
    });
})
    .command('update', 'Update print tasks with personalization data', yargs => {
    return yargs
        .option('order-id', {
        alias: 'o',
        describe: 'Process a specific order by ID',
        type: 'number',
    })
        .option('days-back', {
        alias: 'd',
        describe: 'Process orders from the last N days',
        type: 'number',
        default: 2,
    })
        .option('hours', {
        alias: 'h',
        describe: 'Process orders from the last N hours (overrides days-back)',
        type: 'number',
    })
        .option('update-from-order-items', {
        alias: 'i',
        describe: "Update tasks from order items' print_settings",
        type: 'boolean',
        default: true,
    })
        .option('update-from-amazon', {
        alias: 'a',
        describe: 'Update tasks from Amazon customization data',
        type: 'boolean',
        default: false,
    })
        .option('verbose', {
        alias: 'v',
        describe: 'Show verbose output',
        type: 'boolean',
        default: false,
    })
        .option('dry-run', {
        describe: "Don't make any changes to the database",
        type: 'boolean',
        default: false,
    });
}, async (argv) => {
    await runCommand('Update', async () => {
        logging_1.logger.info('Updating print tasks with options:', {
            orderId: argv.orderId,
            daysBack: argv.daysBack,
            hours: argv.hours,
            updateFromOrderItems: argv.updateFromOrderItems,
            updateFromAmazon: argv.updateFromAmazon,
            dryRun: argv.dryRun,
        });
        // Handle different update sources
        if (argv.updateFromOrderItems) {
            // Find tasks to update
            const whereClause = argv.orderId
                ? { orderId: argv.orderId }
                : {
                    created_at: {
                        gte: new Date(Date.now() -
                            (argv.hours
                                ? argv.hours * 60 * 60 * 1000
                                : argv.daysBack * 24 * 60 * 60 * 1000)),
                    },
                };
            const tasks = await prisma.printOrderTask.findMany({
                where: whereClause,
                include: {
                    orderItem: {
                        include: {
                            product: true,
                        },
                    },
                },
            });
            logging_1.logger.info(`Found ${tasks.length} print tasks to update`);
            if (argv.dryRun) {
                logging_1.logger.info(`[DRY RUN] Would update ${tasks.length} print tasks from order items`);
                return;
            }
            let tasksUpdated = 0;
            for (const task of tasks) {
                if (task.orderItem?.print_settings) {
                    try {
                        const settings = task.orderItem.print_settings;
                        // Extract values ensuring they are strings or null
                        const customText = typeof settings.custom_text === 'string'
                            ? settings.custom_text
                            : task.custom_text;
                        const color_1 = typeof settings.color_1 === 'string' ? settings.color_1 : task.color_1;
                        const color_2 = typeof settings.color_2 === 'string' ? settings.color_2 : task.color_2;
                        await prisma.printOrderTask.update({
                            where: { id: task.id },
                            data: {
                                custom_text: customText,
                                color_1: color_1,
                                color_2: color_2,
                                updated_at: new Date(),
                            },
                        });
                        tasksUpdated++;
                        logging_1.logger.info(`Updated print task ${task.id} from order item ${task.orderItemId}`);
                    }
                    catch (error) {
                        logging_1.logger.error(`Failed to update print task ${task.id}:`, { error });
                    }
                }
            }
            logging_1.logger.info(`Updated ${tasksUpdated} tasks from order items`);
        }
        if (argv.updateFromAmazon) {
            logging_1.logger.warn('Update from Amazon functionality not yet implemented');
            // This would be implemented in the future to pull data from Amazon customization
        }
    });
})
    .command('cleanup', 'Clean up completed/shipped tasks', yargs => {
    return yargs
        .option('clear-all', {
        describe: 'Clear all tasks (with confirmation)',
        type: 'boolean',
        default: false,
    })
        .option('clear-completed', {
        describe: 'Clear completed tasks',
        type: 'boolean',
        default: false,
    })
        .option('fix-pending', {
        describe: 'Fix tasks for shipped/cancelled orders',
        type: 'boolean',
        default: false,
    })
        .option('days-back', {
        alias: 'd',
        describe: 'Process tasks from the last N days',
        type: 'number',
        default: 7,
    })
        .option('verbose', {
        alias: 'v',
        describe: 'Show verbose output',
        type: 'boolean',
        default: false,
    })
        .option('dry-run', {
        describe: "Don't make any changes to the database",
        type: 'boolean',
        default: false,
    });
}, async (argv) => {
    await runCommand('Cleanup', async () => {
        logging_1.logger.info('Cleaning up print tasks with options:', {
            clearAll: argv.clearAll,
            clearCompleted: argv.clearCompleted,
            fixPending: argv.fixPending,
            daysBack: argv.daysBack,
            dryRun: argv.dryRun,
        });
        // Handle clear all with confirmation
        if (argv.clearAll) {
            logging_1.logger.warn('This will delete ALL print tasks!');
            if (argv.dryRun) {
                logging_1.logger.info('[DRY RUN] Would delete all print tasks');
                return;
            }
            // In a real implementation, we would ask for confirmation here
            // For now, just log a warning
            logging_1.logger.warn('Skipping deletion - requires manual confirmation in production');
            return;
        }
        // Handle clear completed
        if (argv.clearCompleted) {
            const whereClause = {
                status: 'completed',
                updated_at: {
                    lte: new Date(Date.now() - argv.daysBack * 24 * 60 * 60 * 1000),
                },
            };
            const completedTasksCount = await prisma.printOrderTask.count({
                where: whereClause,
            });
            logging_1.logger.info(`Found ${completedTasksCount} completed tasks older than ${argv.daysBack} days`);
            if (argv.dryRun) {
                logging_1.logger.info(`[DRY RUN] Would delete ${completedTasksCount} completed print tasks`);
                return;
            }
            const result = await prisma.printOrderTask.deleteMany({
                where: whereClause,
            });
            logging_1.logger.info(`Deleted ${result.count} completed print tasks`);
        }
        // Handle fix pending
        if (argv.fixPending) {
            // Find orders that are shipped or cancelled but have pending print tasks
            const orders = await prisma.order.findMany({
                where: {
                    order_status: {
                        in: ['shipped', 'cancelled'],
                    },
                    printTasks: {
                        some: {
                            status: 'pending',
                        },
                    },
                },
                include: {
                    printTasks: {
                        where: {
                            status: 'pending',
                        },
                    },
                },
            });
            logging_1.logger.info(`Found ${orders.length} shipped/cancelled orders with pending print tasks`);
            if (argv.dryRun) {
                let pendingTasksCount = 0;
                for (const order of orders) {
                    pendingTasksCount += order.printTasks.length;
                }
                logging_1.logger.info(`[DRY RUN] Would update ${pendingTasksCount} pending print tasks for shipped/cancelled orders`);
                return;
            }
            let tasksUpdated = 0;
            for (const order of orders) {
                for (const task of order.printTasks) {
                    await prisma.printOrderTask.update({
                        where: { id: task.id },
                        data: {
                            status: order.order_status === 'shipped'
                                ? 'completed'
                                : 'cancelled',
                            updated_at: new Date(),
                        },
                    });
                    tasksUpdated++;
                }
            }
            logging_1.logger.info(`Updated ${tasksUpdated} pending print tasks for shipped/cancelled orders`);
        }
    });
})
    .command('status', 'Show print queue status and statistics', yargs => {
    return yargs
        .option('status', {
        alias: 's',
        describe: 'Filter by status',
        choices: ['pending', 'in_progress', 'completed', 'cancelled'],
        type: 'string',
    })
        .option('days-back', {
        alias: 'd',
        describe: 'Number of days to look back for statistics',
        type: 'number',
        default: 7,
    })
        .option('format', {
        alias: 'f',
        describe: 'Output format',
        choices: ['table', 'json', 'csv'],
        default: 'table',
        type: 'string',
    });
}, async (argv) => {
    await runCommand('Status', async () => {
        logging_1.logger.info('Showing print queue status with options:', {
            status: argv.status,
            daysBack: argv.daysBack,
            format: argv.format,
        });
        // Calculate date threshold
        const dateThreshold = new Date(Date.now() - argv.daysBack * 24 * 60 * 60 * 1000);
        // Prepare filter based on status option
        const whereClause = {
            created_at: {
                gte: dateThreshold,
            },
        };
        if (argv.status) {
            whereClause.status = argv.status;
        }
        // Get basic counts by status
        const totalCount = await prisma.printOrderTask.count({
            where: {
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        const pendingCount = await prisma.printOrderTask.count({
            where: {
                status: 'pending',
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        const inProgressCount = await prisma.printOrderTask.count({
            where: {
                status: 'in_progress',
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        const completedCount = await prisma.printOrderTask.count({
            where: {
                status: 'completed',
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        const cancelledCount = await prisma.printOrderTask.count({
            where: {
                status: 'cancelled',
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        const needsReviewCount = await prisma.printOrderTask.count({
            where: {
                needs_review: true,
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        // Prepare statistics output
        const stats = {
            period: `Last ${argv.daysBack} days`,
            totalTasks: totalCount,
            byStatus: {
                pending: pendingCount,
                inProgress: inProgressCount,
                completed: completedCount,
                cancelled: cancelledCount,
            },
            needsReview: needsReviewCount,
        };
        // Output based on format
        if (argv.format === 'json') {
            console.log(JSON.stringify(stats, null, 2));
        }
        else if (argv.format === 'csv') {
            console.log('Period,Total,Pending,InProgress,Completed,Cancelled,NeedsReview');
            console.log(`Last ${argv.daysBack} days,${totalCount},${pendingCount},${inProgressCount},${completedCount},${cancelledCount},${needsReviewCount}`);
        }
        else {
            // Default table format
            console.log('\nPrint Queue Status:');
            console.log('===================');
            console.log(`Period: Last ${argv.daysBack} days`);
            console.log(`Total Tasks: ${totalCount}`);
            console.log('\nBy Status:');
            console.log(`  Pending: ${pendingCount}`);
            console.log(`  In Progress: ${inProgressCount}`);
            console.log(`  Completed: ${completedCount}`);
            console.log(`  Cancelled: ${cancelledCount}`);
            console.log(`\nNeeds Review: ${needsReviewCount}`);
        }
    });
})
    .command('metrics', 'Report on print task performance and issues', yargs => {
    return yargs
        .option('days-back', {
        alias: 'd',
        describe: 'Number of days to look back for metrics',
        type: 'number',
        default: 30,
    })
        .option('format', {
        alias: 'f',
        describe: 'Output format',
        choices: ['table', 'json', 'csv'],
        default: 'table',
        type: 'string',
    })
        .option('output', {
        alias: 'o',
        describe: 'Output file',
        type: 'string',
    });
}, async (argv) => {
    await runCommand('Metrics', async () => {
        logging_1.logger.info('Generating print task metrics with options:', {
            daysBack: argv.daysBack,
            format: argv.format,
            output: argv.output,
        });
        // Calculate date threshold
        const dateThreshold = new Date(Date.now() - argv.daysBack * 24 * 60 * 60 * 1000);
        // Get task creation metrics
        const totalTasksCreated = await prisma.printOrderTask.count({
            where: {
                created_at: {
                    gte: dateThreshold,
                },
            },
        });
        // Get average processing time (from creation to completion)
        const completedTasks = await prisma.printOrderTask.findMany({
            where: {
                status: 'completed',
                created_at: {
                    gte: dateThreshold,
                },
            },
            select: {
                created_at: true,
                updated_at: true,
            },
        });
        let totalProcessingTime = 0;
        let validTasksCount = 0;
        for (const task of completedTasks) {
            if (task.updated_at) {
                const processingTime = task.updated_at.getTime() - task.created_at.getTime();
                totalProcessingTime += processingTime;
                validTasksCount++;
            }
        }
        const avgProcessingTimeMs = validTasksCount > 0 ? totalProcessingTime / validTasksCount : 0;
        // Convert to hours
        const avgProcessingTimeHours = avgProcessingTimeMs / (1000 * 60 * 60);
        const tasksByMarketplace = await prisma.$queryRaw `
                    SELECT o.marketplace, COUNT(*) as count
                    FROM PrintOrderTask t
                    JOIN "Order" o ON t.orderId = o.id
                    WHERE t.created_at >= ${dateThreshold}
                    GROUP BY o.marketplace
                    ORDER BY count DESC
                `;
        const reviewReasons = await prisma.$queryRaw `
                    SELECT review_reason, COUNT(*) as count
                    FROM PrintOrderTask
                    WHERE needs_review = true
                    AND created_at >= ${dateThreshold}
                    AND review_reason IS NOT NULL
                    GROUP BY review_reason
                    ORDER BY count DESC
                    LIMIT 5
                `;
        // Prepare metrics data
        const metrics = {
            period: `Last ${argv.daysBack} days`,
            tasksCreated: totalTasksCreated,
            tasksCompleted: completedTasks.length,
            avgProcessingTimeHours: avgProcessingTimeHours.toFixed(2),
            tasksByMarketplace,
            topReviewReasons: reviewReasons,
        };
        // Prepare output based on format
        let output = '';
        if (argv.format === 'json') {
            output = JSON.stringify(metrics, null, 2);
        }
        else if (argv.format === 'csv') {
            output = 'Period,TasksCreated,TasksCompleted,AvgProcessingTimeHours\n';
            output += `Last ${argv.daysBack} days,${totalTasksCreated},${completedTasks.length},${avgProcessingTimeHours.toFixed(2)}\n\n`;
            output += 'Marketplace,Count\n';
            for (const item of tasksByMarketplace) {
                output += `${item.marketplace || 'Unknown'},${item.count}\n`;
            }
            output += '\nReviewReason,Count\n';
            for (const item of reviewReasons) {
                output += `${item.review_reason || 'Unknown'},${item.count}\n`;
            }
        }
        else {
            // Default table format
            output = '\nPrint Task Metrics:\n';
            output += '=================\n';
            output += `Period: Last ${argv.daysBack} days\n`;
            output += `Tasks Created: ${totalTasksCreated}\n`;
            output += `Tasks Completed: ${completedTasks.length}\n`;
            output += `Average Processing Time: ${avgProcessingTimeHours.toFixed(2)} hours\n\n`;
            output += 'Tasks by Marketplace:\n';
            for (const item of tasksByMarketplace) {
                output += `  ${item.marketplace || 'Unknown'}: ${item.count}\n`;
            }
            output += '\nTop Review Reasons:\n';
            for (const item of reviewReasons) {
                output += `  ${item.review_reason || 'Unknown'}: ${item.count}\n`;
            }
        }
        // Output or save to file
        if (argv.output) {
            await promises_1.default.writeFile(argv.output, output);
            console.log(`Metrics saved to ${argv.output}`);
        }
        else {
            console.log(output);
        }
    });
})
    .demandCommand(1, 'Please provide a valid command.')
    .strict()
    .help()
    .alias('help', 'h')
    .fail((msg, err) => {
    if (err) {
        logging_1.logger.error('Command execution failed:', { error: err.message });
    }
    else {
        logging_1.logger.error(`Error: ${msg}`);
        cli.showHelp();
    }
    process.exit(1);
});
// Execute the command
cli.parse();
