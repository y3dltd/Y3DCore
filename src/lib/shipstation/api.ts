import axios from 'axios';

import { shipstationApi } from './client';
import { upsertOrderWithItems } from './db-sync';
import type {
  ShipStationApiParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Type is used implicitly in loop
  ShipStationOrder,
  ShipStationOrdersResponse,
  ShipStationTag,
  SyncSummary,
} from './types';

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
 * @param syncParams - Parameters to control the sync (date range, page limit, status filter).
 * @returns A summary object detailing the outcome of the sync process.
 */
export const syncShipstationData = async (
  syncParams: SyncShipstationParams = {}
): Promise<SyncSummary> => {
  let currentPage = 1;
  let totalPages = 1;
  let ordersSuccessfullyProcessed = 0;
  let ordersFailedToProcess = 0;
  let totalOrdersFetched = 0;
  const maxPagesToSync = syncParams.pageLimit ?? Infinity; // Default to Infinity if no limit for historical sync
  const syncFailed = false;
  const failureReason = '';

  console.log('Starting full ShipStation data synchronization...');

  // Prepare API parameters based on sync options
  const apiParams: ShipStationApiParams = {
    // Default to OrderDate sort for historical sync, ModifyDate otherwise
    sortBy: syncParams.orderDateStart || syncParams.orderDateEnd ? 'OrderDate' : 'ModifyDate',
    sortDir: 'ASC',
    pageSize: 100, // Max efficient page size
    ...(syncParams.modifyDateStart && { modifyDateStart: syncParams.modifyDateStart }),
    ...(syncParams.orderDateStart && { orderDateStart: syncParams.orderDateStart }), // Add date filters
    ...(syncParams.orderDateEnd && { orderDateEnd: syncParams.orderDateEnd }), // Add date filters
    ...(!syncParams.syncAllStatuses && { orderStatus: 'awaiting_shipment' }),
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

      for (const ssOrder of response.orders) {
        try {
          const result = await upsertOrderWithItems(ssOrder);
          if (result) {
            ordersSuccessfullyProcessed++;
          } else {
            ordersFailedToProcess++;
          }
        } catch (itemProcessingError) {
          console.error(
            `[Sync] Uncaught error processing items for order ${ssOrder.orderNumber}:`,
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
    // ... existing error handling ...
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during sync execution';
    console.error('\n--- FATAL SYNC ERROR ---');
    console.error(errorMessage, error);
    console.error('----------------------\n');
    return {
      success: false,
      message: `Sync failed: ${errorMessage}`,
      ordersProcessed: ordersSuccessfullyProcessed,
      ordersFailed: ordersFailedToProcess,
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

  // Only override units from inches to centimeters; numeric values remain unchanged
  if (payload.dimensions?.units === 'inches') {
    payload.dimensions.units = 'centimeters'
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
  fetchedOrder: ShipStationOrder,
  itemsToPatch: Record<string, Array<{ name: string; value: string | null }>>,
  auditNote: string | null = null
): Promise<boolean> {
  const endpoint = '/orders/createorder'

  // Build updated items list, only patch targeted items
  const updatedItems = fetchedOrder.items.map(item => {
    const key = item.lineItemKey;
    // Only attempt patch if lineItemKey exists (is not null/undefined)
    // and is actually a key present in itemsToPatch
    if (key != null && Object.prototype.hasOwnProperty.call(itemsToPatch, key)) {
      // Ensure itemsToPatch[key] is an array before calling filter
      const optionsToPatch = Array.isArray(itemsToPatch[key]) ? itemsToPatch[key] : [];

      // Filter out null values using a type predicate to satisfy ShipStationItemOption type
      const validatedOptions = optionsToPatch.filter(
        (o): o is { name: string; value: string } => o.value !== null
      );

      return {
        ...item,
        options: validatedOptions, // Assign the correctly typed array
      };
    }
    // Otherwise, return the original item unchanged
    return item;
  });

  // Build human‑friendly summaries for Internal Notes / Custom Field 1
  const summaryLines = Object.entries(itemsToPatch).map(([_, opts]) => {
    const text = opts.find(o => o.name === 'Name or Text')?.value ?? '-'
    const colour1 = opts.find(o => o.name === 'Colour 1')?.value ?? null
    const colour2 = opts.find(o => o.name === 'Colour 2')?.value ?? null
    const colourPart = colour1 ? ` (${colour1}${colour2 ? ` / ${colour2}` : ''})` : ''
    return `${text}${colourPart}`
  })
  const summaryBlock = summaryLines.join('\n')

  const vibeLine = `🤖 AI personalised ${summaryLines.length} item${summaryLines.length === 1 ? '' : 's'}`

  const sparkleLine = `🌟 Y3D AI – Happy ${new Date().toLocaleDateString('en', { weekday: 'long' })}!`

  const newNotesLines = [
    sparkleLine,
    vibeLine,
    summaryBlock,
    auditNote ?? '',
  ]
    .filter(Boolean)
    .map(l => l.trim())

  // Prevent duplicates if note already exists
  const existingLines = (fetchedOrder.internalNotes ?? '').split(/\r?\n/)
  const mergedNotes = [...existingLines, ...newNotesLines].filter(
    (line, idx, arr) => line && arr.indexOf(line) === idx
  )

  const payload: ShipStationOrder = {
    ...fetchedOrder,
    items: updatedItems,
    internalNotes: mergedNotes.join('\n'),
  }

  // Inject Custom Field 1 when only one summary line
  if (summaryLines.length === 1) {
    const cf1 = summaryLines[0].slice(0, 100)
    payload.advancedOptions = {
      ...(fetchedOrder.advancedOptions ?? {}),
      customField1: cf1,
    } as ShipStationOrder['advancedOptions']
  }

  // Convert units flag only
  if (payload.dimensions?.units === 'inches') payload.dimensions.units = 'centimeters'

  // Ensure numeric orderId
  if (payload.orderId) payload.orderId = Number(payload.orderId)

  console.log(
    `[ShipStation API] Batch‑updating ${Object.keys(itemsToPatch).length} items in order ${fetchedOrder.orderId} …`
  )
  try {
    console.log('[ShipStation API] Sending payload:', JSON.stringify(payload, null, 2))
    const response = await shipstationApi.post(endpoint, payload)
    if (response.status === 200 || response.status === 201) {
      console.log(
        `[ShipStation API] Batch update success for order ${fetchedOrder.orderId}.`
      )
      return true
    }
    console.warn(
      `[ShipStation API] Batch update unexpected status ${response.status} for order ${fetchedOrder.orderId}.`
    )
    return false
  } catch (error) {
    let msg = `[ShipStation API] Batch update error for order ${fetchedOrder.orderId}`
    if (axios.isAxiosError(error)) {
      msg += `. Status: ${error.response?.status ?? 'N/A'}`
    } else if (error instanceof Error) msg += `: ${error.message}`
    console.error(msg, error)
    return false
  }
}
