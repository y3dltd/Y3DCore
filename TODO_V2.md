# Y3DHub Script Consolidation and Refactoring Plan V2

This document outlines the comprehensive plan for consolidating the Y3DHub scripts into three main scripts:

1. `src/scripts/order-sync.ts` - Unified Order Sync Script (including Amazon customization)
2. `src/scripts/print-tasks.ts` - Unified Print Tasks Script
3. `src/scripts/utils.ts` - Utility Script for maintenance and diagnostics

## Current State Analysis

The Y3DHub project currently has numerous scripts spread across different directories with overlapping functionality:

### Order Sync Scripts

- `src/scripts/sync-orders.ts` - Main script for syncing orders from ShipStation
- `scripts/analysis/sync-orders-wrapper.ts` - Wrapper for sync-orders.ts with database logging

### Amazon Customization Scripts

- `scripts/analysis/amazon-customization-sync.ts` - Downloads and processes Amazon customization files
- `scripts/analysis/update-order-items-from-amazon.ts` - Updates order items and ShipStation with personalization data
- `scripts/analysis/amazon-sync-wrapper.ts` - Wrapper script that runs both Amazon customization sync steps
- `scripts/amazon-customization-workflow.ts` - Orchestrates the entire Amazon customization process
- `scripts/find-amazon-orders-needing-personalization.ts` - Finds and fixes orders with missing personalization data

### Print Task Scripts

- `src/scripts/populate-print-queue.ts` - Creates print tasks for orders
- `scripts/update-print-tasks-from-order-items.ts` - Updates print tasks with personalization data

### Utility Scripts

- `scripts/analysis/orders.ts` - Analyzes order data, synchronization status, and print task completion status
- `scripts/analysis/cleanup.ts` - Scripts for cleaning up inconsistent data states
- Various check and test scripts

## Consolidated Script Architecture

### 1. `src/scripts/order-sync.ts` - Unified Order Sync Script

This script will handle all order-related operations, including Amazon customization.

#### Commands

- `sync` - Sync orders from ShipStation

  - `--mode=all|recent|single` - Sync mode
  - `--order-id=<id>` - ShipStation Order ID to sync (for single mode)
  - `--days-back=<days>` - Number of days to look back (for recent mode)
  - `--hours=<hours>` - Number of hours to look back (for recent mode)
  - `--force-start-date=<date>` - Force sync to start from this date
  - `--skip-tags` - Skip syncing ShipStation tags

- `amazon` - Process Amazon customization

  - `sync` - Download and process Amazon customization files
    - `--retry-failed` - Retry previously failed downloads/processing
    - `--max-retries=<num>` - Maximum number of retries for failed items
  - `update` - Update order items and ShipStation with personalization data
    - `--update-shipstation` - Update ShipStation with personalization data
  - `workflow` - Run the entire Amazon customization workflow
  - `fix` - Find and fix orders with missing personalization data

- `status` - Show sync status and statistics

  - `--days-back=<days>` - Number of days to look back for statistics

- `metrics` - Report on sync performance and issues
  - `--format=<format>` - Output format (json, table, csv)
  - `--output=<file>` - Output file

#### Global Options

- `--order-id=<id>` - Process a specific order by ID
- `--days-back=<days>` - Process orders from the last N days
- `--hours=<hours>` - Process orders from the last N hours
- `--limit=<limit>` - Limit the number of orders to process
- `--verbose` - Show verbose output
- `--dry-run` - Don't make any changes to the database or ShipStation

### 2. `src/scripts/print-tasks.ts` - Unified Print Tasks Script

This script will handle all print task operations.

#### Commands

- `create` - Create print tasks from orders

  - `--force-recreate` - Force recreation of existing tasks
  - `--create-placeholder` - Create placeholder tasks for orders without personalization data

- `update` - Update print tasks with personalization data

  - `--update-from-order-items` - Update tasks from order items' print_settings
  - `--update-from-amazon` - Update tasks from Amazon customization data

