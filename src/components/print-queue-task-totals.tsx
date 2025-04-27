'use client';

import { PrintTaskStatus } from '@prisma/client';
import { AlertCircle, CheckCircle2, Clock, Package } from 'lucide-react';

import { ClientPrintTaskData } from '@/types/print-tasks'; // Import client-safe type

import { StatsCard } from './dashboard/stats-card';

// Define props for the component
interface PrintQueueTaskTotalsProps {
  tasks: ClientPrintTaskData[]; // Use client-safe type
}

export function PrintQueueTaskTotals({ tasks }: PrintQueueTaskTotalsProps) {
  // Helper function to sum quantities
  const sumQuantity = (filteredTasks: ClientPrintTaskData[]) =>
    filteredTasks.reduce((sum, task) => sum + (task.quantity || 0), 0);

  // Calculate totals based on item quantity
  const totalItems = sumQuantity(tasks);
  const pendingItems = sumQuantity(tasks.filter(task => task.status === PrintTaskStatus.pending));
  const inProgressItems = sumQuantity(
    tasks.filter(task => task.status === PrintTaskStatus.in_progress)
  );
  const completedItems = sumQuantity(
    tasks.filter(task => task.status === PrintTaskStatus.completed)
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cancelledItems = sumQuantity(
    tasks.filter(task => task.status === PrintTaskStatus.cancelled)
  );
  const needsReviewItems = sumQuantity(tasks.filter(task => task.needs_review));

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 w-full col-span-full mb-4 px-2">
      <StatsCard
        title="Total Items"
        value={totalItems}
        icon={Package}
        color="blue"
        className="p-3" /* Reduce padding and stretch */
      />
      <StatsCard
        title="Pending Items"
        value={pendingItems}
        icon={Clock}
        color="yellow"
        className="p-3" /* Reduce padding and stretch */
      />
      <StatsCard
        title="In Progress Items"
        value={inProgressItems}
        icon={Clock}
        color="indigo"
        className="p-3" /* Reduce padding and stretch */
      />
      <StatsCard
        title="Completed Items"
        value={completedItems}
        icon={CheckCircle2}
        color="green"
        className="p-3" /* Reduce padding and stretch */
      />
      <StatsCard
        title="Needs Review Items"
        value={needsReviewItems}
        icon={AlertCircle}
        color="red"
        className="p-3" /* Reduce padding and stretch */
      />
    </div>
  );
}
