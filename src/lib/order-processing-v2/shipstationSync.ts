// src/lib/order-processing-v2/shipstationSync.ts

import { getLogger } from './logger';
import type { OrderDebugInfoV2, ProcessingOptionsV2, ShipstationUpdatePayload } from './types';
import { getShipstationOrders, updateOrderItemsOptionsBatch } from '../shared/shipstation'; // Use existing functions

/**
 * Updates ShipStation item options based on successfully extracted Amazon data.
 * Checks order status before attempting updates and skips shipped/fulfilled orders.
 * @param shipstationOrderId - The ShipStation Order ID.
 * @param shipstationOrderNumber - The ShipStation Order Number (for logging).
 * @param itemsToUpdate - A map where keys are shipstationLineItemKeys and values are the options to apply.
 * @param options - Processing options, including dryRun and confirm flags.
 * @param orderDebugInfo - The debug object to update with processing status.
 * @returns A promise resolving to true if the update was attempted/successful (or skipped appropriately), false on error.
 */
export async function syncAmazonDataToShipstation(
    shipstationOrderId: string | null | undefined,
    shipstationOrderNumber: string | null | undefined,
    itemsToUpdate: ShipstationUpdatePayload,
    options: Pick<ProcessingOptionsV2, 'dryRun' | 'confirm'>,
    orderDebugInfo: OrderDebugInfoV2 // Pass the main debug object
): Promise<boolean> {
    const logger = getLogger();
    const orderIdForLog = orderDebugInfo.orderId; // Use DB ID for internal logging consistency
    const ssOrderNumForLog = shipstationOrderNumber ?? 'N/A';
    const ssOrderIdForLog = shipstationOrderId ?? 'N/A';
    orderDebugInfo.shipstationItemsToUpdateCount = Object.keys(itemsToUpdate).length;

    if (!shipstationOrderId) {
        logger.warn(`[ShipstationSync][Order ${orderIdForLog}] Skipping sync: Missing ShipStation Order ID.`);
        orderDebugInfo.shipstationSyncStatus = 'Skipped (Missing SS Order ID)';
        return true; // Not an error, just skipped
    }

    if (Object.keys(itemsToUpdate).length === 0) {
        logger.info(`[ShipstationSync][Order ${orderIdForLog}] No items with successful Amazon extraction data to sync.`);
        orderDebugInfo.shipstationSyncStatus = 'Skipped (No Data)';
        return true; // Nothing to do
    }

    logger.info(
        `[ShipstationSync][Order ${orderIdForLog}] Preparing to sync ${Object.keys(itemsToUpdate).length
        } item(s) with Amazon data to ShipStation Order ID ${ssOrderIdForLog} (Number: ${ssOrderNumForLog}).`
    );
    orderDebugInfo.shipstationSyncStatus = 'Fetching Order Status';

    try {
        // 1. Fetch the order from ShipStation to check its status
        const ssOrderResponse = await getShipstationOrders({ orderId: Number(shipstationOrderId) });

        if (!ssOrderResponse || !ssOrderResponse.orders || ssOrderResponse.orders.length === 0) {
            logger.error(`[ShipstationSync][Order ${orderIdForLog}] Failed to fetch order details from ShipStation (ID: ${ssOrderIdForLog}). Cannot check status.`);
            orderDebugInfo.shipstationSyncStatus = 'Failed (Fetch Error)';
            orderDebugInfo.processingError = `Failed to fetch SS order ${ssOrderIdForLog}`;
            return false;
        }

        const ssOrder = ssOrderResponse.orders[0];
        const orderStatusLower = ssOrder.orderStatus?.toLowerCase();

        // 2. Check if the order is shipped or fulfilled
        if (orderStatusLower === 'shipped' || orderStatusLower === 'fulfilled') {
            logger.warn(
                `[ShipstationSync][Order ${orderIdForLog}] ⚠️ SKIPPING UPDATE: Order ${ssOrderNumForLog} (ID: ${ssOrderIdForLog}) is already marked as "${ssOrder.orderStatus}" in ShipStation. Updates will likely be ignored.`
            );
            orderDebugInfo.shipstationSyncStatus = `Skipped (Status: ${ssOrder.orderStatus})`;
            // Potentially prompt user if not using --confirm, though this might be better handled in the orchestrator
            // if (!options.confirm) { ... }
            return true; // Skipped due to status, not an error in our process
        }

        // 3. Proceed with the update if not shipped/fulfilled
        logger.info(`[ShipstationSync][Order ${orderIdForLog}] Order status is "${ssOrder.orderStatus}". Proceeding with update.`);
        orderDebugInfo.shipstationSyncStatus = 'Attempting Update';

        if (options.dryRun) {
            logger.info(`[Dry Run][ShipstationSync][Order ${orderIdForLog}] Would update ${Object.keys(itemsToUpdate).length} items in ShipStation order ${ssOrderIdForLog}.`);
            orderDebugInfo.shipstationSyncStatus = 'Dry Run Skipped';
            orderDebugInfo.shipstationUpdateResult = true; // Simulate success for dry run
            return true;
        } else {
            const patchReasons = Object.keys(itemsToUpdate).map(key => `${key}(AmazonURL)`);
            const auditNote = `V2 Task sync ${new Date().toISOString()} -> ${patchReasons.join(', ')}`;

            const success = await updateOrderItemsOptionsBatch(ssOrder, itemsToUpdate, auditNote);

            if (success) {
                logger.info(`[ShipstationSync][Order ${orderIdForLog}] Successfully updated items in ShipStation: ${patchReasons.join(', ')}`);
                orderDebugInfo.shipstationSyncStatus = 'Success';
                orderDebugInfo.shipstationUpdateResult = true;
                return true;
            } else {
                logger.error(`[ShipstationSync][Order ${orderIdForLog}] Failed to update items in ShipStation order ${ssOrderIdForLog}.`);
                orderDebugInfo.shipstationSyncStatus = 'Failed (API Error)';
                orderDebugInfo.shipstationUpdateResult = false;
                // Don't set processingError here unless we want it to halt the whole order
                return false; // Indicate failure
            }
        }
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[ShipstationSync][Order ${orderIdForLog}] Error during ShipStation sync process: ${errorMsg}`, error);
        orderDebugInfo.shipstationSyncStatus = 'Failed (Exception)';
        orderDebugInfo.shipstationUpdateResult = false;
        // Don't set processingError here unless we want it to halt the whole order
        return false; // Indicate failure
    }
}
