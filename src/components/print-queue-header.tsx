'use client'

import { RefreshCcw, CheckCheck, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React, { useEffect } from 'react'
import { useFormState } from 'react-dom'
import { PrintQueueToolsModal } from './print-queue-tools-modal'
// Assume a toast component exists (e.g., from sonner)
// import { toast } from 'sonner';

// Define the expected state/return type for our action
interface CleanupActionResult {
  success: boolean;
  updatedCount?: number;
  error?: string;
}

// Define the type for the action function itself
type CleanupAction = () => Promise<CleanupActionResult>;

interface PrintQueueHeaderProps {
  formattedNow: string;
  cleanupAction: CleanupAction; // Pass the action function
}

// Create a client component wrapper for the form/button
function CleanupButton({ action }: { action: CleanupAction }) {
  // Initial state for form state
  const initialState: CleanupActionResult = { success: false };
  const [state, formAction] = useFormState(action, initialState);

  useEffect(() => {
    if (state.error) {
      // toast.error(`Cleanup failed: ${state.error}`);
      console.error(`Cleanup failed: ${state.error}`); // Placeholder feedback
    } else if (state.success && state.updatedCount !== undefined) {
      if (state.updatedCount > 0) {
        // toast.success(`Cleanup successful: ${state.updatedCount} tasks updated.`);
        console.log(`Cleanup successful: ${state.updatedCount} tasks updated.`); // Placeholder feedback
      } else {
        // toast.info("Cleanup ran, but no tasks needed updating.");
        console.log("Cleanup ran, but no tasks needed updating."); // Placeholder feedback
      }
    }
    // Only run effect when state changes *after* form submission
  }, [state]);

  return (
    <form action={formAction}>
      <Button
        variant="outline"
        size="sm"
        type="submit"
        title="Mark tasks for shipped/cancelled orders as completed"
      // Add pending state handling if desired later
      >
        <CheckCheck className="mr-2 h-4 w-4" />
        Cleanup Tasks
      </Button>
    </form>
  );
}

export function PrintQueueHeader({ formattedNow, cleanupAction }: PrintQueueHeaderProps) {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
      <h1 className="text-3xl font-bold">Print Queue</h1>
      <div className="flex items-center space-x-2 text-sm text-muted-foreground ml-auto">
        <span>
          Last updated: {formattedNow}
        </span>
        <PrintQueueToolsModal>
          <Button
            variant="outline"
            size="sm"
            title="Open print queue tools"
          >
            <Wrench className="mr-2 h-4 w-4" />
            Tools
          </Button>
        </PrintQueueToolsModal>
        <CleanupButton action={cleanupAction} />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
        >
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
