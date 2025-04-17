# Scripts Directory

This directory contains various utility scripts for the Y3DHub application, primarily located within the `utils/` subdirectory.

## Utility Scripts (`./utils/`)

General utility scripts:
- `backup-print-tasks.ts` - Creates backups of print tasks
- `check-ai-logs.ts` - Checks AI call logs
- `check-logging.ts` - Verifies logging functionality
- `ai-usage-stats.ts` - Generates statistics on AI usage (Used by cron)
- `run-with-env.sh` - Shell script for running commands with environment variables
- `reprocess-all-orders.ts` - Reprocesses all orders

## Running Scripts

Most scripts can be run using:

```bash
npx tsx scripts/utils/script-name.ts [arguments]
```

For shell scripts:

```bash
bash scripts/utils/script-name.sh [arguments]
```

## Note on New Scripts

For new core application scripts (e.g., those run by cron or essential for core processes), consider placing them in the `src/scripts/` directory alongside other primary application code. This directory (`scripts/`) is primarily intended for manual utilities, one-off tasks, or auxiliary scripts.

## Full Workflow (`npm run full-workflow`)

The `full-workflow` script (`npm run full-workflow`) runs the complete end-to-end Y3DHub process:
1. Sync orders from ShipStation
2. Populate the print queue
3. Cleanup completed print tasks

Usage:
```bash
npm run full-workflow -- [options]
```

Options:
- `--mode <all|recent|single>`  Which orders to sync (default: recent)
- `--order-id <ID>`             Only sync a single order (requires `--mode single`)
- `--days-back <N>`             Days to look back when mode is `recent` (default: 2)
- `--hours <N>`                 Hours to look back when mode is `recent` (overrides `--days-back`)
- `--dry-run`                   Show actions without making changes
- `--verbose`                   Enable verbose console output
- `--skip-tags`                 Skip ShipStation tag synchronization (handled by separate daily job)

Concurrency:
The script uses a filesystem lock at `/tmp/y3dhub_workflow.lock` to prevent concurrent executions.
