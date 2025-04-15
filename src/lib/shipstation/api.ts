import axios from 'axios'
import { shipstationApi } from './client'
import {
  upsertOrderWithItems
} from './db-sync'
import type {
  ShipStationApiParams,
  ShipStationOrdersResponse,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Type is used implicitly in loop
  ShipStationOrder,
  SyncSummary,
  ShipStationTag
} from './types'

const MAX_RETRIES = 3

/**
 * Fetches orders from the ShipStation API with retry logic and improved error handling.
 */
export const getShipstationOrders = async (
  params: ShipStationApiParams = {}
): Promise<ShipStationOrdersResponse> => {
  let attempt = 0

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
  params.pageSize = params.pageSize || 100 

  while (attempt < MAX_RETRIES) {
    attempt++
    try {
      console.log(
        `[API] Attempt ${attempt}: Fetching orders from ShipStation with params:`,
        params
      )
      
      const response = await shipstationApi.get<ShipStationOrdersResponse>(
        '/orders',
        { params }
      )

      console.log(
        `[API] Fetched ${response.data.orders.length} orders from page ${response.data.page}/${response.data.pages}. Total: ${response.data.total}`
      )

      // Optional: Keep minimal debug logging if helpful during development
      // console.log(`[API DEBUG] Metadata: Total=${response.data.total}, Page=${response.data.page}, Pages=${response.data.pages}`);
      // if (response.data.orders?.length > 0) {
      //   console.log(`[API DEBUG] First order ID: ${response.data.orders[0].orderId}`);
      // }

      return response.data // Success
    } catch (error: unknown) {
      let errorMessage = '[API] Error fetching ShipStation orders'
      let statusCode: number | string = 'N/A'
      let shouldRetry = false

      if (axios.isAxiosError(error)) {
        statusCode = error.response?.status ?? 'N/A'
        errorMessage += `. Status: ${statusCode}.`
        // Log only essential error info, avoid logging potentially large data object in prod
        console.error(`${errorMessage} Attempt ${attempt}. URL: ${error.config?.url}`); 
        if (error.response?.data) {
            // Log specific error message from ShipStation if available
            console.error(` -> ShipStation Response: ${JSON.stringify(error.response.data)}`);
        }
        
        // Retry on common transient errors (rate limits, server errors)
        if (
          statusCode === 429 ||
          (typeof statusCode === 'number' && statusCode >= 500)
        ) {
          shouldRetry = true
        }
      } else if (error instanceof Error) {
        errorMessage += `: ${error.message}. Attempt ${attempt}.`
        console.error(errorMessage, error)
      } else {
        errorMessage += `: Unknown error occurred. Attempt ${attempt}.`
        console.error(errorMessage, error)
      }

      if (shouldRetry && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000 // Exponential backoff (2s, 4s)
        console.log(`[API] Retrying after ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        // Don't retry or max retries reached
        const finalMessage = `${errorMessage}. Max retries reached or non-retryable error.`
        console.error(`[API] Failed to fetch orders after ${attempt} attempts. ${finalMessage}`)
        // Re-throw the error to be caught by the sync orchestrator
        throw new Error(finalMessage, { cause: error }) 
      }
    }
  }
  // Should not be reachable due to throw in the loop, but satisfies TypeScript
  throw new Error('[API] Unexpected error state after fetch attempts.')
}

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
  let currentPage = 1
  let totalPages = 1 
  let ordersSuccessfullyProcessed = 0
  let ordersFailedToProcess = 0
  let totalOrdersFetched = 0
  const maxPagesToSync = syncParams.pageLimit ?? Infinity; // Default to Infinity if no limit for historical sync
  const syncFailed = false
  const failureReason = ''

  console.log('Starting full ShipStation data synchronization...')

  // Prepare API parameters based on sync options
  const apiParams: ShipStationApiParams = {
    // Default to OrderDate sort for historical sync, ModifyDate otherwise
    sortBy: (syncParams.orderDateStart || syncParams.orderDateEnd) ? 'OrderDate' : 'ModifyDate', 
    sortDir: 'ASC',
    pageSize: 100, // Max efficient page size
    ...(syncParams.modifyDateStart && { modifyDateStart: syncParams.modifyDateStart }),
    ...(syncParams.orderDateStart && { orderDateStart: syncParams.orderDateStart }), // Add date filters
    ...(syncParams.orderDateEnd && { orderDateEnd: syncParams.orderDateEnd }),     // Add date filters
    ...(!syncParams.syncAllStatuses && { orderStatus: 'awaiting_shipment' }),
  }

  // NOTE: The default modifyDateStart logic remains commented out for now

  // Log parameters being used
  console.log('[Sync] Effective API Parameters:', JSON.stringify(apiParams, null, 2));
  console.log(`[Sync] Page limit set to: ${maxPagesToSync === Infinity ? 'None' : maxPagesToSync}`);

  try {
    do {
      console.log(`[Sync] Syncing page ${currentPage} of ${totalPages === Infinity ? '?' : totalPages}...`);
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
            console.error(`[Sync] Uncaught error processing items for order ${ssOrder.orderNumber}:`, itemProcessingError);
            ordersFailedToProcess++; 
        }
      }

      currentPage++;
      // Avoid infinite loops if totalPages is weird; rely on empty page break
    } while (currentPage <= totalPages && currentPage <= maxPagesToSync)

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
        pagesSynced: currentPage -1, // Number of pages actually fetched
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
     const errorMessage = error instanceof Error ? error.message : 'Unknown error during sync execution';
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
         totalPagesAvailable: totalPages === Infinity ? -1 : totalPages 
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

// Helper to construct full URL
// ... existing code ...
