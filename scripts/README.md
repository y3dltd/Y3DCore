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
