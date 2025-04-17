import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth'; // Import user check
import { handleApiError } from '@/lib/errors'; // Import error handler
import { syncShipstationData } from '@/lib/shipstation'; // Import the main sync function
import { syncShipStationTags } from '@/lib/shipstation/db-sync'; // Import tag sync directly
// Prisma import likely not needed here anymore

// Removed API Key logic
// const EXPECTED_SYNC_API_KEY = process.env.SYNC_API_KEY;

/**
 * Handles POST requests to trigger the ShipStation order synchronization process.
 * Requires a valid API key provided in the 'X-Sync-API-Key' header.
 */
export async function POST(request: NextRequest) {
  console.log('Received request to trigger ShipStation sync...');

  // --- Authentication Check (Session Based) ---
  const user = await getCurrentUser();
  if (!user) {
    console.warn('Unauthorized attempt to trigger ShipStation sync (no valid session).');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  console.log(`Authenticated user ${user.email} triggered sync.`);
  // --- End Authentication Check ---

  // --- Old API Key Check Removed ---
  // const providedApiKey = request.headers.get('X-Sync-API-Key');
  // if (!EXPECTED_SYNC_API_KEY) { ... }
  // if (!providedApiKey || providedApiKey !== EXPECTED_SYNC_API_KEY) { ... }
  // ---

  // console.log('Authentication successful. Proceeding with sync...'); // Already logged above

  try {
    // --- Sync Tags First ---
    try {
      console.log('Syncing ShipStation Tags...');
      await syncShipStationTags(); // Use the direct import
      console.log('Tag sync completed.');
    } catch (tagSyncError) {
      console.error(
        'Error during ShipStation tag sync (continuing with order sync):',
        tagSyncError
      );
      // Optionally, add this error to the final response or log it differently
    }
    // --- End Tag Sync ---

    // Read optional parameters from the request body
    let syncParams = {};
    try {
      // Try to parse JSON body, default to empty object if no body or invalid JSON
      const body = await request.json();
      if (body && typeof body === 'object') {
        syncParams = {
          syncAllStatuses: body.syncAllStatuses === true, // Explicitly check for true
          // Add other potential params here if needed later (e.g., date ranges)
          // orderDateStart: body.orderDateStart,
          // orderDateEnd: body.orderDateEnd,
          // pageLimit: body.pageLimit,
        };
        console.log('Sync triggered with custom parameters:', syncParams);
      } else if (request.body) {
        console.warn('Sync request body was present but not valid JSON.');
      }
    } catch {
      // Remove unused variable entirely
      // Ignore error if body is empty or not JSON - use default params
      console.log('No valid JSON body provided for sync parameters, using defaults.');
    }

    // Call the main sync function with potentially overridden parameters
    const syncResult = await syncShipstationData(syncParams);

    return NextResponse.json(syncResult);
  } catch (error) {
    // Catch errors from getShipstationOrders or other unexpected issues
    console.error('Error during ShipStation sync trigger:', error);
    // Use the centralized error handler
    return handleApiError(error);
  }
}
