# Command Reference

This document provides a comprehensive reference for all commands available in the Y3DHub system scripts. It serves as a detailed guide for using the command-line interfaces.

## Overview

The Y3DHub system provides several main command-line scripts:

1.  `order-sync.ts` - Handles order synchronization from ShipStation.
2.  `populate-print-queue.ts` - Handles print task creation and management, including Amazon URL fetching and AI extraction.
3.  `utils.ts` - Provides utility functions for maintenance and diagnostics (Structure may vary).

## Global Options (Apply to most scripts, check specific script for exact support)

| Option                            | Description                                                                                                | Default          | Example                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------- |
| `--verbose` / `--log-level debug` | Show detailed debug output                                                                                 | `false` / `info` | `--verbose` or `--log-level debug` |
| `--dry-run`                       | Simulate operations without making changes                                                                 | `false`          | `--dry-run`                        |
| `--order-id=<id>`                 | Process a specific order by DB ID (for `populate-print-queue`) or ShipStation ID (for `order-sync single`) | -                | `--order-id=12345`                 |
| `--limit=<limit>`                 | Limit the number of items to process                                                                       | Varies           | `--limit=50`                       |
| `--help`                          | Show help information                                                                                      | -                | `--help`                           |

## Order Sync Script (`order-sync.ts`)

The Order Sync script handles order synchronization with ShipStation.

### Usage

```bash
npx tsx src/scripts/order-sync.ts <command> [options]
```

### Commands

#### `sync` - Synchronize orders from ShipStation

Fetches orders from ShipStation based on modification date and upserts them into the database. Correctly handles ShipStation's Pacific Time zone for date filters.

```bash
npx tsx src/scripts/order-sync.ts sync [options]
```

| Option                      | Description                                                                       | Default  | Example                                       |
| --------------------------- | --------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| `--mode=<mode>`             | Sync mode (`all`, `recent`, `single`)                                             | `recent` | `--mode=all`                                  |
| `--order-id=<ss_id>`        | ShipStation Order ID to sync (required for `single` mode)                         | -        | `--order-id=12345678`                         |
| `--days-back=<days>`        | Number of days to look back for modified orders (for `recent` mode)               | 2        | `--days-back 7`                               |
| `--hours=<hours>`           | Number of hours to look back (for `recent` mode, overrides `--days-back`)         | -        | `--hours 12`                                  |
| `--order-date-start=<date>` | Start date filter (YYYY-MM-DD HH:MM:SS format, assumes Pacific Time)              | -        | `--order-date-start="2024-01-01 00:00:00"`    |
| `--order-date-end=<date>`   | End date filter (YYYY-MM-DD HH:MM:SS format, assumes Pacific Time)                | -        | `--order-date-end="2024-01-31 23:59:59"`      |
| `--force-start-date=<date>` | Force sync to start from this ISO date (YYYY-MM-DDTHH:mm:ss.sssZ, for `all` mode) | -        | `--force-start-date=2023-01-01T00:00:00.000Z` |
| `--skip-tags`               | Skip syncing ShipStation tags                                                     | `false`  | `--skip-tags`                                 |
| `--verbose`                 | Show verbose output (Note: May not increase detail beyond Prisma logs)            | `false`  | `--verbose`                                   |
| `--dry-run`                 | Simulate operations without making changes                                        | `false`  | `--dry-run`                                   |

#### `amazon` - Process Amazon customization (Currently Not Implemented)

Handles Amazon customization processes. **Note:** These subcommands are currently placeholders and do not execute the intended logic. Amazon URL fetching is now integrated into `populate-print-queue.ts`.

```bash
npx tsx src/scripts/order-sync.ts amazon <subcommand> [options]
```

##### Subcommands (Placeholders)

###### `sync` - Download and process Amazon customization files (Not Implemented)

###### `update` - Update order items with personalization data (Not Implemented)

###### `fix` - Find and fix orders with missing personalization data (Not Implemented)

###### `workflow` - Run the entire Amazon customization workflow (Not Implemented)

#### `status` - Show sync status and statistics (May need update/verification)

Displays information about order synchronization status.

```bash
npx tsx src/scripts/order-sync.ts status [options]
```

| Option               | Description                                | Default | Example          |
| -------------------- | ------------------------------------------ | ------- | ---------------- |
| `--days-back=<days>` | Number of days to look back for statistics | 7       | `--days-back=14` |

#### `metrics` - Report on sync performance and issues (May need update/verification)

Generates metrics reports for order synchronization.

```bash
npx tsx src/scripts/order-sync.ts metrics [options]
```

| Option              | Description                      | Default | Example                 |
| ------------------- | -------------------------------- | ------- | ----------------------- |
| `--format=<format>` | Output format (json, table, csv) | `table` | `--format=json`         |
| `--output=<file>`   | Output file for metrics          | -       | `--output=metrics.json` |

