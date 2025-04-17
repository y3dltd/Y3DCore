'use client'; // This directive makes it a Client Component

import { Loader2 } from 'lucide-react'; // Import loader icon
import { useState } from 'react';

import { Button } from '@/components/ui/button'; // Use Shadcn button

// Define the expected shape of the API response summary
interface SyncSummary {
  success: boolean;
  message: string;
  ordersProcessed: number;
  ordersFailed: number;
  totalOrdersFetched: number;
  pagesSynced: number;
  totalPagesAvailable: number;
}

// Get the API key from environment variables (exposed to client)
const SYNC_API_KEY_FRONTEND = process.env.NEXT_PUBLIC_SYNC_API_KEY;

export function SyncButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsLoading(true);
    setSummary(null); // Clear previous summary
    setError(null); // Clear previous error

    // --- Check if frontend API key is available ---
    if (!SYNC_API_KEY_FRONTEND) {
      setError('Configuration Error: Sync API key not available on the client.');
      setIsLoading(false);
      console.error('CRITICAL: NEXT_PUBLIC_SYNC_API_KEY is not defined!');
      return; // Stop if key is missing
    }
    // --- End Check ---

    try {
      const response = await fetch('/api/sync/shipstation', {
        method: 'POST',
        headers: {
          // Add the API key header required by the backend
          'X-Sync-API-Key': SYNC_API_KEY_FRONTEND,
          'Content-Type': 'application/json', // Keep content type if needed later
        },
      });

      // Try to parse JSON regardless of response.ok to get potential error messages
      let data: unknown; // Use unknown instead of any
      try {
        data = await response.json();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_ignoredError) {
        // Rename and add eslint disable comment for unused var
        // Handle cases where the response is not JSON (e.g., server error HTML page)
        throw new Error(
          `Failed to parse response. Status: ${response.status} ${response.statusText}`
        );
      }

      if (!response.ok) {
        // Specifically handle 401 Unauthorized from backend
        if (response.status === 401) {
          throw new Error('Authorization failed. Check API Key configuration.');
        }
        // Use the message from the JSON error response if available
        // Need type assertion or check for data properties
        const errorData = data as { message?: string; error?: string };
        throw new Error(
          errorData?.message || errorData?.error || `HTTP error! status: ${response.status}`
        );
      }

      // Type guard to check if data is a valid SyncSummary
      const isSyncSummary = (
        obj: unknown // Use unknown instead of any
      ): obj is SyncSummary => {
        return (
          typeof obj === 'object' &&
          obj !== null &&
          typeof (obj as SyncSummary).success === 'boolean' && // Cast within checks
          typeof (obj as SyncSummary).message === 'string' &&
          typeof (obj as SyncSummary).ordersProcessed === 'number' &&
          typeof (obj as SyncSummary).ordersFailed === 'number' &&
          typeof (obj as SyncSummary).totalOrdersFetched === 'number' &&
          typeof (obj as SyncSummary).pagesSynced === 'number' &&
          typeof (obj as SyncSummary).totalPagesAvailable === 'number'
        );
      };

      // Validate the structure of the successful response using the type guard
      if (!isSyncSummary(data)) {
        throw new Error('Received invalid summary format from API.');
      }

      setSummary(data); // data is now confirmed as SyncSummary
    } catch (err: unknown) {
      // Use unknown type for error
      console.error('Sync failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(`Sync failed: ${errorMessage}`);
      setSummary(null); // Clear summary on error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 border rounded-lg bg-card text-card-foreground">
      <Button
        onClick={handleSync}
        disabled={isLoading || !SYNC_API_KEY_FRONTEND}
        className="flex items-center gap-2"
      >
        {/* Optionally disable button if key isn't configured */}
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing...
          </>
        ) : (
          'Sync ShipStation Orders'
        )}
      </Button>

      {/* Display detailed summary or error */}
      <div className="mt-3 text-sm">
        {summary && (
          <div
            className={`p-3 rounded-md ${summary.success ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}
          >
            <p className="font-medium">{summary.message}</p>
            {summary.success && (
              <ul className="list-disc list-inside mt-1 pl-2">
                <li>Fetched: {summary.totalOrdersFetched} orders</li>
                <li>Processed OK: {summary.ordersProcessed} orders</li>
                <li>Failed: {summary.ordersFailed} orders</li>
                <li>
                  Pages Synced: {summary.pagesSynced} / {summary.totalPagesAvailable}
                </li>
              </ul>
            )}
          </div>
        )}
        {error && (
          <div className="p-3 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            <p className="font-medium">Error</p>
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