- `cleanup` - Clean up completed/shipped tasks

  - `--clear-all` - Clear all tasks (with confirmation)
  - `--clear-completed` - Clear completed tasks
  - `--fix-pending` - Fix tasks for shipped/cancelled orders

- `status` - Show print queue status and statistics

  - `--status=pending|in_progress|completed` - Filter by status
  - `--days-back=<days>` - Number of days to look back for statistics

- `metrics` - Report on print task performance and issues
  - `--format=<format>` - Output format (json, table, csv)
  - `--output=<file>` - Output file

#### Global Options

- `--order-id=<id>` - Process a specific order by ID
- `--days-back=<days>` - Process orders from the last N days
- `--hours=<hours>` - Process orders from the last N hours
- `--limit=<limit>` - Limit the number of orders to process
- `--verbose` - Show verbose output
- `--dry-run` - Don't make any changes to the database

### 3. `src/scripts/utils.ts` - Utility Script

This script will handle miscellaneous utility functions.

#### Commands

- `check` - Check system status

  - `order` - Check order details
  - `print-tasks` - Check print tasks for an order
  - `amazon` - Check Amazon customization status
  - `shipstation` - Check ShipStation connection and status
  - `database` - Check database status and consistency

- `fix` - Fix common issues

  - `inconsistencies` - Find and fix data inconsistencies
  - `orphaned-tasks` - Find and fix orphaned print tasks
  - `missing-data` - Find and fix missing data

- `backup` - Backup database or files

  - `database` - Backup database
  - `logs` - Backup logs

- `stats` - Generate statistics and reports
  - `orders` - Generate order statistics
  - `print-tasks` - Generate print task statistics
  - `amazon` - Generate Amazon customization statistics
  - `ai-usage` - Generate AI usage statistics

#### Global Options

- `--order-id=<id>` - Process a specific order by ID
- `--days-back=<days>` - Process data from the last N days
- `--format=<format>` - Output format (json, table, csv)
- `--output=<file>` - Output file
- `--verbose` - Show verbose output

## Implementation Plan

### Phase 1: Core Module Structure (Day 1 - Morning)

1. Create the core module structure:

```
src/
├── lib/
│   ├── orders/
│   │   ├── sync.ts
│   │   ├── amazon/
│   │   │   ├── customization.ts
│   │   │   ├── sync.ts
│   │   │   ├── update.ts
│   │   │   └── fix.ts
│   │   ├── metrics.ts
│   │   └── status.ts
│   ├── print-tasks/
│   │   ├── create.ts
│   │   ├── update.ts
│   │   ├── cleanup.ts
│   │   ├── metrics.ts
│   │   └── status.ts
│   ├── utils/
│   │   ├── check.ts
│   │   ├── fix.ts
│   │   ├── backup.ts
│   │   └── stats.ts
│   ├── shared/
│   │   ├── shipstation.ts
│   │   ├── database.ts
│   │   ├── logging.ts
│   │   └── metrics.ts
```

2. Create the command handlers for the three main scripts:

```
src/
├── scripts/
│   ├── order-sync.ts
│   ├── print-tasks.ts
│   └── utils.ts
```

### Phase 2: Order Sync Implementation (Day 1 - Midday)

1. Migrate the order sync functionality from `src/scripts/sync-orders.ts` to `src/lib/orders/sync.ts`
2. Implement the `sync` command in `src/scripts/order-sync.ts`
3. Test the basic order sync functionality

### Phase 3: Amazon Customization Implementation (Day 1 - Afternoon)

1. Migrate the Amazon customization functionality:

   - `scripts/analysis/amazon-customization-sync.ts` → `src/lib/orders/amazon/sync.ts`
   - `scripts/analysis/update-order-items-from-amazon.ts` → `src/lib/orders/amazon/update.ts`
   - `scripts/find-amazon-orders-needing-personalization.ts` → `src/lib/orders/amazon/fix.ts`

