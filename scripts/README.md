# Scripts Directory

This directory contains various utility scripts for the Y3DHub application. The scripts are organized into the following categories:

## Maintenance Scripts (`./maintenance/`)

Scripts for system maintenance tasks:
- `clear-print-tasks.ts` - Clears all print tasks from the database
- `clear-tables.ts` - Clears AI call logs and print tasks tables
- `cleanup.ts` - General cleanup script for the database
- `cleanup-print-tasks.ts` - Specific cleanup for print tasks
- `nightly-cleanup.sh` - Shell script for scheduled nightly cleanup

## Analysis Scripts (`./analysis/`)

Scripts for analyzing data and troubleshooting:
- `analyze-etsy-orders.ts` - Analyzes Etsy orders for patterns and issues
- `analyze-ebay-orders.ts` - Analyzes eBay orders for patterns and issues
- `analyze-orders.ts` - General order analysis
- `check-order-*.ts` - Various scripts for checking specific orders or order patterns
- `examine-order*.ts` - Detailed examination of specific orders
- `check-print-tasks.ts` - Analyzes print tasks for issues

## Testing Scripts (`./testing/`)

Scripts for testing system functionality:
- `run-final-test.ts` - Runs a final test of the system
- `test-awaiting-shipping.ts` - Tests handling of awaiting_shipping status
- `test-timezone-conversion.ts` - Tests timezone conversion functionality
- `verify-print-tasks.ts` - Verifies print tasks are correctly created

## Utility Scripts (`./utils/`)

General utility scripts:
- `backup-print-tasks.ts` - Creates backups of print tasks
- `check-ai-logs.ts` - Checks AI call logs
- `check-logging.ts` - Verifies logging functionality
- `ai-usage-stats.ts` - Generates statistics on AI usage
- `migrate-timestamps.ts` - Migrates timestamp formats
- `run-with-env.sh` - Shell script for running commands with environment variables
- `reprocess-all-orders.ts` - Reprocesses all orders

## Running Scripts

Most scripts can be run using:

```bash
npx tsx scripts/category/script-name.ts [arguments]
```

For shell scripts:

```bash
bash scripts/category/script-name.sh [arguments]
```

## Adding New Scripts

When adding new scripts, please:
1. Place them in the appropriate category directory
2. Add documentation in the script header
3. Update this README if necessary
