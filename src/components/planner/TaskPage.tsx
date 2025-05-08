'use client';

import { ArrowPathIcon, PlayIcon, CheckIcon } from '@heroicons/react/24/outline';
import {
  Button,
  Spinner,
  Tooltip,
  Alert,
  Progress,
  Select,
  SelectItem,
} from '@nextui-org/react';
import { PrintTaskStatus } from '@prisma/client';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

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
  onGenerateTodayPlan: () => void;
  onGenerateTodayTomorrowPlan: () => void;
  setTasks: React.Dispatch<React.SetStateAction<PrintTaskCardProps[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  recentRuns?: { id: string; finishedAt: string }[];
  selectedRunId?: string | null;
  onSelectRun?: (id: string | null) => void;
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
  onGenerateTodayPlan,
  onGenerateTodayTomorrowPlan,
  setTasks,
  setError,
  recentRuns = [],
  selectedRunId = null,
  onSelectRun,
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

      // Convert string IDs to numbers for API validation and filter out any NaNs
      const itemIds = task.items
        .map(item => parseInt(item.name, 10))
        .filter(id => !Number.isNaN(id));

      // If no valid numeric IDs, abort API call to avoid validation errors
      if (itemIds.length === 0) {
        console.warn(
          '[TaskPage] handleBulkStatusChange: No valid numeric item IDs found for task',
          taskId
        );
        return;
      }

      // API Call for bulk update
      try {
        await fetch(`/api/print-tasks/bulk-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds: itemIds, status: newStatus }), // Use numeric IDs for bulk update
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

  // --- Global Bulk Status Handler (Set All In Progress / Set All Complete) ---
  const handleGlobalStatusChange = useCallback(
    async (newStatus: PrintTaskStatus) => {
      if (tasks.length === 0) return;

      const previousTasks = JSON.parse(JSON.stringify(tasks));

      // Optimistic update – set every item's status
      const updatedTasks = tasks.map(task => ({
        ...task,
        items: task.items.map(item => ({ ...item, status: newStatus })),
      }));
      setTasks(updatedTasks);

      // Collect all unique, valid numeric item IDs
      const allItemIds = tasks
        .flatMap(task => task.items.map(item => parseInt(item.name, 10)))
        .filter(id => !Number.isNaN(id));

      if (allItemIds.length === 0) {
        console.warn('[TaskPage] handleGlobalStatusChange: no valid numeric item IDs found');
        return;
      }

      try {
        await fetch(`/api/print-tasks/bulk-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds: allItemIds, status: newStatus }),
        });
      } catch (error) {
        console.error('Failed to globally update task statuses via API:', error);
        setTasks(previousTasks);
        setError(`Failed to update all tasks: ${(error as Error).message}`);
      }
    },
    [tasks, setTasks, setError]
  );

  // --- Derived Global Progress Metrics ---
  const totalItemsGlobal = tasks.reduce(
    (sum, task) => sum + task.items.reduce((q, item) => q + (item.quantity ?? 1), 0),
    0
  );
  const completedItemsGlobal = tasks.reduce(
    (sum, task) =>
      sum +
      task.items
        .filter(item => item.status === PrintTaskStatus.completed)
        .reduce((q, item) => q + (item.quantity ?? 1), 0),
    0
  );
  const anyItemInProgressGlobal = tasks.some(task =>
    task.items.some(item => item.status === PrintTaskStatus.in_progress)
  );
  const allItemsCompletedGlobal = totalItemsGlobal > 0 && completedItemsGlobal === totalItemsGlobal;

  // --- Dynamic Task Completion Stats ---
  const derivedTotalTasks = tasks.length;
  const derivedCompletedTasks = useMemo(
    () =>
      tasks.filter(task => task.items.every(item => item.status === PrintTaskStatus.completed))
        .length,
    [tasks]
  );
  // Count tasks with any items currently in progress
  const derivedInProgressTasks = useMemo(
    () =>
      tasks.filter(task => task.items.some(item => item.status === PrintTaskStatus.in_progress))
        .length,
    [tasks]
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

  // --- Handler for selecting a historical run ---
  const handleRunSelect = useCallback(
    (keys: unknown) => {
      if (!onSelectRun) return;
      // NextUI passes a Set of keys (or "all"), we only allow single selection here
      const keyArray = Array.isArray(keys)
        ? (keys as unknown as React.Key[])
        : Array.from(keys as Set<React.Key>);
      const firstKey = keyArray[0] as string | undefined;
      if (firstKey === undefined) return;
      // "latest" denotes the most recent successful run (live data)
      onSelectRun(firstKey === 'latest' ? null : firstKey);
    },
    [onSelectRun]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header/Summary */}
      <div ref={headerRef} className="border-b border-gray-700 z-10">
        <div className="container mx-auto p-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Print Tasks
            </h1>
            <div className="flex items-center gap-2">
              {/* Historical runs dropdown */}
              {recentRuns.length > 0 && (
                <Select
                  size="sm"
                  selectedKeys={new Set([selectedRunId ?? 'latest'])}
                  onSelectionChange={handleRunSelect}
                  aria-label="Select previous optimisation run"
                  placeholder="Run history"
                  className="min-w-[160px]"
                  items={[
                    { id: 'latest', label: 'Latest Run' },
                    ...recentRuns.map(run => ({
                      id: run.id,
                      label: new Date(run.finishedAt).toLocaleString(),
                    })),
                  ]}
                >
                  {item => (
                    <SelectItem key={item.id} textValue={item.label}>
                      {item.label}
                    </SelectItem>
                  )}
                </Select>
              )}
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
              <Tooltip content="Generate Plan for Today's Orders Only">
                <Button
                  type="button"
                  color="secondary"
                  variant="solid"
                  onPress={onGenerateTodayPlan}
                  isLoading={isOptimizing}
                  disabled={isLoading || isOptimizing}
                  size="sm"
                >
                  Today
                </Button>
              </Tooltip>
              <Tooltip content="Generate Plan for Today & Tomorrow Orders Only">
                <Button
                  type="button"
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
                  type="button"
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
            <div className="text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="font-medium text-gray-300">
                {derivedCompletedTasks} of {derivedTotalTasks} tasks completed
              </span>
              <span className="px-2 py-0.5 text-green-400 rounded-full">
                {derivedTotalTasks > 0
                  ? Math.round((derivedCompletedTasks / derivedTotalTasks) * 100)
                  : 0}
                %
              </span>
              <span className="font-medium text-gray-300">
                {derivedInProgressTasks} of {derivedTotalTasks} tasks in progress
              </span>
              <span className="px-2 py-0.5 text-yellow-400 rounded-full">
                {derivedTotalTasks > 0
                  ? Math.round((derivedInProgressTasks / derivedTotalTasks) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>

          {/* Global progress & bulk buttons */}
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Progress
                aria-label="Overall progress"
                value={totalItemsGlobal === 0 ? 0 : (completedItemsGlobal / totalItemsGlobal) * 100}
                size="sm"
                color={
                  allItemsCompletedGlobal
                    ? 'success'
                    : anyItemInProgressGlobal
                      ? 'primary'
                      : 'warning'
                }
                className="flex-1"
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {completedItemsGlobal} of {totalItemsGlobal} items completed
              </span>
            </div>
            <div className="flex gap-2 self-end">
              <Button
                color="warning"
                variant="flat"
                size="sm"
                startContent={<PlayIcon className="h-4 w-4" />}
                onPress={() => handleGlobalStatusChange(PrintTaskStatus.in_progress)}
                isDisabled={allItemsCompletedGlobal || anyItemInProgressGlobal}
              >
                Set All In Progress
              </Button>
              <Button
                color="success"
                variant="flat"
                size="sm"
                startContent={<CheckIcon className="h-4 w-4" />}
                onPress={() => handleGlobalStatusChange(PrintTaskStatus.completed)}
                isDisabled={allItemsCompletedGlobal}
              >
                Set All Complete
              </Button>
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
