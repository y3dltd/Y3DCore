import { Card, CardBody } from '@nextui-org/react';
import { PrintTaskStatus } from '@prisma/client';
import React from 'react';

import { PrintTaskCardProps } from '@/types/print-tasks';

// Helper function to determine dot color based on status
const getStatusColor = (status: PrintTaskStatus): string => {
  switch (status) {
    case PrintTaskStatus.pending:
      return 'bg-gray-400'; // Neutral for pending
    case PrintTaskStatus.in_progress:
      return 'bg-yellow-500'; // Yellow for in progress
    case PrintTaskStatus.completed:
      return 'bg-green-500'; // Green for completed
    case PrintTaskStatus.cancelled:
      return 'bg-red-500'; // Red for cancelled
    default:
      console.warn(`Unexpected PrintTaskStatus: ${status}`);
      return 'bg-gray-400'; // Default gray
  }
};

interface TaskTimelineProps {
  tasks: PrintTaskCardProps[];
  activeTaskId: string | null;
  onTaskSelect?: (_taskId: string) => void;
}

export const TaskTimeline = ({ tasks, activeTaskId, onTaskSelect }: TaskTimelineProps) => {
  return (
    <Card className="h-full w-64 border-r shadow-none rounded-none" shadow="none" radius="none">
      <CardBody className="overflow-y-auto p-0 flex flex-col justify-center">
        <div className="py-4 px-2 min-h-0">
          <h2 className="text-xl font-semibold mb-4 px-2 text-gray-100">Print Tasks</h2>
          <div className="space-y-2 relative">
            <div className="absolute left-3 top-1 bottom-1 w-0.5 bg-gray-700"></div>
            {tasks.map((task, idx) => {
              const isSelected = task.taskId === activeTaskId;
              // Alternate background colours for each task block to improve readability
              const palette = [
                'bg-purple-800/40',
                'bg-pink-800/40',
                'bg-blue-800/40',
                'bg-green-800/40',
                'bg-yellow-800/40',
              ];
              const bgColorClass = palette[idx % palette.length];
              return (
                <div
                  key={task.taskId}
                  onClick={() => onTaskSelect?.(task.taskId)}
                  className={
                    `relative flex items-start py-2 pl-8 pr-2 rounded-md transition-all cursor-pointer ${bgColorClass} ` +
                    (isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:bg-opacity-60')
                  }
                >
                  <div
                    className={`absolute left-1.5 top-3 w-3 h-3 rounded-full ${getStatusColor(task.status)}`}
                    style={{ boxShadow: isSelected ? '0 0 0 2px rgba(59, 130, 246, 0.5)' : 'none' }}
                  />
                  <div className="ml-4 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">
                      Task #{task.taskId.substring(0, 6)}...
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {task.items.length} item{task.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