2. Implement the `amazon` command in `src/scripts/order-sync.ts`
3. Test the Amazon customization functionality

### Phase 4: Print Tasks Implementation (Day 1 - Late Afternoon)

1. Migrate the print tasks functionality:

   - `src/scripts/populate-print-queue.ts` → `src/lib/print-tasks/create.ts`
   - `scripts/update-print-tasks-from-order-items.ts` → `src/lib/print-tasks/update.ts`

2. Implement the `create` and `update` commands in `src/scripts/print-tasks.ts`
3. Test the print tasks functionality

### Phase 5: Utilities Implementation (Day 2 - Morning)

1. Migrate the utility functionality:

   - `scripts/analysis/orders.ts` → `src/lib/utils/check.ts`
   - `scripts/analysis/cleanup.ts` → `src/lib/utils/fix.ts`

2. Implement the `check` and `fix` commands in `src/scripts/utils.ts`
3. Test the utility functionality

### Phase 6: Metrics and Status Implementation (Day 2 - Midday)

1. Implement metrics collection and reporting:

   - `src/lib/orders/metrics.ts`
   - `src/lib/print-tasks/metrics.ts`
   - `src/lib/utils/stats.ts`

2. Implement status reporting:

   - `src/lib/orders/status.ts`
   - `src/lib/print-tasks/status.ts`

3. Implement the `metrics` and `status` commands in all three scripts
4. Test the metrics and status functionality

### Phase 7: Testing and Documentation (Day 2 - Afternoon)

1. Comprehensive testing of all commands and options
2. Update documentation:

   - Update `src/scripts/README.md`
   - Create command-specific documentation
   - Update the main `README.md`

3. Update crontab configuration

## Module Details

### 1. Order Sync Modules

#### `src/lib/orders/sync.ts`

This module will handle the core order sync functionality:

- Syncing orders from ShipStation
- Syncing ShipStation tags
- Handling pagination and rate limiting
- Error handling and recovery
- Transaction management

Key functions:

- `syncAllOrders(options)`
- `syncRecentOrders(options)`
- `syncSingleOrder(orderId, options)`
- `syncShipStationTags(options)`

#### `src/lib/orders/amazon/customization.ts`

This module will handle the core Amazon customization functionality:

- Downloading and processing Amazon customization files
- Extracting personalization data
- Error handling and recovery

Key functions:

- `fetchAndProcessAmazonCustomization(url, options)`
- `extractPersonalizationData(jsonData, options)`

#### `src/lib/orders/amazon/sync.ts`

This module will handle the Amazon customization sync functionality:

- Finding orders with customization URLs
- Downloading and processing customization files
- Updating the database with customization data

Key functions:

- `syncCustomizationFiles(options)`
- `findOrderItemsToProcess(options)`
- `processOrderItem(item, options)`

#### `src/lib/orders/amazon/update.ts`

This module will handle updating order items and ShipStation with personalization data:

- Updating order items with personalization data
- Updating ShipStation with personalization data
- Creating print tasks for updated items

Key functions:

- `updateOrderItems(options)`
- `updateShipStation(options)`
- `createPrintTasks(options)`

#### `src/lib/orders/amazon/fix.ts`

This module will handle finding and fixing orders with missing personalization data:

- Finding orders with missing personalization data
- Fixing orders with missing personalization data
- Updating ShipStation with personalization data

Key functions:

- `findMissingPersonalization(options)`
- `fixMissingPersonalization(options)`

### 2. Print Tasks Modules

#### `src/lib/print-tasks/create.ts`

This module will handle creating print tasks from orders:

- Finding orders that need print tasks
- Creating print tasks for orders
- Handling AI extraction of personalization data

Key functions:

- `createPrintTasks(options)`
- `findOrdersNeedingTasks(options)`
- `extractPersonalizationData(order, options)`

#### `src/lib/print-tasks/update.ts`

This module will handle updating print tasks with personalization data:

