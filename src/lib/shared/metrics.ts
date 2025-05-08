// filepath: /workspaces/Y3DHub/src/lib/shared/metrics.ts
// import { prisma } from "./database"; // Commented out until DB saving is implemented
import { getLogger } from './logging';

const logger = getLogger('metrics');

// Define the structure for a metric record
export interface Metric {
  name: string; // e.g., 'order_sync_duration_ms', 'shipstation_api_call'
  value: number; // The numeric value of the metric
  tags?: Record<string, string>; // Optional key-value pairs for context (e.g., { status: 'success', mode: 'recent' })
  timestamp?: Date; // Timestamp of the metric event, defaults to now
}

// Interface for a metrics collector service
export interface MetricsCollector {
  recordMetric: (_metric: Metric) => Promise<void>;
  // Add more specific metric recording methods as needed
  // e.g., recordApiCall(service: string, endpoint: string, durationMs: number, success: boolean): Promise<void>;
}

// Basic implementation that logs metrics to the console and potentially stores them
// TODO: Implement actual storage (e.g., in a database table or time-series DB)
class BasicMetricsCollector implements MetricsCollector {
  async recordMetric(metric: Metric): Promise<void> {
    const metricRecord = {
      ...metric,
      timestamp: metric.timestamp ?? new Date(),
    };

    // Log the metric
    logger.info(`Metric recorded: ${metric.name}=${metric.value}`, metricRecord);

    // Placeholder for storing metrics in the database
    // try {
    //   await prisma.metric.create({
    //     data: {
    //       name: metricRecord.name,
    //       value: metricRecord.value,
    //       tags: metricRecord.tags ? JSON.stringify(metricRecord.tags) : undefined,
    //       timestamp: metricRecord.timestamp,
    //     },
    //   });
    // } catch (error) {
    //   logger.error('Failed to save metric to database', { error, metric: metricRecord });
    // }
  }
}

// Export a singleton instance of the metrics collector
export const metricsCollector: MetricsCollector = new BasicMetricsCollector();

// Helper function to easily record a metric
export const recordMetric = async (metric: Metric): Promise<void> => {
  await metricsCollector.recordMetric(metric);
};
