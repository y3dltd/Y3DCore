# Amazon Customization Unified Script

This document provides detailed information about the unified Amazon customization script, which consolidates all Amazon customization-related functionality into a single, command-based script.

## Overview

The Amazon customization workflow is a critical part of the Y3DHub system, responsible for:

1. Downloading and processing Amazon customization files
2. Extracting personalization data (custom text, colors)
3. Updating order items with personalization data
4. Updating ShipStation with personalization data
5. Creating and updating print tasks

Previously, this workflow was spread across multiple scripts, which were chained together in the crontab. This approach had several limitations:

- Error handling was limited to the script level
- Logging was fragmented across multiple files
- Duplicate code existed across scripts
- No unified transaction handling
- No centralized metrics collection

The unified script addresses these limitations by providing a single, command-based interface for all Amazon customization-related functionality.

## Command Structure

```
src/scripts/amazon-customization.ts [command] [options]
```

### Commands

| Command | Description | Replaces |
|---------|-------------|----------|
| `sync` | Download and process Amazon customization files | `amazon-customization-sync.ts` |
| `update` | Update order items and ShipStation with personalization data | `update-order-items-from-amazon.ts` |
| `tasks` | Update print tasks with personalization data | `update-print-tasks-from-order-items.ts` |
| `fix` | Find and fix orders with missing personalization data | `find-amazon-orders-needing-personalization.ts` |
| `workflow` | Run the entire workflow (sync, update, tasks) in sequence | Chained execution in crontab |
| `status` | Show the status of the Amazon customization workflow | New functionality |
| `metrics` | Show metrics for the Amazon customization workflow | New functionality |

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--order-id=<id>` | Process a specific order by ID | Process all orders |
| `--days-back=<days>` | Process orders from the last N days | 7 days |
| `--hours=<hours>` | Process orders from the last N hours | None |
| `--limit=<limit>` | Limit the number of orders to process | 50 |
| `--verbose` | Show verbose output | False |
| `--dry-run` | Don't make any changes to the database or ShipStation | False |

### Command-Specific Options

#### `sync` Command

| Option | Description | Default |
|--------|-------------|---------|
| `--retry-failed` | Retry previously failed downloads/processing | False |
| `--max-retries=<num>` | Maximum number of retries for failed items | 3 |

#### `update` Command

| Option | Description | Default |
|--------|-------------|---------|
| `--create-print-tasks` | Create print tasks for orders | False |
| `--update-shipstation` | Update ShipStation with personalization data | False |

#### `fix` Command

| Option | Description | Default |
|--------|-------------|---------|
| `--fix-shipstation` | Fix ShipStation orders | False |
| `--fix-print-tasks` | Fix print tasks | False |

#### `metrics` Command

| Option | Description | Default |
|--------|-------------|---------|
| `--format=<format>` | Output format (json, table, csv) | table |
| `--output=<file>` | Output file | stdout |

## Example Usage

### Run the Entire Workflow

```bash
npx tsx src/scripts/amazon-customization.ts workflow
```

### Process a Specific Order

```bash
npx tsx src/scripts/amazon-customization.ts workflow --order-id=12345
```

### Show Metrics for the Last 7 Days

```bash
npx tsx src/scripts/amazon-customization.ts metrics --days-back=7
```

### Show the Status of the Workflow

```bash
npx tsx src/scripts/amazon-customization.ts status
```

### Sync Orders from the Last 2 Hours

```bash
npx tsx src/scripts/amazon-customization.ts sync --hours=2
```

### Update ShipStation for a Specific Order

```bash
npx tsx src/scripts/amazon-customization.ts update --order-id=12345 --update-shipstation
```

### Fix Orders with Missing Personalization

```bash
npx tsx src/scripts/amazon-customization.ts fix --days-back=2
```

## Architecture

The unified script is built on a modular architecture with the following components:

### Core Modules

- `src/lib/amazon/workflow.ts`: Core workflow logic
- `src/lib/amazon/sync.ts`: Logic for downloading and processing customization files
- `src/lib/amazon/update.ts`: Logic for updating order items and ShipStation
- `src/lib/amazon/tasks.ts`: Logic for updating print tasks
- `src/lib/amazon/fix.ts`: Logic for finding and fixing orders with missing personalization
- `src/lib/amazon/metrics.ts`: Logic for collecting and reporting metrics

### Command Handler

- `src/scripts/amazon-customization.ts`: Main script with command handling

### Database Interaction

The script uses the Prisma ORM for database interaction, with proper transaction handling to ensure atomicity for related operations.

### Error Handling

The script implements comprehensive error handling and recovery mechanisms, including:

- Retry logic for transient errors
- Graceful degradation for non-critical errors
- Detailed error reporting
- Transaction rollback for database operations

### Logging

The script implements comprehensive logging, including:

- Structured logging with JSON format
- Log levels (debug, info, warn, error)
- Context-aware logging
- Log rotation

### Metrics Collection

The script collects and reports metrics, including:

- Success/failure rates
- Processing times
- Resource usage
- Error counts and types

## Crontab Configuration

After implementing the unified script, the crontab entries will be simplified to:

```bash
# Process Amazon customization workflow every 15 minutes
*/15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/amazon-customization.ts workflow >> $LOG_DIR/cron_amazon_workflow_`date +\%Y\%m\%d`.log 2>&1