## Populate Print Queue Script (`populate-print-queue.ts`)

Fetches eligible orders from the database, processes personalization (prioritizing Amazon URLs, then eBay notes, then AI), and creates/updates print tasks.

### Usage

```bash
npx tsx src/scripts/populate-print-queue.ts [options]
```

### Options

| Option                   | Alias | Description                                                                                               | Default       | Example                   |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------------------- | ------------- | ------------------------- |
| `--order-id=<id>`        | `-o`  | Process specific order by **database ID**. Bypasses default filters.                                      | -             | `--order-id 450`          |
| `--limit=<number>`       | `-l`  | Limit the number of orders fetched when not using `--order-id`.                                           | 10            | `--limit 100`             |
| `--force-recreate`       | `-f`  | Delete existing tasks for fetched orders before creating new ones. Allows reprocessing orders with tasks. | `false`       | `--force-recreate`        |
| `--clear-all`            |       | Delete ALL print tasks from the database before processing. **Requires confirmation unless -y is used.**  | `false`       | `--clear-all`             |
| `--confirm`              | `-y`  | Skip confirmation prompts (e.g., for `--clear-all`).                                                      | `false`       | `-y`                      |
| `--create-placeholder`   |       | Create placeholder task if Amazon URL fetch fails and AI extraction also fails/is skipped.                | `true`        | `--no-create-placeholder` |
| `--openai-api-key=<key>` |       | OpenAI API Key (reads from `OPENAI_API_KEY` env var by default).                                          | `env`         | `--openai-api-key sk-...` |
| `--openai-model=<model>` |       | OpenAI model to use for extraction.                                                                       | `gpt-4o-mini` | `--openai-model gpt-4`    |
| `--log-level=<level>`    |       | Set log level (e.g., `debug`, `info`, `warn`, `error`).                                                   | `info`        | `--log-level debug`       |
| `--dry-run`              |       | Simulate operations without making database changes.                                                      | `false`       | `--dry-run`               |
| `--debug-file=<path>`    |       | Path for detailed debug log file (requires `--order-id`).                                                 | -             | `--debug-file debug.log`  |
| `--help`                 | `-h`  | Show help information.                                                                                    | -             | `--help`                  |

_(Note: The old `print-tasks.ts` script seems deprecated or refactored into `populate-print-queue.ts` based on recent changes. Commands like `update`, `cleanup`, `status`, `metrics` specific to print tasks might need separate scripts or integration into `utils.ts` if still required.)_

## Utilities Script (`utils.ts`)

The Utils script provides various utility functions for system maintenance and diagnostics. (Structure and commands may need verification based on current implementation).

### Usage

```bash
npx tsx src/scripts/utils.ts <command> [options]
```

### Commands (Example Structure - Verify Actual Implementation)

#### `check` - Check system status

##### Subcommands

###### `database` - Check database status and consistency

###### `order` - Check order details and status

#### `fix` - Fix common issues

##### Subcommands

###### `missing-data` - Find and fix missing data

###### `orphaned-tasks` - Find and fix orphaned tasks

#### `backup` - Backup database or files

##### Subcommands

###### `database` - Backup the database

###### `logs` - Backup log files

#### `stats` - Generate statistics and reports

##### Subcommands

###### `orders` - Generate order statistics

###### `ai-usage` - Generate AI usage statistics

## Examples

### Order Synchronization

```bash
# Sync recent orders from the last 12 hours
npx tsx src/scripts/order-sync.ts sync --mode=recent --hours 12

# Sync orders modified between two dates (Pacific Time assumed by ShipStation)
npx tsx src/scripts/order-sync.ts sync --order-date-start="2024-03-01 00:00:00" --order-date-end="2024-03-31 23:59:59"

# Sync a single specific order from ShipStation
npx tsx src/scripts/order-sync.ts sync --mode=single --order-id=<SHIPSTATION_ORDER_ID>
```

### Print Task Population

```bash
# Populate tasks for the 50 oldest eligible orders
npx tsx src/scripts/populate-print-queue.ts --limit 50

# Force re-population for the 20 oldest eligible orders, deleting old tasks first
npx tsx src/scripts/populate-print-queue.ts --limit 20 --force-recreate

# Force re-population for a specific order (DB ID 450)
npx tsx src/scripts/populate-print-queue.ts --order-id 450 --force-recreate

# Clear the entire print queue and repopulate up to 100 orders (no confirmation prompt)
npx tsx src/scripts/populate-print-queue.ts --clear-all -y --limit 100 --force-recreate
```

### Utilities (Verify actual commands)

```bash
# Check database status and consistency with verbose output
npx tsx src/scripts/utils.ts check database --verbose

# Backup the database to a specific directory
npx tsx src/scripts/utils.ts backup database --output=/mnt/backups
```
