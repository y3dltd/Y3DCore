/**
 * Utility functions for date formatting and timezone handling
 */
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { format as formatTz } from 'date-fns-tz';

// The timezone used by ShipStation
export const SHIPSTATION_TIMEZONE = 'America/Los_Angeles';

// The timezone used for display in the UI (UTC)
export const DISPLAY_TIMEZONE = 'UTC';

/**
 * Formats a date for display with timezone indicator
 *
 * @param date The date to format
 * @param formatStr The format string to use
 * @param includeTimezone Whether to include the timezone indicator
 * @returns Formatted date string
 */
export function formatDateWithTimezone(
  date: Date | string | null | undefined,
  formatStr: string = 'dd/MM/yyyy HH:mm',
  includeTimezone: boolean = true
): string {
  if (!date) return 'N/A';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (!isValid(dateObj)) return 'Invalid Date';

  try {
    // Format the date in UTC
    const formattedDate = formatTz(dateObj, formatStr, { timeZone: DISPLAY_TIMEZONE });
    return includeTimezone ? `${formattedDate} UTC` : formattedDate;
  } catch (error) {
    // Fallback to regular format if there's an error
    console.error('Error formatting date with timezone:', error);
    return format(dateObj, formatStr);
  }
}

/**
 * Formats a date as a relative time (e.g., "2 hours ago")
 *
 * @param date The date to format
 * @param includeTimezone Whether to include the timezone indicator
 * @returns Formatted relative time string
 */
export function formatRelativeTime(
  date: Date | string | null | undefined,
  includeTimezone: boolean = true
): string {
  if (!date) return 'N/A';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (!isValid(dateObj)) return 'Invalid Date';

  const relativeTime = formatDistanceToNow(dateObj, { addSuffix: true });
  return includeTimezone ? `${relativeTime} (UTC)` : relativeTime;
}

/**
 * Formats a date for display in a table or list
 *
 * @param date The date to format
 * @returns Formatted date string (dd/MM/yyyy)
 */
export function formatDateForTable(date: Date | string | null | undefined): string {
  return formatDateWithTimezone(date, 'dd/MM/yyyy', false);
}

/**
 * Formats a date and time for detailed display
 *
 * @param date The date to format
 * @returns Formatted date and time string with timezone
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDateWithTimezone(date, 'dd/MM/yyyy HH:mm:ss', true);
}

/**
 * Formats a date for use in an input field
 *
 * @param date The date to format
 * @returns Formatted date string (yyyy-MM-dd)
 */
export function formatDateForInput(date: Date | string | null | undefined): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (!isValid(dateObj)) return '';

  return format(dateObj, 'yyyy-MM-dd');
}
