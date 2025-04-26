"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/cleanup-shipped-tasks.ts
const client_1 = require("@prisma/client");
const commander_1 = require("commander");
const logging_1 = require("../lib/shared/logging"); // Corrected import path
const prisma = new client_1.PrismaClient();
/**
 * Finds print tasks that are still pending or in-progress but belong to orders
 * that have already been shipped or cancelled, and updates their status to completed.
 * Respects dry-run flag.
 */
async function cleanShippedOrderTasksWithDryRun(options) {
    const { dryRun } = options;
    logging_1.logger.info(`Starting cleanup task check... ${dryRun ? '(DRY RUN)' : ''}`);
    try {
        const whereClause = {
            status: {
                in: [client_1.PrintTaskStatus.pending, client_1.PrintTaskStatus.in_progress],
            },
            order: {
                order_status: {
                    in: ['shipped', 'cancelled'],
                },
            },
        };
        const tasksToUpdate = await prisma.printOrderTask.findMany({
            where: whereClause,
            select: {
                id: true,
                order: { select: { id: true, shipstation_order_number: true } }, // Include order info for logging
            },
        });
        const taskIds = tasksToUpdate.map(task => task.id);
        if (taskIds.length > 0) {
            logging_1.logger.info(`Found ${taskIds.length} tasks needing cleanup.`);
            tasksToUpdate.forEach(task => {
                logging_1.logger.debug(` - Task ID: ${task.id} (Order: ${task.order.id} / ${task.order.shipstation_order_number})`);
            });
            if (dryRun) {
                logging_1.logger.info(`[Dry Run] Would mark ${taskIds.length} tasks as completed.`);
                return { success: true, count: taskIds.length };
            }
            else {
                logging_1.logger.info(`Marking ${taskIds.length} tasks as completed...`);
                const updateResult = await prisma.printOrderTask.updateMany({
                    where: {
                        id: {
                            in: taskIds,
                        },
                    },
                    data: {
                        status: client_1.PrintTaskStatus.completed,
                        // Note: revalidatePath cannot be called here
                    },
                });
                logging_1.logger.info(`Successfully marked ${updateResult.count} tasks as completed.`);
                return { success: true, count: updateResult.count };
            }
        }
        else {
            logging_1.logger.info('No tasks needed cleanup.');
            return { success: true, count: 0 };
        }
    }
    catch (error) {
        logging_1.logger.error(`Error during cleanup task check/update: ${error instanceof Error ? error.message : String(error)}`);
        return {
            success: false,
            error: `Failed cleanup: ${error instanceof Error ? error.message : String(error)}`,
            count: 0,
        };
    }
}
async function main() {
    const program = new commander_1.Command();
    program
        .name('cleanup-shipped-tasks')
        .description('Finds and marks tasks as completed if their order is shipped/cancelled.')
        .option('--dry-run', 'Simulate without DB changes', false)
        .option('--verbose', 'Enable verbose logging', false) // Keep verbose for consistency
        .action(async (options) => {
        // Removed logger level setting - rely on shared logger config
        // if (options.verbose) {
        //     logger.level = 'debug';
        // } else {
        //     logger.level = 'info'; // Default level
        // }
        try {
            const result = await cleanShippedOrderTasksWithDryRun(options);
            if (!result.success) {
                throw new Error(result.error || 'Unknown cleanup error');
            }
        }
        catch (error) {
            logging_1.logger.error(`Cleanup script failed fatally: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1); // Exit with error code if cleanup fails
        }
        finally {
            await prisma.$disconnect();
            logging_1.logger.info('Database connection closed.');
        }
    });
    await program.parseAsync(process.argv);
}
main();
