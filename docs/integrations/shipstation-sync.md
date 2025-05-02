# ---

# title: ShipStation Synchronization

# last-reviewed: 2025-04-18

# maintainer: TBD

# ---

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
5. **Status Mismatch Script**: Use `src/scripts/fix-status-mismatch.ts` to check and correct discrepancies between ShipStation order status and the database status, including updating associated print tasks.

## Main Order & Tag Synchronization (`sync-orders.ts`)

The primary script for fetching order updates and tags from ShipStation and updating the local database is `src/scripts/sync-orders.ts`.

### Modes of Operation

- `--mode recent` (Default): Syncs orders modified within a recent timeframe (default 2 days, configurable with `--days-back` or `--hours`). Skips tag sync by default.
- `--mode all`: Syncs all orders since the last successful sync timestamp or a specified `--force-start-date`. Skips tag sync by default.
- `--mode single --order-id <ID>`: Syncs a single specific order. The `<ID>` can be the **Database ID**, **Marketplace Order Number**, or **ShipStation Order ID**. Skips tag sync.
- `--mode tags`: Syncs only the ShipStation tags and then exits.

### Options

- `--sync-tags`: **Enables** tag synchronization (skipped by default in `recent` and `all` modes).
- `--order-id <ID>`: Specifies the order identifier for `single` mode.
- `--days-back <N>` / `--hours <N>`: Sets the lookback period for `recent` mode.
- `--force-start-date <YYYY-MM-DD>`: Forces `all` mode to start from a specific date.
- `--dry-run`: Simulates the sync without making database changes. Useful for testing.
- `--verbose`: Enables more detailed logging output.

### Identifier Resolution (`--order-id`)

The `--order-id` flag for `single` mode is flexible:

1. If the provided ID is purely numeric, the script first checks if it matches an `id` in the local `Order` table.
2. If not found by DB ID, it checks if it matches a `shipstation_order_number`.
3. If still not found, it assumes the numeric ID is the internal `shipstation_order_id`.
4. If the provided ID is non-numeric, it assumes it's a `shipstation_order_number`.
5. The script uses the resolved `shipstation_order_id` to query the ShipStation API.

## Full Workflow Script (`workflow.sh`)

The `scripts/workflow.sh` script orchestrates a common sequence of synchronization tasks:

1. **Sync Orders:** Runs `src/scripts/sync-orders.ts` (passes through mode, ID, date range, dry-run, verbose, and tag sync options).
2. **Populate Print Queue:** Runs `src/scripts/populate-print-queue.ts` to generate print tasks for newly synced or relevant orders.
3. **Cleanup Shipped Tasks:** Runs the dedicated `src/scripts/cleanup-shipped-tasks.ts` script to mark tasks as completed for orders that are now shipped/cancelled in the database.

This workflow script provides a convenient way to run the standard sync process. It accepts the same flags as `sync-orders.ts` (e.g., `--mode`, `--order-id`, `--dry-run`, `--sync-tags`).

## Status Mismatch Correction (`fix-status-mismatch.ts`)

The `src/scripts/fix-status-mismatch.ts` script specifically addresses discrepancies between the order status in ShipStation and the local database.

- It fetches order status from both sources.
- If a mismatch is found (and `--fix` is used), it updates the database status.
- **Crucially**, it also checks if the order's final status is `shipped` or `cancelled`. If so (and `--fix` is used), it updates any associated `pending` or `in_progress` print tasks to `completed` or `cancelled`, respectively. This ensures task statuses align with the final order status, even if the order status itself didn't need correction during that specific run.
- Can be run for a specific `--order-id` (DB ID only) or for all orders.

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
