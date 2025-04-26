import { PrintTaskStatus, PrismaClient } from '@prisma/client'; 
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; 
import { Command } from 'commander';
import dotenv from 'dotenv';
import pino from 'pino';
import readline from 'readline/promises';

// Load environment variables
dotenv.config()

// Setup logger
const logger = pino({ level: 'info' })

// Initialize database connection
const prisma = new PrismaClient()

async function confirmExecution(promptMessage: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`${promptMessage} (yes/NO) `)
    rl.close()
    return answer.toLowerCase() === 'yes'
}

async function main() {
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

    const options = program.opts<{
        dryRun: boolean
        confirm: boolean
        verbose: boolean
        shippedStatuses: string[] // Array of strings
        targetTaskStatuses: string[] // Array of strings
    }>()

    if (options.verbose) {
        logger.level = 'debug'
    }

    logger.info(`Starting task completion process for shipped orders.`)
    logger.info(`Identifying orders with local status(es): ${options.shippedStatuses.join(', ')}`)
    logger.info(`Targeting tasks with status(es): ${options.targetTaskStatuses.join(', ')}`)
    if (options.dryRun) {
        logger.info('--- DRY RUN MODE ---')
    }

    try {
        await prisma.$connect()
        logger.info('Database connected.')

        // 1. Find orders in the local DB marked as shipped
        logger.info('Finding locally shipped orders...')
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
            logger.info('No local orders found with specified shipped status(es).')
            return
        }

        const shippedLocalOrderIds = shippedLocalOrders.map(o => o.id)
        logger.info(`Found ${shippedLocalOrders.length} local orders marked as shipped.`)
        logger.debug({ shippedOrders: shippedLocalOrders.map(o => ({ id: o.id, number: o.shipstation_order_number, status: o.order_status })) }, 'Local Shipped Orders')

        // 2. Find Print Tasks associated with these shipped orders that are pending/needs_review
        logger.info('Finding associated print tasks to mark as completed...')
        const tasksToUpdate = await prisma.printOrderTask.findMany({
            where: {
                orderId: { in: shippedLocalOrderIds },
                // Use the provided target status list
                status: { in: options.targetTaskStatuses as PrintTaskStatus[] }, // Cast to PrintTaskStatus[]
            },
            select: {
                id: true,
                orderId: true,
                status: true,
            },
        })

        if (tasksToUpdate.length === 0) {
            logger.info('No tasks found needing completion for these shipped orders.')
            return
        }

        logger.info(`Identified ${tasksToUpdate.length} print tasks to mark as COMPLETED.`)
        logger.debug({ taskIdsToUpdate: tasksToUpdate.map(t => t.id), taskDetails: tasksToUpdate }, 'Tasks to Update')

        // 3. Confirm and Update
        if (!options.confirm && !options.dryRun) {
            if (!(await confirmExecution(`Update ${tasksToUpdate.length} print tasks to COMPLETED?`))) {
                logger.info('Aborted by user.')
                return
            }
        }

        if (options.dryRun) {
            logger.info(`[Dry Run] Would update ${tasksToUpdate.length} print tasks to status COMPLETED.`)
        } else {
            logger.info(`Updating ${tasksToUpdate.length} print tasks to COMPLETED...`)
            const updateResult = await prisma.printOrderTask.updateMany({
                where: {
                    id: { in: tasksToUpdate.map(t => t.id) },
                },
                data: {
                    status: PrintTaskStatus.completed, // Use PrintTaskStatus enum directly
                },
            })
            logger.info(`Successfully updated ${updateResult.count} print tasks.`) // updateMany returns count
        }

    } catch (error) {
        // Log specific Prisma errors if possible
        if (error instanceof PrismaClientKnownRequestError) { // Use the specific Prisma error type
            // Now TypeScript knows 'error' has code, meta, message, stack
            logger.error({ err: { code: error.code, meta: error.meta, message: error.message, stack: error.stack } }, 'A Prisma error occurred during the process.');
        } else {
            // Handle unknown error type more safely
            const errDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) };
            logger.error({ err: errDetails }, 'An error occurred during the process.');
        }
        process.exitCode = 1
    } finally {
        await prisma.$disconnect()
        logger.info('Database disconnected.')
        logger.info('Task completion script finished.')
    }
}

main().catch((e) => {
    logger.error({ err: e }, 'Unhandled error in main function')
    process.exit(1)
}) 
