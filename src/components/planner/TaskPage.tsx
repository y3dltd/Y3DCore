/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { Card, CardBody, Button, Spinner, Tooltip, Alert } from '@nextui-org/react';
import { PrintTaskStatus } from '@prisma/client';
import { ArrowPathIcon, PlayIcon } from '@heroicons/react/24/outline';
import React, { useState, useRef, useCallback, useEffect } from 'react';

import { PrintTaskCardProps } from '@/types/print-tasks';

import TaskCarousel from './TaskCarousel';
import { TaskTimeline } from './TaskTimeline';

interface TaskPageProps {
  tasks: PrintTaskCardProps[];
  stats: {
    totalTasks: number;
    totalItems: number;
    pendingTasks: number;
    completedTasks: number;
    lastUpdated: string;
  };
  isLoading: boolean;
  isOptimizing: boolean;
  optimizingElapsedTime: number;
  error: string | null;
  onRefresh: () => void;
  onGeneratePlan: () => void;
  onGenerateTodayTomorrowPlan: () => void;
  setTasks: React.Dispatch<React.SetStateAction<PrintTaskCardProps[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

const TaskPage: React.FC<TaskPageProps> = ({
  tasks,
  stats,
  isLoading,
  isOptimizing,
  optimizingElapsedTime,
  error,
  onRefresh,
  onGeneratePlan,
  onGenerateTodayTomorrowPlan,
  setTasks,
  setError,
}) => {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(
    tasks.length > 0 ? tasks[0].taskId : null
  );

  const carouselRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Handle scrolling to task when timeline item is clicked
  const handleTaskSelect = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    const element = document.getElementById(`task-${taskId}`);
    if (element && carouselRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Handler for individual item status change (passed to Carousel)
  const handleItemStatusChange = useCallback(
    async (taskId: string, itemId: string, newStatus: PrintTaskStatus) => {
      // Find the task and item index
      const taskIndex = tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex === -1) return;

      const task = tasks[taskIndex];
      if (!task) return;

      const itemIndex = task.items.findIndex(item => item.name === itemId);
      if (itemIndex === -1) return;

      // Store previous state for potential rollback
      const previousTasks = JSON.parse(JSON.stringify(tasks));

      // Optimistic Update
      const updatedTasks = tasks.map((t, idx) => {
        if (idx === taskIndex) {
          const updatedItems = t.items.map((item, iIdx) => {
            if (iIdx === itemIndex) {
              return { ...item, status: newStatus };
            }
            return item;
          });
          // Recalculate task status based on items (optional, might depend on logic)
          // const allComplete = updatedItems.every(i => i.status === PrintTaskStatus.completed);
          // const taskStatus = allComplete ? PrintTaskStatus.completed : PrintTaskStatus.pending;
          return { ...t, items: updatedItems /*, status: taskStatus */ };
        }
        return t;
      });
      setTasks(updatedTasks); // Use prop setter

      // API Call to update the specific item status
      try {
        // Use the actual item ID (item.name) for the API call
        await fetch(`/api/print-tasks/${itemId}/status`, {
          // Use itemId
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        // TODO: Add success feedback/logging if needed
      } catch (error) {
        console.error('Failed to update task status via API:', error);
        // Revert optimistic update on API error
        setTasks(previousTasks); // Use prop setter
        setError(`Failed to update status for task ${taskId}: ${(error as Error).message}`); // Use prop setter
      }
    },
    [tasks, setTasks, setError] // Use prop setters in dependency array
  );

  // Handler for bulk task status change (passed to Carousel)
  const handleBulkStatusChange = useCallback(
    async (taskId: string, newStatus: PrintTaskStatus) => {
      const taskIndex = tasks.findIndex(t => t.taskId === taskId);
      const task = tasks[taskIndex];
      if (!task) return;

      const previousTasks = JSON.parse(JSON.stringify(tasks));

      // Optimistic Update
      const updatedTasks = tasks.map((t, idx) => {
        if (idx === taskIndex) {
          return {
            ...t,
            items: t.items.map(item => ({ ...item, status: newStatus })),
            // Optionally update task status itself
            // status: newStatus === PrintTaskStatus.completed ? PrintTaskStatus.completed : t.status,
          };
        }
        return t;
      });
      setTasks(updatedTasks); // Use prop setter

      // API Call for bulk update
      try {
        const itemIds = task.items.map(item => item.name); // Get all original item IDs
        await fetch(`/api/print-tasks/bulk-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds: itemIds, status: newStatus }), // Use correct payload for bulk update
        });
        // TODO: Add success feedback/logging
      } catch (error) {
        console.error('Failed to bulk update task status via API:', error);
        // Revert optimistic update on API error
        setTasks(previousTasks); // Use prop setter
        setError(`Failed to bulk update status for task ${taskId}: ${(error as Error).message}`); // Use prop setter
      }
    },
    [tasks, setTasks, setError] // Use prop setters in dependency array
  );

  // Set up scroll listener to update active task
  useEffect(() => {
    const handleScroll = () => {
      if (!carouselRef.current) return;

      const elements = Array.from(carouselRef.current.querySelectorAll('section[id^="task-"]'));
      const headerHeight = headerRef.current?.clientHeight || 0;

      // Find the first element whose top is within viewport
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        if (rect.top <= headerHeight + 100 && rect.bottom > headerHeight) {
          const taskId = element.id.replace('task-', '');
          if (taskId !== activeTaskId) {
            setActiveTaskId(taskId);
          }
          break;
        }
      }
    };

    const carouselElement = carouselRef.current;
    if (carouselElement) {
      carouselElement.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (carouselElement) {
        carouselElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, [activeTaskId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header/Summary */}
      <div ref={headerRef} className="border-b border-gray-700 z-10">
        <div className="container mx-auto p-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold text-gray-100">3D Print Task Sequence</h1>
            <div className="flex items-center gap-2">
              <Tooltip content="Refresh Plan">
                <Button
                  isIconOnly
                  variant="light"
                  onPress={onRefresh}
                  disabled={isLoading || isOptimizing}
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </Button>
              </Tooltip>
              <Tooltip content="Generate Plan for Today & Tomorrow Orders Only">
                <Button
                  color="warning"
                  variant="solid"
                  onPress={onGenerateTodayTomorrowPlan}
                  isLoading={isOptimizing}
                  disabled={isLoading || isOptimizing}
                  size="sm"
                >
                  Today & Tomorrow
                </Button>
              </Tooltip>
              <Tooltip content="Generate New Optimized Plan for All Pending Orders">
                <Button
                  color="primary"
                  variant="solid"
                  onPress={onGeneratePlan}
                  isLoading={isOptimizing}
                  disabled={isLoading || isOptimizing}
                  startContent={!isOptimizing && <PlayIcon className="h-5 w-5" />}
                >
                  {isOptimizing ? `Optimizing... (${optimizingElapsedTime}s)` : 'Generate Plan'}
                </Button>
              </Tooltip>
            </div>
          </div>
          <div className="flex justify-between items-center text-sm">
            <p className="text-sm text-gray-300">
              <span className="font-medium">{stats.totalTasks} Tasks</span> ·
              <span className="ml-2">{stats.totalItems} Items</span>
            </p>
            <div className="text-sm">
              <span className="font-medium text-gray-300">
                {stats.completedTasks} of {stats.totalTasks} tasks completed
              </span>
              <span className="ml-2 px-2 py-0.5 text-green-400 rounded-full">
                {stats.totalTasks > 0
                  ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>
          {error && (
            <Alert color="danger" className="mt-2">
              {error}
            </Alert>
          )}
          {isLoading && !isOptimizing && (
            <div className="flex justify-center items-center p-4">
              <Spinner label="Loading Plan..." color="primary" />
            </div>
          )}
        </div>
      </div>

      {/* Container to center the Timeline and Carousel block horizontally */}
      <div className="flex justify-center overflow-hidden h-full">
        {/* Left Rail: Timeline - Use TaskTimeline directly */}
        <TaskTimeline tasks={tasks} onTaskSelect={handleTaskSelect} activeTaskId={activeTaskId} />

        {/* Main Content: Carousel - Ensure it scrolls vertically */}
        <main ref={carouselRef} className="flex flex-col p-4 md:p-6 overflow-y-auto h-full">
          {/* Inner container for width constraint - Removed mx-auto */}
          <div className="w-full max-w-screen-xl">
            <TaskCarousel
              tasks={tasks}
              onTaskStatusChange={handleItemStatusChange}
              onBulkTaskStatusChange={handleBulkStatusChange}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default TaskPage;
