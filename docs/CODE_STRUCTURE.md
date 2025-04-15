# Code Structure

This document provides a detailed explanation of the Y3DHub codebase structure after refactoring, focusing on the organization of modules, scripts, and their interactions.

## Directory Structure Overview

The refactored codebase follows a clear directory structure that separates concerns and promotes maintainability:

```
src/
├── lib/               # Core library modules
│   ├── orders/        # Order-related functionality
│   │   ├── amazon/    # Amazon-specific order handling
│   │   ├── sync.ts    # Order synchronization logic
│   │   ├── mappers.ts # Data mapping functions
│   │   ├── metrics.ts # Order-related metrics
│   │   └── status.ts  # Order status reporting
│   ├── print-tasks/   # Print task functionality
│   │   ├── create.ts  # Task creation logic
│   │   ├── update.ts  # Task update logic
│   │   ├── cleanup.ts # Task cleanup logic
│   │   ├── metrics.ts # Task-related metrics
│   │   └── status.ts  # Task status reporting
│   ├── utils/         # Utility functions
│   │   ├── check.ts   # System verification
│   │   ├── fix.ts     # Issue remediation
│   │   ├── backup.ts  # Backup functionality
│   │   └── stats.ts   # Statistics generation
│   └── shared/        # Shared utilities
│       ├── shipstation.ts # ShipStation API client
│       ├── database.ts    # Database client wrapper
│       ├── logging.ts     # Logging utilities
│       ├── metrics.ts     # Metrics collection
│       └── date-utils.ts  # Date handling utilities
├── scripts/           # Command-line scripts
│   ├── order-sync.ts  # Unified order sync script
│   ├── print-tasks.ts # Unified print tasks script
│   └── utils.ts       # Utility script
├── app/               # Next.js application
│   ├── api/           # API routes
│   ├── orders/        # Order pages
│   ├── print-queue/   # Print queue pages
│   └── ...            # Other application pages
└── components/        # React components
    ├── ui/            # UI components
    └── ...            # Other components
```

## Core Modules

### Orders Module (`lib/orders/`)

The orders module handles all order-related functionality, including synchronization with ShipStation, order processing, and status reporting.

#### Key Files:

- **`sync.ts`**: Core order synchronization logic

  - `syncAllOrders(options)`: Synchronizes all orders from ShipStation
  - `syncRecentOrders(options)`: Synchronizes recent orders based on a time window
  - `syncSingleOrder(orderId, options)`: Synchronizes a specific order
  - `syncShipStationTags(options)`: Synchronizes ShipStation tags

- **`mappers.ts`**: Functions for mapping data between different formats

  - `mapOrderToPrisma(order)`: Maps ShipStation order data to Prisma schema
  - `mapCustomerToPrisma(customer)`: Maps customer data to Prisma schema
  - `convertShipStationDateToUTC(date)`: Converts ShipStation dates from Pacific Time to UTC

- **`metrics.ts`**: Order metrics collection and reporting

  - `recordOrderMetric(name, value, tags)`: Records a metric related to orders
  - `getOrderMetrics(options)`: Retrieves order-related metrics

- **`status.ts`**: Order status reporting
  - `getOrderSyncStatus(options)`: Gets the status of order synchronization
  - `generateOrderSyncReport(options)`: Generates a report on order synchronization

#### Amazon Submodule (`lib/orders/amazon/`)

The Amazon submodule handles Amazon-specific order processing, including customization file handling.

- **`customization.ts`**: Core Amazon customization functionality

  - `extractPersonalizationData(jsonData)`: Extracts personalization data from Amazon customization files

- **`sync.ts`**: Amazon customization file synchronization

  - `syncCustomizationFiles(options)`: Downloads and processes Amazon customization files

- **`update.ts`**: Order item updating with personalization data

  - `updateOrderItems(options)`: Updates order items with personalization data
  - `updateShipStation(options)`: Updates ShipStation with personalization data

- **`fix.ts`**: Fixing orders with missing personalization

  - `findMissingPersonalization(options)`: Finds orders with missing personalization data
  - `fixMissingPersonalization(options)`: Fixes orders with missing personalization data

- **`workflow.ts`**: Orchestration of the entire Amazon workflow
  - `runWorkflow(options)`: Runs the entire Amazon customization workflow

### Print Tasks Module (`lib/print-tasks/`)

The print tasks module handles all print task-related functionality, including task creation, updating, and cleanup.

#### Key Files:

- **`create.ts`**: Print task creation logic

  - `createPrintTasks(options)`: Creates print tasks from orders
  - `findOrdersNeedingTasks(options)`: Finds orders that need print tasks

- **`update.ts`**: Print task updating logic

  - `updatePrintTasks(options)`: Updates print tasks with personalization data
  - `updateFromOrderItems(options)`: Updates print tasks from order items
  - `updateFromAmazon(options)`: Updates print tasks from Amazon customization data

- **`cleanup.ts`**: Print task cleanup logic

  - `cleanupTasks(options)`: Cleans up completed/shipped tasks
  - `clearCompletedTasks(options)`: Clears completed tasks
  - `fixPendingTasks(options)`: Fixes tasks for shipped/cancelled orders

- **`metrics.ts`**: Print task metrics collection and reporting

  - `recordTaskMetric(name, value, tags)`: Records a metric related to print tasks
  - `getTaskMetrics(options)`: Retrieves print task-related metrics

- **`status.ts`**: Print task status reporting
  - `getTaskStatus(options)`: Gets the status of print tasks
  - `generateTaskReport(options)`: Generates a report on print tasks

### Utilities Module (`lib/utils/`)

The utilities module provides general utility functions for system maintenance and diagnostics.

#### Key Files:

