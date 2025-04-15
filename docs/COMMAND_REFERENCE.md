# Command Reference

This document provides a comprehensive reference for all commands available in the unified scripts after refactoring. It serves as a detailed guide for using the command-line interfaces of the Y3DHub system.

## Overview

The Y3DHub system provides three main command-line scripts:

1. `order-sync.ts` - Handles order synchronization and processing
2. `print-tasks.ts` - Manages print task creation and management
3. `utils.ts` - Provides utility functions for maintenance and diagnostics

## Global Options

All scripts support the following global options:

| Option               | Description                                | Default | Example            |
| -------------------- | ------------------------------------------ | ------- | ------------------ |
| `--verbose`          | Show detailed debug output                 | `false` | `--verbose`        |
| `--dry-run`          | Simulate operations without making changes | `false` | `--dry-run`        |
| `--order-id=<id>`    | Process a specific order by ID             | -       | `--order-id=12345` |
| `--days-back=<days>` | Process data from the last N days          | Varies  | `--days-back=7`    |
| `--hours=<hours>`    | Process data from the last N hours         | -       | `--hours=24`       |
| `--limit=<limit>`    | Limit the number of items to process       | Varies  | `--limit=50`       |
| `--help`             | Show help information                      | -       | `--help`           |

## Order Sync Script (`order-sync.ts`)

The Order Sync script handles order synchronization with ShipStation and Amazon customization processing.

### Usage

```bash
npx tsx src/scripts/order-sync.ts <command> [options]
```

### Commands

#### `sync` - Synchronize orders from ShipStation

Fetches orders from ShipStation and stores them in the database.

```bash
npx tsx src/scripts/order-sync.ts sync [options]
```

| Option                      | Description                                 | Default  | Example                         |
| --------------------------- | ------------------------------------------- | -------- | ------------------------------- |
| `--mode=<mode>`             | Sync mode (all, recent, single)             | `recent` | `--mode=all`                    |
| `--skip-tags`               | Skip syncing ShipStation tags               | `false`  | `--skip-tags`                   |
| `--order-date-start=<date>` | Start date for order filtering (YYYY-MM-DD) | -        | `--order-date-start=2025-01-01` |
| `--order-date-end=<date>`   | End date for order filtering (YYYY-MM-DD)   | -        | `--order-date-end=2025-02-01`   |

#### `amazon` - Process Amazon customization

Handles Amazon customization processes.

```bash
npx tsx src/scripts/order-sync.ts amazon <subcommand> [options]
```

##### Subcommands

###### `sync` - Download and process Amazon customization files

```bash
npx tsx src/scripts/order-sync.ts amazon sync [options]
```

| Option                | Description                                  | Default | Example           |
| --------------------- | -------------------------------------------- | ------- | ----------------- |
| `--retry-failed`      | Retry previously failed downloads/processing | `false` | `--retry-failed`  |
| `--max-retries=<num>` | Maximum number of retries for failed items   | 3       | `--max-retries=5` |

###### `update` - Update order items with personalization data

```bash
npx tsx src/scripts/order-sync.ts amazon update [options]
```

| Option                 | Description                                  | Default | Example                |
| ---------------------- | -------------------------------------------- | ------- | ---------------------- |
| `--create-print-tasks` | Create print tasks for orders                | `false` | `--create-print-tasks` |
| `--update-shipstation` | Update ShipStation with personalization data | `false` | `--update-shipstation` |

###### `fix` - Find and fix orders with missing personalization data

```bash
npx tsx src/scripts/order-sync.ts amazon fix [options]
```

| Option              | Description            | Default | Example             |
| ------------------- | ---------------------- | ------- | ------------------- |
| `--fix-shipstation` | Fix ShipStation orders | `false` | `--fix-shipstation` |
| `--fix-print-tasks` | Fix print tasks        | `false` | `--fix-print-tasks` |

###### `workflow` - Run the entire Amazon customization workflow

```bash
npx tsx src/scripts/order-sync.ts amazon workflow [options]
```

This runs `sync`, `update`, and task creation sequentially.

#### `status` - Show sync status and statistics

Displays information about order synchronization status.

```bash
npx tsx src/scripts/order-sync.ts status [options]
```

| Option               | Description                                | Default | Example          |
| -------------------- | ------------------------------------------ | ------- | ---------------- |
| `--days-back=<days>` | Number of days to look back for statistics | 7       | `--days-back=14` |

#### `metrics` - Report on sync performance and issues

Generates metrics reports for order synchronization.

```bash
npx tsx src/scripts/order-sync.ts metrics [options]
```

| Option              | Description                      | Default | Example                 |
| ------------------- | -------------------------------- | ------- | ----------------------- |
| `--format=<format>` | Output format (json, table, csv) | `table` | `--format=json`         |
| `--output=<file>`   | Output file for metrics          | -       | `--output=metrics.json` |

