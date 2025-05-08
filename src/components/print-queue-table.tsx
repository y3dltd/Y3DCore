'use client';

import { PrintOrderTask, PrintTaskStatus, Product as PrismaProduct } from '@prisma/client';
import {
  ColumnDef,
  ColumnFiltersState,
  Row,
  RowSelectionState,
  SortingState,
  Table as TTable,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import {
  ArrowUpDown,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ClientPrintTaskData } from '@/types/print-tasks';
import { usePrintQueueModal } from '@/contexts/PrintQueueModalContext';

import { PrintTaskDetailModal } from './print-task-detail-modal';

interface SerializableProduct extends Omit<PrismaProduct, 'weight' | 'item_weight_value'> {
  weight: string | null;
  item_weight_value: string | null;
}

export interface PrintTaskData extends PrintOrderTask {
  product: SerializableProduct;
  orderLink?: string;
  order?: {
    requested_shipping_service: string | null;
    marketplace?: string | null;
    marketplace_order_number?: string | null;
  };
}

async function updateTaskStatus(taskId: number, status: PrintTaskStatus): Promise<{message?: string; count?: number}> {
  const response = await fetch(`/api/print-tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to parse error response' }));
    throw new Error(errorData.error || `Failed to update task ${taskId}`);
  }

  return response.json();
}

async function bulkUpdateTaskStatus(taskIds: number[], status: PrintTaskStatus): Promise<{message?: string; count?: number}> {
  const response = await fetch(`/api/print-tasks/bulk-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskIds, status }),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to parse error response' }));
    throw new Error(errorData.error || 'Bulk status update failed');
  }

  return response.json();
}