- Updating print tasks from order items' print_settings
- Updating print tasks from Amazon customization data
- Handling status updates

Key functions:

- `updatePrintTasks(options)`
- `updateFromOrderItems(options)`
- `updateFromAmazon(options)`

#### `src/lib/print-tasks/cleanup.ts`

This module will handle cleaning up completed/shipped tasks:

- Clearing completed tasks
- Fixing tasks for shipped/cancelled orders
- Handling orphaned tasks

Key functions:

- `cleanupTasks(options)`
- `clearCompletedTasks(options)`
- `fixPendingTasks(options)`

### 3. Utility Modules

#### `src/lib/utils/check.ts`

This module will handle checking system status:

- Checking order details
- Checking print tasks for an order
- Checking Amazon customization status
- Checking ShipStation connection and status
- Checking database status and consistency

Key functions:

- `checkOrder(orderId, options)`
- `checkPrintTasks(orderId, options)`
- `checkAmazon(orderId, options)`
- `checkShipStation(options)`
- `checkDatabase(options)`

#### `src/lib/utils/fix.ts`

This module will handle fixing common issues:

- Finding and fixing data inconsistencies
- Finding and fixing orphaned print tasks
- Finding and fixing missing data

Key functions:

- `fixInconsistencies(options)`
- `fixOrphanedTasks(options)`
- `fixMissingData(options)`

## Shared Utilities

### `src/lib/shared/shipstation.ts`

This module will provide a unified interface for interacting with the ShipStation API:

- Creating and managing the ShipStation API client
- Handling rate limiting and retries
- Providing common ShipStation operations

Key functions:

- `createShipStationClient(options)`
- `getOrder(orderId, options)`
- `updateOrder(orderId, data, options)`
- `getTags(options)`

### `src/lib/shared/database.ts`

This module will provide a unified interface for database operations:

- Creating and managing the Prisma client
- Handling transactions
- Providing common database operations

Key functions:

- `createPrismaClient(options)`
- `withTransaction(fn, options)`
- `getOrder(orderId, options)`
- `getOrderItems(orderId, options)`
- `getPrintTasks(orderId, options)`

### `src/lib/shared/logging.ts`

This module will provide a unified logging interface:

- Creating and managing the logger
- Handling log levels and formats
- Providing common logging operations

Key functions:

- `createLogger(options)`
- `info(message, data)`
- `warn(message, data)`
- `error(message, data)`
- `debug(message, data)`

### `src/lib/shared/metrics.ts`

This module will provide a unified metrics collection interface:

- Creating and managing the metrics collector
- Handling metrics storage and retrieval
- Providing common metrics operations

Key functions:

- `createMetricsCollector(options)`
- `recordMetric(name, value, tags)`
- `getMetrics(options)`
- `generateReport(options)`

## Crontab Configuration

After implementing the consolidated scripts, the crontab configuration will be simplified to:

```bash
# Sync recent orders every 15 minutes
*/15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts sync --mode=recent --hours=2 >> $LOG_DIR/cron_order_sync_recent_`date +\%Y\%m\%d`.log 2>&1

# Sync all orders once a day
0 3 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts sync --mode=all >> $LOG_DIR/cron_order_sync_all_`date +\%Y\%m\%d`.log 2>&1

# Process Amazon customization every 15 minutes
*/15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts amazon workflow >> $LOG_DIR/cron_amazon_workflow_`date +\%Y\%m\%d`.log 2>&1

# Find and fix orders with missing personalization every 2 hours
0 */2 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts amazon fix --days-back=2 >> $LOG_DIR/cron_amazon_fix_`date +\%Y\%m\%d`.log 2>&1

# Create and update print tasks every 15 minutes
*/15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/print-tasks.ts create >> $LOG_DIR/cron_print_tasks_create_`date +\%Y\%m\%d`.log 2>&1

# Clean up completed/shipped tasks daily
0 2 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/print-tasks.ts cleanup --fix-pending >> $LOG_DIR/cron_print_tasks_cleanup_`date +\%Y\%m\%d`.log 2>&1

# Generate daily statistics
0 5 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/utils.ts stats --days-back=7 > $LOG_DIR/daily_stats_`date +\%Y\%m\%d`.log 2>&1

# Check for inconsistencies daily
0 4 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/utils.ts check database >> $LOG_DIR/db_check_`date +\%Y\%m\%d`.log 2>&1
```