## Print Tasks Script (`print-tasks.ts`)

The Print Tasks script handles print task creation, updating, and management.

### Usage

```bash
npx tsx src/scripts/print-tasks.ts <command> [options]
```

### Commands

#### `create` - Create print tasks from orders

Creates print tasks based on order data.

```bash
npx tsx src/scripts/print-tasks.ts create [options]
```

| Option                     | Description                                                                       | Default  | Example                    |
| -------------------------- | --------------------------------------------------------------------------------- | -------- | -------------------------- |
| `--create-placeholder`     | Create placeholder tasks for orders without personalization data                  | `false`  | `--create-placeholder`     |
| `--ai-provider=<provider>` | AI provider for personalization extraction (openai, openrouter, ollama, lmstudio) | `openai` | `--ai-provider=openrouter` |
| `--batch-size=<size>`      | Number of orders to process in a batch                                            | 10       | `--batch-size=20`          |

#### `update` - Update print tasks with personalization data

Updates existing print tasks with personalization data.

```bash
npx tsx src/scripts/print-tasks.ts update [options]
```

| Option                 | Description                                          | Default | Example                |
| ---------------------- | ---------------------------------------------------- | ------- | ---------------------- |
| `--update-from-amazon` | Update tasks from Amazon customization data          | `false` | `--update-from-amazon` |
| `--force-update`       | Force update of tasks even if they already have data | `false` | `--force-update`       |

#### `cleanup` - Clean up completed/shipped tasks

Cleans up print tasks for completed or shipped orders.

```bash
npx tsx src/scripts/print-tasks.ts cleanup [options]
```

| Option                | Description                                   | Default | Example              |
| --------------------- | --------------------------------------------- | ------- | -------------------- |
| `--fix-pending`       | Fix tasks for shipped/cancelled orders        | `false` | `--fix-pending`      |
| `--delete-completed`  | Delete completed tasks (instead of archiving) | `false` | `--delete-completed` |
| `--older-than=<days>` | Only clean up tasks older than N days         | 30      | `--older-than=60`    |

#### `status` - Show print queue status and statistics

Displays information about the current print queue.

```bash
npx tsx src/scripts/print-tasks.ts status [options]
```

| Option               | Description                                | Default | Example          |
| -------------------- | ------------------------------------------ | ------- | ---------------- |
| `--days-back=<days>` | Number of days to look back for statistics | 7       | `--days-back=14` |
| `--format=<format>`  | Output format (json, table, csv)           | `table` | `--format=json`  |

#### `metrics` - Report on print task performance and issues

Generates metrics reports for print tasks.

```bash
npx tsx src/scripts/print-tasks.ts metrics [options]
```

| Option              | Description                      | Default | Example                 |
| ------------------- | -------------------------------- | ------- | ----------------------- |
| `--format=<format>` | Output format (json, table, csv) | `table` | `--format=json`         |
| `--output=<file>`   | Output file for metrics          | -       | `--output=metrics.json` |

## Utilities Script (`utils.ts`)

The Utils script provides various utility functions for system maintenance and diagnostics.

### Usage

```bash
npx tsx src/scripts/utils.ts <command> [options]
```

### Commands

#### `check` - Check system status

Performs system checks to identify potential issues.

```bash
npx tsx src/scripts/utils.ts check <subcommand> [options]
```

##### Subcommands

###### `database` - Check database status and consistency

```bash
npx tsx src/scripts/utils.ts check database [options]
```

| Option      | Description                    | Default | Example     |
| ----------- | ------------------------------ | ------- | ----------- |
| `--fix`     | Automatically fix issues found | `false` | `--fix`     |
| `--verbose` | Show detailed output           | `false` | `--verbose` |

###### `order` - Check order details and status

```bash
npx tsx src/scripts/utils.ts check order --order-id=<id> [options]
```

| Option            | Description                   | Default | Example              |
| ----------------- | ----------------------------- | ------- | -------------------- |
| `--include-items` | Include order items in output | `true`  | `--no-include-items` |
| `--include-tasks` | Include print tasks in output | `true`  | `--no-include-tasks` |

#### `fix` - Fix common issues

Fixes common issues with the database or system.

```bash
npx tsx src/scripts/utils.ts fix <subcommand> [options]
```

##### Subcommands

###### `missing-data` - Find and fix missing data

```bash
npx tsx src/scripts/utils.ts fix missing-data [options]
```

| Option          | Description                                 | Default | Example        |
| --------------- | ------------------------------------------- | ------- | -------------- |
| `--type=<type>` | Type of data to fix (order, customer, task) | -       | `--type=order` |
| `--dry-run`     | Don't make any changes                      | `false` | `--dry-run`    |

###### `orphaned-tasks` - Find and fix orphaned tasks