async function handleBulkStatusUpdateOutside(
  newStatus: PrintTaskStatus,
  numSelected: number,
  selectedRowIds: number[],
  setIsBulkUpdating: React.Dispatch<React.SetStateAction<boolean>>,
  router: ReturnType<typeof useRouter>,
  bulkUpdateHelper: typeof bulkUpdateTaskStatus
): Promise<void> {
  if (numSelected === 0) {
    toast.warning('No tasks selected.');
    return;
  }
  const idsToUpdate = selectedRowIds;
  setIsBulkUpdating(true);
  try {
    const result = await bulkUpdateHelper(idsToUpdate, newStatus);
    toast.success(
      `${result.message || `Successfully marked ${result.count} tasks as ${newStatus}.`}`
    );
    router.refresh();
  } catch (error: unknown) {
    console.error('Bulk status update failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown bulk update error';
    toast.error(`Bulk update failed: ${errorMessage}`);
  } finally {
    setIsBulkUpdating(false);
  }
}

const colorMapInternal: { [key: string]: { bg: string; textColor: string } } = {
  black: { bg: 'bg-black', textColor: 'text-white' },
  grey: { bg: 'bg-gray-400', textColor: 'text-white' },
  gray: { bg: 'bg-gray-400', textColor: 'text-white' },
  'light blue': { bg: 'bg-blue-400', textColor: 'text-white' },
  blue: { bg: 'bg-blue-500', textColor: 'text-white' },
  'dark blue': { bg: 'bg-blue-900', textColor: 'text-white' },
  brown: { bg: 'bg-yellow-800', textColor: 'text-white' },
  orange: { bg: 'bg-orange-500', textColor: 'text-white' },
  'matt orange': { bg: 'bg-orange-600', textColor: 'text-white' },
  'silk orange': { bg: 'bg-orange-400', textColor: 'text-black' },
  red: { bg: 'bg-red-600', textColor: 'text-white' },
  'fire engine red': { bg: 'bg-red-700', textColor: 'text-white' },
  'rose gold': { bg: 'bg-pink-300', textColor: 'text-black' },
  magenta: { bg: 'bg-fuchsia-700', textColor: 'text-white' },
  white: { bg: 'bg-white', textColor: 'text-black' },
  'cold white': {
    bg: 'bg-slate-50 border border-gray-300',
    textColor: 'text-black',
  },
  yellow: { bg: 'bg-yellow-400', textColor: 'text-black' },
  silver: { bg: 'bg-gray-300', textColor: 'text-black' },
  'silk silver': { bg: 'bg-gray-200', textColor: 'text-black' },
  purple: { bg: 'bg-purple-500', textColor: 'text-white' },
  pink: { bg: 'bg-pink-400', textColor: 'text-white' },
  'matt pink': { bg: 'bg-pink-500', textColor: 'text-white' },
  'silk pink': { bg: 'bg-pink-300', textColor: 'text-black' },
  gold: { bg: 'bg-yellow-500', textColor: 'text-black' },
  skin: { bg: 'bg-orange-200', textColor: 'text-black' },
  'peak green': { bg: 'bg-green-400', textColor: 'text-white' },
  green: { bg: 'bg-green-500', textColor: 'text-white' },
  'olive green': { bg: 'bg-green-700', textColor: 'text-white' },
  'pine green': { bg: 'bg-green-800', textColor: 'text-white' },
  'glow in the dark': { bg: 'bg-lime-300', textColor: 'text-black' },
  bronze: { bg: 'bg-amber-700', textColor: 'text-white' },
  beige: { bg: 'bg-amber-100', textColor: 'text-black' },
  turquoise: { bg: 'bg-teal-400', textColor: 'text-black' },
};

const getColorInfo = (
  colorName: string | null | undefined
): { bgClass: string; textClass: string } => {
  const defaultColor = { bgClass: 'bg-gray-200', textClass: 'text-black' };
  if (!colorName) return { bgClass: 'bg-transparent', textClass: 'text-foreground' };

  const lowerColorName = colorName.toLowerCase();

  if (lowerColorName.includes('peak green'))
    return {
      bgClass: colorMapInternal['peak green'].bg,
      textClass: colorMapInternal['peak green'].textColor,
    };
  if (lowerColorName.includes('light blue'))
    return {
      bgClass: colorMapInternal['light blue'].bg,
      textClass: colorMapInternal['light blue'].textColor,
    };
  if (lowerColorName.includes('dark grey') || lowerColorName.includes('dark gray'))
    return { bgClass: 'bg-gray-600', textClass: 'text-white' };
  if (lowerColorName.includes('magenta'))
    return {
      bgClass: colorMapInternal.magenta.bg,
      textClass: colorMapInternal.magenta.textColor,
    };
  if (lowerColorName.includes('white'))
    return {
      bgClass: colorMapInternal.white.bg,
      textClass: colorMapInternal.white.textColor,
    };

  const exactMatch = colorMapInternal[lowerColorName];
  if (exactMatch) return { bgClass: exactMatch.bg, textClass: exactMatch.textColor };

  const entries = Object.entries(colorMapInternal).sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    if (lowerColorName.includes(key)) return { bgClass: value.bg, textClass: value.textColor };
  }

  return defaultColor;
};

const formatRelativeDate = (date: Date | string | null): string => {
  if (!date) return 'N/A';
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isToday(dateObj)) return 'Today';
  if (isTomorrow(dateObj)) return 'Tomorrow';
  if (isYesterday(dateObj)) return 'Yesterday';
  return format(dateObj, 'dd/MM/yyyy');
};

interface TableMeta {
  openModal: (
    _task: ClientPrintTaskData
  ) => void;
}
interface ExtendedTableMeta extends TableMeta {
  router: ReturnType<typeof useRouter>;
}

