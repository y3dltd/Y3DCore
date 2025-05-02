import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { syncShipstationData } from '@/lib/shipstation';
import { syncShipStationTags } from '@/lib/shipstation/db-sync';

/**
 * Handles POST requests to trigger the ShipStation order synchronization process.
 * Requires a valid API key provided in the 'X-Sync-API-Key' header.
 */
export async function POST(request: NextRequest) {
  console.log('Received request to trigger ShipStation sync...');

  // --- Get Session --- 
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    console.error('[API Sync POST] Unauthorized: No session found.');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  console.log(`[API Sync POST] Sync triggered by user: ${session.user.email}`);
  // --- End Get Session ---

  try {
    try {
      console.log('Syncing ShipStation Tags...');
      await syncShipStationTags();
      console.log('Tag sync completed.');
    } catch (tagSyncError) {
      console.error(
        'Error during ShipStation tag sync (continuing with order sync):',
        tagSyncError
      );
    }

    let syncParams = {};
    try {
      const body = await request.json();
      if (body && typeof body === 'object') {
        syncParams = {
          syncAllStatuses: body.syncAllStatuses === true,
        };
        console.log('Sync triggered with custom parameters:', syncParams);
      } else if (request.body) {
        console.warn('Sync request body was present but not valid JSON.');
      }
    } catch {
      console.log('No valid JSON body provided for sync parameters, using defaults.');
    }

    const syncResult = await syncShipstationData(syncParams);
    return NextResponse.json(syncResult);
  } catch (error) {
    console.error('Error during ShipStation sync trigger:', error);
    return handleApiError(error);
  }
}
