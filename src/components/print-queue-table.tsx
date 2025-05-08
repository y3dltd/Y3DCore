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
// Remove context dependencies completely
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
import { usePrintQueueModal } from '@/contexts/PrintQueueModalContext';
import { cn } from '@/lib/utils';
import { ClientPrintTaskData } from '@/types/print-tasks';

import { PrintTaskDetailModal } from './print-task-detail-modal';

// Define a product type suitable for client components (Decimals as strings)
interface SerializableProduct extends Omit<PrismaProduct, 'weight' | 'item_weight_value'> {
  weight: string | null;
  item_weight_value: string | null;
}

// Update PrintTaskData to use the serializable product type
export interface PrintTaskData extends PrintOrderTask {
  product: SerializableProduct;
  orderLink?: string;
  order?: {
    requested_shipping_service: string | null;
    marketplace?: string | null; // Add marketplace here
  };
}

// Helper function for single task status update
async function updateTaskStatus(taskId: number, status: PrintTaskStatus) {
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

// Helper function for bulk task status update
async function bulkUpdateTaskStatus(taskIds: number[], status: PrintTaskStatus) {
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

// Moved handleBulkStatusUpdate outside the component
// It now accepts necessary state and functions as arguments
async function handleBulkStatusUpdateOutside(
  newStatus: PrintTaskStatus,
  numSelected: number,
  selectedRowIds: number[],
  setIsBulkUpdating: React.Dispatch<React.SetStateAction<boolean>>,
  router: ReturnType<typeof useRouter>,
  bulkUpdateHelper: typeof bulkUpdateTaskStatus // Pass the helper function
) {
  if (numSelected === 0) {
    toast.warning('No tasks selected.');
    return;
  }
  const idsToUpdate = selectedRowIds;
  setIsBulkUpdating(true);
  try {
    const result = await bulkUpdateHelper(idsToUpdate, newStatus); // Use the passed helper
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

// Comprehensive color mapping
const colorMapInternal: { [key: string]: { bg: string; textColor: string } } = {
  black: { bg: 'bg-black', textColor: 'text-white' },
  grey: { bg: 'bg-gray-400', textColor: 'text-white' },
  gray: { bg: 'bg-gray-400', textColor: 'text-white' },
  'light blue': { bg: 'bg-blue-400', textColor: 'text-white' }, // Lighter blue
  blue: { bg: 'bg-blue-500', textColor: 'text-white' },
  'dark blue': { bg: 'bg-blue-900', textColor: 'text-white' }, // Darker blue
  brown: { bg: 'bg-yellow-800', textColor: 'text-white' },
  orange: { bg: 'bg-orange-500', textColor: 'text-white' },
  'matt orange': { bg: 'bg-orange-600', textColor: 'text-white' },
  'silk orange': { bg: 'bg-orange-400', textColor: 'text-black' },
  red: { bg: 'bg-red-600', textColor: 'text-white' }, // Brighter red
  'fire engine red': { bg: 'bg-red-700', textColor: 'text-white' }, // Darker red
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
  'peak green': { bg: 'bg-green-400', textColor: 'text-white' }, // Lighter green
  green: { bg: 'bg-green-500', textColor: 'text-white' },
  'olive green': { bg: 'bg-green-700', textColor: 'text-white' },
  'pine green': { bg: 'bg-green-800', textColor: 'text-white' },
  'glow in the dark': { bg: 'bg-lime-300', textColor: 'text-black' },
  bronze: { bg: 'bg-amber-700', textColor: 'text-white' },
  beige: { bg: 'bg-amber-100', textColor: 'text-black' },
  turquoise: { bg: 'bg-teal-400', textColor: 'text-black' },
};

// Helper to get Tailwind classes for color - Corrected return type
const getColorInfo = (
  colorName: string | null | undefined
): { bgClass: string; textClass: string } => {
  const defaultColor = { bgClass: 'bg-gray-200', textClass: 'text-black' };
  if (!colorName) return { bgClass: 'bg-transparent', textClass: 'text-foreground' };

  const lowerColorName = colorName.toLowerCase();

  // Handle special cases first
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

  // Try exact match
  const exactMatch = colorMapInternal[lowerColorName];
  if (exactMatch) return { bgClass: exactMatch.bg, textClass: exactMatch.textColor };

  // Try partial match
  const entries = Object.entries(colorMapInternal).sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    if (lowerColorName.includes(key)) return { bgClass: value.bg, textClass: value.textColor };
  }

  return defaultColor;
};

// Helper function for shipping alias is defined at the bottom of the file

// Helper function for marketplace alias is defined at the bottom of the file

// Marketplace styles are defined at the bottom of the file

// Helper function to format dates
const formatRelativeDate = (date: Date | null): string => {
  if (!date) return 'N/A';
  const dateObj = new Date(date);
  if (isToday(dateObj)) return 'Today';
  if (isTomorrow(dateObj)) return 'Tomorrow';
  if (isYesterday(dateObj)) return 'Yesterday';
  return format(dateObj, 'dd/MM/yyyy');
};

// Define interfaces for table meta
interface TableMeta {
  openModal: (task: ClientPrintTaskData) => void;
}
interface ExtendedTableMeta extends TableMeta {
  router: ReturnType<typeof useRouter>;
}

// --- Extracted Action Cell Component ---
function ActionCellComponent({
  row,
  table,
}: {
  row: Row<ClientPrintTaskData>;
  table: TTable<ClientPrintTaskData>;
}) {
  const meta = table.options.meta as ExtendedTableMeta;
  const { openModal } = meta;
  const task = row.original;
  const router = useRouter(); // Hooks are safe here
  const [isPending, startTransition] = useTransition(); // Hooks are safe here
  const currentStatus = task.status;

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

  // Quick action button based on current status
  const renderQuickActionButton = (): React.ReactNode => {
    if (currentStatus === PrintTaskStatus.pending) {
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
    } else if (currentStatus === PrintTaskStatus.in_progress) {
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
    } else if (currentStatus === PrintTaskStatus.completed) {
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
          <DropdownMenuItem onClick={() => openModal(task)}>View Details</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Status Actions
          </DropdownMenuLabel>

          {/* Status change options */}
          {currentStatus !== PrintTaskStatus.pending && (
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
          {currentStatus !== PrintTaskStatus.in_progress && (
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
          {currentStatus !== PrintTaskStatus.completed && (
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

// Define Table Columns
// Reordering columns to ensure critical columns are always visible
export const columns: ColumnDef<ClientPrintTaskData>[] = [
  {
    accessorKey: 'product.sku',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        SKU <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const sku = row.original.product?.sku || 'N/A';
      // Use direct text output without any truncation or special styling
      return (
        <div
          style={{
            fontSize: '12px',
            textOverflow: 'clip',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflow: 'visible',
            padding: '4px',
            width: '100%',
            maxWidth: '300px',
            display: 'block',
          }}
          title={sku}
        >
          {sku}
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'product.name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Product Name <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const productName = row.original.product?.name || 'N/A';
      // Use direct text output without any truncation or special styling
      return (
        <div
          style={{
            fontSize: '12px',
            textOverflow: 'clip',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflow: 'visible',
            padding: '4px',
            width: '100%',
            maxWidth: '350px',
            display: 'block',
          }}
          title={productName}
        >
          {productName}
        </div>
      );
    },
  },
  {
    accessorKey: 'quantity',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Qty <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const quantity = row.getValue('quantity') as number;
      const isMultiple = quantity > 1;
      return (
        <div className="text-center">
          <Badge
            variant="secondary"
            className={cn(
              'text-xs px-2 py-0.5 text-primary-foreground',
              isMultiple ? 'bg-blue-500 hover:bg-blue-600' : 'bg-primary/20 hover:bg-primary/30'
            )}
          >
            {quantity}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'color_1',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Color 1 <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const color = row.getValue('color_1') as string | null;
      if (!color) return <span className="text-xs text-muted-foreground">-</span>;
      const { bgClass, textClass } = getColorInfo(color);
      const colorClass = `color-${color.toLowerCase().replace(/\s+/g, '-')}`;
      return (
        <div className="flex items-center">
          <span
            className={cn(
              'px-2 py-1 rounded-md text-xs font-medium inline-block w-[100px] text-center',
              bgClass,
              textClass,
              colorClass,
              color?.toLowerCase() === 'white'
                ? 'border-2 border-gray-400'
                : 'border border-gray-700'
            )}
            title={color}
          >
            {color}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'color_2',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Color 2 <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const color = row.getValue('color_2') as string | null;
      if (!color) return <span className="text-xs text-muted-foreground">-</span>;
      const { bgClass, textClass } = getColorInfo(color);
      const colorClass = `color-${color.toLowerCase().replace(/\s+/g, '-')}`;
      return (
        <div className="flex items-center">
          <span
            className={cn(
              'px-2 py-1 rounded-md text-xs font-medium inline-block w-[100px] text-center',
              bgClass,
              textClass,
              colorClass,
              color?.toLowerCase() === 'white'
                ? 'border-2 border-gray-400'
                : 'border border-gray-700'
            )}
            title={color}
          >
            {color}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'custom_text',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Custom Text <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: function CustomTextCell({ row }) {
      const text = row.getValue('custom_text') as string | null;
      const task = row.original;
      const { setSelectedTask, setIsModalOpen } = usePrintQueueModal();

      const handleOpenModal = () => {
        setSelectedTask(task);
        setIsModalOpen(true);
      };
      const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (text) {
          navigator.clipboard
            .writeText(text)
            .then(() => toast.success('Custom text copied!'))
            .catch(() => toast.error('Failed to copy text'));
        }
      };

      return (
        <div
          className="flex items-center gap-1 min-w-[150px] max-w-[200px] group cursor-pointer"
          onClick={handleOpenModal}
          title={text || 'View Details'}
        >
          <span className="break-words whitespace-normal flex-grow font-mono text-xs leading-tight min-h-[2.5em] overflow-y-auto max-h-[4em]">
            {text || '-'}
          </span>
          {text && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={handleCopy}
              aria-label="Copy custom text"
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Status <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: function StatusCell({ row }) {
      const status = row.getValue('status') as PrintTaskStatus;

      // Use custom styling for status badges
      let badgeClass = '';
      if (status === PrintTaskStatus.pending) {
        badgeClass =
          'bg-slate-600 hover:bg-slate-700 text-white px-3 py-1 min-w-[100px] text-center';
      } else if (status === PrintTaskStatus.in_progress) {
        badgeClass = 'bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 min-w-[100px] text-center';
      } else if (status === PrintTaskStatus.completed) {
        badgeClass =
          'bg-green-600 hover:bg-green-700 text-white px-3 py-1 min-w-[100px] text-center';
      } else if (status === PrintTaskStatus.cancelled) {
        badgeClass = 'bg-red-600 hover:bg-red-700 text-white px-3 py-1 min-w-[100px] text-center';
      }

      return (
        <div className="flex justify-center items-center status-cell">
          <Badge className={cn('font-medium', badgeClass)}>{status}</Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'needs_review',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Review? <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const needsReview = row.getValue('needs_review') as boolean;
      const reviewReason = row.original.review_reason;
      if (!needsReview)
        return (
          <div className="flex justify-center">
            <span className="text-muted-foreground text-xs">No</span>
          </div>
        );
      const indicator = (
        <div className="flex justify-center">
          <div className="bg-red-100 border border-red-500 rounded p-1 w-6 h-6 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-red-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      );
      if (reviewReason) {
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{indicator}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs break-words">{reviewReason}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return indicator;
    },
  },
  {
    accessorKey: 'ship_by_date',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Ship By <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div>{formatRelativeDate(row.getValue('ship_by_date') as Date | null)}</div>,
  },
  {
    accessorKey: 'marketplace_order_number',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Order # <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const task = row.original;
      return task.orderLink ? (
        <a
          href={task.orderLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground/90 hover:text-foreground hover:underline w-full inline-block text-xs"
          title={task.marketplace_order_number || ''}
        >
          {task.marketplace_order_number}
        </a>
      ) : (
        <span className="w-full inline-block text-xs" title={task.marketplace_order_number || ''}>
          {task.marketplace_order_number}
        </span>
      );
    },
  },
  {
    accessorKey: 'order.marketplace',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Marketplace <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const marketplace = row.original.order?.marketplace;
      const alias = getMarketplaceAlias(marketplace);
      const style = marketplaceStyles[alias] || marketplaceStyles['N/A'];

      return (
        <div className="text-center">
          <Badge
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md min-w-[80px] inline-block',
              style.bg,
              style.text
            )}
          >
            {alias}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: 'order.requested_shipping_service',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Shipping <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const shippingService = row.original.order?.requested_shipping_service;
      const alias = getShippingAlias(shippingService);

      // Determine icon and styling based on shipping method
      let icon = null;
      let className = 'px-3 py-1 text-xs font-medium inline-flex items-center gap-1.5 rounded';

      if (alias === 'Special Delivery') {
        // Special Delivery - Blue with red text
        className += ' bg-blue-600 text-red-500 border border-blue-700 font-bold';
        icon = (
          <span className="w-3 h-3 bg-blue-700 border border-blue-800 rounded-sm flex items-center justify-center text-[8px] font-bold text-white">
            1
          </span>
        );
      } else if (alias === 'Tracked24') {
        // Tracked24 - Red with yellow text
        className += ' bg-red-600 text-yellow-300 border border-red-700 font-bold';
        icon = <span className="w-3 h-3 bg-red-700 rounded-sm"></span>;
      } else if (alias === '1st Class') {
        // 1st Class - Black with white text
        className += ' bg-black text-white border border-gray-700 font-bold';
      } else {
        // Default styling
        className += ' bg-gray-100 text-gray-700 border border-gray-200';
      }

      return (
        <div className="text-center">
          <span className={className}>
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span>{alias}</span>
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="px-2 py-1 h-7"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Created <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as Date;
      // Use a fixed format instead of relative time to avoid hydration errors
      const formattedDate = format(new Date(date), 'dd/MM/yy HH:mm');
      const absoluteTime = date.toLocaleString();

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center text-xs">{formattedDate}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{absoluteTime}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    enableSorting: true,
  },
  {
    id: 'actions',
    enableHiding: false,
    cell: ({ row, table }) => <ActionCellComponent row={row} table={table} />,
  },
];

// Define Props Interface
export interface PrintQueueTableProps {
  data: ClientPrintTaskData[];
  onSelectTask?: (task: ClientPrintTaskData) => void;
}

// Main Component
export function PrintQueueTable({ data, onSelectTask }: PrintQueueTableProps) {
  const router = useRouter();

  const onTaskClick = (task: ClientPrintTaskData) => {
    if (onSelectTask) {
      onSelectTask(task);
    }
  };

  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

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
      sorting: [{ id: 'created_at', desc: true }], // Sort by newest first
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    enableRowSelection: true,
    meta: { openModal: onTaskClick, router } as ExtendedTableMeta,
  });

  const selectedRowIds = Object.keys(rowSelection)
    .map(index => table.getRowModel().rowsById[index]?.original?.id)
    .filter((id): id is number => typeof id === 'number');
  const numSelected = selectedRowIds.length;

  // handleBulkStatusUpdate is now defined outside the component
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
        {/* Custom styles for table cells */}
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
          .sku-cell {
            min-width: 300px !important;
            width: 300px !important;
          }
          .product-name-cell {
            min-width: 350px !important;
            width: 350px !important;
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

          .print-queue-table tr.priority-tracked24 {
            border-left: 4px solid #2563eb;
          }
        `}</style>
        <Table className="print-queue-table data-table w-full">
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.id === 'select' ? 'sticky left-0 z-10 bg-background' : '',
                      header.id === 'status' ? 'sticky right-0 z-10 bg-background' : '',
                      header.id === 'actions' ? 'sticky right-0 z-10 bg-background' : ''
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => {
                const task = row.original;
                const isInProgress = task.status === PrintTaskStatus.in_progress;
                const shippingService = task.order?.requested_shipping_service;
                const shippingAlias = getShippingAlias(shippingService);

                // Check for priority shipping methods
                const isSpecialDelivery = shippingAlias === 'Special Delivery';
                const isTracked24 = shippingAlias === 'Tracked24';
                const _isPriority = isSpecialDelivery || isTracked24;

                // Row styling based on status and shipping method
                const rowClassName = cn(
                  // Status styling
                  isInProgress && 'in-progress-row bg-gray-800/10',

                  // Shipping method styling - make priority shipping stand out
                  isSpecialDelivery && 'font-medium priority-special-delivery bg-blue-50/30',
                  isTracked24 && 'font-medium priority-tracked24 bg-red-50/30',

                  // Zebra striping for normal rows - removed for consistent dark hover
                  ''
                );

                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={rowClassName}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.id === 'status'
                            ? 'status-cell sticky right-0 z-10 bg-background'
                            : '',
                          cell.column.id === 'actions'
                            ? 'actions-cell sticky right-0 z-10 bg-background'
                            : '',
                          cell.column.id === 'select' ? 'select-cell' : '',
                          cell.column.id === 'product.sku' ? 'sku-cell' : '',
                          cell.column.id === 'product.name' ? 'product-name-cell' : ''
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
      <PrintTaskDetailModal /> {/* Reverted back to self-closing */}
    </div>
  );
}

// --- Shipping Name Mapping ---
const shippingMapping: Record<string, string> = {
  // Next Day and Special Delivery
  'NextDay UK Next': 'Special Delivery',
  'Next Day': 'Special Delivery',
  NextDay: 'Special Delivery',
  'Next Day UK': 'Special Delivery',

  // International
  UK_RoyalMailAirmailInternational: 'International',
  'International Tracked – 3-5 Working Days Delivery': 'International Tracked',

  // Standard
  UK_RoyalMailSecondClassStandard: 'Standard',
  UK_RoyalMail48: 'Standard',
  'Standard Std UK Dom_1': 'Standard',
  'Standard Std UK Dom_2': 'Standard',
  'Standard Std UK Dom_3': 'Standard',

  // Tracked
  'SecondDay UK Second': 'Tracked24',
  '2-Day Shipping – 1-2 Working Days Delivery': 'Tracked24',
  'Tracked 24': 'Tracked24',
  UK_RoyalMail1stClassLetterLargeLetter: '1st Class',
};

// Shipping method styles - commented out as we're not using backgrounds anymore
// const shippingStyles: Record<string, { bg: string; text: string }> = {
//   "Special Delivery": { bg: "bg-red-600", text: "text-white" },
//   "Tracked24": { bg: "bg-blue-600", text: "text-white" },
//   "1st Class": { bg: "bg-blue-500", text: "text-white" },
//   "Standard": { bg: "bg-gray-800", text: "text-white" }, // Deeper black
//   "International": { bg: "bg-teal-600", text: "text-white" },
//   "International Tracked": { bg: "bg-teal-700", text: "text-white" },
//   "N/A": { bg: "bg-gray-800", text: "text-white" }, // Deeper black
// };

function getShippingAlias(originalName?: string | null): string {
  if (!originalName) {
    return 'N/A'; // Handle null or undefined
  }
  return shippingMapping[originalName] || originalName; // Return alias or original if no match
}
// --- End Temporary Shipping Name Mapping ---

// --- Temporary Marketplace Name Mapping ---
const marketplaceMapping: Record<string, string> = {
  ebay_v2: 'eBay', // Keep keys lowercase
  amazon: 'Amazon',
  etsy: 'Etsy',
  web: 'Shopify',
};

function getMarketplaceAlias(originalName?: string | null): string {
  if (!originalName) {
    return 'N/A'; // Handle null or undefined
  }
  // Convert input to lowercase AND trim whitespace
  const lowerCaseName = originalName.toLowerCase().trim();
  // Lookup using lowercase key, return display alias or original name if no match
  return marketplaceMapping[lowerCaseName] || originalName;
}

// Marketplace Styles (Keys should match the *output* of getMarketplaceAlias, e.g., "eBay")
const marketplaceStyles: Record<string, { bg: string; text: string }> = {
  Shopify: { bg: 'bg-green-600', text: 'text-white' },
  Amazon: { bg: 'bg-yellow-600', text: 'text-white' },
  eBay: { bg: 'bg-red-600', text: 'text-white' },
  Etsy: { bg: 'bg-orange-600', text: 'text-white' },
  'N/A': { bg: 'bg-gray-500', text: 'text-white' }, // Default/Unknown
};

// --- End Temporary Marketplace Name Mapping ---