```bash
npx tsx src/scripts/utils.ts fix orphaned-tasks [options]
```

| Option               | Description                                   | Default | Example          |
| -------------------- | --------------------------------------------- | ------- | ---------------- |
| `--delete`           | Delete orphaned tasks instead of marking them | `false` | `--delete`       |
| `--days-back=<days>` | Only check tasks from the last N days         | 30      | `--days-back=60` |

#### `backup` - Backup database or files

Creates backups of the database or important files.

```bash
npx tsx src/scripts/utils.ts backup <subcommand> [options]
```

##### Subcommands

###### `database` - Backup the database

```bash
npx tsx src/scripts/utils.ts backup database [options]
```

| Option           | Description                 | Default     | Example                 |
| ---------------- | --------------------------- | ----------- | ----------------------- |
| `--output=<dir>` | Output directory for backup | `./backups` | `--output=/var/backups` |
| `--compress`     | Compress the backup         | `true`      | `--no-compress`         |

###### `logs` - Backup log files

```bash
npx tsx src/scripts/utils.ts backup logs [options]
```

| Option               | Description                           | Default          | Example                      |
| -------------------- | ------------------------------------- | ---------------- | ---------------------------- |
| `--output=<dir>`     | Output directory for backup           | `./backups/logs` | `--output=/var/backups/logs` |
| `--days-back=<days>` | Only backup logs from the last N days | 7                | `--days-back=30`             |

#### `stats` - Generate statistics and reports

Generates various statistics and reports about the system.

```bash
npx tsx src/scripts/utils.ts stats <subcommand> [options]
```

##### Subcommands

###### `orders` - Generate order statistics

```bash
npx tsx src/scripts/utils.ts stats orders [options]
```

| Option               | Description                      | Default | Example                     |
| -------------------- | -------------------------------- | ------- | --------------------------- |
| `--days-back=<days>` | Number of days to look back      | 30      | `--days-back=90`            |
| `--group-by=<field>` | Group statistics by field        | -       | `--group-by=marketplace`    |
| `--format=<format>`  | Output format (json, table, csv) | `table` | `--format=json`             |
| `--output=<file>`    | Output file                      | -       | `--output=order-stats.json` |

###### `ai-usage` - Generate AI usage statistics

```bash
npx tsx src/scripts/utils.ts stats ai-usage [options]
```

| Option               | Description                      | Default | Example                  |
| -------------------- | -------------------------------- | ------- | ------------------------ |
| `--days-back=<days>` | Number of days to look back      | 30      | `--days-back=90`         |
| `--format=<format>`  | Output format (json, table, csv) | `table` | `--format=json`          |
| `--output=<file>`    | Output file                      | -       | `--output=ai-usage.json` |

## Examples

### Order Synchronization

```bash
# Sync all orders from ShipStation
npx tsx src/scripts/order-sync.ts sync --mode=all

# Sync recent orders from the last 2 hours
npx tsx src/scripts/order-sync.ts sync --hours=2

# Sync a specific order by ID
npx tsx src/scripts/order-sync.ts sync --order-id=12345

# Sync orders within a date range
npx tsx src/scripts/order-sync.ts sync --order-date-start=2025-01-01 --order-date-end=2025-02-01
```

### Amazon Customization

```bash
# Run the entire Amazon customization workflow
npx tsx src/scripts/order-sync.ts amazon workflow

# Download and process Amazon customization files
npx tsx src/scripts/order-sync.ts amazon sync --retry-failed

# Update order items with personalization data and create print tasks
npx tsx src/scripts/order-sync.ts amazon update --create-print-tasks --update-shipstation

# Find and fix orders with missing personalization
npx tsx src/scripts/order-sync.ts amazon fix --fix-shipstation --fix-print-tasks
```

### Print Tasks

```bash
# Create print tasks for all unprocessed orders
npx tsx src/scripts/print-tasks.ts create

# Create print tasks with a specific AI provider
npx tsx src/scripts/print-tasks.ts create --ai-provider=openrouter

# Update print tasks with Amazon customization data
npx tsx src/scripts/print-tasks.ts update --update-from-amazon

# Clean up completed tasks and fix pending tasks
npx tsx src/scripts/print-tasks.ts cleanup --fix-pending

# Show print queue status
npx tsx src/scripts/print-tasks.ts status --days-back=14
```

### Utilities

```bash
# Check database status and consistency
npx tsx src/scripts/utils.ts check database --verbose

# Check details for a specific order
npx tsx src/scripts/utils.ts check order --order-id=12345

# Fix missing data
npx tsx src/scripts/utils.ts fix missing-data --type=order

# Backup the database
npx tsx src/scripts/utils.ts backup database --output=/var/backups

# Generate order statistics
npx tsx src/scripts/utils.ts stats orders --days-back=90 --group-by=marketplace --format=json --output=stats.json
```
