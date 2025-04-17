'use client';

import { PrintTaskStatus } from '@prisma/client';
import { format } from 'date-fns';
import debounce from 'lodash.debounce';
import { X, CalendarIcon, RotateCcw } from 'lucide-react'; // Import icons
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import React, { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const colorOptions = [
  'Black',
  'Grey',
  'Light Blue',
  'Blue',
  'Dark Blue',
  'Brown',
  'Orange',
  'Matt Orange',
  'Silk Orange',
  'Red',
  'Fire Engine Red',
  'Rose Gold',
  'Magenta',
  'White',
  'Yellow',
  'Silver',
  'Silk Silver',
  'Purple',
  'Pink',
  'Gold',
  'Skin',
  'Peak Green',
  'Green',
  'Olive Green',
  'Pine Green',
  'Cold White',
  'Matt Pink',
  'Silk Pink',
  'Glow in the Dark',
  'Bronze',
  'Beige',
  'Turquoise',
];

interface PrintQueueFiltersProps {
  currentFilters: {
    status?: string | string[];
    needsReview?: string | string[];
    query?: string | string[];
    shipByDateStart?: string | string[];
    shipByDateEnd?: string | string[];
    color1?: string | string[];
    color2?: string | string[];
    color?: string | string[];
    shippingMethod?: string | string[];
  };
  availableProductNames?: string[];
  availableShippingMethods?: string[];
}

// Helper to get the first value if it's an array
const getFilterParam = (value: string | string[] | undefined): string | undefined => {
  return Array.isArray(value) ? value[0] : value;
};

// Type guard for PrintTaskStatus
function isPrintTaskStatus(value: string): value is PrintTaskStatus {
  // Check if value is one of the enum keys
  return Object.values(PrintTaskStatus).includes(value as PrintTaskStatus);
}

// Type guard for extended status including 'active'
function isExtendedPrintTaskStatus(value: string): value is PrintTaskStatus | 'active' | 'all' {
  return isPrintTaskStatus(value) || value === 'all' || value === 'active';
}

// Type guard for Review Option
function isReviewOption(value: string): value is 'yes' | 'no' | 'all' {
  return ['yes', 'no', 'all'].includes(value);
}

export function PrintQueueFilters({
  currentFilters,
  availableProductNames = [],
  availableShippingMethods = [],
}: PrintQueueFiltersProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const productNames = availableProductNames; // Will be used in future implementation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const shippingMethods = availableShippingMethods; // Available shipping methods
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local state for controlled inputs
  const initialQueryParam = getFilterParam(currentFilters.query) || '';
  const [query, setQuery] = useState(initialQueryParam);

  const initialStatusParam = getFilterParam(currentFilters.status) || 'active';
  const initialValidatedStatus = isExtendedPrintTaskStatus(initialStatusParam)
    ? initialStatusParam
    : 'active';
  const [status, setStatus] = useState<PrintTaskStatus | 'all' | 'active'>(
    initialValidatedStatus as PrintTaskStatus | 'all' | 'active'
  );

  const initialNeedsReviewParam = getFilterParam(currentFilters.needsReview) || 'all';
  const initialValidatedNeedsReview = isReviewOption(initialNeedsReviewParam)
    ? initialNeedsReviewParam
    : 'all';
  const [needsReview, setNeedsReview] = useState<'yes' | 'no' | 'all'>(initialValidatedNeedsReview);

  // Color filters
  const initialColor1Param = getFilterParam(currentFilters.color1) || '';
  const [color1, setColor1] = useState(initialColor1Param);

  const initialColor2Param = getFilterParam(currentFilters.color2) || '';
  const [color2, setColor2] = useState(initialColor2Param);

  const initialColorParam = getFilterParam(currentFilters.color) || '';
  const [color, setColor] = useState(initialColorParam);

  // Shipping Method filter
  const initialShippingMethodParam = getFilterParam(currentFilters.shippingMethod) || '';
  const [shippingMethod, setShippingMethod] = useState(initialShippingMethodParam);

  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() => {
    const startStr = getFilterParam(currentFilters.shipByDateStart);
    const endStr = getFilterParam(currentFilters.shipByDateEnd);
    // Ensure dates are valid before setting
    const start = startStr && !isNaN(new Date(startStr).getTime()) ? new Date(startStr) : undefined;
    const end = endStr && !isNaN(new Date(endStr).getTime()) ? new Date(endStr) : undefined;
    if (start || end) {
      return { from: start, to: end };
    }
    return undefined;
  });

  // Check if any filter is currently active
  const isAnyFilterActive = useMemo(() => {
    return (
      query !== '' ||
      status !== 'all' ||
      needsReview !== 'all' ||
      dateRange?.from !== undefined ||
      dateRange?.to !== undefined ||
      color1 !== '' ||
      color2 !== '' ||
      color !== '' ||
      shippingMethod !== ''
    );
  }, [query, status, needsReview, dateRange, color1, color2, color, shippingMethod]);

  // Update URL search params function
  const updateSearchParams = useCallback(
    (newParams: Record<string, string | undefined>, clearAll = false) => {
      let current: URLSearchParams;
      if (clearAll) {
        // Start fresh if clearing all, keep only non-filter params like limit
        current = new URLSearchParams();
        const limit = searchParams.get('limit');
        if (limit) current.set('limit', limit);
      } else {
        current = new URLSearchParams(Array.from(searchParams.entries()));
      }

      Object.entries(newParams).forEach(([key, value]) => {
        // Trim the query parameter if it exists
        const processedValue = key === 'query' && value ? value.trim() : value;

        if (processedValue && processedValue !== 'all') {
          current.set(key, processedValue);
        } else {
          // Only delete if not clearing all (to avoid re-adding default 'all' values)
          if (!clearAll) {
            current.delete(key);
          }
        }
      });

      // Always delete page when filters change or are cleared
      current.delete('page');

      const search = current.toString();
      const query = search ? `?${search}` : '';

      startTransition(() => {
        router.push(`${pathname}${query}`, { scroll: false }); // Prevent scroll jump
      });
    },
    [pathname, router, searchParams]
  );

  // Debounced search input handler
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedUpdateSearch = useCallback(
    debounce((value: string) => {
      updateSearchParams({ query: value });
    }, 500),
    [updateSearchParams] // Dependency array is correct based on usage
  );

  // Handler for search input change
  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    // Pass the value as-is to state for UI, but trim for the actual search
    debouncedUpdateSearch(value);
  };

  // Handler for status select change
  const handleStatusChange = (value: string) => {
    const newStatus = isExtendedPrintTaskStatus(value) ? value : 'active';
    setStatus(newStatus as PrintTaskStatus | 'all' | 'active');
    updateSearchParams({ status: newStatus === 'all' ? undefined : newStatus });
  };

  // Handler for needs review select change
  const handleNeedsReviewChange = (value: string) => {
    const newReview = value === 'yes' || value === 'no' ? value : 'all';
    setNeedsReview(newReview);
    updateSearchParams({ needsReview: newReview });
  };

  // Handler for Date Range Select
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    const start = range?.from ? format(range.from, 'yyyy-MM-dd') : undefined;
    const end = range?.to ? format(range.to, 'yyyy-MM-dd') : undefined;
    updateSearchParams({ shipByDateStart: start, shipByDateEnd: end });
  };

  // Handler for color1 input change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleColor1Change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setColor1(value);
    updateSearchParams({ color1: value || undefined });
  };

  // Handler for color2 input change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleColor2Change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setColor2(value);
    updateSearchParams({ color2: value || undefined });
  };

  // Handler for color select change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleColorChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedColor = event.target.value;
    setColor(selectedColor);
    updateSearchParams({ color: selectedColor || undefined });
  };

  // Clear color1 input - not used with new Select component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const clearColor1 = () => {
    setColor1('');
    updateSearchParams({ color1: undefined });
  };

  // Clear color2 input - not used with new Select component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const clearColor2 = () => {
    setColor2('');
    updateSearchParams({ color2: undefined });
  };

  // Clear color select
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const clearColor = () => {
    setColor('');
    updateSearchParams({ color: undefined });
  };

  // Handler for shipping method select change
  const handleShippingMethodChange = (value: string) => {
    setShippingMethod(value);
    updateSearchParams({ shippingMethod: value || undefined });
  };

  // Clear shipping method - not used with new Select component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const clearShippingMethod = () => {
    setShippingMethod('');
    updateSearchParams({ shippingMethod: undefined });
  };

  // Clear search input
  const clearSearch = () => {
    setQuery('');
    updateSearchParams({ query: undefined }); // Pass undefined to clear
  };

  // Clear date range
  const clearDateRange = () => {
    handleDateRangeSelect(undefined); // Reuse existing handler
  };

  // Clear All Filters
  const handleClearAllFilters = () => {
    setQuery('');
    setStatus('all');
    setNeedsReview('all');
    setDateRange(undefined);
    setColor1('');
    setColor2('');
    setColor('');
    setShippingMethod('');
    // Call update with all filters explicitly set to undefined/default
    updateSearchParams(
      {
        query: undefined,
        status: undefined, // Will be deleted as it maps to 'all'
        needsReview: undefined, // Will be deleted
        shipByDateStart: undefined,
        shipByDateEnd: undefined,
        color1: undefined,
        color2: undefined,
        color: undefined,
        shippingMethod: undefined,
      },
      true
    ); // Pass true to indicate clearing all
  };

  // Sync local state
  useEffect(() => {
    setQuery(searchParams.get('query') || '');

    const statusParam = searchParams.get('status') || 'all';
    setStatus(isPrintTaskStatus(statusParam) || statusParam === 'all' ? statusParam : 'all');

    const needsReviewParam = searchParams.get('needsReview') || 'all';
    setNeedsReview(isReviewOption(needsReviewParam) ? needsReviewParam : 'all');

    const start = searchParams.get('shipByDateStart');
    const end = searchParams.get('shipByDateEnd');
    const startDate = start && !isNaN(new Date(start).getTime()) ? new Date(start) : undefined;
    const endDate = end && !isNaN(new Date(end).getTime()) ? new Date(end) : undefined;
    setDateRange({ from: startDate, to: endDate });

    setColor1(searchParams.get('color1') || '');
    setColor2(searchParams.get('color2') || '');
    setColor(searchParams.get('color') || '');
    setShippingMethod(searchParams.get('shippingMethod') || '');
    // Keep dependency array simple
  }, [searchParams]);

  const statusOptions = [
    { value: 'active', label: 'Active Tasks' },
    { value: 'all', label: 'All Statuses' },
    ...Object.values(PrintTaskStatus).map(s => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' '),
    })),
  ];

  const reviewOptions = [
    { value: 'all', label: 'Review: Any' },
    { value: 'yes', label: 'Review: Yes' },
    { value: 'no', label: 'Review: No' },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 p-3 border rounded-md bg-muted/40 relative">
      {/* Clear All Button - positioned top-right */}
      {isAnyFilterActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAllFilters}
          className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground"
          title="Clear all filters"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Clear All
        </Button>
      )}

      {/* Search Input */}
      <div className="flex-grow min-w-[200px] relative">
        <Label htmlFor="search-query" className="mb-1 block text-xs font-medium">
          Search (Product, SKU, Order#)
        </Label>
        <div>
          <Input
            id="search-query"
            placeholder="Enter search term..."
            value={query}
            onChange={handleQueryChange}
            className="pr-8 h-9" // Add padding for clear button and match height
            // Add onBlur handler to trim spaces
            onBlur={() => {
              if (query.trim() !== query) {
                setQuery(query.trim());
                debouncedUpdateSearch(query.trim());
              }
            }}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Search by ID, text, color, or marketplace order number
          </p>
        </div>
        {query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-[29px] h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={clearSearch}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Status Select */}
      <div>
        <Label htmlFor="status-filter" className="mb-1 block text-xs font-medium">
          Status
        </Label>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger id="status-filter" className="w-[160px] h-9">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Needs Review Select */}
      <div>
        <Label htmlFor="review-filter" className="mb-1 block text-xs font-medium">
          Needs Review
        </Label>
        <Select value={needsReview} onValueChange={handleNeedsReviewChange}>
          <SelectTrigger id="review-filter" className="w-[160px] h-9">
            <SelectValue placeholder="Filter by review" />
          </SelectTrigger>
          <SelectContent>
            {reviewOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date Range Picker with Clear Button */}
      <div className="flex items-end gap-1">
        <div>
          <Label htmlFor="date-range" className="mb-1 block text-xs font-medium">
            Ship By Date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date-range"
                variant={'outline'}
                className={cn(
                  'w-[200px] h-9 justify-start text-left font-normal text-sm', // Reduced width, added height
                  !dateRange?.from && !dateRange?.to && 'text-muted-foreground' // Adjust condition
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                    </>
                  ) : (
                    format(dateRange.from, 'LLL dd, y')
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
        {/* Clear Date Range Button */}
        {(dateRange?.from || dateRange?.to) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearDateRange}
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Clear date range"
            title="Clear date range"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Color 1 Filter */}
      <div>
        <Label htmlFor="color1-filter" className="mb-1 block text-xs font-medium">
          Color 1
        </Label>
        <Select
          value={color1 || 'all'}
          onValueChange={value => {
            const newValue = value === 'all' ? '' : value;
            setColor1(newValue);
            updateSearchParams({ color1: newValue || undefined });
          }}
        >
          <SelectTrigger id="color1-filter" className="w-[160px] h-9">
            <SelectValue placeholder="All Colors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Colors</SelectItem>
            {colorOptions.map(colorOption => (
              <SelectItem key={colorOption} value={colorOption}>
                {colorOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Color 2 Filter */}
      <div>
        <Label htmlFor="color2-filter" className="mb-1 block text-xs font-medium">
          Color 2
        </Label>
        <Select
          value={color2 || 'all'}
          onValueChange={value => {
            const newValue = value === 'all' ? '' : value;
            setColor2(newValue);
            updateSearchParams({ color2: newValue || undefined });
          }}
        >
          <SelectTrigger id="color2-filter" className="w-[160px] h-9">
            <SelectValue placeholder="All Colors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Colors</SelectItem>
            {colorOptions.map(colorOption => (
              <SelectItem key={colorOption} value={colorOption}>
                {colorOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Shipping Method Filter */}
      <div>
        <Label htmlFor="shipping-method-filter" className="mb-1 block text-xs font-medium">
          Shipping Method
        </Label>
        <Select
          value={shippingMethod || 'all'}
          onValueChange={value => handleShippingMethodChange(value === 'all' ? '' : value)}
        >
          <SelectTrigger id="shipping-method-filter" className="w-[160px] h-9">
            <SelectValue placeholder="All Shipping Methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shipping Methods</SelectItem>
            {availableShippingMethods.map(method => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading Indicator */}
      {isPending && <div className="text-sm text-muted-foreground">Loading...</div>}
    </div>
  );
}
