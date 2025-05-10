import axios from 'axios';
// Prisma not used in this file directly for this specific change, but keep if used elsewhere.
// import { Prisma } from '@prisma/client'; 
import { shipstationApi } from './client';
import logger from '../logger';
import {
  ShipStationOrder,
  ShipStationOrdersResponse,
  ShipStationTag,
  ShipStationApiParams,
  SyncSummary,
  ShipStationOrderItem,
  ShipStationItemOption
} from './types';

// // CONSTANTS for internal notes truncation (Global versions commented out as they were only used by the global sanitize function)
// const SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH = 10000;
// const SHIPSTATION_INTERNAL_NOTES_TRUNCATION_SUFFIX = '... (truncated)';

// CONSTANTS for dimension conversion
const INCH_TO_CM_FACTOR = 2.54;
const DIMENSION_PRECISION = 2;

// // HELPER FUNCTION to sanitize and truncate internal notes
// function sanitizeAndTruncateShipstationInternalNotes(notes: string): string {
//   // Strip non-printable ASCII characters except for common whitespace (newline, tab, carriage return)
//   // Keeps characters from space (32) to tilde (126), plus tab (9), newline (10), carriage return (13).
//   let sanitizedNotes = notes.replace(/[^\x20-\x7E\x09\x0A\x0D]/g, '');

//   if (sanitizedNotes.length > SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH) {
//     const maxLengthWithoutSuffix = SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH - SHIPSTATION_INTERNAL_NOTES_TRUNCATION_SUFFIX.length;
//     if (maxLengthWithoutSuffix < 0) { // Should not happen if suffix is shorter than max length
//       sanitizedNotes = sanitizedNotes.substring(0, SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH);
//     } else {
//       sanitizedNotes = sanitizedNotes.substring(0, maxLengthWithoutSuffix) + SHIPSTATION_INTERNAL_NOTES_TRUNCATION_SUFFIX;
//     }
//     // Conditional logging to avoid logger dependency if this util is moved to a logger-less context
//     // (assuming logger might not always be available where this function could be used)
//     if (typeof logger !== 'undefined' && logger?.warn) {
//       logger.warn(`[ShipStation API] Internal notes truncated to ${SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH} characters.`);
//     }
//   }
//   return sanitizedNotes;
// }

import { upsertOrderWithItems } from './db-sync';

const MAX_RETRIES = 3;

/**
 * Fetches orders from the ShipStation API with retry logic and improved error handling.
 */
