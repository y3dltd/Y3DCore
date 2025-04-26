import logger from '@/lib/logger';
import { prisma } from '@/lib/prisma';
/**
 * Creates a new sync progress record in the database
 */
export async function createSyncProgress(syncType) {
    try {
        const progress = await prisma.syncProgress.create({
            data: {
                syncType,
                startTime: new Date(),
                status: 'running',
                totalOrders: 0,
                processedOrders: 0,
                failedOrders: 0,
            },
        });
        logger.info(`[Sync Progress] Created new sync progress record: ${progress.id}`);
        return progress.id;
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to create sync progress record: ${error}`);
        throw error;
    }
}
/**
 * Updates an existing sync progress record
 */
export async function updateSyncProgress(progressId, data) {
    try {
        await prisma.syncProgress.update({
            where: { id: progressId },
            data,
        });
        logger.debug(`[Sync Progress] Updated sync progress: ${progressId}`);
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to update sync progress ${progressId}: ${error}`);
        // Don't throw - we don't want to fail the sync just because progress tracking failed
    }
}
/**
 * Marks a sync as completed or failed
 */
export async function markSyncCompleted(progressId, success, error) {
    try {
        await prisma.syncProgress.update({
            where: { id: progressId },
            data: {
                endTime: new Date(),
                status: success ? 'completed' : 'failed',
                error,
            },
        });
        logger.info(`[Sync Progress] Marked sync ${progressId} as ${success ? 'completed' : 'failed'}`);
    }
    catch (updateError) {
        logger.error(`[Sync Progress] Failed to mark sync ${progressId} as ${success ? 'completed' : 'failed'}: ${updateError}`);
        // Don't throw - we don't want to fail the sync just because progress tracking failed
    }
}
/**
 * Gets the last successful sync of a specific type
 */
export async function getLastSuccessfulSync(syncType) {
    try {
        const result = await prisma.syncProgress.findFirst({
            where: {
                syncType,
                status: 'completed',
            },
            orderBy: {
                endTime: 'desc',
            },
        });
        // Assert the type to match the SyncProgress interface
        return result;
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to get last successful sync of type ${syncType}: ${error}`);
        return null;
    }
}
/**
 * Gets the last failed sync of a specific type
 */
export async function getLastFailedSync(syncType) {
    try {
        const result = await prisma.syncProgress.findFirst({
            where: {
                syncType,
                status: 'failed',
            },
            orderBy: {
                endTime: 'desc',
            },
        });
        // Assert the type to match the SyncProgress interface
        return result;
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to get last failed sync of type ${syncType}: ${error}`);
        return null;
    }
}
/**
 * Attempts to resume a failed sync
 */
export async function resumeFailedSync(syncType) {
    try {
        const lastFailed = await getLastFailedSync(syncType);
        if (!lastFailed || !lastFailed.lastProcessedOrderId) {
            return null;
        }
        const newProgress = await prisma.syncProgress.create({
            data: {
                syncType,
                startTime: new Date(),
                status: 'running',
                totalOrders: lastFailed.totalOrders,
                processedOrders: lastFailed.processedOrders,
                failedOrders: lastFailed.failedOrders,
                lastProcessedOrderId: lastFailed.lastProcessedOrderId,
                lastProcessedTimestamp: lastFailed.lastProcessedTimestamp,
            },
        });
        logger.info(`[Sync Progress] Created new progress record ${newProgress.id} to resume failed sync`);
        return {
            progressId: newProgress.id,
            lastProcessedOrderId: lastFailed.lastProcessedOrderId,
            lastProcessedTimestamp: lastFailed.lastProcessedTimestamp,
        };
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to resume failed sync of type ${syncType}: ${error}`);
        return null;
    }
}
/**
 * Increments the processed orders count
 */
export async function incrementProcessedOrders(progressId, count = 1) {
    try {
        await prisma.syncProgress.update({
            where: { id: progressId },
            data: {
                processedOrders: {
                    increment: count,
                },
            },
        });
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to increment processed orders for ${progressId}: ${error}`);
        // Don't throw
    }
}
/**
 * Increments the failed orders count
 */
export async function incrementFailedOrders(progressId, count = 1) {
    try {
        await prisma.syncProgress.update({
            where: { id: progressId },
            data: {
                failedOrders: {
                    increment: count,
                },
            },
        });
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to increment failed orders for ${progressId}: ${error}`);
        // Don't throw
    }
}
/**
 * Updates the last processed order information
 */
export async function updateLastProcessedOrder(progressId, orderId, timestamp) {
    try {
        await prisma.syncProgress.update({
            where: { id: progressId },
            data: {
                lastProcessedOrderId: orderId,
                lastProcessedTimestamp: timestamp,
            },
        });
    }
    catch (error) {
        logger.error(`[Sync Progress] Failed to update last processed order for ${progressId}: ${error}`);
        // Don't throw
    }
}
