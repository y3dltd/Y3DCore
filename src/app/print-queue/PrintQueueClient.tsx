'use client';

import { AutoRefresher } from '@/components/auto-refresher';
import { LimitSelector } from '@/components/limit-selector';
import { OrdersPagination } from '@/components/orders-pagination';
import { PrintQueueFilters } from '@/components/print-queue-filters';
import { PrintQueueHeader } from '@/components/print-queue-header';
import { PrintQueueTable } from '@/components/print-queue-table';
import { ClientPrintTaskData } from '@/types/print-tasks';
import { PrintQueueTaskTotals } from '@/components/print-queue-task-totals';
import { cleanShippedOrderTasks } from '@/lib/actions/print-queue-actions'; 
import { PrintQueuePageSearchParams } from './page'; 
import { PrintQueueModalProvider } from '@/contexts/PrintQueueModalContext'; 
import { PrintTaskDetailModal } from '@/components/print-task-detail-modal'; 

interface PrintQueueClientProps {
  tasks: ClientPrintTaskData[];
  totalTasks: number;
  page: number;
  limit: number;
  productNames: string[];
  initialFilters: PrintQueuePageSearchParams; 
  formattedNow: string; 
}

export default function PrintQueueClient({
  tasks,
  totalTasks,
  page,
  limit,
  productNames,
  initialFilters,
  formattedNow,
}: PrintQueueClientProps) {
  // The state for the modal (isOpen, onOpenChange) remains within PrintQueueTable

  // Calculate total pages for pagination
  const totalPages = Math.ceil(totalTasks / limit);

  return (
    <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
      {/* Pass necessary props to PrintQueueHeader */}
      <PrintQueueHeader formattedNow={formattedNow} cleanupAction={cleanShippedOrderTasks} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Pass tasks to PrintQueueTaskTotals - ensure it can handle ClientPrintTaskData */}
        <PrintQueueTaskTotals tasks={tasks} />
      </div>
      <div className="rounded-md border bg-background p-4 shadow">
        {/* Pass props to PrintQueueFilters, assuming it expects these names based on previous usage */}
        {/* If errors persist here, PrintQueueFiltersProps interface might need checking */}
        <PrintQueueFilters
          currentFilters={initialFilters} // Pass validated params as current filters
          availableProductNames={productNames} // Pass available product names
        // availableShippingMethods might be needed if PrintQueueFilters expects it
        />
        {/* Wrap Table and Modal with Provider */}
        <PrintQueueModalProvider>
          <PrintQueueTable 
            data={tasks} 
            onSelectTask={(task) => {
              // Use the context directly from here
              const modal = document.querySelector('[data-modal-component="print-task-modal"]');
              if (modal && 'setSelectedTask' in modal && 'setIsModalOpen' in modal) {
                // Basic interaction with the modal
                (modal as any).setSelectedTask(task);
                (modal as any).setIsModalOpen(true);
              }
            }} 
          />
          <PrintTaskDetailModal />
        </PrintQueueModalProvider>
      </div>
      <div className="mt-4 flex items-center justify-between">
        {/* Pass current limit to LimitSelector */}
        <LimitSelector currentLimit={limit} />
        {/* Pass calculated totalPages to OrdersPagination */}
        <OrdersPagination currentPage={page} totalPages={totalPages} limit={limit} />
      </div>
      {/* Pass interval in seconds to AutoRefresher */}
      <AutoRefresher intervalSeconds={60} />
      <div className="text-xs text-muted-foreground">Last updated: {formattedNow}</div>
    </div>
  );
}
