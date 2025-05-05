# Order Utilities Script

This script provides a comprehensive set of utilities for managing orders and print tasks, including fixing quantity mismatches, status mismatches, and other common issues.

## Installation

No installation required. The script is part of the Y3DCore codebase.

## Usage

```bash
npx tsx src/scripts/order-utils.ts [command] [options]
```

## Commands

### Find Orders with Quantity Mismatches

Find orders that have quantity mismatches (e.g., 2 items ordered but only 1 personalization text found).

```bash
npx tsx src/scripts/order-utils.ts find [options]
```

Options:

- `-m, --marketplace <marketplace>`: Marketplace to search (default: ebay)
- `-l, --limit <limit>`: Maximum number of orders to show (default: 10)

Example:

```bash
npx tsx src/scripts/order-utils.ts find --limit 5
```

### Fix an Order with Quantity Mismatches

Fix an order that has quantity mismatches by creating the correct number of tasks.

```bash
npx tsx src/scripts/order-utils.ts fix <orderNumber> [options]
```

Options:

- `-f, --force`: Force processing even if not an eBay order

Example:

```bash
npx tsx src/scripts/order-utils.ts fix 14-13017-08187
```

### Show Order Details

Show detailed information about an order and its print tasks.

```bash
npx tsx src/scripts/order-utils.ts show <orderNumber>
```

Example:

```bash
npx tsx src/scripts/order-utils.ts show 14-13017-08187
```

### Reprocess an Order

Reprocess an order using the populate-print-queue.ts script.

```bash
npx tsx src/scripts/order-utils.ts reprocess <orderNumber>
```

Example:

```bash
npx tsx src/scripts/order-utils.ts reprocess 14-13017-08187
```

### Fix Status Mismatches

Fix status mismatches between ShipStation and the database.

```bash
npx tsx src/scripts/order-utils.ts fix-status [options]
```

Options:

- `-o, --order-id <orderId>`: Specific order to check
- `-f, --fix`: Apply fixes (without this flag, runs in dry-run mode)
- `-v, --verbose`: Show detailed information

Example:

```bash
npx tsx src/scripts/order-utils.ts fix-status --order-id 14-13017-08187 --fix
```

### Fix STL Render Status

Fix STL render status issues, including empty values, stuck tasks, and incorrect statuses.

```bash
npx tsx src/scripts/order-utils.ts fix-stl
```

Example:

```bash
npx tsx src/scripts/order-utils.ts fix-stl
```

### Check Task Status

Check task status statistics, including counts by status, render state, and potential stuck tasks.

```bash
npx tsx src/scripts/order-utils.ts check-tasks
```

Example:

```bash
npx tsx src/scripts/order-utils.ts check-tasks
```

### Batch Reprocess Orders

Reprocess multiple orders in a batch.

```bash
npx tsx src/scripts/order-utils.ts batch-reprocess [options]
```

Options:

- `-l, --limit <limit>`: Maximum number of orders to process (default: 10)
- `-m, --marketplace <marketplace>`: Filter by marketplace (e.g., amazon, ebay)
- `-s, --status <status>`: Filter by order status (e.g., pending, shipped)

Example:

```bash
npx tsx src/scripts/order-utils.ts batch-reprocess --marketplace ebay --limit 5
```

## Common Workflows

### Finding and Fixing eBay Orders with Quantity Mismatches

1. Find orders with quantity mismatches:

   ```bash
   npx tsx src/scripts/order-utils.ts find
   ```

2. Review the list of orders and select one to fix.

3. Fix the selected order:

   ```bash
   npx tsx src/scripts/order-utils.ts fix <orderNumber>
   ```

4. Verify the fix:
   ```bash
   npx tsx src/scripts/order-utils.ts show <orderNumber>
   ```

### Troubleshooting an Order

1. Show order details:

   ```bash
   npx tsx src/scripts/order-utils.ts show <orderNumber>
   ```

2. If needed, reprocess the order:

   ```bash
   npx tsx src/scripts/order-utils.ts reprocess <orderNumber>
   ```

3. If there are quantity mismatches, fix them:
   ```bash
   npx tsx src/scripts/order-utils.ts fix <orderNumber>
   ```

### Fixing Status Mismatches

1. Check for status mismatches (dry run):

   ```bash
   npx tsx src/scripts/order-utils.ts fix-status
   ```

2. Fix status mismatches for a specific order:

   ```bash
   npx tsx src/scripts/order-utils.ts fix-status --order-id <orderNumber> --fix
   ```

3. Fix status mismatches for all orders:
   ```bash
   npx tsx src/scripts/order-utils.ts fix-status --fix
   ```

### Batch Processing

1. Reprocess multiple orders from a specific marketplace:

   ```bash
   npx tsx src/scripts/order-utils.ts batch-reprocess --marketplace ebay --limit 10
   ```

2. Reprocess orders with a specific status:
   ```bash
   npx tsx src/scripts/order-utils.ts batch-reprocess --status pending --limit 10
   ```

## How It Works

The script handles several common issues:

1. **Quantity Mismatches**: When there's a mismatch between the number of items ordered and the number of personalization texts found in the customer notes, the script creates the correct number of tasks and marks them for review.

2. **Status Mismatches**: The script checks for mismatches between ShipStation order status and database order status, and updates the database to match ShipStation.

3. **STL Render Status Issues**: The script fixes issues with STL render status, including empty values, stuck tasks, and incorrect statuses.

4. **Task Status Statistics**: The script provides statistics on task status, including counts by status, render state, and potential stuck tasks.

5. **Batch Processing**: The script can reprocess multiple orders in a batch, filtered by marketplace or status.

## Troubleshooting

If you encounter any issues with the script, try the following:

1. Make sure you're running the script from the project root directory.
2. Check that the order number is correct.
3. Use the `show` command to verify the order details.
4. Use the `check-tasks` command to check for any task status issues.
5. Use the `--force` option with the `fix` command if needed.

If problems persist, please report the issue with the order number and any error messages.
