import readline from 'readline/promises';

import { PrintTaskStatus, PrismaClient } from '@prisma/client'; 
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; 
import { Command } from 'commander';

import 'dotenv/config'; // Side-effect import for dotenv
import { getLogger } from '@lib/shared/logging';

// Setup logger
const logger = getLogger('complete-shipped-print-tasks');

// Initialize database connection
const prisma = new PrismaClient()

async function confirmExecution(promptMessage: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`${promptMessage} (yes/NO) `)
    rl.close()
    return answer.toLowerCase() === 'yes'
}

async function run(options: {
    dryRun: boolean
    confirm: boolean
    verbose: boolean
    shippedStatuses: string[] // Array of strings
    targetTaskStatuses: string[] // Array of strings
}): Promise<void> {
    logger.info(`Starting task completion process for shipped orders.`);
    logger.info(`Identifying orders with local status(es): ${options.shippedStatuses.join(', ')}`);
    logger.info(`Targeting tasks with status(es): ${options.targetTaskStatuses.join(', ')}`);
    if (options.dryRun) {
        logger.info('--- DRY RUN MODE ---');
    }

    try {
        await prisma.$connect();
        logger.info('Database connected.');

        // 1. Find orders in the local DB marked as shipped
        logger.info('Finding locally shipped orders...');
        const shippedLocalOrders = await prisma.order.findMany({
            where: {
                // Query the string field 'order_status'
                order_status: { in: options.shippedStatuses },
            },
            select: {
                id: true,
                shipstation_order_number: true,
                order_status: true, // Select the correct field
            },
        })

        if (shippedLocalOrders.length === 0) {
            logger.info('No local orders found with specified shipped status(es).');
            return;
        }

        const shippedLocalOrderIds = shippedLocalOrders.map(o => o.id);
        logger.info(`Found ${shippedLocalOrders.length} local orders marked as shipped.`);
        logger.debug('Local Shipped Orders', { 
            shippedOrders: shippedLocalOrders.map(o => ({ id: o.id, number: o.shipstation_order_number, status: o.order_status })) 
        });

        // 2. Find Print Tasks associated with these shipped orders that are pending/needs_review
        logger.info('Finding associated print tasks to mark as completed...');
        const tasksToUpdate = await prisma.printOrderTask.findMany({
            where: {
                orderId: { in: shippedLocalOrderIds },
                // Use the provided target status list
                status: { in: options.targetTaskStatuses as PrintTaskStatus[] }, // Cast to PrintTaskStatus[]
            },
            select: {
                id: true,
                orderId: true, // Added for logging context
                status: true, // Added for logging context
            },
        })

        if (tasksToUpdate.length === 0) {
            logger.info('No print tasks found needing update for these orders.');
            return;
        }

        const taskIdsToUpdate = tasksToUpdate.map(t => t.id);
        logger.info(`Found ${tasksToUpdate.length} tasks to update.`);
        logger.debug('Task Details', { 
            taskIdsToUpdate,
            taskDetails: tasksToUpdate.map(t => ({ id: t.id, orderId: t.orderId, status: t.status }))
        });

        if (options.confirm) {
            const confirmed = await confirmExecution(
                `Found ${tasksToUpdate.length} tasks to mark as '${PrintTaskStatus.completed}'. Proceed?`
            );
            if (!confirmed) {
                logger.info('Execution aborted by user.');
                return;
            }
        }

        if (!options.dryRun) {
            logger.info(`Updating ${taskIdsToUpdate.length} tasks to '${PrintTaskStatus.completed}'...`);
            const updateResult = await prisma.printOrderTask.updateMany({
                where: {
                    id: { in: taskIdsToUpdate },
                },
                data: {
                    status: PrintTaskStatus.completed,
                },
            });
            logger.info(`Successfully updated ${updateResult.count} tasks.`);
        } else {
            logger.info(`DRY RUN: Would have updated ${taskIdsToUpdate.length} tasks.`);
        }

    } catch (err: unknown) {
        if (err instanceof PrismaClientKnownRequestError) {
            // Prisma specific error
            logger.error('A Prisma database error occurred',
                {
                    code: err.code,
                    meta: err.meta,
                    stack: err.stack,
                }
            );
        } else if (err instanceof Error) {
            // Generic error
            logger.error('An unexpected error occurred',
                {
                    errorName: err.name,
                    errorMessage: err.message,
                    stack: err.stack,
                }
            );
        } else {
            // Fallback for unknown error types
            logger.error('An unknown error occurred', { error: err });
        }
    } finally {
        await prisma.$disconnect();
        logger.info('Database disconnected.');
    }
}

async function main(): Promise<void> {
    const program = new Command()
    program
        .name('complete-shipped-print-tasks')
        .description('Updates status to COMPLETED for print tasks associated with locally marked shipped orders.')
        .option('--dry-run', 'Simulate without making database changes', false)
        .option('-y, --confirm', 'Skip confirmation prompt', false)
        .option('--verbose', 'Enable verbose logging', false)
        // Option for shipped statuses uses strings now
        .option<string[]>(
            '--shipped-statuses <statuses>',
            'Comma-separated list of local order statuses (strings) considered shipped',
            (value) => value.split(',').map(s => s.trim()),
            ['shipped'] // Default to the string 'shipped'
        )
        // Target pending and in_progress tasks by default
        .option<string[]>(
            '--target-task-statuses <statuses>',
            'Comma-separated list of task statuses to mark as completed',
            (value) => value.split(',').map(s => s.trim()),
            [PrintTaskStatus.pending, PrintTaskStatus.in_progress] // Corrected default values
        )
        .parse(process.argv)

    const commanderOptions = program.opts<{
        dryRun: boolean
        confirm: boolean
        verbose: boolean
        shippedStatuses: string[] // Array of strings
        targetTaskStatuses: string[] // Array of strings
    }>()

    await run({
        dryRun: commanderOptions.dryRun,
        confirm: commanderOptions.confirm,
        verbose: commanderOptions.verbose,
        shippedStatuses: commanderOptions.shippedStatuses,
        targetTaskStatuses: commanderOptions.targetTaskStatuses
    });
}

main().catch((e) => {
    logger.error('Unhandled error in main execution', { error: e });
    process.exit(1);
});
