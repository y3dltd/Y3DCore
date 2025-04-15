// Barrel file for ShipStation integration
import { shipstationApi } from "./client";
// Import DB functions including syncShipStationTags
import {
  getLastSyncTimestamp,
  upsertOrderWithItems,
  syncShipStationTags,
} from "./db-sync";
import logger from "../logger"; // Import logger (adjust path)
import { MetricsCollector } from "./metrics";
import {
  createSyncProgress,
  updateSyncProgress,
  markSyncCompleted,
  incrementProcessedOrders,
  incrementFailedOrders,
  updateLastProcessedOrder,
} from "./sync-progress";
import type { ShipStationOrder } from "./types"; // Import ShipStationOrder type
import { getShipstationOrders } from "./api"; // Import getShipstationOrders

export * from "./types";
export * from "./api";
export * from "./client"; // Re-export client functions
export * from "./metrics";
export * from "./sync-progress";
export { syncShipStationTags }; // Re-export syncShipStationTags

// Define SyncOptions type if not already defined elsewhere
export interface SyncOptions {
  dryRun?: boolean;
}

// Constants for pagination and rate limiting
const PAGE_SIZE = 100; // Orders per API call (adjust as needed, max 500)
const DELAY_MS = 1500; // Delay between API calls (adjust based on rate limits)

/**
 * Performs a full sync of ShipStation orders, fetching pages based on the last
 * successfully synced order's modification date, unless overridden.
 * Enhanced with progress tracking and metrics collection.
 */