function ActionCellComponent({
  row,
  table,
}: {
  row: Row<ClientPrintTaskData>;
  table: TTable<ClientPrintTaskData>;
}): JSX.Element {
  const meta = table.options.meta as ExtendedTableMeta;
  const openModal = meta?.openModal || ((_task: ClientPrintTaskData) => {
    console.warn('No openModal function provided');
  });
  const task = row.original;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleStatusUpdate = (newStatus: PrintTaskStatus): void => {
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, newStatus);
        toast.success(`Task marked as ${newStatus}`);
        router.refresh();
      } catch (error: unknown) {
        console.error('Status update failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to update task: ${errorMessage}`);
      }
    });
  };

  const handleCopyId = (): void => {
    navigator.clipboard
      .writeText(task.id.toString())
      .then(() => toast.success(`Task ID ${task.id} copied!`))
      .catch(() => toast.error('Failed to copy ID'));
  };

  const renderQuickActionButton = (): React.ReactNode => {
    if (task.status === PrintTaskStatus.pending) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full"
          onClick={() => handleStatusUpdate(PrintTaskStatus.in_progress)}
          disabled={isPending}
          title="Mark as In Progress"
        >
          <PlayCircle className="h-5 w-5" />
        </Button>
      );
    } else if (task.status === PrintTaskStatus.in_progress) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-full"
          onClick={() => handleStatusUpdate(PrintTaskStatus.completed)}
          disabled={isPending}
          title="Mark as Completed"
        >
          <CheckCircle2 className="h-5 w-5" />
        </Button>
      );
    } else if (task.status === PrintTaskStatus.completed) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-full"
          onClick={() => handleStatusUpdate(PrintTaskStatus.pending)}
          disabled={isPending}
          title="Mark as Pending"
        >
          <Undo2 className="h-5 w-5" />
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="flex justify-end space-x-2 actions-cell">
      {renderQuickActionButton()}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {task.orderLink && (
            <DropdownMenuItem asChild>
              <Link href={task.orderLink}>View Order</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleCopyId}>Copy Task ID</DropdownMenuItem>
          <DropdownMenuItem 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof openModal === 'function') {
                openModal(task);
              }
            }}
          >
            View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Status Actions
          </DropdownMenuLabel>

          {task.status !== PrintTaskStatus.pending && (
            <DropdownMenuItem
              onClick={() => handleStatusUpdate(PrintTaskStatus.pending)}
              disabled={isPending}
              className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="mr-2 h-4 w-4" />
              )}
              Mark Pending
            </DropdownMenuItem>
          )}
          {task.status !== PrintTaskStatus.in_progress && (
            <DropdownMenuItem
              onClick={() => handleStatusUpdate(PrintTaskStatus.in_progress)}
              disabled={isPending}
              className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Mark In Progress
            </DropdownMenuItem>
          )}
          {task.status !== PrintTaskStatus.completed && (
            <DropdownMenuItem
              onClick={() => handleStatusUpdate(PrintTaskStatus.completed)}
              disabled={isPending}
              className="text-green-600 hover:text-green-800 hover:bg-green-100"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Mark Completed
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const columns: ColumnDef<ClientPrintTaskData>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="border-gray-400 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean | 'indeterminate') => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="border-gray-400 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'product.sku',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          SKU
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const sku = row.getValue('product_sku') as string;
      const product = row.original.product;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="truncate font-mono text-xs max-w-[80px] cursor-default">
                {sku}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              <p className="text-sm font-semibold">{product.name}</p>
              <p className="text-xs text-muted-foreground">SKU: {sku}</p>
              {product.weight && <p className="text-xs">Weight: {product.weight}g</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'product.name',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Product Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const name = row.getValue('product_name') as string;
      const productName = name || 'N/A';
      return (
        <div
          title={productName}
          className="truncate max-w-[200px] whitespace-normal text-sm"
        >
          {productName}
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'quantity',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Qty
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const quantity = row.getValue('quantity') as number;
      if (quantity > 1) {
        return (
          <div className="text-center">
            <Badge variant="default" className="bg-blue-500 text-white px-2 py-0.5 text-xs">
              {quantity}
            </Badge>
          </div>
        );
      }
      return <div className="text-center text-sm">{quantity}</div>;
    },
    enableSorting: true,
  },
  {
    accessorKey: 'color_1',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Color 1
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const color = row.original.color_1;
      if (!color) return <div className="text-center">-</div>;

      const { bgClass, textClass } = getColorInfo(color);
      return (
        <div className="flex justify-center">
          <Badge
            className={`${bgClass} ${textClass} border border-gray-300 shadow-sm`}
            variant="outline"
          >
            {color}
          </Badge>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'color_2',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Color 2
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const color = row.original.color_2;
      if (!color) return <div className="text-center">-</div>;

      const { bgClass, textClass } = getColorInfo(color);
      return (
        <div className="flex justify-center">
          <Badge
            className={`${bgClass} ${textClass} border border-gray-300 shadow-sm`}
            variant="outline"
          >
            {color}
          </Badge>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'custom_text',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Personalisation
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const customText = row.getValue('custom_text') as string | null;
      const fullText = customText || '';
      const truncatedText =
        fullText.length > 50 ? `${fullText.substring(0, 50)}...` : fullText;

      const handleCopyCustomText = () => {
        if (fullText) {
          navigator.clipboard.writeText(fullText);
          toast.success('Custom text copied!');
        }
      };

      return fullText ? (
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-left font-medium truncate max-w-[180px] hover:whitespace-normal hover:overflow-visible">
                  {truncatedText}
                </div>
              </TooltipTrigger>
              {fullText.length > 50 && <TooltipContent>{fullText}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyCustomText}
            className="h-6 w-6 p-1 text-gray-500 hover:text-gray-700 ml-1 flex-shrink-0"
            title="Copy Custom Text"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <span className="text-gray-400">-</span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const status = row.original.status;
      let indicator;

      switch (status) {
        case PrintTaskStatus.pending:
          indicator = (
            <Badge
              variant="outline"
              className="bg-gray-100 text-gray-800 border-gray-300 font-medium"
            >
              Pending
            </Badge>
          );
          break;
        case PrintTaskStatus.in_progress:
          indicator = (
            <Badge
              variant="outline"
              className="bg-blue-100 text-blue-800 border-blue-300 font-medium"
            >
              In Progress
            </Badge>
          );
          break;
        case PrintTaskStatus.completed:
          indicator = (
            <Badge
              variant="outline"
              className="bg-green-100 text-green-800 border-green-300 font-medium"
            >
              Completed
            </Badge>
          );
          break;
        case PrintTaskStatus.cancelled:
          indicator = (
            <Badge
              variant="outline"
              className="bg-red-100 text-red-800 border-red-300 font-medium"
            >
              Cancelled
            </Badge>
          );
          break;
        default:
          indicator = (
            <Badge variant="outline" className="bg-gray-100 text-gray-800">
              {status}
            </Badge>
          );
      }

      return <div className="flex justify-center status-cell">{indicator}</div>;
    },
    enableSorting: true,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.original.created_at;
      return (
        <div className="text-center text-xs">
          <div>{formatRelativeDate(date)}</div>
          <div className="text-gray-500">
            {date ? format(new Date(date), 'HH:mm') : 'N/A'}
          </div>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'order.requested_shipping_service',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Shipping
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const shippingService = row.original.order?.requested_shipping_service;
      const shippingAlias = getShippingAlias(shippingService);

      let icon = null;
      if (shippingAlias === 'Special Delivery') {
        icon = (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Special Delivery - Priority</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      } else if (shippingAlias === 'Tracked24') {
        icon = (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-1"></span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tracked 24 - Priority</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return (
        <div className="flex items-center justify-center text-xs">
          {icon}
          <span>{shippingAlias}</span>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'order.marketplace',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Marketplace
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const marketplace = row.original.order?.marketplace;
      const marketplaceAlias = getMarketplaceAlias(marketplace);

      const style = marketplaceStyles[marketplaceAlias] || marketplaceStyles['N/A'];

      return (
        <div className="flex justify-center">
          <Badge className={`${style.bg} ${style.text}`} variant="default">
            {marketplaceAlias}
          </Badge>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'marketplace_order_number',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Order ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const orderNum = row.original.order?.marketplace_order_number;
      const orderLink = row.original.orderLink;

      if (orderLink) {
        return (
          <Link
            href={orderLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 hover:underline text-xs"
          >
            {orderNum || 'View Order'}
          </Link>
        );
      }
      return <div className="text-xs">{orderNum || 'N/A'}</div>;
    },
    enableSorting: true,
  },
  {
    id: 'actions',
    cell: ActionCellComponent,
    enableSorting: false,
    enableHiding: false,
  },
];

export interface PrintQueueTableProps {
  data: ClientPrintTaskData[];
  onSelectTask?: (task: ClientPrintTaskData) => void;
}

export function PrintQueueTable({ data, onSelectTask }: PrintQueueTableProps): JSX.Element {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const { setSelectedTask, setIsModalOpen } = usePrintQueueModal();

  const handleOpenModal = (task: ClientPrintTaskData) => {
    if (onSelectTask) {
      onSelectTask(task);
    }
    setSelectedTask(task); 
    setIsModalOpen(true);  
  };

  const table = useReactTable<ClientPrintTaskData>({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageSize: 100, pageIndex: 0 },
      columnFilters: [
        {
          id: 'status',
          value: [PrintTaskStatus.pending, PrintTaskStatus.in_progress],
        },
      ],
      sorting: [{ id: 'created_at', desc: true }],
      columnVisibility: {
        'custom_text': true,
        'marketplace_order_number': true,
        'product.sku': true,
        'product.name': true
      }
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    enableRowSelection: true,
    meta: { openModal: handleOpenModal, router } as ExtendedTableMeta,
  });

  const selectedRowIds = Object.keys(rowSelection)
    .map(index => table.getRowModel().rowsById[index]?.original?.id)
    .filter((id): id is number => typeof id === 'number');
  const numSelected = selectedRowIds.length;

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex-1 text-sm">
            <span className="text-muted-foreground">
              {numSelected > 0 ? `${numSelected} task(s) selected. ` : ''}
            </span>
            <span className="font-medium">{table.getFilteredRowModel().rows.length} tasks</span>
            <span className="text-muted-foreground"> displayed</span>
          </div>
        </div>
        <div className="flex items-center space-x-2 ml-auto">
          {numSelected > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleBulkStatusUpdateOutside(
                    PrintTaskStatus.in_progress,
                    numSelected,
                    selectedRowIds,
                    setIsBulkUpdating,
                    router,
                    bulkUpdateTaskStatus
                  )
                }
                disabled={isBulkUpdating}
                className="border-blue-500 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600"
              >
                {isBulkUpdating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}{' '}
                Mark Selected In Progress ({numSelected})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleBulkStatusUpdateOutside(
                    PrintTaskStatus.completed,
                    numSelected,
                    selectedRowIds,
                    setIsBulkUpdating,
                    router,
                    bulkUpdateTaskStatus
                  )
                }
                disabled={isBulkUpdating}
                className="border-green-500 text-green-500 hover:bg-green-500/10 hover:text-green-600"
              >
                {isBulkUpdating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}{' '}
                Mark Selected Completed ({numSelected})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleBulkStatusUpdateOutside(
                    PrintTaskStatus.pending,
                    numSelected,
                    selectedRowIds,
                    setIsBulkUpdating,
                    router,
                    bulkUpdateTaskStatus
                  )
                }
                disabled={isBulkUpdating}
              >
                {isBulkUpdating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="mr-2 h-4 w-4" />
                )}{' '}
                Mark Selected Pending ({numSelected})
              </Button>
            </>
          )}
        </div>
      </div>
      <div
        className="rounded-md border overflow-x-auto w-full mx-auto relative"
        style={{ minWidth: '100%', overflowX: 'auto' }}
      >
        <style jsx global>{`
          .print-queue-table td {
            padding: 0.75rem 0.5rem;
            min-width: auto;
            text-overflow: clip !important;
            overflow: visible !important;
            white-space: normal !important;
          }
          .print-queue-table th {
            padding: 0.75rem 0.5rem;
            min-width: auto;
            text-overflow: clip !important;
            overflow: visible !important;
            white-space: normal !important;
          }

          /* Specific column widths */
          .status-cell {
            position: sticky;
            right: 0;
            z-index: 10;
            background-color: var(--background);
          }
          .product-name-cell {
            min-width: 220px;
            max-width: 300px;
          }
          .sku-cell {
            min-width: 130px;
          }
          .marketplace-id-cell {
            min-width: 150px;
            width: 150px;
          }
          .custom-text-cell {
            min-width: 200px;
            max-width: 300px;
          }
          /* Add a bit more spacing to all cells */
          .tanstack-table td, .tanstack-table th {
            padding: 8px 12px;
          }

          /* Fix cell content display */
          .sku-cell > div,
          .product-name-cell > div {
            max-width: 100%;
            word-break: break-word;
            overflow: visible;
            padding: 8px 4px;
            line-height: 1.5;
            white-space: normal;
            text-overflow: clip !important;
          }

          /* Explicitly prevent text truncation anywhere in the table */
          .print-queue-table * {
            text-overflow: clip !important;
            overflow: visible !important;
          }
          .print-queue-table
            .in-progress-row
            td:not(.status-cell):not(.actions-cell):not(.select-cell) {
            text-decoration: line-through;
            text-decoration-thickness: 1px;
            color: #4b5563;
            font-style: italic;
          }

          /* Add a subtle left border to priority shipping rows */
          .print-queue-table tr.priority-special-delivery {
            border-left: 4px solid #ef4444;
          }
          }
        `}</style>
        <Table className="min-w-full table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan} className="px-3 py-2">
                    {header.isPlaceholder ? null : (
                      <div>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const task = row.original;
                const isInProgress = task.status === PrintTaskStatus.in_progress;
                const shippingService = task.order?.requested_shipping_service;
                const shippingAlias = getShippingAlias(shippingService);

                const isSpecialDelivery = shippingAlias === 'Special Delivery';
                const isTracked24 = shippingAlias === 'Tracked24';
                const _isPriority = isSpecialDelivery || isTracked24;

                const rowClassName = cn(
                  isInProgress && 'in-progress-row bg-gray-800/10',
                  isSpecialDelivery && 'font-medium priority-special-delivery bg-blue-50/30',
                  isTracked24 && 'font-medium priority-tracked24 bg-red-50/30',
                  ''
                );

                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={rowClassName}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'px-3 py-2',
                          cell.column.id === 'status'
                            ? 'status-cell sticky right-0 z-10 bg-background'
                            : '',
                          cell.column.id === 'actions'
                            ? 'actions-cell sticky right-0 z-10 bg-background'
                            : '',
                          cell.column.id === 'select' ? 'select-cell' : '',
                          cell.column.id === 'product.sku' ? 'sku-cell' : '',
                          cell.column.id === 'product.name' ? 'product-name-cell whitespace-normal' : '',
                          cell.column.id === 'marketplace_order_number' ? 'marketplace-id-cell' : '',
                          cell.column.id === 'custom_text' ? 'custom-text-cell' : ''
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <PrintTaskDetailModal />
    </div>
  );
}

const shippingMapping: Record<string, string> = {
  'NextDay UK Next': 'Special Delivery',
  'Next Day': 'Special Delivery',
  NextDay: 'Special Delivery',
  'Next Day UK': 'Special Delivery',

  UK_RoyalMailAirmailInternational: 'International',
  'International Tracked – 3-5 Working Days Delivery': 'International Tracked',

  UK_RoyalMailSecondClassStandard: 'Standard',
  UK_RoyalMail48: 'Standard',
  'Standard Std UK Dom_1': 'Standard',
  'Standard Std UK Dom_2': 'Standard',
  'Standard Std UK Dom_3': 'Standard',

  'SecondDay UK Second': 'Tracked24',
  '2-Day Shipping – 1-2 Working Days Delivery': 'Tracked24',
  'Tracked 24': 'Tracked24',
  UK_RoyalMail1stClassLetterLargeLetter: '1st Class',
};

const marketplaceMapping: Record<string, string> = {
  ebay_v2: 'eBay',
  amazon: 'Amazon',
  etsy: 'Etsy',
  web: 'Shopify',
};

const marketplaceStyles: Record<string, { bg: string; text: string }> = {
  Shopify: { bg: 'bg-green-600', text: 'text-white' },
  Amazon: { bg: 'bg-yellow-600', text: 'text-white' },
  eBay: { bg: 'bg-red-600', text: 'text-white' },
  Etsy: { bg: 'bg-orange-600', text: 'text-white' },
  'N/A': { bg: 'bg-gray-500', text: 'text-white' },
};

function getShippingAlias(originalName?: string | null): string {
  if (!originalName) {
    return 'N/A';
  }
  return shippingMapping[originalName] || originalName;
}

function getMarketplaceAlias(originalName?: string | null): string {
  if (!originalName) {
    return 'N/A';
  }
  const lowerCaseName = originalName.toLowerCase().trim();
  return marketplaceMapping[lowerCaseName] || originalName;
}
