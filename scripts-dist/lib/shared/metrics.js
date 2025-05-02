// filepath: /workspaces/Y3DHub/src/lib/shared/metrics.ts
// import { prisma } from "./database"; // Commented out until DB saving is implemented
import { getLogger } from './logging';
const logger = getLogger('metrics');
// Basic implementation that logs metrics to the console and potentially stores them
// TODO: Implement actual storage (e.g., in a database table or time-series DB)
class BasicMetricsCollector {
    async recordMetric(metric) {
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
export const metricsCollector = new BasicMetricsCollector();
// Helper function to easily record a metric
export const recordMetric = async (metric) => {
    await metricsCollector.recordMetric(metric);
};
