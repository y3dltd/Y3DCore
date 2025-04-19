# ---
# title: Cleanup Utilities
# last-reviewed: 2025-04-18
# maintainer: TBD
# ---

# Cleanup Utilities

The project provides a unified cleanup utility to manage temporary files, build artifacts, and other cleanup tasks.

## clean.ts

Located at `src/scripts/clean.ts`, this script handles all cleanup operations:

```bash
# Basic cleanup
npx tsx src/scripts/clean.ts

# Dry run (shows what would be removed without actually removing)
npx tsx src/scripts/clean.ts --dry-run

# Verbose output
npx tsx src/scripts/clean.ts --verbose

# Include browser caches
npx tsx src/scripts/clean.ts --browser-caches

# Include node_modules
npx tsx src/scripts/clean.ts --node-modules

# Include example files
npx tsx src/scripts/clean.ts --example-files

# Skip log files
npx tsx src/scripts/clean.ts --no-logs

# Specify a different directory
npx tsx src/scripts/clean.ts --dir /path/to/directory
```

## NPM Scripts

The following npm scripts are available for cleanup:

```bash
# Basic cleanup
npm run clean

# Full cleanup (includes browser caches and node_modules)
npm run clean:all

# Dry run with verbose output
npm run clean:dry
```

## What Gets Cleaned

The cleanup utility removes the following by default:

- Temporary files (`*.tmp`, `*.temp`, `*.bak`, `*.old`)
- Cache directories (`.turbo`, `.swc`, `.ruff_cache`, etc.)
- Build artifacts (`.next`, `build`, etc.)
- Log files (`*.log`, `logs/` directory)
- IDE files (except `.vscode`)

With additional options, it can also clean:

- Browser caches (Playwright, Puppeteer)
- Node modules (`node_modules/` directory)
- Example files (`example*.jpg`, `example*.png`, `example*.json`)

## Cron Job

A daily cleanup is scheduled in the crontab configuration:

```
# Run daily cleanup at 2 AM
0 2 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/clean.ts >> $LOG_DIR/cleanup_`date +\%Y\%m\%d`.log 2>&1
```

## Implementation Details

The cleanup functionality is implemented in `src/lib/utils/cleanup.ts`, which provides a modular and extensible approach to cleaning different types of files and directories.

The implementation uses:
- `globby` for pattern matching
- `fs/promises` for file operations
- Proper error handling and reporting
- Dry run capability for safe testing
- Verbose logging for detailed output
