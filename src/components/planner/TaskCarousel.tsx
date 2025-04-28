/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';
import { Button, Progress, Tooltip } from '@nextui-org/react';
import { PrintTaskStatus } from '@prisma/client';
import { Check, ClipboardCopy, Play, RotateCcw } from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';
import { PrintTaskCardProps } from '@/types/print-tasks';
import type { PrintItem } from '@/types/print-tasks';

import { ColorChip } from '../ui/ColorChip';

// Basic color name to hex mapping (moved to module scope)
const colorMap: Record<string, string> = {
  red: '#FF0000',
  blue: '#0000FF',
  green: '#00FF00',
  yellow: '#FFFF00',
  orange: '#FFA500',
  purple: '#800080',
  black: '#000000',
  white: '#FFFFFF',
  pink: '#FFC0CB',
  'light blue': '#ADD8E6',
  'dark blue': '#00008B',
  gray: '#808080',
  'fire engine red': '#CE2029',
  gold: '#FFD700',
  silver: '#C0C0C0',
  magenta: '#FF00FF',
  'peak green': '#008F39',
  'pine green': '#01796F',
  'cold white': '#F5F5F5',
  'light brown': '#B5651D',
  grey: '#808080',
  unknown: '#808080',
  // Add more colors as needed
};

interface TaskCarouselProps {
  tasks: PrintTaskCardProps[];
  className?: string;
  onTaskStatusChange: (taskId: string, itemId: string, newStatus: PrintTaskStatus) => void;
  onBulkTaskStatusChange: (taskId: string, newStatus: PrintTaskStatus) => void;
}

// Helper function to generate a gradient from colors - Simplified Logic
const getGradientFromColors = (colors: { color: string; displayName: string }[]): string => {
  if (!colors || colors.length === 0) {
    // Default gradient for no colors or empty array
    return 'linear-gradient(to right, #666, #555)';
  }

  // Map color names to hex codes, defaulting unknown/null to gray
  const colorValues = colors
    .map(c => colorMap[c.color?.toLowerCase() ?? 'unknown'] || '#808080') // Default to gray
    .slice(0, 4); // Limit to max 4 colors for the gradient display

  // Remove duplicates for the gradient itself
  const uniqueColorValues = [...new Set(colorValues)];

  if (uniqueColorValues.length === 0) {
    // Should not happen if input wasn't empty, but fallback just in case
    return 'linear-gradient(to right, #666, #555)';
  }

  if (uniqueColorValues.length === 1) {
    // Single color gradient
    return `linear-gradient(to right, ${uniqueColorValues[0]}, ${uniqueColorValues[0]})`;
  }

  // Multiple colors gradient
  return `linear-gradient(to right, ${uniqueColorValues.join(', ')})`;
};

// helper to get colors for ribbon
const getColorsForRibbon = (task: PrintTaskCardProps) => {
  if (task.colorsLoaded && task.colorsLoaded.length > 0) {
    // Ensure color strings are handled, provide default for null/undefined
    return task.colorsLoaded.map(c => ({ color: c ?? 'Unknown', displayName: c ?? 'Unknown' }));
  }
  return deriveColorsFromItems(task.items);
};

// Derive unique colors from all items within a task
const deriveColorsFromItems = (items: PrintItem[]): { color: string; displayName: string }[] => {
  const colorsSet = new Set<string>();
  items.forEach(item => {
    // Add null check for colors
    if (item.color1) colorsSet.add(item.color1);
    if (item.color2) colorsSet.add(item.color2);
  });
  // Handle case where no colors are defined
  if (colorsSet.size === 0) {
    return [{ color: 'Unknown', displayName: 'N/A' }];
  }

  return Array.from(colorsSet).map(c => ({ color: c, displayName: c }));
};

// Helper function to copy text to clipboard
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).then(
    () => {
      console.log('Text copied to clipboard:', text);
    },
    err => {
      console.error('Failed to copy text:', err);
    }
  );
};

