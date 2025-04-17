import logger from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export interface SyncMetrics {
  syncId: string;
  totalApiCalls: number;
  totalOrdersProcessed: number;
  totalOrdersFailed: number;
  totalItemsProcessed: number;
  totalItemsFailed: number;
  totalCustomersUpserted: number;
  totalProductsUpserted: number;
  avgProcessingTimePerOrder: number;
  maxProcessingTimePerOrder: number;
  minProcessingTimePerOrder: number;
  totalProcessingTime: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Class for collecting and tracking metrics during a sync process
 */
export class MetricsCollector {
  private metrics: SyncMetrics;
  private orderTimings: Record<string, number> = {};

  constructor(syncId: string) {
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
  recordApiCall(): void {
    this.metrics.totalApiCalls++;
  }

  /**
   * Starts timing the processing of an order
   */
  startOrderProcessing(orderId: string): void {
    this.orderTimings[orderId] = Date.now();
  }

  /**
   * Records the completion of order processing
   */
  recordOrderProcessed(
    orderId: string,
    success: boolean,
    itemsProcessed: number,
    itemsFailed: number
  ): void {
    const startTime = this.orderTimings[orderId] || Date.now();
    const processingTime = Date.now() - startTime;

    if (success) {
      this.metrics.totalOrdersProcessed++;
      this.metrics.totalItemsProcessed += itemsProcessed;
      this.metrics.totalItemsFailed += itemsFailed;

      this.metrics.totalProcessingTime += processingTime;
      this.metrics.maxProcessingTimePerOrder = Math.max(
        this.metrics.maxProcessingTimePerOrder,
        processingTime
      );
      this.metrics.minProcessingTimePerOrder = Math.min(
        this.metrics.minProcessingTimePerOrder,
        processingTime
      );

      if (this.metrics.totalOrdersProcessed > 0) {
        this.metrics.avgProcessingTimePerOrder = Math.round(
          this.metrics.totalProcessingTime / this.metrics.totalOrdersProcessed
        );
      }
    } else {
      this.metrics.totalOrdersFailed++;
    }

    delete this.orderTimings[orderId];
  }

  /**
   * Records a customer upsert
   */
  recordCustomerUpserted(): void {
    this.metrics.totalCustomersUpserted++;
  }

  /**
   * Records a product upsert
   */
  recordProductUpserted(): void {
    this.metrics.totalProductsUpserted++;
  }

  /**
   * Saves the metrics to the database
   */
  async saveMetrics(): Promise<void> {
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
      logger.info(
        `[Metrics] Summary: ${this.metrics.totalOrdersProcessed} orders processed, ${this.metrics.totalOrdersFailed} failed, ${this.metrics.totalItemsProcessed} items processed`
      );
    } catch (error) {
      logger.error(`[Metrics] Failed to save metrics for sync ${this.metrics.syncId}: ${error}`);
      // Don't throw - we don't want to fail the sync just because metrics saving failed
    }
  }

  /**
   * Gets a summary of the current metrics
   */
  getMetricsSummary(): Omit<SyncMetrics, 'syncId'> {
    return {
      ...this.metrics,
      avgProcessingTimePerOrder: Math.round(this.metrics.avgProcessingTimePerOrder),
      minProcessingTimePerOrder:
        this.metrics.minProcessingTimePerOrder === Number.MAX_SAFE_INTEGER
          ? 0
          : this.metrics.minProcessingTimePerOrder,
    };
  }

  /**
   * Logs the current metrics to the console
   */
  logMetrics(): void {
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
