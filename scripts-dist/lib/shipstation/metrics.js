import logger from '@/lib/logger';
import { prisma } from '@/lib/prisma';
/**
 * Class for collecting and tracking metrics during a sync process
 */
export class MetricsCollector {
    metrics;
    orderTimings = {};
    constructor(syncId) {
        this.metrics = {
            syncId,
            totalApiCalls: 0,
            totalOrdersProcessed: 0,
            totalOrdersFailed: 0,
            totalItemsProcessed: 0,
            totalItemsFailed: 0,
            totalCustomersUpserted: 0,
            totalProductsUpserted: 0,
            avgProcessingTimePerOrder: 0,
            maxProcessingTimePerOrder: 0,
            minProcessingTimePerOrder: Number.MAX_SAFE_INTEGER,
            totalProcessingTime: 0,
            startTime: new Date(),
        };
        logger.info(`[Metrics] Started metrics collection for sync ${syncId}`);
    }
    /**
     * Records an API call to ShipStation
     */
    recordApiCall() {
        this.metrics.totalApiCalls++;
    }
    /**
     * Starts timing the processing of an order
     */
    startOrderProcessing(orderId) {
        this.orderTimings[orderId] = Date.now();
    }
    /**
     * Records the completion of order processing
     */
    recordOrderProcessed(orderId, success, itemsProcessed, itemsFailed) {
        const startTime = this.orderTimings[orderId] || Date.now();
        const processingTime = Date.now() - startTime;
        if (success) {
            this.metrics.totalOrdersProcessed++;
            this.metrics.totalItemsProcessed += itemsProcessed;
            this.metrics.totalItemsFailed += itemsFailed;
            this.metrics.totalProcessingTime += processingTime;
            this.metrics.maxProcessingTimePerOrder = Math.max(this.metrics.maxProcessingTimePerOrder, processingTime);
            this.metrics.minProcessingTimePerOrder = Math.min(this.metrics.minProcessingTimePerOrder, processingTime);
            if (this.metrics.totalOrdersProcessed > 0) {
                this.metrics.avgProcessingTimePerOrder = Math.round(this.metrics.totalProcessingTime / this.metrics.totalOrdersProcessed);
            }
        }
        else {
            this.metrics.totalOrdersFailed++;
        }
        delete this.orderTimings[orderId];
    }
    /**
     * Records a customer upsert
     */
    recordCustomerUpserted() {
        this.metrics.totalCustomersUpserted++;
    }
    /**
     * Records a product upsert
     */
    recordProductUpserted() {
        this.metrics.totalProductsUpserted++;
    }
    /**
     * Saves the metrics to the database
     */
    async saveMetrics() {
        try {
            this.metrics.endTime = new Date();
            // If no orders were processed, set min to 0
            if (this.metrics.minProcessingTimePerOrder === Number.MAX_SAFE_INTEGER) {
                this.metrics.minProcessingTimePerOrder = 0;
            }
            await prisma.syncMetrics.create({
                data: this.metrics,
            });
            logger.info(`[Metrics] Saved sync metrics for sync ${this.metrics.syncId}`);
            logger.info(`[Metrics] Summary: ${this.metrics.totalOrdersProcessed} orders processed, ${this.metrics.totalOrdersFailed} failed, ${this.metrics.totalItemsProcessed} items processed`);
        }
        catch (error) {
            logger.error(`[Metrics] Failed to save metrics for sync ${this.metrics.syncId}: ${error}`);
            // Don't throw - we don't want to fail the sync just because metrics saving failed
        }
    }
    /**
     * Gets a summary of the current metrics
     */
    getMetricsSummary() {
        return {
            ...this.metrics,
            avgProcessingTimePerOrder: Math.round(this.metrics.avgProcessingTimePerOrder),
            minProcessingTimePerOrder: this.metrics.minProcessingTimePerOrder === Number.MAX_SAFE_INTEGER
                ? 0
                : this.metrics.minProcessingTimePerOrder,
        };
    }
    /**
     * Logs the current metrics to the console
     */
    logMetrics() {
        const summary = this.getMetricsSummary();
        const avgTimeStr = `${(summary.avgProcessingTimePerOrder / 1000).toFixed(2)}s`;
        const maxTimeStr = `${(summary.maxProcessingTimePerOrder / 1000).toFixed(2)}s`;
        const minTimeStr = `${(summary.minProcessingTimePerOrder / 1000).toFixed(2)}s`;
        logger.info(`[Metrics] Current Status:
  - Orders: ${summary.totalOrdersProcessed} processed, ${summary.totalOrdersFailed} failed
  - Items: ${summary.totalItemsProcessed} processed, ${summary.totalItemsFailed} failed
  - API Calls: ${summary.totalApiCalls}
  - Customers: ${summary.totalCustomersUpserted} upserted
  - Products: ${summary.totalProductsUpserted} upserted
  - Processing Time: avg ${avgTimeStr}, max ${maxTimeStr}, min ${minTimeStr}
`);
    }
}