## Benefits of Consolidation

1. **Improved Maintainability**: Fewer scripts to maintain, with clear separation of concerns
2. **Better Error Handling**: Unified error handling and recovery mechanisms
3. **Enhanced Logging**: Centralized logging with consistent format and levels
4. **Simplified Crontab**: Fewer cron jobs with clearer purpose
5. **Reduced Duplication**: Shared code and utilities
6. **Better Metrics**: Centralized metrics collection and reporting
7. **Easier Troubleshooting**: Unified command structure and documentation
8. **Transaction Support**: Proper transaction handling for database operations
9. **Modular Architecture**: Clear separation of concerns with well-defined interfaces
10. **Comprehensive Documentation**: Unified documentation with clear examples

## Data Structures and I/O Specifications

To ensure correct implementation, here are the detailed input/output specifications for each module:

### Order Sync Data Structures

#### Input Parameters

```typescript
interface OrderSyncOptions {
  mode?: "all" | "recent" | "single";
  orderId?: string;
  daysBack?: number;
  hours?: number;
  forceStartDate?: string;
  skipTags?: boolean;
  limit?: number;
  verbose?: boolean;
  dryRun?: boolean;
}
```

#### Output Structure

```typescript
interface OrderSyncResult {
  success: boolean;
  ordersProcessed: number;
  ordersFailed: number;
  errors?: Array<{
    orderId: string;
    error: string;
  }>;
  metrics?: {
    startTime: Date;
    endTime: Date;
    duration: number;
    apiCalls: number;
    averageProcessingTime: number;
  };
}
```

### Amazon Customization Data Structures

#### Input Parameters

```typescript
interface AmazonCustomizationOptions {
  orderId?: number;
  itemId?: number;
  daysBack?: number;
  hours?: number;
  limit?: number;
  retryFailed?: boolean;
  maxRetries?: number;
  updateShipstation?: boolean;
  createPrintTasks?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
}
```

#### Output Structure

```typescript
interface AmazonCustomizationResult {
  sync?: {
    success: number;
    failed: number;
    skipped: number;
  };
  update?: {
    success: number;
    failed: number;
    skipped: number;
    shipstationUpdated: number;
  };
  tasks?: {
    created: number;
    updated: number;
    failed: number;
  };
  overall: {
    success: boolean;
    message: string;
  };
  errors?: Array<{
    orderId: number;
    itemId?: number;
    error: string;
  }>;
}
```

#### Customization File Structure

```typescript
interface AmazonCustomizationData {
  customText: string | null;
  color1: string | null;
  color2: string | null;
  allFields: Record<string, string | null>;
}
```

### Print Tasks Data Structures

#### Input Parameters

```typescript
interface PrintTasksOptions {
  orderId?: number;
  daysBack?: number;
  hours?: number;
  limit?: number;
  forceRecreate?: boolean;
  createPlaceholder?: boolean;
  clearAll?: boolean;
  clearCompleted?: boolean;
  fixPending?: boolean;
  status?: "pending" | "in_progress" | "completed";
  verbose?: boolean;
  dryRun?: boolean;
  confirm?: boolean;
}
```

#### Output Structure

```typescript
interface PrintTasksResult {
  tasksCreated: number;
  tasksUpdated: number;
  tasksDeleted: number;
  tasksFailed: number;
  ordersProcessed: number;
  ordersFailed: number;
  errors?: Array<{
    orderId: number;
    error: string;
  }>;
}
```

#### Print Task Structure