export const getShipstationOrders = async (
  params: ShipStationApiParams = {}
): Promise<ShipStationOrdersResponse> => {
  let attempt = 0;

  // --- TEMPORARILY REMOVED DEFAULT DATE FILTER FOR TESTING ---
  // // Default start date if none provided (modifyDateStart is often useful)
  // if (
  //   !params.modifyDateStart &&
  //   !params.createDateStart &&
  //   !params.orderDateStart
  // ) {
  //   const yesterday = new Date()
  //   yesterday.setDate(yesterday.getDate() - 1)
  //   params.modifyDateStart = yesterday.toISOString()
  //   console.log(`[API] Defaulting to modifyDateStart: ${params.modifyDateStart}`)
  // }
  // --- END REMOVAL ---

  // Ensure pageSize is reasonable, default to 100 (API max might be 500)
  params.pageSize = params.pageSize || 100;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      let response;
      const orderIdToFetch = params.orderId;

      // If a specific orderId is provided, fetch that single order
      if (orderIdToFetch) {
        const endpoint = `/orders/${orderIdToFetch}`;
        console.log(
          `[API] Attempt ${attempt}: Fetching single order from ShipStation: ${endpoint}`
        );
        // Fetch single order - response data is the ShipStationOrder object directly
        response = await shipstationApi.get<ShipStationOrder>(endpoint);

        // Wrap the single order in the expected list response structure
        const singleOrderData = response.data;
        console.log(
          `[API] Fetched single order ${singleOrderData.orderNumber} (ID: ${singleOrderData.orderId}). Status: ${singleOrderData.orderStatus}`
        );
        return {
          orders: [singleOrderData],
          total: 1,
          page: 1,
          pages: 1,
        }; // Return wrapped response
      } else {
        // Otherwise, fetch the list of orders using provided params
        console.log(
          `[API] Attempt ${attempt}: Fetching order list from ShipStation with params:`,
          params
        );
        response = await shipstationApi.get<ShipStationOrdersResponse>(
          '/orders',
          { params } // Pass the original params for filtering/pagination
        );
        console.log(
          `[API] Fetched ${response.data.orders.length} orders from page ${response.data.page}/${response.data.pages}. Total: ${response.data.total}`
        );
        return response.data; // Return list response
      }
    } catch (error: unknown) {
      let errorMessage = '[API] Error fetching ShipStation orders';
      let statusCode: number | string = 'N/A';
      let shouldRetry = false;

      if (axios.isAxiosError(error)) {
        statusCode = error.response?.status ?? 'N/A';
        errorMessage += `. Status: ${statusCode}.`;
        // Log only essential error info, avoid logging potentially large data object in prod
        console.error(`${errorMessage} Attempt ${attempt}. URL: ${error.config?.url}`);
        if (error.response?.data) {
          // Log specific error message from ShipStation if available
          console.error(` -> ShipStation Response: ${JSON.stringify(error.response.data)}`);
        }

        // Retry on common transient errors (rate limits, server errors)
        if (statusCode === 429 || (typeof statusCode === 'number' && statusCode >= 500)) {
          shouldRetry = true;
        }
      } else if (error instanceof Error) {
        errorMessage += `: ${error.message}. Attempt ${attempt}.`;
        console.error(errorMessage, error);
      } else {
        errorMessage += `: Unknown error occurred. Attempt ${attempt}.`;
        console.error(errorMessage, error);
      }

      if (shouldRetry && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff (2s, 4s)
        console.log(`[API] Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Don't retry or max retries reached
        const finalMessage = `${errorMessage}. Max retries reached or non-retryable error.`;
        console.error(`[API] Failed to fetch orders after ${attempt} attempts. ${finalMessage}`);
        // Re-throw the error to be caught by the sync orchestrator
        throw new Error(finalMessage, { cause: error });
      }
    }
  }
  // Should not be reachable due to throw in the loop, but satisfies TypeScript
  throw new Error('[API] Unexpected error state after fetch attempts.');
};

// --- Full Sync Orchestration ---

/**
 * Sync parameters type definition.
 */
interface SyncShipstationParams {
  modifyDateStart?: string;
  orderDateStart?: string; // Added for date range sync
  orderDateEnd?: string; // Added for date range sync
  pageLimit?: number;
  syncAllStatuses?: boolean;
}

/**
 * Fetches and upserts orders, customers, and items within a date range.
 * Orchestrates the synchronization process, handling pagination and errors.
 * @param syncParams - Parameters to control the sync (date range, page limit, status filter - NOTE: syncAllStatuses is now ignored).
 * @returns A summary object detailing the outcome of the sync process.
 */
export const syncShipstationData = async (
  // syncParams: SyncShipstationParams = {} - syncAllStatuses is unused now
  syncParams: Omit<SyncShipstationParams, 'syncAllStatuses'> = {}
): Promise<SyncSummary> => {
  let currentPage = 1;
  let totalPages = 1;
  let ordersSuccessfullyProcessed = 0;
  let ordersFailedToProcess = 0;
  let totalOrdersFetched = 0;
  let ordersSkippedStatus = 0; // Track skipped orders
  const maxPagesToSync = syncParams.pageLimit ?? Infinity; // Default to Infinity if no limit for historical sync
  const syncFailed = false;
  const failureReason = '';

  console.log('Starting ShipStation data synchronization (awaiting_shipment & on_hold)...');

  // Prepare API parameters based on sync options
  const apiParams: ShipStationApiParams = {
    // Default to OrderDate sort for historical sync, ModifyDate otherwise
    sortBy: syncParams.orderDateStart || syncParams.orderDateEnd ? 'OrderDate' : 'ModifyDate',
    sortDir: 'ASC',
    pageSize: 100, // Max efficient page size
    ...(syncParams.modifyDateStart && { modifyDateStart: syncParams.modifyDateStart }),
    ...(syncParams.orderDateStart && { orderDateStart: syncParams.orderDateStart }), // Add date filters
    ...(syncParams.orderDateEnd && { orderDateEnd: syncParams.orderDateEnd }), // Add date filters
    // REMOVED: ...(!syncParams.syncAllStatuses && { orderStatus: 'awaiting_shipment' }),
    // Fetch all statuses from API, filter locally
  };

  // NOTE: The default modifyDateStart logic remains commented out for now

  // Log parameters being used
  console.log('[Sync] Effective API Parameters:', JSON.stringify(apiParams, null, 2));
  console.log(`[Sync] Page limit set to: ${maxPagesToSync === Infinity ? 'None' : maxPagesToSync}`);

  try {
    do {
      console.log(
        `[Sync] Syncing page ${currentPage} of ${totalPages === Infinity ? '?' : totalPages}...`
      );
      const response = await getShipstationOrders({ ...apiParams, page: currentPage });

      if (!response || !response.orders) {
        throw new Error(
          `[Sync] Inconsistent state: Failed to get orders response for page ${currentPage}, but no error thrown.`
        );
      }

      if (currentPage === 1) {
        totalPages = response.pages || Infinity; // Handle potential API differences
        console.log(`[Sync] Total pages reported by API: ${totalPages}`);
      }

      if (response.orders.length === 0) {
        console.log(`[Sync] No more orders found on page ${currentPage}. Ending sync.`);
        break; // Exit loop if API returns empty page
      }

      totalOrdersFetched += response.orders.length;
      console.log(
        `[Sync] Processing ${response.orders.length} orders from page ${currentPage}/${totalPages === Infinity ? '?' : totalPages}...`
      );

      // Filter fetched orders locally for desired statuses BEFORE processing
      const ordersToProcess = response.orders.filter(ssOrder => {
        const shouldProcess = ssOrder.orderStatus === 'awaiting_shipment' || ssOrder.orderStatus === 'on_hold';
        if (!shouldProcess) {
          ordersSkippedStatus++;
          // Optional: Log skipped orders if needed for debugging
          // console.log(`[Sync] Skipping order ${ssOrder.orderNumber} (Status: ${ssOrder.orderStatus})`);
        }
        return shouldProcess;
      });

      console.log(
        `[Sync] -> Filtered to ${ordersToProcess.length} orders with status 'awaiting_shipment' or 'on_hold'.`
      );


      for (const ssOrder of ordersToProcess) { // Iterate over the filtered list
        try {
          // Now process the order (which is guaranteed to be awaiting_shipment or on_hold)
          const result = await upsertOrderWithItems(ssOrder);
          if (result) {
            ordersSuccessfullyProcessed++;
          } else {
            ordersFailedToProcess++;
          }
        } catch (itemProcessingError) {
          console.error(
            `[Sync] Uncaught error processing items for order ${ssOrder.orderNumber} (Status: ${ssOrder.orderStatus}):`,
            itemProcessingError
          );
          ordersFailedToProcess++;
        }
      }

      currentPage++;
      // Avoid infinite loops if totalPages is weird; rely on empty page break
    } while (currentPage <= totalPages && currentPage <= maxPagesToSync);

    // Final summary logic needs adjustment for potentially huge numbers
    const message = syncFailed
      ? `ShipStation sync FAILED: ${failureReason}`
      : `ShipStation sync process completed successfully.`;

    console.log('\n[Sync] Summary:', {
      success: !syncFailed,
      message: message,
      ordersProcessed: ordersSuccessfullyProcessed,
      ordersFailed: ordersFailedToProcess,
      totalOrdersFetched: totalOrdersFetched,
      ordersSkippedDueToStatus: ordersSkippedStatus, // Add skipped count to summary
      pagesSynced: currentPage - 1, // Number of pages actually fetched
      totalPagesAvailable: totalPages === Infinity ? 'Unknown' : totalPages, // Total reported by API
    });

    return {
      success: !syncFailed,
      message: message,
      ordersProcessed: ordersSuccessfullyProcessed,
      ordersFailed: ordersFailedToProcess,
      totalOrdersFetched: totalOrdersFetched,
      pagesSynced: currentPage - 1,
      totalPagesAvailable: totalPages === Infinity ? -1 : totalPages, // Use -1 for unknown
    };
  } catch (error: unknown) {
    console.error('[Sync] Critical error during ShipStation sync:', error);
    // Ensure summary reflects failure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `ShipStation sync FAILED: ${errorMessage}`,
      ordersProcessed: ordersSuccessfullyProcessed,
      ordersFailed: ordersFailedToProcess + (totalOrdersFetched - ordersSuccessfullyProcessed - ordersSkippedStatus), // Estimate remaining as failed
      totalOrdersFetched: totalOrdersFetched,
      pagesSynced: currentPage - 1,
      totalPagesAvailable: totalPages === Infinity ? -1 : totalPages,
    };
  }
};

/**
 * Fetches all tags defined for the ShipStation account.
 * @returns {Promise<ShipStationTag[]>} A promise that resolves to an array of tags.
 */
export async function listTags(): Promise<ShipStationTag[]> {
  console.log('[ShipStation API] Fetching tags...');
  // Use the shipstationApi instance for the request
  const response = await shipstationApi.get<ShipStationTag[]>(
    `/accounts/listtags`
    // GET is the default method for shipstationApi.get, no need to specify
  );
  const tags = response.data; // Extract data from the Axios response
  console.log(`[ShipStation API] Fetched ${tags.length} tags.`);
  return tags;
}

/**
 * Updates the options for a specific order item in ShipStation.
 * Uses the /orders/createorder endpoint which also handles updates.
 * @param shipstationOrderId The ShipStation Order ID.
 * @param lineItemKey The unique key for the order item to update.
 * @param options An array of option objects ({ name: string, value: string | null }).
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
// Removed duplicate import - types are imported at the top

export async function updateOrderItemOptions(
  lineItemKey: string,
  newOptions: Array<{ name: string; value: string | null }>,
  fetchedOrder: ShipStationOrder // Accept the full fetched order object
): Promise<boolean> {
  const endpoint = '/orders/createorder';

  // Map over the fetched items to create the updated items array
  const updatedOrderItems = fetchedOrder.items.map(item => {
    if (item.lineItemKey === lineItemKey) {
      // Return the target item with updated options
      // Keep all original item fields, just override options
      return {
        ...item,
        options: newOptions.filter(opt => opt.value !== null), // Set the new options
      };
    }
    // Return other items unchanged
    return item;
  });

  // Construct payload by spreading the fetched order and overriding items
  const payload = {
    ...fetchedOrder, // Spread all properties from the fetched order
    items: updatedOrderItems, // Override with the modified items array
  };

  // Convert dimensions if they exist and are in inches
  if (
    payload.dimensions &&
    payload.dimensions.units &&
    payload.dimensions.units.toLowerCase() === 'inches' &&
    typeof payload.dimensions.length === 'number' &&
    typeof payload.dimensions.width === 'number' &&
    typeof payload.dimensions.height === 'number'
  ) {
    logger.info(
      `[ShipStation API][Order ${payload.orderId}] Converting dimensions from inches to cm and scaling values for batch update.`
    );
    payload.dimensions = {
      units: 'cm',
      length: parseFloat(
        (payload.dimensions.length * INCH_TO_CM_FACTOR).toFixed(
          DIMENSION_PRECISION
        )
      ),
      width: parseFloat(
        (payload.dimensions.width * INCH_TO_CM_FACTOR).toFixed(
          DIMENSION_PRECISION
        )
      ),
      height: parseFloat(
        (payload.dimensions.height * INCH_TO_CM_FACTOR).toFixed(
          DIMENSION_PRECISION
        )
      ),
    };
  } else if (
    payload.dimensions &&
    payload.dimensions.units &&
    payload.dimensions.units.toLowerCase() === 'inches'
  ) {
    // If conversion can't happen due to missing numeric properties but units are inches, set to null to avoid sending invalid partial data
    logger.warn(
      `[ShipStation API][Order ${payload.orderId}] Original dimensions in inches but one or more numeric dimension properties (length, width, height) are missing or not numbers. Setting dimensions to null for the API call.`
    );
    payload.dimensions = null;
  }

  // Ensure orderId is a number if it exists (it should)
  if (payload.orderId) {
    payload.orderId = Number(payload.orderId);
  }

  // Remove potentially problematic fields if necessary (optional, based on testing)
  // delete payload.createDate;
  // delete payload.modifyDate;
  // delete payload.orderTotal; // API might recalculate this

  console.log(
    `[ShipStation API] Updating options for item ${lineItemKey} in order ${fetchedOrder.orderId} (Order Number: ${fetchedOrder.orderNumber})...`
  );
  // Log the payload being sent for debugging (optional, remove sensitive data if needed)
  // logger.debug({ payload }, `[ShipStation API] Update Payload for order ${fetchedOrder.orderId}`);
  try {
    // Log the payload before sending
    console.log('[ShipStation API] Sending payload:', JSON.stringify(payload, null, 2));
    const response = await shipstationApi.post(endpoint, payload);
    if (response.status === 200 || response.status === 201) {
      console.log(
        `[ShipStation API] Successfully updated options for item ${lineItemKey} in order ${fetchedOrder.orderId}.`
      );
      return true;
    } else {
      console.warn(
        `[ShipStation API] Unexpected status code ${response.status} when updating item options for order ${fetchedOrder.orderId}.`
      );
      return false;
    }
  } catch (error: unknown) {
    let errorMessage = `[ShipStation API] Error updating item options for item ${lineItemKey} in order ${fetchedOrder.orderId}`;
    if (axios.isAxiosError(error)) {
      errorMessage += `. Status: ${error.response?.status ?? 'N/A'}`;
      if (error.response?.data) {
        errorMessage += ` Response: ${JSON.stringify(error.response.data)}`;
      }
    } else if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }
    console.error(errorMessage, error);
    return false;
  }
}

// Removed addInternalOrderNote function.

// Helper to construct full URL
// ... existing code ...

export async function updateOrderItemsOptionsBatch(
  // `fetchedOrder` is the order data as it was known by the calling function.
  // It might be slightly stale, which is why we fetch a fresh copy.
  fetchedOrder: ShipStationOrder,
  itemsToPatch: Record<string, Array<{ name: string; value: string | null }>>,
  auditNote: string | null = null,
  dimensionsInput: { units: string; length: number; width: number; height: number } | null = null,
  customerNotes?: string | null
): Promise<boolean> {
  const endpoint = '/orders/createorder';

  // Define constants and helper function locally within this function scope
  const SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH = 10000;
  const SHIPSTATION_INTERNAL_NOTES_TRUNCATION_SUFFIX = '... (truncated)';

  function sanitizeAndTruncateShipstationInternalNotes(notes: string): string {
    // Strip non-printable ASCII
    let sanitizedNotes = notes.replace(/[^\x20-\x7E\x09\x0A\x0D]/g, '');
    if (sanitizedNotes.length > SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH) {
      const maxLengthWithoutSuffix = SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH - SHIPSTATION_INTERNAL_NOTES_TRUNCATION_SUFFIX.length;
      if (maxLengthWithoutSuffix < 0) {
        sanitizedNotes = sanitizedNotes.substring(0, SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH);
      } else {
        sanitizedNotes = sanitizedNotes.substring(0, maxLengthWithoutSuffix) + SHIPSTATION_INTERNAL_NOTES_TRUNCATION_SUFFIX;
      }
      logger.warn(
        `[ShipStation API][Order ${fetchedOrder.orderId}] Internal notes truncated to ${SHIPSTATION_INTERNAL_NOTES_MAX_LENGTH} characters.`
      );
    }
    return sanitizedNotes;
  }

  let freshlyFetchedOrder: ShipStationOrder;
  try {
    logger.info(`[ShipStation API] Fetching latest order data for orderId ${fetchedOrder.orderId} before batch update.`);
    const response = await getShipstationOrders({ orderId: fetchedOrder.orderId });
    if (!response.orders || response.orders.length === 0) {
      logger.error(`[ShipStation API] Failed to fetch fresh order data for orderId ${fetchedOrder.orderId}. Aborting update.`);
      return false;
    }
    freshlyFetchedOrder = response.orders[0];
    logger.info(
      `[ShipStation API - DEBUG] Original FRESHLY fetched order data for orderId ${freshlyFetchedOrder.orderId} BEFORE any modification:\n ${JSON.stringify(freshlyFetchedOrder, null, 2)}`
    );
  } catch (fetchError) {
    logger.error(`[ShipStation API] Error fetching fresh order data for orderId ${fetchedOrder.orderId}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}. Aborting update.`);
    return false;
  }


  // Map itemsToPatch to the structure ShipStation expects, using freshlyFetchedOrder's items as a base
  const updatedOrderItems = freshlyFetchedOrder.items.map(item => {
    const patchOptions = itemsToPatch[item.lineItemKey || ''];
    if (patchOptions) {
      // If new options are provided for this lineItemKey, process them to ensure compatibility
      const SSpatchOptions: ShipStationItemOption[] = patchOptions
        .map(opt => ({
          name: opt.name,
          value: opt.value === null ? "" : opt.value, // Convert null to empty string
        }))
      // .filter(opt => typeof opt.value === 'string'); // Ensure value is string (already handled by above)
      return { ...item, options: SSpatchOptions };
    }
    // Otherwise, keep the item as it is from the fresh fetch
    return item;
  });

  // Sanitize internal notes before sending
  const sanitizedAuditNote = auditNote ? sanitizeAndTruncateShipstationInternalNotes(auditNote) : null;

  // Construct payload by spreading the FRESHLY fetched order and overriding specific fields
  const payload: ShipStationOrder = { // Using ShipStationOrder type
    ...freshlyFetchedOrder,
    items: updatedOrderItems,
    internalNotes: sanitizedAuditNote, // Use sanitized notes
    // customerNotes will be added below
    customerNotes: null, // Initialize customerNotes, will be set below
  };

  // Handle customerNotes: if provided and not empty, add to payload; otherwise, send null to potentially clear it.
  if (customerNotes && customerNotes.trim() !== "") {
    payload.customerNotes = customerNotes;
  } else {
    payload.customerNotes = null; // Send null to clear or if no customer notes are intended
  }

  // Dimension handling (using dimensionsInput, which is the 'dimensions' from the calling function)
  // This logic assumes 'dimensionsInput' is what the CALLER wants to set.
  // It might override freshlyFetchedOrder.dimensions or convert them.

  if (dimensionsInput !== undefined) { // Check if dimensionsInput was explicitly passed
    payload.dimensions = dimensionsInput; // Directly use the input from the function call

    // Apply conversion if units are in inches and numeric properties are valid on dimensionsInput
    if (
      payload.dimensions && // Ensure dimensions is not null from the assignment above
      payload.dimensions.units &&
      payload.dimensions.units.toLowerCase() === 'inches' &&
      typeof payload.dimensions.length === 'number' &&
      typeof payload.dimensions.width === 'number' &&
      typeof payload.dimensions.height === 'number'
    ) {
      const scaledLength = payload.dimensions.length * INCH_TO_CM_FACTOR;
      const scaledWidth = payload.dimensions.width * INCH_TO_CM_FACTOR;
      const scaledHeight = payload.dimensions.height * INCH_TO_CM_FACTOR;

      // Check if any converted dimension becomes effectively zero after precision
      if (
        parseFloat(scaledLength.toFixed(DIMENSION_PRECISION)) === 0.00 ||
        parseFloat(scaledWidth.toFixed(DIMENSION_PRECISION)) === 0.00 ||
        parseFloat(scaledHeight.toFixed(DIMENSION_PRECISION)) === 0.00
      ) {
        logger.warn(
          `[ShipStation API][Order ${payload.orderId}] Original Inch Dimensions: L ${payload.dimensions.length}, W ${payload.dimensions.width}, H ${payload.dimensions.height}. At least one converted dimension is zero after precision, sending null for dimensions.`
        );
        payload.dimensions = null; // Send null if any dimension effectively becomes zero
      } else {
        logger.info(
          `[ShipStation API][Order ${payload.orderId}] Converting dimensions from inches to cm and scaling values for batch update.`
        );
        payload.dimensions = {
          units: 'cm',
          length: parseFloat(scaledLength.toFixed(DIMENSION_PRECISION)),
          width: parseFloat(scaledWidth.toFixed(DIMENSION_PRECISION)),
          height: parseFloat(scaledHeight.toFixed(DIMENSION_PRECISION)),
        };
        logger.info(
          `[ShipStation API][Order ${payload.orderId}] Sending cm: L ${payload.dimensions.length}, W ${payload.dimensions.width}, H ${payload.dimensions.height}`
        );
      }
    }
  } else {
    // If dimensionsInput was not provided, retain dimensions from freshlyFetchedOrder (already in payload via spread)
    // No conversion or nullification needed here as we respect the fetched state.
    logger.info(`[ShipStation API][Order ${payload.orderId}] No dimensionsInput provided, retaining dimensions from fresh fetch.`);
  }


  try {
    logger.info(
      `[ShipStation API] Attempting batch update for order ${freshlyFetchedOrder.orderNumber} (ID: ${freshlyFetchedOrder.orderId}). Payload includes updates for ${updatedOrderItems.length} item(s), internal notes, customer notes, and possibly dimensions.`
    );
    // Log the payload before sending, ensure sensitive data is masked if necessary
    // For debugging, let's see the notes and dimension parts:
    logger.debug(`[ShipStation API] Sending PAYLOAD to /orders/createorder: ${JSON.stringify({
      orderId: payload.orderId,
      items: payload.items.map((i: ShipStationOrderItem) => ({ // Typed item as ShipStationOrderItem
        lineItemKey: i.lineItemKey,
        options: i.options
      })),
      internalNotes: payload.internalNotes,
      customerNotes: payload.customerNotes,
      dimensions: payload.dimensions
    }, null, 2)}`);


    const response = await shipstationApi.post(endpoint, payload);

    console.log(`[ShipStation API Response Details][Order ${payload.orderId}] Status: ${response.status} ${response.statusText}`);
    // Log only a subset of headers if too verbose, or stringify carefully
    // console.log(`[ShipStation API Response Details][Order ${payload.orderId}] Headers:`, JSON.stringify(response.headers, null, 2));
    console.log(`[ShipStation API Response Details][Order ${payload.orderId}] Data:`, JSON.stringify(response.data, null, 2));

    if (response.status === 200 || response.status === 201) {
      console.log(`[ShipStation API] Batch update SUCCESS for order ${payload.orderId}.`);
      // Verify if the response data actually reflects the changes
      const responseOrder = response.data as ShipStationOrder;
      if (JSON.stringify(responseOrder.internalNotes) !== JSON.stringify(payload.internalNotes)) {
        console.warn(`[ShipStation API] WARNING: internalNotes in response does not match sent payload for order ${payload.orderId}.`);
      }
      if (JSON.stringify(responseOrder.dimensions) !== JSON.stringify(payload.dimensions)) {
        console.warn(`[ShipStation API] WARNING: dimensions in response does not match sent payload for order ${payload.orderId}.`);
      }
      // Add similar check for item options if feasible (more complex due to array and object comparison)

      return true;
    }

    console.warn(
      `[ShipStation API] Batch update UNEXPECTED STATUS ${response.status} for order ${payload.orderId}. Full response details logged above.`
    );
    return false;

  } catch (error: unknown) {
    let msg = `[ShipStation API] FATAL ERROR during batch update POST for order ${payload.orderId}`;
    if (axios.isAxiosError(error)) {
      msg += `. Status: ${error.response?.status ?? 'N/A'}`;
      console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Full Axios Error:`, error);
      if (error.response) {
        msg += ` Response: ${JSON.stringify(error.response.data)}`;
        console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Response Status: ${error.response.status} ${error.response.statusText}`);
        console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Response Headers:`, JSON.stringify(error.response.headers, null, 2));
        console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Response Data:`, JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Request made but no response received:`, error.request);
      } else {
        console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Error setting up request: ${error.message}`);
      }
    } else if (error instanceof Error) {
      msg += `: ${error.message}`;
      console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Non-Axios Error:`, error);
    } else {
      console.error(`[ShipStation API Error Details][Order ${payload.orderId}] Unknown error object:`, error);
    }
    console.error(msg);
    return false;
  }
}
