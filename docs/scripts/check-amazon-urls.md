# `check-amazon-urls.ts`

This script checks for orders that may have unprocessed Amazon customization URLs, both in the local database and directly via the ShipStation API.

## Purpose

The primary goal is to identify orders where the automated process of fetching customization data (like text and colors) from an Amazon-provided URL might have failed. This failure is often indicated by the original `amazon.com` URL persisting in the data instead of being replaced by the extracted details.

By finding these orders, you can trigger their reprocessing to ensure correct data is used for print task generation and potentially for packing slips, avoiding manual checks in ShipStation.

## Usage

```bash
npx tsx scripts/check-amazon-urls.ts [options]
```

## Options

- `-d, --days <number>`: Limit the check to orders created within the last N days. This applies to both the database query and the ShipStation API query.
  - Example: `npx tsx scripts/check-amazon-urls.ts --days 7`
- `--dry-run`: Perform all checks and report findings, but _do not_ suggest the reprocessing command at the end. Useful for just seeing which orders might be affected without the prompt to take action.
  - Example: `npx tsx scripts/check-amazon-urls.ts --days 3 --dry-run`

## Checks Performed

1.  **Database Check:**
    - Queries the local `Order` and related `OrderItem`/`AmazonCustomizationFile` tables.
    - Looks for `AmazonCustomizationFile` records where `originalUrl` contains `amazon.com`.
    - Also flags items where `printTasks` are missing, as this can be a symptom of failed processing.
    - Applies the `--days` filter to the `Order.created_at` field if provided.
2.  **ShipStation API Check:**
    - Queries the ShipStation API for orders with `orderStatus: 'awaiting_shipment'`.
    - Iterates through the `options` array of each `OrderItem` in the API response.
    - Checks if any option `name` or `value` contains `amazon.com`.
    - Also checks the `internalNotes` field for potential URLs as a fallback.
    - Applies the `--days` filter to the `createDateStart` API parameter if provided.

## Output

The script logs its progress for both the database and ShipStation checks.

Finally, it outputs a combined, unique list of `shipstation_order_number`s identified as potentially needing reprocessing.

If `--dry-run` is **not** used, it will suggest the command to reprocess these orders using `src/scripts/populate-print-queue.ts`:

```bash
npx tsx src/scripts/populate-print-queue.ts --order-id "ORDER_NUMBER" -f --verbose
```

**Warning:** Always review the list of orders carefully before running reprocessing commands, especially with the `-f` (force) flag, as it will delete existing print tasks for those orders.