const TaskCarousel: React.FC<TaskCarouselProps> = ({
  tasks,
  className,
  onTaskStatusChange,
  onBulkTaskStatusChange,
}) => {
  if (!tasks || tasks.length === 0) {
    return (
      <div className={`h-full flex items-center justify-center text-gray-500 ${className}`}>
        No tasks to display.
      </div>
    );
  }

  // Helper to confirm bulk status change per plate
  const confirmAndBulkUpdate = (taskId: string, newStatus: PrintTaskStatus) => {
    let actionLabel = 'update';
    if (newStatus === PrintTaskStatus.in_progress) actionLabel = 'mark as In Progress';
    else if (newStatus === PrintTaskStatus.completed) actionLabel = 'mark as Complete';
    else if (newStatus === PrintTaskStatus.pending) actionLabel = 'reset to Pending';
    if (
      // eslint-disable-next-line no-alert
      window.confirm(`Are you sure you want to ${actionLabel} for all items on this plate?`)
    ) {
      onBulkTaskStatusChange(taskId, newStatus);
    }
  };

  return (
    <div className={className}>
      {tasks.map(task => {
        const colors = getColorsForRibbon(task);
        const gradient = getGradientFromColors(colors);
        const itemCount = task.items ? task.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

        const completedItems = task.items
          ? task.items.filter(item => item.status === PrintTaskStatus.completed).length
          : 0;
        const progress =
          task.items && task.items.length > 0
            ? Math.round((completedItems / task.items.length) * 100)
            : 0;
        const allItemsCompleted = task.items ? completedItems === task.items.length : false;
        const anyItemInProgress = task.items
          ? task.items.some(item => item.status === PrintTaskStatus.in_progress)
          : false;

        return (
          <section
            id={`task-${task.taskId}`}
            key={task.taskId}
            className="mb-8 rounded-xl overflow-hidden transition-transform hover:scale-[1.01] border border-gray-700/50 bg-gray-800/10"
          >
            <div className="h-6 w-full" style={{ background: gradient }} />

            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-xl font-bold flex justify-between items-center text-gray-200">
                  <span>Plate #{task.taskId?.substring(0, 6) ?? 'N/A'}</span>
                  <span className="text-sm font-normal text-gray-300 px-2 py-1 rounded">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} total
                  </span>
                </h3>
                <div className="mt-1 flex flex-wrap gap-1 items-center">
                  {colors.map((color, idx) => (
                    <Tooltip key={idx} content={color.displayName}>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-4 h-4 rounded-full border border-gray-200 flex-shrink-0"
                          aria-label={`Color swatch for ${color.displayName}`}
                          style={{
                            backgroundColor:
                              colorMap[color.color?.toLowerCase() ?? 'unknown'] || '#CCCCCC',
                          }}
                        />
                        <span className="text-xs text-gray-400">{color.displayName}</span>
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Assigned Items:</h4>
                {task.items &&
                  task.items.map((item, itemIdx) => {
                    const textToCopy = item.customText || '';
                    const itemStatus = item.status || PrintTaskStatus.pending;
                    return (
                      <div
                        key={item.name || `item-${itemIdx}`}
                        className={`flex items-center gap-3 p-3 rounded-md ${itemIdx < task.items.length - 1 ? 'border-b border-gray-700/50' : ''} bg-gray-800/30`}
                      >
                        <div
                          className={cn(
                            'text-sm w-6 text-right flex-shrink-0',
                            item.quantity > 1
                              ? 'font-bold text-red-400'
                              : 'font-semibold text-gray-300'
                          )}
                        >
                          {item.quantity}x
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            {item.color1 && (
                              <div className="flex items-center gap-1">
                                <ColorChip color={item.color1} size="small" />
                                <span className="text-xs text-gray-400">{item.color1}</span>
                              </div>
                            )}
                            {item.color2 && (
                              <div className="flex items-center gap-1">
                                <ColorChip color={item.color2} size="small" />
                                <span className="text-xs text-gray-400">{item.color2}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-200 text-sm font-medium">
                              {item.customText || '(No Custom Text)'}
                            </span>
                            {textToCopy && (
                              <Tooltip content="Copy Text">
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  className="h-6 w-6 min-w-0 text-gray-400 hover:text-gray-200"
                                  onPress={() => copyToClipboard(textToCopy)}
                                  aria-label="Copy text"
                                >
                                  <ClipboardCopy className="h-4 w-4" />
                                </Button>
                              </Tooltip>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span>{item.productName || 'Unknown Product'}</span>
                            <span className="ml-2">SKU: {item.sku || 'N/A'}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            (Item Ref: {item.name || 'N/A'})
                          </p>
                        </div>
                        <div className="flex flex-col items-end space-y-1 ml-2">
                          <span
                            className={cn(
                              'text-xs px-1.5 py-0.5 rounded-full',
                              itemStatus === 'completed'
                                ? 'bg-green-700 text-green-100'
                                : itemStatus === 'in_progress'
                                  ? 'bg-yellow-700 text-yellow-100'
                                  : 'bg-gray-600 text-gray-100'
                            )}
                          >
                            {itemStatus.replace('_', ' ')}
                          </span>
                          <div className="flex gap-1">
                            <Tooltip content="Mark In Progress">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
                                className="h-6 w-6 min-w-0 text-yellow-400"
                                onPress={() =>
                                  onTaskStatusChange(
                                    task.taskId,
                                    item.name,
                                    PrintTaskStatus.in_progress
                                  )
                                }
                                isDisabled={
                                  itemStatus === 'in_progress' || itemStatus === 'completed'
                                }
                                aria-label="Mark In Progress"
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Reset to Pending">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
                                className="h-6 w-6 min-w-0 text-gray-400"
                                onPress={() =>
                                  onTaskStatusChange(
                                    task.taskId,
                                    item.name,
                                    PrintTaskStatus.pending
                                  )
                                }
                                isDisabled={itemStatus === 'pending'}
                                aria-label="Reset Pending"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Mark Complete">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="flat"
                                className="h-6 w-6 min-w-0 text-green-400"
                                onPress={() =>
                                  onTaskStatusChange(
                                    task.taskId,
                                    item.name,
                                    PrintTaskStatus.completed
                                  )
                                }
                                isDisabled={itemStatus === 'completed'}
                                aria-label="Mark Complete"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="w-1/2">
                    <Progress
                      value={progress}
                      size="sm"
                      color={
                        allItemsCompleted ? 'success' : anyItemInProgress ? 'primary' : 'warning'
                      }
                      aria-label={`Plate ${task.taskId ?? 'N/A'} progress`}
                      className="mb-2"
                    />
                    <p className="text-sm text-gray-400">
                      {completedItems} of {task.items?.length ?? 0} items completed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      color="warning"
                      variant="flat"
                      size="sm"
                      onPress={() => confirmAndBulkUpdate(task.taskId, PrintTaskStatus.in_progress)}
                      isDisabled={allItemsCompleted}
                      startContent={<Play className="h-4 w-4" />}
                    >
                      Set All In Progress
                    </Button>
                    <Button
                      color="default"
                      variant="flat"
                      size="sm"
                      onPress={() => confirmAndBulkUpdate(task.taskId, PrintTaskStatus.pending)}
                      isDisabled={task.items.every(item => item.status === PrintTaskStatus.pending)}
                      startContent={<RotateCcw className="h-4 w-4" />}
                    >
                      Reset All Pending
                    </Button>
                    <Button
                      color="success"
                      variant="flat"
                      size="sm"
                      onPress={() => confirmAndBulkUpdate(task.taskId, PrintTaskStatus.completed)}
                      isDisabled={allItemsCompleted}
                      startContent={<Check className="h-4 w-4" />}
                    >
                      Set All Complete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default TaskCarousel;