```typescript
interface PrintTask {
  id: number;
  orderItemId: number;
  taskIndex: number;
  status: "pending" | "in_progress" | "completed";
  custom_text: string | null;
  color_1: string | null;
  color_2: string | null;
  quantity: number;
  needs_review: boolean;
  review_reason: string | null;
  created_at: Date;
  updated_at: Date;
}
```

## UI Integration

The UI components need to be updated to work with the consolidated scripts. Here are the key integration points:

### Orders Page

- **Order Details**: The order details page (`src/app/orders/[id]/page.tsx`) displays order information, including Amazon customization data. It needs to be updated to use the new data structures.
- **Print Settings Display**: The print settings display component (`src/app/orders/[id]/display-print-settings.tsx`) shows the personalization data. It needs to be updated to handle the new data structures.

### Print Queue Page

- **Print Queue Table**: The print queue table (`src/app/print-queue/page.tsx`) displays print tasks. It needs to be updated to work with the new data structures.
- **Task Totals**: The print queue task totals component (`src/components/print-queue-task-totals.tsx`) shows statistics about print tasks. It needs to be updated to use the new data structures.
- **Stats Cards**: The stats cards component (`src/components/dashboard/stats-card.tsx`) displays statistics. It needs to be updated to use the new metrics.

### Tools Modal

- **Sync Controls**: The tools modal includes controls for syncing orders and print tasks. It needs to be updated to use the new consolidated scripts.
- **Amazon Customization Controls**: The tools modal includes controls for Amazon customization. It needs to be updated to use the new consolidated scripts.

## Database Schema Considerations

The consolidated scripts need to work with the existing database schema. Here are the key tables and their relationships:

### Order Tables

- **Order**: Stores order information from ShipStation
- **OrderItem**: Stores individual items within an order
- **Customer**: Stores customer information
- **Product**: Stores product information

### Amazon Customization Tables

- **AmazonCustomizationFile**: Stores information about downloaded customization files

### Print Task Tables

- **PrintOrderTask**: Stores print tasks created from order items

### Logging and Metrics Tables

- **SystemLog**: Stores system logs
- **SyncProgress**: Stores sync progress information
- **SyncMetrics**: Stores sync metrics

## Critical Functionality to Preserve

During the consolidation, it's essential to preserve all critical functionality from the existing scripts. Here are the key features that must be maintained:

### Order Sync Critical Functionality

1. **ShipStation API Integration**: The scripts must maintain the existing ShipStation API integration, including authentication, rate limiting, and error handling.

2. **Order Data Mapping**: The scripts must correctly map ShipStation order data to the database schema, preserving all fields and relationships.

3. **Incremental Sync**: The scripts must support incremental sync based on modification date to avoid re-processing all orders.

4. **Order Status Handling**: The scripts must handle order status changes correctly, including marking print tasks as completed when orders are shipped or cancelled.

5. **Tag Synchronization**: The scripts must synchronize ShipStation tags with the database.

6. **Metrics Collection**: The scripts must collect and store metrics about the sync process, including success/failure rates and processing times.

### Amazon Customization Critical Functionality

1. **Customization URL Extraction**: The scripts must correctly extract customization URLs from order items' print_settings.

2. **Zip File Download**: The scripts must download and extract zip files from Amazon customization URLs.

3. **JSON Parsing**: The scripts must parse the JSON data from the customization files, handling various formats and structures.

4. **Personalization Data Extraction**: The scripts must extract personalization data (custom text, colors) from the JSON data, handling various formats and edge cases.

5. **Database Updates**: The scripts must update the database with the extracted personalization data, including order items and customization files.

6. **ShipStation Updates**: The scripts must update ShipStation with the extracted personalization data, using the correct API endpoints and data formats.

7. **Error Recovery**: The scripts must implement error recovery mechanisms, including retry logic for failed downloads and processing.

### Print Tasks Critical Functionality

1. **Task Creation**: The scripts must create print tasks for order items, handling various order types and personalization data sources.

