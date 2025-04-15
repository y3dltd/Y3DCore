# Timezone Handling in Y3DHub

This document explains how timezones are handled in the Y3DHub application, particularly for ShipStation integration.

## Overview

- **ShipStation** operates in **Pacific Time** (America/Los_Angeles), which is UTC-8 during standard time and UTC-7 during daylight saving time.
- Our **database** stores all timestamps in **UTC**.
- Our **UI** displays timestamps in **UTC** with a timezone indicator.

## Implementation Details

### 1. Storing ShipStation Timestamps

When we receive timestamps from ShipStation, we convert them from Pacific Time to UTC before storing them in the database:

```typescript
// src/lib/shipstation/mappers.ts
function convertShipStationDateToUTC(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  // ShipStation uses Pacific Time (America/Los_Angeles) for timestamps
  const SHIPSTATION_TIMEZONE = 'America/Los_Angeles';

  try {
    // Parse the date string as if it were in Pacific Time
    return toDate(dateString, { timeZone: SHIPSTATION_TIMEZONE });
  } catch (error) {
    console.error(`Error converting date ${dateString} from Pacific Time to UTC:`, error);
    // Fallback to the old method if there's an error
    const date = new Date(dateString);
    const pstOffsetHours = 8; // Approximate PST offset
    return new Date(date.getTime() + (pstOffsetHours * 60 * 60 * 1000));
  }
}
```

This function is used in `mapOrderToPrisma` to convert all ShipStation timestamps to UTC before storing them in the database.

### 2. Displaying Timestamps

When displaying timestamps in the UI, we use the `date-utils.ts` utility functions to format them with a timezone indicator:

```typescript
// src/lib/date-utils.ts
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
```

### 3. Relative Time Formatting

For relative time formatting (e.g., "2 hours ago"), we use the `formatRelativeTime` function:

```typescript
// src/lib/date-utils.ts
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
```

## Libraries Used

We use the following libraries for timezone handling:

- **date-fns**: For basic date formatting and calculations
- **date-fns-tz**: For timezone-aware date formatting and conversions

## Migration

A migration script (`scripts/migrate-timestamps.ts`) was created to update existing timestamps in the database. This script:

1. Retrieves all orders from the database
2. Converts their timestamps from PST to UTC
3. Updates the orders with the corrected timestamps

## Best Practices

1. **Always use the utility functions** from `date-utils.ts` for date formatting and display.
2. **Never manually manipulate dates** without considering timezone implications.
3. **Always include timezone indicators** in the UI to avoid confusion.
4. **Document any timezone-specific logic** in comments.

## Common Issues

1. **Browser timezone differences**: The browser may display dates in the local timezone, which can cause confusion. Always use the utility functions to ensure consistent display.
2. **Daylight saving time**: Pacific Time switches between PST and PDT, which can cause issues if not handled correctly. The `date-fns-tz` library handles this automatically.
3. **Manual date manipulation**: Avoid manually adding or subtracting hours from dates, as this can lead to errors during daylight saving time transitions.

## Testing

When testing timezone-related functionality:

1. Test with dates during both standard time and daylight saving time.
2. Test with browsers set to different timezones.
3. Verify that dates are displayed consistently across the application.
