'use client'; // Needs to be a client component for useState/useEffect
import { format, startOfToday, addDays } from 'date-fns'; // Import date calculation functions
import { Calendar as CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  name: string; // For form submission
  value?: string; // ISO String date from URL param (YYYY-MM-DD)
  placeholder?: string; // Optional placeholder text
  onSelect?: (_date: Date | undefined) => void; // Optional callback on select
}

export function DatePicker({
  name,
  value,
  placeholder = 'Pick a date',
  onSelect,
}: DatePickerProps) {
  // Attempt to parse the incoming value (YYYY-MM-DD string)
  // Ensure we handle timezone correctly - parse as UTC if it's just a date string
  const initialDate =
    value && /\d{4}-\d{2}-\d{2}/.test(value)
      ? new Date(value + 'T00:00:00Z') // Treat YYYY-MM-DD as UTC start of day
      : undefined;
  const [date, setDate] = React.useState<Date | undefined>(initialDate);
  // Store the hidden input value separately
  const [hiddenValue, setHiddenValue] = React.useState(value);
  const [popoverOpen, setPopoverOpen] = React.useState(false); // Control popover state

  // Update internal state if value prop changes (URL param changes)
  React.useEffect(() => {
    const newDate =
      value && /\d{4}-\d{2}-\d{2}/.test(value) ? new Date(value + 'T00:00:00Z') : undefined;
    setDate(newDate);
    setHiddenValue(value);
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    // Format date for hidden input (YYYY-MM-DD)
    const formattedDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
    setHiddenValue(formattedDate);
    // Call the optional onSelect callback
    if (onSelect) {
      onSelect(selectedDate);
    }
    setPopoverOpen(false); // Close popover after selection
  };

  // Handlers for preset buttons
  const setToday = () => handleSelect(startOfToday());
  const setTomorrow = () => handleSelect(addDays(startOfToday(), 1));
  const setNextWeek = () => handleSelect(addDays(startOfToday(), 7));
  const clearDate = () => handleSelect(undefined);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      {' '}
      {/* Controlled popover */}
      {/* Hidden input submits the date in YYYY-MM-DD format */}
      <input type="hidden" name={name} value={hiddenValue || ''} />
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {/* Display date in a user-friendly format */}
          {date ? format(date, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 space-y-2">
        {/* Preset Buttons */}
        <div className="flex justify-around p-2 border-b">
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={setToday}>
            Today
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={setTomorrow}>
            Tomorrow
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={setNextWeek}>
            Next Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2 text-red-500 hover:text-red-600"
            onClick={clearDate}
          >
            Clear
          </Button>
        </div>
        <Calendar mode="single" selected={date} onSelect={handleSelect} initialFocus />
      </PopoverContent>
    </Popover>
  );
}
