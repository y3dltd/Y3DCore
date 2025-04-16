# ShipStation Synchronization

This document outlines how the Print Queue system interacts with ShipStation for syncing order personalization details.

## Overview

The system can synchronize print task data (custom text and color information) from the database to ShipStation. This ensures that order details in ShipStation match what will be printed.

## Sync Functionality

The main sync function is provided through the `populate-print-queue.ts` script with the `--shipstation-sync-only` flag.

```bash
npx tsx src/scripts/populate-print-queue.ts --order-id <order-number> --shipstation-sync-only
```

This command will:
1. Find the order in the database
2. Fetch all print tasks associated with each order item
3. Update the ShipStation order with personalization options matching the database tasks
4. Report success or failure for each item

## Limitations

### Shipped Order Status

**Important:** ShipStation restricts modifications to orders that are already marked as "shipped" or "fulfilled".

When attempting to sync details for shipped orders:
- The API might return a successful response
- However, the changes may not be applied in the ShipStation system
- The script will warn you when attempting to update a shipped order
- You will be prompted to confirm whether to continue (unless using the `--confirm` flag)

### Other Limitations

- Only the first task for each order item is synced (most items only have one task)
- Items without ShipStation line item keys will be skipped
- Items without print tasks will be skipped
- Order status changes or other order-level updates are not handled by this sync

## Best Practices

1. **Process orders early**: Sync order details before they are marked as shipped in ShipStation
2. **Use dry run first**: Add the `--dry-run` flag to preview changes without applying them
3. **Monitor logs**: Check for warnings about shipped orders or other issues
4. **Verify updates**: Confirm changes are reflected in ShipStation's UI after sync
5. **For shipped orders**: Consider using ShipStation's UI directly to manually update details if needed

## Troubleshooting

If synchronization is not working as expected:

1. **Check order status**: Orders marked as "shipped" or "fulfilled" in ShipStation may ignore updates
2. **Verify database data**: Use `check-order.js` or Prisma Studio to confirm the database has the correct values
3. **API permissions**: Ensure the ShipStation API key has write access
4. **Rate limits**: ShipStation has API rate limits that may affect rapid updates

## Command Examples

```bash
# Sync a specific order with confirmation prompts
npx tsx src/scripts/populate-print-queue.ts --order-id 202-7013581-4597156 --shipstation-sync-only

# Sync a specific order, bypassing confirmation prompts
npx tsx src/scripts/populate-print-queue.ts --order-id 202-7013581-4597156 --shipstation-sync-only --confirm

# Preview sync without making changes (dry run)
npx tsx src/scripts/populate-print-queue.ts --order-id 202-7013581-4597156 --shipstation-sync-only --dry-run

# Include debug logs
npx tsx src/scripts/populate-print-queue.ts --order-id 202-7013581-4597156 --shipstation-sync-only --log-level debug
``` 