# Run the fix command every 2 hours as a backup
0 */2 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/amazon-customization.ts fix --days-back=2 >> $LOG_DIR/cron_amazon_fix_`date +\%Y\%m\%d`.log 2>&1

# Collect and report metrics daily
0 5 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/amazon-customization.ts metrics --days-back=7 > $LOG_DIR/amazon_metrics_`date +\%Y\%m\%d`.log 2>&1
```

## Benefits

The unified script provides several benefits over the previous approach:

1. **Improved Reliability**: Proper error handling and recovery mechanisms
2. **Better Maintainability**: Single codebase for the entire workflow
3. **Enhanced Monitoring**: Comprehensive logging and metrics
4. **Simplified Operations**: Single command for the entire workflow
5. **Reduced Duplication**: Shared code and utilities
6. **Transaction Support**: Proper transaction handling for database operations
7. **Metrics Collection**: Track success/failure rates and performance
8. **Easier Troubleshooting**: Unified logging and status reporting

## Implementation Timeline

1. **Week 1**: Design and implement core modules
2. **Week 2**: Implement command handler and basic commands
3. **Week 3**: Add transaction support, metrics collection, and monitoring
4. **Week 4**: Testing, documentation, and deployment

## Migration Plan

To migrate from the existing scripts to the unified script:

1. Implement the unified script
2. Run it in parallel with the existing scripts for a period of time
3. Verify that the unified script produces the same results as the existing scripts
4. Update the crontab to use the unified script
5. Monitor the unified script for any issues
6. Deprecate the existing scripts

## Troubleshooting

### Common Issues

#### Script Fails to Start

- Check that the script exists at the expected location
- Check that the script has execute permissions
- Check that the TypeScript runtime is installed

#### Script Fails During Execution

- Check the logs for error messages
- Run the script with the `--verbose` option for more detailed output
- Check the database for any inconsistencies

#### ShipStation Integration Issues

- Check the ShipStation API credentials
- Check the ShipStation API rate limits
- Check the ShipStation API response for error messages

#### Database Issues

- Check the database connection
- Check the database schema
- Check the database logs for error messages

### Debugging

To debug the script, you can use the following techniques:

- Run the script with the `--verbose` option for more detailed output
- Run the script with the `--dry-run` option to see what changes would be made without actually making them
- Run the script with a specific `--order-id` to focus on a single order
- Check the logs for error messages
- Use the `status` command to see the current state of the workflow

## Conclusion

The unified Amazon customization script provides a more reliable, maintainable, and monitorable solution for the Amazon customization workflow. By consolidating all functionality into a single script with a command-based interface, we can reduce duplication, improve error handling, and provide better monitoring and metrics.
