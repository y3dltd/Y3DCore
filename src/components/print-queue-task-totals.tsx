'use client';

import { PrintTaskStatus } from '@prisma/client';
import { CheckCircle2, Clock, AlertCircle, Package } from 'lucide-react';

import { StatsCard } from './dashboard/stats-card';
import { PrintTaskData } from './print-queue-table';

interface PrintQueueTaskTotalsProps {
  tasks: PrintTaskData[];
}

export function PrintQueueTaskTotals({ tasks }: PrintQueueTaskTotalsProps) {
  // Calculate totals
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(task => task.status === PrintTaskStatus.pending).length;
  const inProgressTasks = tasks.filter(task => task.status === PrintTaskStatus.in_progress).length;
  const completedTasks = tasks.filter(task => task.status === PrintTaskStatus.completed).length;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cancelledTasks = tasks.filter(task => task.status === PrintTaskStatus.cancelled).length;
  const needsReviewTasks = tasks.filter(task => task.needs_review).length;

  return (
    <div className="flex flex-wrap justify-between w-full gap-3 mb-4 px-2">
      <StatsCard
        title="Total Tasks"
        value={totalTasks}
        icon={Package}
        color="blue"
        className="p-3 flex-1" /* Reduce padding and stretch */
      />
      <StatsCard
        title="Pending"
        value={pendingTasks}
        icon={Clock}
        color="yellow"
        className="p-3 flex-1" /* Reduce padding and stretch */
      />
      <StatsCard
        title="In Progress"
        value={inProgressTasks}
        icon={Clock}
        color="indigo"
        className="p-3 flex-1" /* Reduce padding and stretch */
      />
      <StatsCard
        title="Completed"
        value={completedTasks}
        icon={CheckCircle2}
        color="green"
        className="p-3 flex-1" /* Reduce padding and stretch */
      />
      <StatsCard
        title="Needs Review"
        value={needsReviewTasks}
        icon={AlertCircle}
        color="red"
        className="p-3 flex-1" /* Reduce padding and stretch */
      />
    </div>
  );
}