2. **AI Extraction**: The scripts must use AI to extract personalization data from order notes and print settings when needed.

3. **Task Updates**: The scripts must update print tasks with personalization data from various sources, including order items and Amazon customization files.

4. **Status Management**: The scripts must manage print task status correctly, including marking tasks as completed when orders are shipped or cancelled.

5. **Cleanup**: The scripts must clean up completed and orphaned print tasks.

6. **Placeholder Tasks**: The scripts must create placeholder tasks for orders without personalization data, with appropriate review flags.

7. **Quantity Handling**: The scripts must handle order item quantities correctly, creating the appropriate number of print tasks.

## Edge Cases and Special Handling

The consolidated scripts need to handle various edge cases and special situations:

### Order Sync Edge Cases

1. **Rate Limiting**: ShipStation API has rate limits that need to be respected
2. **Pagination**: ShipStation API returns paginated results that need to be handled
3. **Order Status Changes**: Orders can change status between syncs, which needs special handling
4. **Duplicate Orders**: ShipStation can sometimes return duplicate orders
5. **Missing Data**: ShipStation can sometimes return orders with missing data
6. **API Errors**: ShipStation API can return errors that need to be handled
7. **Network Issues**: Network issues can cause API calls to fail
8. **Large Orders**: Orders with many items can cause performance issues

### Amazon Customization Edge Cases

1. **Missing Customization URLs**: Some Amazon orders don't have customization URLs
2. **Invalid Customization URLs**: Some customization URLs can be invalid or expired
3. **Failed Downloads**: Customization file downloads can fail
4. **Malformed JSON**: Customization files can contain malformed JSON
5. **Missing Personalization Data**: Customization files can be missing personalization data
6. **Multiple Customization Files**: Some orders can have multiple customization files
7. **ShipStation Update Failures**: Updates to ShipStation can fail
8. **Different Print Settings Formats**: Print settings can be in different formats

### Print Tasks Edge Cases

1. **Missing Order Items**: Some order items might be missing
2. **Missing Personalization Data**: Some order items might be missing personalization data
3. **Multiple Print Tasks**: Some order items can have multiple print tasks
4. **Status Changes**: Print tasks can change status outside the script
5. **Orphaned Tasks**: Print tasks can become orphaned if the order item is deleted
6. **AI Extraction Failures**: AI extraction of personalization data can fail
7. **Large Batch Processing**: Processing many print tasks at once can cause performance issues

## Potential Challenges and Mitigations

1. **Code Complexity**:

   - **Challenge**: The consolidated scripts will be more complex than the individual scripts.
   - **Mitigation**: Keep modules small and focused, with clear interfaces. Use TypeScript interfaces to define module boundaries.

2. **Migration Risks**:

   - **Challenge**: Migrating functionality from existing scripts to the consolidated scripts can introduce bugs.
   - **Mitigation**: Implement and test one module at a time, with comprehensive testing. Use TypeScript to catch type errors.

3. **Backward Compatibility**:

   - **Challenge**: The consolidated scripts need to maintain backward compatibility with existing scripts during the transition.
   - **Mitigation**: Keep the existing scripts working until the consolidated scripts are fully tested and deployed.

4. **Performance**:

   - **Challenge**: The consolidated scripts need to handle large amounts of data efficiently.
   - **Mitigation**: Optimize critical paths, use proper transaction handling, and implement pagination and batching.

5. **Error Handling**:

   - **Challenge**: The consolidated scripts need to handle various error conditions gracefully.
   - **Mitigation**: Implement comprehensive error handling and recovery mechanisms, with detailed logging.

6. **Documentation**:

   - **Challenge**: The consolidated scripts need comprehensive documentation.
   - **Mitigation**: Create detailed documentation with clear examples, including command-line usage and API references.

7. **UI Integration**:

   - **Challenge**: The UI components need to be updated to work with the consolidated scripts.
   - **Mitigation**: Update the UI components incrementally, with comprehensive testing.

