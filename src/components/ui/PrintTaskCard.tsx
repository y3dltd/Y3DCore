import { Card, CardHeader, CardBody, Divider, Chip, Button, ChipProps } from '@nextui-org/react';
import { PrintTaskStatus } from '@prisma/client';
import React from 'react';

import { PrintTaskCardProps } from '@/types/print-tasks';

import { ColorChip } from './ColorChip';


interface StatusDisplayInfo {
  text: string;
  color: ChipProps['color'];
  action: string | null;
}

// helper to fall back to item-derived colours if colorsLoaded missing
const getColorsForTask = (task: Pick<PrintTaskCardProps, 'items' | 'colorsLoaded'>) => {
  if (task.colorsLoaded && task.colorsLoaded.length > 0) {
    return task.colorsLoaded;
  }
  return Array.from(
    new Set(
      task.items.flatMap(i => [i.color1, i.color2]).filter(Boolean) as string[]
    )
  );
};

export const PrintTaskCard: React.FC<PrintTaskCardProps> = ({
  taskId,
  orderId,
  status,
  items,
  colorsLoaded,
  onStatusChange,
}) => {
  const getStatusDisplay = (currentStatus: PrintTaskStatus): StatusDisplayInfo => {
    switch (currentStatus) {
      case PrintTaskStatus.pending:
        return { text: 'Ready to start printing', color: 'default', action: 'Start Printing' };
      case PrintTaskStatus.in_progress:
        return { text: 'Printing in progress...', color: 'warning', action: 'Mark as Completed' };
      case PrintTaskStatus.completed:
        return { text: 'Printing completed', color: 'success', action: null };
      case PrintTaskStatus.cancelled:
        return { text: 'Task cancelled', color: 'danger', action: null };
      default:
        return { text: 'Unknown status', color: 'default', action: null };
    }
  };

  const statusInfo = getStatusDisplay(status);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleActionClick = () => {
    if (onStatusChange) {
      let nextStatus: PrintTaskStatus | null = null;
      if (status === PrintTaskStatus.pending) {
        nextStatus = PrintTaskStatus.in_progress;
      } else if (status === PrintTaskStatus.in_progress) {
        nextStatus = PrintTaskStatus.completed;
      }
      if (nextStatus) {
        onStatusChange(taskId, nextStatus);
      }
    }
  };

  const uniqueColors = getColorsForTask({ items, colorsLoaded });

  return (
    <Card id={`task-${taskId}`} className="mb-4 bg-gray-800 border border-gray-700 shadow-md w-full">
      <CardHeader className="flex justify-between items-center p-3 bg-gray-850 rounded-t-lg border-b border-gray-700">
        <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-gray-100">
              {uniqueColors.length > 0 && colorsLoaded?.length ? 'Plate' : 'Task'} #{taskId}
            </h3>
            <span className="text-xs text-gray-400">Order ID: {orderId}</span>
        </div>
        <Chip color={statusInfo.color} size="sm" variant="flat">
            {totalItems} item{totalItems !== 1 ? 's' : ''} total
        </Chip>
      </CardHeader>
      
      {/* Colors to Load Section */}
      <div className="p-3 bg-gray-750 border-b border-gray-700">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Colors to Load:</h4>
        <div className="flex flex-wrap gap-2">
          {uniqueColors.map((color, index) => (
            <ColorChip key={index} color={color} />
          ))}
          {uniqueColors.length === 0 && (
            <span className="text-xs text-gray-500 italic">No colors specified</span>
          )}
        </div>
      </div>
      
      <Divider className="bg-gray-700"/>
      
      {/* Task Items Section */}
      <CardBody className="p-3">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Tasks:</h4>
        
        {items.map((item, index) => (
          <div key={index} className={`flex items-start mb-3 ${index < items.length - 1 ? 'pb-3 border-b border-gray-700' : ''}`}>
            <div className="mr-2 font-bold text-gray-300">{item.quantity}</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-1 mb-1">
                {item.color1 && <ColorChip color={item.color1} size="small" />}
                {item.color2 && <ColorChip color={item.color2} size="small" />}
                <span className="text-gray-200 ml-1">{item.customText || item.name}</span>
              </div>
              {item.customText && item.name && (
                <p className="text-xs text-gray-400">
                  Item: {item.name}
                </p>
              )}
            </div>
          </div>
        ))}

        <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between items-center">
          <p className="text-sm text-gray-400">{statusInfo.text}</p>
          {statusInfo.action && (
            <Button 
              size="sm" 
              color={status === PrintTaskStatus.pending ? "primary" : "success"}
              variant="solid"
              onClick={handleActionClick}
              className="text-xs font-semibold"
            >
              {statusInfo.action}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
};
