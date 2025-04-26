#!/usr/bin/env node
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
// Removed unused prisma import
import { logger } from '../lib/shared/logging';
import { syncAllPaginatedOrders } from '../lib/shared/shipstation';
// Load environment variables
dotenv.config();
// Constants
const LOCK_FILE = '/tmp/y3dhub-historical-sync.lock';
const PROGRESS_FILE = path.join(process.cwd(), 'logs', 'historical-sync-progress.json');
// Batch size handled by syncAllPaginatedOrders
const START_DATE = '2020-01-01';
// CLI arguments
const argv = yargs(hideBin(process.argv))
    .option('force', {
    alias: 'f',
    type: 'boolean',
    description: 'Force sync even if progress file exists',
    default: false,
})
    .option('dry-run', {
    type: 'boolean',
    description: 'Run without making database changes',
    default: false,
})
    .help()
    .parseSync();
async function acquireLock() {
    try {
        await fs.access(LOCK_FILE).catch(() => null);
        // Check if the lock is stale (older than 6 hours)
        const stats = await fs.stat(LOCK_FILE).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs > 6 * 60 * 60 * 1000) {
            logger.warn('Found stale lock file. Removing...');
            await fs.unlink(LOCK_FILE);
        }
        else if (stats) {
            logger.error('Another sync process is running. Exiting.');
            return false;
        }
        // Create lock file
        await fs.writeFile(LOCK_FILE, process.pid.toString());
        return true;
    }
    catch (error) {
        logger.error('Failed to acquire lock:', { error: error instanceof Error ? error.message : String(error) });
        return false;
    }
}
async function releaseLock() {
    try {
        await fs.unlink(LOCK_FILE);
    }
    catch (error) {
        logger.warn('Failed to release lock:', { error: error instanceof Error ? error.message : String(error) });
    }
}
async function loadProgress() {
    try {
        const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return {
            lastProcessedDate: START_DATE,
            totalProcessed: 0,
            totalFailed: 0,
            lastRunTime: new Date().toISOString(),
            isComplete: false,
        };
    }
}
async function saveProgress(progress) {
    await fs.mkdir(path.dirname(PROGRESS_FILE), { recursive: true });
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}
async function main() {
    logger.info('Starting historical order sync...');
    if (!(await acquireLock())) {
        process.exit(1);
    }
    try {
        // Load or initialize progress
        let progress = await loadProgress();
        if (progress.isComplete && !argv.force) {
            logger.info('Historical sync already completed. Use --force to run again.');
            return;
        }
        if (argv.force) {
            progress = {
                lastProcessedDate: START_DATE,
                totalProcessed: 0,
                totalFailed: 0,
                lastRunTime: new Date().toISOString(),
                isComplete: false,
            };
        }
        logger.info(`Resuming sync from ${progress.lastProcessedDate}`);
        const result = await syncAllPaginatedOrders({
            dryRun: argv['dry-run'],
            overrideStartDate: progress.lastProcessedDate,
            defaultStartDate: START_DATE,
        });
        // Update progress
        progress.totalProcessed += result.ordersProcessed;
        progress.totalFailed += result.ordersFailed;
        progress.lastRunTime = new Date().toISOString();
        progress.isComplete = true;
        await saveProgress(progress);
        logger.info('Historical sync completed!', {
            totalProcessed: progress.totalProcessed,
            totalFailed: progress.totalFailed,
        });
    }
    catch (error) {
        logger.error('Historical sync failed:', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
    }
    finally {
        await releaseLock();
    }
}
// Handle process termination
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Cleaning up...');
    await releaseLock();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Cleaning up...');
    await releaseLock();
    process.exit(0);
});
// Run the script
main().catch((error) => {
    logger.error('Unhandled error:', { error: error instanceof Error ? error.message : String(error) });
    releaseLock().finally(() => process.exit(1));
});