export async function syncAllPaginatedOrders(
  // Optional: Allow overriding the start date, ignoring the checkpoint
  overrideStartDate?: string,
  // Optional: Keep default start date if no override and no checkpoint
  defaultStartDate: string = "2022-01-01T00:00:00.000Z",
  // Add SyncOptions parameter
  options?: SyncOptions
): Promise<{
  success: boolean;
  ordersProcessed: number;
  ordersFailed: number;
}> {
  // Corrected return type
  let ordersProcessed = 0;
  let ordersFailed = 0;
  let success = true; // Assume success initially
  let page = 1;
  let totalPages = Infinity; // Initialize to infinity, update on first page

  const progressId = await createSyncProgress("full");
  const metrics = new MetricsCollector(progressId); // Pass progressId to MetricsCollector

  try {
    // Determine start date
    const startDate =
      overrideStartDate ??
      (
        (await getLastSyncTimestamp()) ?? new Date(defaultStartDate)
      ).toISOString();
    logger.info(
      `[Full Sync] Starting sync for orders modified since: ${startDate}`
    );

    await updateSyncProgress(progressId, { status: "running" }); // Initial status update

    while (page <= totalPages && success) {
      // Ensure loop stops on error
      try {
        logger.info(`[Full Sync] Fetching page ${page}...`);
        const response = await getShipstationOrders({
          modifyDateStart: startDate,
          sortBy: "ModifyDate",
          sortDir: "ASC",
          pageSize: PAGE_SIZE,
          page: page,
        });
        metrics.recordApiCall();

        const { orders, pages, total } = response;
        // Update totalPages only once on the first page
        if (page === 1) {
          totalPages = pages ?? Infinity; // Use reported pages or fallback
          logger.info(
            `[Full Sync] Total pages reported: ${totalPages === Infinity ? "Unknown" : totalPages}`
          );
          if (total) {
            await updateSyncProgress(progressId, { totalOrders: total });
          }
        }

        if (orders && orders.length > 0) {
          logger.info(
            `[Full Sync] Processing ${orders.length} orders from page ${page}...`
          );

          // Process each order
          for (const orderData of orders) {
            metrics.startOrderProcessing(orderData.orderId.toString());

            try {
              // Remove progressId from upsertOrderWithItems call
              // Pass options to upsertOrderWithItems
              const result = await upsertOrderWithItems(orderData, options);

              metrics.recordOrderProcessed(
                orderData.orderId.toString(),
                result.success,
                result.itemsProcessed,
                result.itemsFailed
              );

              if (result.success) {
                ordersProcessed++;
                await incrementProcessedOrders(progressId);

                // Update last processed order info
                // Handle potentially undefined modifyDate
                const modifyDateValue = orderData.modifyDate; // Keep as string | undefined
                if (!modifyDateValue) {
                  logger.warn(
                    `[Full Sync] Order ${orderData.orderNumber} (SS_ID: ${orderData.orderId}) has undefined modifyDate. Using current time for lastProcessedOrder update.`
                  );
                  // Use current time directly for updateLastProcessedOrder
                  await updateLastProcessedOrder(
                    progressId,
                    orderData.orderId.toString(),
                    new Date() // Use current time
                  );
                } else {
                  // Only create Date if modifyDateValue is valid
                  const modifyDate = new Date(modifyDateValue);
                  await updateLastProcessedOrder(
                    progressId,
                    orderData.orderId.toString(),
                    modifyDate
                  );
                }
              } else {
                ordersFailed++;
                await incrementFailedOrders(progressId);
                logger.warn(
                  `[Full Sync] Order ${orderData.orderNumber} failed: ${result.errors.map((e) => e.error).join(", ")}`
                );
              }
            } catch (orderError) {
              // This catch block handles errors specifically from upsertOrderWithItems or metric recording
              ordersFailed++;
              await incrementFailedOrders(progressId);
              const errorMsg =
                orderError instanceof Error
                  ? orderError.message
                  : String(orderError);
              logger.error(
                `[Full Sync] Error processing order ${orderData.orderNumber}: ${errorMsg}`,
                { error: orderError }
              );
              // Optionally mark the entire sync as failed here, or let it continue
              // success = false; // Uncomment to stop sync on first order processing error
            }
          } // End order loop

          // Update overall progress after processing the page
          await updateSyncProgress(progressId, {
            processedOrders: ordersProcessed,
            failedOrders: ordersFailed,
            // lastProcessedTimestamp can be updated here if needed, using the last order's modifyDate
          });

          page++;
        } else {
          // If no orders are returned, we've reached the end for the current filters
          logger.info(
            `[Full Sync] No orders returned on page ${page}. Ending sync for this run.`
          );
          break; // Exit the while loop
        }

        // Keep the delay before the next iteration
        if (page <= totalPages) {
          // Only delay if there might be more pages
          logger.info(
            `[Full Sync] Waiting ${DELAY_MS / 1000}s before fetching page ${page}...`
          );
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
      } catch (error: unknown) {
        // This catch block handles errors from getShipstationOrders or page-level issues
        success = false; // Mark sync as failed
        let errorMessage = "Unknown error during page fetch/process";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        logger.error(
          `[Full Sync] Error fetching or processing page ${page}: ${errorMessage}`,
          { error }
        );
        // Log details if it's an Axios error (optional, based on getShipstationOrders implementation)
        break; // Exit the while loop on error
      }
    } // End while loop

    // Final success/failure logging
    if (success) {
      logger.info(
        `[Full Sync] ShipStation full order sync completed successfully. Processed: ${ordersProcessed}, Failed: ${ordersFailed}`
      );
    } else {
      logger.error(
        `[Full Sync] ShipStation full order sync failed. Processed: ${ordersProcessed}, Failed: ${ordersFailed}`
      );
    }

    // Mark progress as completed or failed
    await markSyncCompleted(
      progressId,
      success,
      success ? undefined : "Sync failed during page processing."
    );
    // Save metrics
    await metrics.saveMetrics();

    // Ensure the function returns the correct structure
    return { success, ordersProcessed, ordersFailed };
  } catch (error) {
    // This catch block handles errors during initial setup (e.g., createSyncProgress, initial date fetch)
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Full Sync] Unexpected error in sync setup: ${errorMsg}`, {
      error,
    });

    // Attempt to save metrics even on setup failure
    try {
      await metrics.saveMetrics();
    } catch /* istanbul ignore next */ {
      // Ignore metrics saving error here
      logger.error(`[Full Sync] Failed to save metrics during setup error.`);
    }

    // Attempt to mark progress as failed
    try {
      // Ensure progressId exists before trying to mark completion
      if (progressId) {
        await markSyncCompleted(
          progressId,
          false,
          `Sync setup failed: ${errorMsg}`
        );
      } else {
        logger.error(
          `[Full Sync] Cannot mark progress as failed - progressId is missing.`
        );
      }
    } catch /* istanbul ignore next */ {
      // Ignore progress marking error here
      logger.error(
        `[Full Sync] Failed to mark progress as failed during setup error.`
      );
    }

    // Ensure the function returns the correct structure on error
    return { success: false, ordersProcessed, ordersFailed }; // Return failure state
  }
}

/**
 * Syncs recent orders from ShipStation (orders created within the specified number of days)
 * @param lookbackDays Number of days to look back (can be fractional, e.g., 0.5 for 12 hours)
 */
export async function syncRecentOrders(
  lookbackDays: number = 2,
  // Add SyncOptions parameter
  options?: SyncOptions
): Promise<{
  success: boolean;
  ordersProcessed: number;
  ordersFailed: number;
}> {
  // Note: This function now primarily acts as a wrapper around syncAllPaginatedOrders
  // It creates its own progress record for tracking the 'recent' sync type specifically.
  const progressId = await createSyncProgress("recent");
  // Metrics are handled within syncAllPaginatedOrders, but we might want high-level logging here.

  try {
    const now = new Date();
    const startDate = new Date(
      now.getTime() - lookbackDays * 24 * 60 * 60 * 1000
    );
    const dateStartFilter = startDate.toISOString();

    // Format the lookback period for logging
    const lookbackPeriod =
      lookbackDays >= 1
        ? `${lookbackDays} days`
        : `${Math.round(lookbackDays * 24)} hours`;
    logger.info(
      `[Recent Sync] Starting sync for orders in the last ${lookbackPeriod} (since ${dateStartFilter})`
    );

    // Update progress with start info (optional, as syncAllPaginatedOrders updates its own)
    await updateSyncProgress(progressId, {
      status: "running",
      // We don't know totalOrders yet, syncAllPaginatedOrders will update its record
    });

    // Use the full sync function with the calculated start date
    // syncAllPaginatedOrders handles its own progress marking and metrics saving.
    // Pass options to syncAllPaginatedOrders
    const result = await syncAllPaginatedOrders(
      dateStartFilter,
      undefined,
      options
    );

    // Update *this* progress record based on the result of the underlying sync
    await markSyncCompleted(
      progressId,
      result.success,
      result.success ? undefined : "Recent sync failed."
    );
    // Optionally update processed/failed counts on this record too
    await updateSyncProgress(progressId, {
      processedOrders: result.ordersProcessed,
      failedOrders: result.ordersFailed,
      // totalOrders might be available if syncAllPaginatedOrders could return it
    });

    logger.info(
      `[Recent Sync] Completed. Success: ${result.success}, Processed: ${result.ordersProcessed}, Failed: ${result.ordersFailed}`
    );
    return result;
  } catch (error) {
    // This catches errors specific to the setup of syncRecentOrders (e.g., date calculation)
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      `[Recent Sync] Unexpected error in sync process setup: ${errorMsg}`,
      { error }
    );

    // Mark *this* progress record as failed
    try {
      await markSyncCompleted(
        progressId,
        false,
        `Recent sync setup failed: ${errorMsg}`
      );
    } catch /* istanbul ignore next */ {
      // Ignore progress marking error
      logger.error(
        `[Recent Sync] Failed to mark progress as failed during setup error.`
      );
    }

    // Return consistent failure structure
    return { success: false, ordersProcessed: 0, ordersFailed: 0 };
  }
}

/**
 * Syncs a single order from ShipStation by its ID
 */
export async function syncSingleOrder(
  orderId: string, // Assuming orderId is the ShipStation Order ID (string)
  // Add SyncOptions parameter
  options?: SyncOptions
): Promise<{ success: boolean; error?: string }> {
  const progressId = await createSyncProgress("single");
  const metrics = new MetricsCollector(progressId); // Pass progressId

  try {
    logger.info(`[Single Order Sync] Fetching order ${orderId}...`);
    await updateSyncProgress(progressId, { status: "running", totalOrders: 1 });

    // Fetch the single order
    const response = await shipstationApi.get<ShipStationOrder>(
      `/orders/${orderId}`
    );
    metrics.recordApiCall();

    if (!response.data) {
      throw new Error(`Order ${orderId} not found in ShipStation.`);
    }

    const orderData = response.data;
    const orderNumber = orderData.orderNumber; // Get orderNumber for logging/metrics if needed

    // Use string orderId for metrics processing
    metrics.startOrderProcessing(orderId);

    logger.info(
      `[Single Order Sync] Processing order ${orderId} (${orderNumber})...`
    );

    // Remove progressId from upsertOrderWithItems call
    // Pass options to upsertOrderWithItems
    const result = await upsertOrderWithItems(orderData, options);

    // Use string orderId for metrics recording
    metrics.recordOrderProcessed(
      orderId,
      result.success,
      result.itemsProcessed,
      result.itemsFailed
    );

    if (result.success) {
      logger.info(`[Single Order Sync] Successfully synced order ${orderId}`);
      await incrementProcessedOrders(progressId);

      // Use string orderId for updating last processed order
      await updateLastProcessedOrder(
        progressId,
        orderId,
        new Date() // Use current time for single sync
      );

      await markSyncCompleted(progressId, true);
      await metrics.saveMetrics();
      return { success: true };
    } else {
      const errorMsg = result.errors.map((e) => e.error).join(", ");
      logger.error(
        `[Single Order Sync] Failed to sync order ${orderId}: ${errorMsg}`
      );

      await incrementFailedOrders(progressId);
      await markSyncCompleted(progressId, false, errorMsg);
      await metrics.saveMetrics();
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      `[Single Order Sync] Error syncing order ${orderId}: ${errorMsg}`,
      { error }
    );

    // Attempt to save metrics even on failure
    try {
      await metrics.saveMetrics();
    } catch /* istanbul ignore next */ {
      // Ignore metrics saving error
      logger.error(`[Single Order Sync] Failed to save metrics during error.`);
    }

    // Attempt to mark progress as failed
    try {
      await markSyncCompleted(progressId, false, errorMsg);
    } catch /* istanbul ignore next */ {
      // Ignore progress marking error
      logger.error(
        `[Single Order Sync] Failed to mark progress as failed during error.`
      );
    }

    return { success: false, error: errorMsg };
  }
}