- **`check.ts`**: System verification

  - `checkDatabase(options)`: Checks database status and consistency
  - `checkOrder(orderId, options)`: Checks order details

- **`fix.ts`**: Issue remediation

  - `fixInconsistencies(options)`: Fixes data inconsistencies
  - `fixOrphanedTasks(options)`: Fixes orphaned print tasks

- **`backup.ts`**: Backup functionality

  - `backupDatabase(options)`: Backs up the database
  - `backupLogs(options)`: Backs up log files

- **`stats.ts`**: Statistics generation
  - `generateOrderStats(options)`: Generates order statistics
  - `generateTaskStats(options)`: Generates print task statistics

### Shared Module (`lib/shared/`)

The shared module provides utilities that are used across multiple modules.

#### Key Files:

- **`shipstation.ts`**: ShipStation API client

  - `createShipStationClient(options)`: Creates a ShipStation API client
  - `getOrder(orderId)`: Gets an order from ShipStation
  - `updateOrder(orderId, data)`: Updates an order in ShipStation

- **`database.ts`**: Database client wrapper

  - `createPrismaClient()`: Creates a Prisma client
  - `withTransaction(fn)`: Runs a function within a transaction

- **`logging.ts`**: Logging utilities

  - `createLogger(options)`: Creates a logger
  - `info(message, data)`: Logs an info message
  - `error(message, data)`: Logs an error message

- **`metrics.ts`**: Metrics collection

  - `recordMetric(name, value, tags)`: Records a metric
  - `getMetrics(options)`: Retrieves metrics

- **`date-utils.ts`**: Date handling utilities
  - `convertShipStationDateToUTC(dateString)`: Converts ShipStation dates from Pacific Time to UTC
  - `formatDateWithTimezone(date, formatStr)`: Formats dates with timezone information
  - `formatRelativeTime(date)`: Formats relative time

## Command-Line Scripts

### Order Sync Script (`scripts/order-sync.ts`)

This script provides a command-line interface for order synchronization and related operations.

#### Commands:

- **`sync`**: Syncs orders from ShipStation

  - `--skip-tags`: Skip syncing ShipStation tags
  - `--order-id=<id>`: Process a specific order by ID

- **`amazon`**: Processes Amazon customization

  - `sync`: Downloads and processes Amazon customization files
  - `update`: Updates order items with personalization data
  - `fix`: Finds and fixes orders with missing personalization data
  - `workflow`: Runs the entire Amazon customization workflow

- **`status`**: Shows sync status and statistics

  - `--days-back=<days>`: Number of days to look back for statistics

- **`metrics`**: Reports on sync performance and issues
  - `--format=<format>`: Output format (json, table, csv)
  - `--output=<file>`: Output file

### Print Tasks Script (`scripts/print-tasks.ts`)

This script provides a command-line interface for print task operations.

#### Commands:

- **`create`**: Creates print tasks from orders

  - `--create-placeholder`: Create placeholder tasks for orders without personalization data

- **`update`**: Updates print tasks with personalization data

  - `--update-from-amazon`: Update tasks from Amazon customization data

- **`cleanup`**: Cleans up completed/shipped tasks

  - `--fix-pending`: Fix tasks for shipped/cancelled orders

- **`status`**: Shows print queue status and statistics

  - `--days-back=<days>`: Number of days to look back for statistics

- **`metrics`**: Reports on print task performance and issues
  - `--format=<format>`: Output format (json, table, csv)
  - `--output=<file>`: Output file

### Utilities Script (`scripts/utils.ts`)

This script provides a command-line interface for utility operations.

#### Commands:

- **`check`**: Checks system status

  - `database`: Checks database status and consistency

- **`fix`**: Fixes common issues

  - `missing-data`: Finds and fixes missing data

- **`backup`**: Backs up database or files

  - `logs`: Backs up logs

- **`stats`**: Generates statistics and reports
  - `orders`: Generates order statistics
  - `ai-usage`: Generates AI usage statistics

## Module Interactions

The modules interact with each other in a structured manner:

1. **Scripts** use **lib modules** to perform their operations
2. **Order modules** interact with **ShipStation** via the shared ShipStation client
3. **Print task modules** use order data to create and update tasks
4. **All modules** use **shared utilities** for common operations like logging and database access

The diagram below illustrates these interactions:

```
[scripts] ---> [lib modules] ---> [external APIs]
               |
               v
            [database]
```

## Error Handling Strategy

The refactored codebase implements a consistent error handling strategy:

1. **Try-catch blocks** in all modules with proper error propagation
2. **Retries** for transient errors, especially during external API calls
3. **Transaction rollbacks** for database operations in case of failure
4. **Detailed error logging** with context information
5. **Graceful degradation** for non-critical errors

## Global Options

Most scripts and commands support the following global options:

- **`--verbose`**: Shows verbose output
- **`--dry-run`**: Doesn't make any changes to the database or external systems
- **`--order-id=<id>`**: Processes a specific order by ID
- **`--days-back=<days>`**: Processes data from the last N days
- **`--hours=<hours>`**: Processes data from the last N hours
- **`--limit=<limit>`**: Limits the number of items to process

## Conclusion

The refactored code structure provides a clear separation of concerns, with modular components that interact through well-defined interfaces. This organization improves maintainability, testability, and extensibility of the system.

For more details on specific aspects of the system, see:

- [COMMAND_REFERENCE.md](./COMMAND_REFERENCE.md) for a comprehensive list of commands and options
- [DATABASE.md](./DATABASE.md) for information on the database schema and field standards
- [API_REFERENCE.md](./API_REFERENCE.md) for documentation on API endpoints
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for help with common issues
- [TESTING.md](./TESTING.md) for information on testing strategies and test coverage