8. **Database Schema Changes**:

   - **Challenge**: The consolidated scripts might require database schema changes.
   - **Mitigation**: Minimize schema changes, and use migrations for any necessary changes.

9. **Crontab Configuration**:

   - **Challenge**: The crontab configuration needs to be updated to use the consolidated scripts.
   - **Mitigation**: Update the crontab configuration incrementally, with comprehensive testing.

10. **Testing**:
    - **Challenge**: The consolidated scripts need comprehensive testing.
    - **Mitigation**: Implement unit tests, integration tests, and end-to-end tests. Use TypeScript to catch type errors.

## Testing and Validation Plan

To ensure the consolidated scripts work correctly, we need a comprehensive testing and validation plan:

### Unit Testing

1. **Module Tests**: Write unit tests for each module, focusing on core functionality:

   - `src/lib/orders/sync.ts`: Test order sync functionality
   - `src/lib/orders/amazon/customization.ts`: Test customization processing
   - `src/lib/print-tasks/create.ts`: Test print task creation
   - etc.

2. **Edge Case Tests**: Write tests for edge cases and special handling:

   - Rate limiting and pagination
   - Error handling and recovery
   - Different data formats and structures
   - Missing or malformed data

3. **Mock Tests**: Use mocks for external dependencies:
   - Mock ShipStation API responses
   - Mock database queries and transactions
   - Mock file system operations

### Integration Testing

1. **Command Tests**: Test each command in the consolidated scripts:

   - `order-sync.ts sync`: Test order sync command
   - `order-sync.ts amazon`: Test Amazon customization command
   - `print-tasks.ts create`: Test print task creation command
   - etc.

2. **End-to-End Tests**: Test the entire workflow:

   - Order sync → Amazon customization → Print task creation
   - Print task update → Print task cleanup
   - Error recovery and retry logic

3. **Database Tests**: Test database interactions:
   - Transaction handling
   - Data consistency
   - Performance with large datasets

### Validation Tests

1. **Functionality Validation**: Validate that all critical functionality is preserved:

   - Compare output of consolidated scripts with existing scripts
   - Verify that all edge cases are handled correctly
   - Verify that all data is processed correctly

2. **Performance Validation**: Validate that performance is acceptable:

   - Measure processing time for various operations
   - Measure memory usage
   - Measure database query performance

3. **UI Validation**: Validate that UI components work correctly with the consolidated scripts:
   - Verify that order details page displays correctly
   - Verify that print queue page displays correctly
   - Verify that tools modal works correctly

### Test Data

1. **Real-World Data**: Use real-world data for testing:

   - Export a subset of production data for testing
   - Anonymize sensitive data
   - Include examples of edge cases and special handling

2. **Synthetic Data**: Create synthetic data for specific test cases:

   - Generate orders with specific characteristics
   - Generate customization files with specific formats
   - Generate print tasks with specific status and data

3. **Test Fixtures**: Create test fixtures for unit and integration tests:
   - Mock ShipStation API responses
   - Mock database queries and transactions
   - Mock file system operations

### Test Automation

1. **Automated Tests**: Automate tests where possible:

   - Use Jest or similar testing framework
   - Create test scripts for common operations
   - Integrate with CI/CD pipeline

2. **Manual Tests**: Create checklists for manual tests:

   - UI validation
   - End-to-end workflow validation
   - Edge case validation

3. **Regression Tests**: Create regression tests for critical functionality:
   - Order sync
   - Amazon customization
   - Print task creation and management

## Conclusion

This consolidation plan will significantly improve the maintainability, reliability, and usability of the Y3DHub scripts. By consolidating the functionality into three main scripts with a modular architecture, we can reduce duplication, improve error handling, and provide better monitoring and metrics.

The implementation will be done in phases, with each phase focusing on a specific area of functionality. This approach will allow us to make incremental progress and test each component thoroughly before moving on to the next.

The end result will be a more robust, maintainable, and user-friendly system that is easier to extend and troubleshoot.
