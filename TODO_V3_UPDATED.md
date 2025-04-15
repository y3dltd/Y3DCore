# Y3DHub Script Consolidation and Refactoring TODO_V3 (Updated)

This document outlines the remaining issues and tasks needed to complete the refactoring of Y3DHub scripts according to the plans in TODO_V2.md. These issues were identified during code analysis on April 14, 2025, with the goal of ensuring all code aligns with the current database structure and coding conventions.

## Key Reference Files Index

This index provides quick access to important files in the project that will be referenced throughout the refactoring process.

### Documentation Files

| File                                                                                                                        | Description                     | Purpose in Refactoring                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| [README.md](/workspaces/Y3DHub/README.md)                                                                                   | Main project documentation      | Overview of project architecture and features             |
| [TODO_V2.md](/workspaces/Y3DHub/TODO_V2.md)                                                                                 | Original refactoring plan       | Reference for intended architecture and command structure |
| [IDE_GUIDELINES.md](/workspaces/Y3DHub/IDE_GUIDELINES.md)                                                                   | Coding standards                | Reference for maintaining consistent code quality         |
| [docs/timezone-handling.md](/workspaces/Y3DHub/docs/timezone-handling.md)                                                   | Timezone implementation details | Guide for correctly handling timezones in the application |
| [docs/Amazon/AMAZON_CUSTOMIZATION_UNIFIED_SCRIPT.md](/workspaces/Y3DHub/docs/Amazon/AMAZON_CUSTOMIZATION_UNIFIED_SCRIPT.md) | Amazon customization spec       | Reference for implementing Amazon workflow                |
| [DEVELOPMENT.md](/workspaces/Y3DHub/DEVELOPMENT.md)                                                                         | Development guidelines          | General development practices                             |
| [FUTURE_IMPROVEMENTS.md](/workspaces/Y3DHub/FUTURE_IMPROVEMENTS.md)                                                         | Future enhancement ideas        | Potential features to consider during refactoring         |

### Additional Documentation Files

| File                                                                      | Description                           | Purpose in Refactoring                                    |
| ------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| [docs/CODE_STRUCTURE.md](/workspaces/Y3DHub/docs/CODE_STRUCTURE.md)       | Detailed code structure explanation   | Guide for understanding the refactored codebase structure |
| [docs/COMMAND_REFERENCE.md](/workspaces/Y3DHub/docs/COMMAND_REFERENCE.md) | Command reference for unified scripts | Reference for all available commands and options          |
| [docs/DATABASE.md](/workspaces/Y3DHub/docs/DATABASE.md)                   | Database schema and field standards   | Reference for ensuring consistent database interaction    |
| [docs/API_REFERENCE.md](/workspaces/Y3DHub/docs/API_REFERENCE.md)         | API endpoints documentation           | Reference for available API endpoints and their usage     |
| [docs/TROUBLESHOOTING.md](/workspaces/Y3DHub/docs/TROUBLESHOOTING.md)     | Troubleshooting guide                 | Guide for diagnosing and fixing common issues             |
| [docs/TESTING.md](/workspaces/Y3DHub/docs/TESTING.md)                     | Testing strategy and coverage         | Guide for implementing and maintaining tests              |

### Key Script Files

| File                                                                                                            | Description                    | Refactoring Goal                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| [src/scripts/sync-orders.ts](/workspaces/Y3DHub/src/scripts/sync-orders.ts)                                     | Original order sync script     | To be consolidated into order-sync.ts       |
| [src/scripts/populate-print-queue.ts](/workspaces/Y3DHub/src/scripts/populate-print-queue.ts)                   | Print queue population script  | To be consolidated into print-tasks.ts      |
| [src/scripts/order-sync.ts](/workspaces/Y3DHub/src/scripts/order-sync.ts)                                       | New unified order sync script  | To be completed with all subcommands        |
| [src/scripts/print-tasks.ts](/workspaces/Y3DHub/src/scripts/print-tasks.ts)                                     | New unified print tasks script | To be completed with all subcommands        |
| [src/scripts/utils.ts](/workspaces/Y3DHub/src/scripts/utils.ts)                                                 | New unified utility script     | To be completed with all utility functions  |
| [src/scripts/amazon-customization.ts.skeleton](/workspaces/Y3DHub/src/scripts/amazon-customization.ts.skeleton) | Template for Amazon script     | Reference for Amazon command implementation |

### Database and Configuration Files

| File                                                            | Description                   | Relevance to Refactoring                                |
| --------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| [prisma/schema.prisma](/workspaces/Y3DHub/prisma/schema.prisma) | Database schema               | Reference for ensuring proper field names and relations |
| [tsconfig.json](/workspaces/Y3DHub/tsconfig.json)               | TypeScript configuration      | Needs update for proper path resolution                 |
| [crontab-config.txt](/workspaces/Y3DHub/crontab-config.txt)     | Current crontab configuration | Reference for creating new scheduled tasks              |

## Implementation Progress Checklist

### Phase 1: Setup and Infrastructure (Day 1)

- [ ] Update tsconfig.json paths configuration to use "@/_": ["./src/_"]
- [ ] Create proper directory structure following the guidelines in IDE Guidelines
- [ ] Create lib/shared/database.ts as Prisma wrapper with transaction support
- [ ] Create lib/shared/logging.ts with proper log levels and context
- [ ] Create lib/shared/metrics.ts with interface for consistent collection
- [ ] Create lib/shared/date-utils.ts for timezone handling (per timezone-handling.md)

### Phase 2: Core Modules and Schema Alignment (Day 2)

- [ ] Implement lib/shared/shipstation.ts API client with rate limiting
- [ ] Fix field names to match schema snake_case (created_at, shipstation_order_id, etc.)
- [ ] Update type definitions in all modules to match Prisma schema
- [ ] Fix type errors in all files, especially OrderCreateInput/OrderUpdateInput
- [ ] Clean up unused variables in all files

### Phase 3: Order Sync Implementation (Day 3)

- [ ] Implement orders/sync.ts with proper transaction support
- [ ] Implement orders/mappers.ts with correct timezone handling
- [ ] Add metrics collection to order sync process
- [ ] Create orders/status.ts for reporting sync status
- [ ] Test basic order sync functionality

### Phase 4: Amazon Customization Integration (Day 4)

- [ ] Create the orders/amazon directory structure (following amazon-customization.ts.skeleton)
- [ ] Implement amazon/customization.ts for extraction logic
- [ ] Implement amazon/sync.ts for downloading and processing customization files
- [ ] Implement amazon/update.ts for updating order items
- [ ] Implement amazon/fix.ts for missing personalization data
- [ ] Implement amazon/workflow.ts to orchestrate all Amazon processes
- [ ] Implement amazon/metrics.ts for Amazon-specific metrics

### Phase 5: Script Command Structure (Day 5)

- [ ] Create and implement src/scripts/order-sync.ts with full command structure
- [ ] Add amazon command to order-sync.ts with all subcommands
- [ ] Create and implement src/scripts/print-tasks.ts with command structure
- [ ] Create and implement src/scripts/utils.ts with maintenance commands
- [ ] Test all commands with --help flag to verify structure

### Phase 6: Print Tasks Implementation (Day 6)

- [ ] Create print-tasks modules (create.ts, update.ts, cleanup.ts)
- [ ] Implement print-tasks/create.ts for generating tasks
- [ ] Implement print-tasks/update.ts for updating tasks from various sources
- [ ] Implement print-tasks/cleanup.ts for managing completed tasks
- [ ] Implement print-tasks/metrics.ts for reporting on print queue

### Phase 7: Testing and Refinement (Day 7)

- [ ] Test amazon customization workflow end-to-end
- [ ] Test print tasks creation and management
- [ ] Fix any issues found during testing
- [ ] Implement proper idempotency in all commands
- [ ] Add detailed logging and error handling

### Phase 8: Utility Implementation (Day 8)

- [ ] Create utils modules for maintenance
- [ ] Implement utils/check.ts for system verification
- [ ] Implement utils/fix.ts for common issues
- [ ] Implement utils/stats.ts for generating reports
- [ ] Test utility commands

### Phase 9: Documentation and Finalization (Day 9)

- [ ] Update all script documentation with JSDoc comments
- [ ] Create detailed README for each module
- [ ] Update crontab configuration (crontab-config.txt)
- [ ] Fix any remaining ESLint warnings
- [ ] Remove deprecated scripts
- [ ] Final verification of all functionality

### Phase 10: Deployment (Day 10)

- [ ] Test in staging environment
- [ ] Update production documentation
- [ ] Deploy to production
- [ ] Monitor initial execution
- [ ] Handle any post-deployment issues

## 1. Import Path Issues

The majority of errors relate to incorrect import paths. The new shared module structure needs proper path resolution.

### TypeScript Module Resolution Errors

| File                            | Error                                         | Solution             |
| ------------------------------- | --------------------------------------------- | -------------------- |
| `src/lib/orders/mappers.ts`     | Cannot find module '@/lib/shared/shipstation' | Fix import path      |
| `src/lib/orders/mappers.ts`     | Cannot find module '@/lib/shared/logging'     | Fix import path      |
| `src/lib/orders/sync.ts`        | Multiple import path errors                   | Fix all import paths |
| `src/lib/shared/database.ts`    | Cannot find module '@/lib/prisma'             | Fix import path      |
| `src/lib/shared/logging.ts`     | Cannot find module '@/lib/logger'             | Fix import path      |
| `src/lib/shared/metrics.ts`     | Cannot find module '@/lib/shared/database'    | Fix import path      |
| `src/lib/shared/metrics.ts`     | Cannot find module '@/lib/shared/logging'     | Fix import path      |
| `src/lib/shared/shipstation.ts` | Cannot find module '@/lib/shipstation'        | Fix import path      |
| `src/scripts/order-sync.ts`     | Cannot find module '@/lib/shared/logging'     | Fix import path      |
| `src/scripts/order-sync.ts`     | Cannot find module '@/lib/orders/sync'        | Fix import path      |
| `src/scripts/print-tasks.ts`    | Cannot find module '@/lib/shared/logging'     | Fix import path      |
| `src/scripts/utils.ts`          | Cannot find module '@/lib/shared/logging'     | Fix import path      |

### Action Items for Import Path Issues

1. Verify the `paths` configuration in `tsconfig.json` to ensure '@/lib' resolves correctly:

   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

2. Create the proper directory structure:

   ```
   src/
   ├── lib/
   │   ├── orders/
   │   │   ├── amazon/
   │   │   │   ├── customization.ts
   │   │   │   ├── sync.ts
   │   │   │   ├── update.ts
   │   │   │   └── fix.ts
   │   │   ├── sync.ts
   │   │   ├── mappers.ts
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
   │   └── prisma.ts
   ```

3. Ensure the correct exports from shared modules:
   - `database.ts` should export `prisma` and `Prisma` from `@prisma/client`
   - `logging.ts` should export a logger instance
   - `metrics.ts` should export metrics interfaces and collection functions
   - `shipstation.ts` should re-export required types and functions

## 2. Type Errors in Order Sync

There are several type errors in the order sync code that need to be addressed:

| File                         | Error                                             | Solution                                                 |
| ---------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/orders/sync.ts:484` | Property 'id' does not exist on type              | Properly check if property exists before access          |
| `src/lib/orders/sync.ts:488` | Type is not assignable to type 'OrderCreateInput' | Ensure object matches Prisma schema structure            |
| `src/lib/orders/sync.ts:495` | Cannot find name 'primitiveOrderData'             | Fix variable reference or create proper OrderUpdateInput |

### Action Items for Type Errors

1. Properly handle object properties and types based on the Prisma schema:

   ```typescript
   // Example fix for correct property access
   const orderDataForDb = { ...orderMappedData };

   // Safe property removal - check if exists first
   if ("id" in orderDataForDb) delete orderDataForDb.id;
   if ("items" in orderDataForDb) delete orderDataForDb.items;
   if ("printTasks" in orderDataForDb) delete orderDataForDb.printTasks;

   // Ensure proper Prisma input types
   const createData: Prisma.OrderCreateInput = {
     ...orderDataForDb,
     // Use correct field names from Prisma schema
     shipstation_order_id: orderData.orderId.toString(),
     created_at: new Date(),
     updated_at: new Date(),
     // Connect customer if available using the proper relation syntax
     ...(dbCustomer && { customer: { connect: { id: dbCustomer.id } } }),
   };

   // For update data, create a new object rather than referencing non-existent variables
   const updateData: Prisma.OrderUpdateInput = {
     ...orderDataForDb,
     shipstation_order_id: orderData.orderId.toString(),
     updated_at: new Date(),
     ...(dbCustomer && { customer: { connect: { id: dbCustomer.id } } }),
   };
   ```

2. Ensure all field names match the Prisma schema exactly:
   - Use `created_at` and `updated_at` (not camelCase)
   - Use `shipstation_order_id` (not camelCase)
   - Use proper enums for status fields (e.g., `PrintTaskStatus.pending`)

## 3. Unused Variables and ESLint Warnings

Several files have unused variables and other ESLint warnings:

| File                         | Error                                                     | Solution                                                  |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `src/lib/orders/sync.ts`     | 'metricsError' and 'progressError' defined but never used | Remove or use these variables                             |
| `src/lib/shared/logging.ts`  | 'options' defined but never used                          | Use or remove the parameter                               |
| `src/lib/shared/metrics.ts`  | 'prisma' defined but never used                           | Use prisma for storing metrics or remove the import       |
| `src/lib/shared/metrics.ts`  | Unexpected any (getMetrics return type)                   | Use specific type like `Metric[]` instead of `any[]`      |
| `src/scripts/order-sync.ts`  | 'argv' defined but never used in multiple commands        | Use argv in command handlers or change function signature |
| `src/scripts/print-tasks.ts` | 'argv' defined but never used in multiple commands        | Use argv in command handlers or change function signature |
| `src/scripts/utils.ts`       | 'argv' defined but never used in multiple commands        | Use argv in command handlers or change function signature |

### Action Items for ESLint Warnings

1. Fix unused variable warnings:

   ```typescript
   // Example fix for unused catch variables
   try {
     await recordMetric({
       name: "order_sync_completed",
       value: 1,
       tags: {
         order_id: orderId.toString(),
         status: orderData.orderStatus,
       },
     });
   } catch (error) {
     // Changed from metricsError to error
     logger.warn(`Failed to record metrics for order ${orderId}:`, { error });
   }
   ```

2. Fix any types with more specific types:

   ```typescript
   // In metrics.ts
   interface Metric {
     id: number;
     name: string;
     value: number;
     timestamp: Date;
     tags?: Record<string, string>;
   }

   getMetrics: (options: {
     name?: string;
     tags?: Record<string, string>;
     from?: Date;
     to?: Date;
   }) => Promise<Metric[]>; // Instead of Promise<any[]>
   ```

3. Use or properly ignore unused parameters:

   ```typescript
   // If argv is needed:
   async (argv) => {
     await runCommand("Status", async () => {
       const daysBack = argv.daysBack || 7; // Actually use argv
       logger.info(`Showing status for the last ${daysBack} days`);
       // Implementation
     });
   };

   // If argv is not needed:
   async (_argv) => {
     // Prefix with underscore to indicate intentionally unused
     await runCommand("Status", async () => {
       logger.info("Showing status");
       // Implementation
     });
   };
   ```

## 4. Amazon Customization Integration

A key focus of the TODO_V2 plan was integrating Amazon customization functionality, which currently exists in separate scripts. This integration is incomplete.

### Action Items for Amazon Integration

1. Create the `orders/amazon/` directory structure with specialized modules:

   - `customization.ts` - Core Amazon customization extraction logic
   - `sync.ts` - Download and process Amazon customization files
   - `update.ts` - Update OrderItems with customization data
   - `fix.ts` - Find and fix orders with missing personalization

2. Implement `amazon` command in `order-sync.ts` with all subcommands:

   ```typescript
   .command('amazon', 'Process Amazon customization', (yargs) => {
     // Existing placeholder implementation needs full subcommands
     return yargs
       .command('sync', 'Download and process Amazon customization files',
         (yargs) => {
           return yargs
             .option('retry-failed', {
               describe: 'Retry previously failed downloads/processing',
               type: 'boolean',
               default: false
             })
             .option('max-retries', {
               describe: 'Maximum number of retries for failed items',
               type: 'number',
               default: 3
             });
         },
         async (argv) => { /* Implementation */ }
       )
       .command('update', 'Update order items with personalization data',
         (yargs) => {
           return yargs
             .option('update-shipstation', {
               describe: 'Update ShipStation with personalization data',
               type: 'boolean',
               default: false
             });
         },
         async (argv) => { /* Implementation */ }
       )
       .command('workflow', 'Run the entire Amazon customization workflow',
         () => {},
         async (argv) => { /* Implementation */ }
       )
       .command('fix', 'Find and fix orders with missing personalization data',
         () => {},
         async (argv) => { /* Implementation */ }
       );
   }, () => {})
   ```

3. Migrate existing Amazon customization code to new modules:

   - Map existing fields to match the `AmazonCustomizationFile` schema
   - Ensure proper error handling and logging
   - Add transaction support for database operations
   - Implement metrics collection

4. Integrate with ShipStation updates:
   - Ensure customization data is properly sent to ShipStation
   - Handle rate limiting and retries for API calls
   - Implement proper error reporting

## 5. Print Tasks Implementation

The print task functionality needs to be consolidated into the new structure while correctly maintaining relationships with the database schema.

### Action Items for Print Tasks

1. Create the print-tasks modules:

   - `create.ts` - Create print tasks from orders with AI extraction
   - `update.ts` - Update print tasks from various sources
   - `cleanup.ts` - Clean up completed/shipped tasks
   - `status.ts` - Show print queue status
   - `metrics.ts` - Report on print task performance

2. Implement the commands in `print-tasks.ts`:

   ```typescript
   .command('create', 'Create print tasks from orders',
     (yargs) => {
       return yargs
         .option('force-recreate', {
           describe: 'Force recreation of existing tasks',
           type: 'boolean',
           default: false
         })
         .option('create-placeholder', {
           describe: 'Create placeholder tasks for orders without personalization data',
           type: 'boolean',
           default: false
         });
     },
     async (argv) => { /* Implementation */ }
   )
   .command('update', 'Update print tasks with personalization data',
     (yargs) => {
       return yargs
         .option('update-from-order-items', {
           describe: 'Update tasks from order items\' print_settings',
           type: 'boolean',
           default: false
         })
         .option('update-from-amazon', {
           describe: 'Update tasks from Amazon customization data',
           type: 'boolean',
           default: false
         });
     },
     async (argv) => { /* Implementation */ }
   )
   // Additional commands...
   ```

3. Ensure print tasks are correctly linked to database fields:

   - Use the proper relationship between `PrintOrderTask` and `OrderItem` using `orderItemId` and `taskIndex`
   - Use correct status enum values from `PrintTaskStatus`
   - Properly handle the `needs_review` and `review_reason` fields
   - Ensure `shorthandProductName` is properly populated

4. Implement auto-completion of print tasks for shipped/cancelled orders:
   - Monitor order status changes in sync process
   - Apply appropriate status updates to pending/in-progress tasks

## 6. Metrics and Status Reporting

The metrics collection and status reporting functionality needs to be improved to provide better visibility into the system's operation.

### Action Items for Metrics and Status

1. Enhance the `metrics.ts` module:

   ```typescript
   // Example implementation
   export interface MetricsCollector {
     recordMetric: (options: MetricsOptions) => Promise<void>;
     recordOrderProcessed: (
       orderNumber: string,
       success: boolean,
       itemsProcessed: number,
       itemsFailed: number
     ) => Promise<void>;
     recordProductUpserted: () => Promise<void>;
     recordCustomerUpserted: () => Promise<void>;
     startOrderProcessing: (orderNumber: string) => void;
     getMetricsSummary: () => {
       totalOrdersProcessed: number;
       totalOrdersFailed: number;
       totalItemsProcessed: number;
       totalItemsFailed: number;
       apiCalls: number;
       startTime: Date;
       endTime: Date | null;
       duration: number | null;
     };
     saveMetrics: () => Promise<void>;
   }

   export function createMetricsCollector(
     progressId: string
   ): MetricsCollector {
     // Implementation that properly uses the database for metrics storage
   }
   ```

2. Implement status reporting functions:

   - Create functions to report on sync status
   - Create functions to report on print task status
   - Add filtering options by date range, status, etc.

3. Implement the `status` and `metrics` commands in all scripts:
   - Add proper formatting options (json, table, csv)
   - Add output file options
   - Implement proper filtering and date range options

## 7. Utility Script Implementation

The utility script functionality needs to be implemented to provide maintenance and diagnostic tools.

### Action Items for Utility Script

1. Create the utils modules:

   - `check.ts` - Check system status
   - `fix.ts` - Fix common issues
   - `backup.ts` - Backup database or files
   - `stats.ts` - Generate statistics and reports

2. Implement the commands in `utils.ts`:

   ```typescript
   .command('check', 'Check system status',
     (yargs) => {
       return yargs
         .command('order', 'Check order details',
           (yargs) => {
             return yargs
               .option('order-id', {
                 describe: 'Order ID to check',
                 type: 'number',
                 demandOption: true
               });
           },
           async (argv) => { /* Implementation */ }
         )
         .command('print-tasks', 'Check print tasks for an order',
           (yargs) => {
             return yargs
               .option('order-id', {
                 describe: 'Order ID to check',
                 type: 'number',
                 demandOption: true
               });
           },
           async (argv) => { /* Implementation */ }
         )
         // Additional commands...
     },
     () => {}
   )
   // Additional commands...
   ```

3. Implement database consistency checks:
   - Check for orphaned print tasks
   - Check for inconsistent order statuses
   - Check for missing Amazon customization data

## 8. Database Schema Alignment

Ensure all code aligns perfectly with the current database schema:

### Action Items for Schema Alignment

1. Update all references to database fields to match the schema exactly:

   - Use snake_case for field names (e.g., `created_at`, `shipstation_order_id`)
   - Use proper enum values (e.g., `PrintTaskStatus.pending`, `InternalOrderStatus.new`)
   - Use proper default values as defined in the schema

2. Ensure relationships are correctly established:

   - `PrintOrderTask` to `OrderItem` (using `orderItemId` and `taskIndex`)
   - `OrderItem` to `Product` (using `productId`)
   - `Order` to `Customer` (using `customerId`)
   - `AmazonCustomizationFile` to `OrderItem` (using `orderItemId`)

3. Verify that all required fields are properly set in create/update operations:
   - Set all non-nullable fields
   - Use proper default values
   - Handle nullability correctly

## 9. Command Structure Completion

The command structure outlined in TODO_V2.md needs to be fully implemented:

### Action Items for Command Structure

1. Complete all commands and subcommands in `order-sync.ts`
2. Complete all commands and subcommands in `print-tasks.ts`
3. Complete all commands and subcommands in `utils.ts`
4. Add global options to all commands as specified in TODO_V2.md

## 10. Testing and Documentation

Comprehensive testing and documentation are essential:

### Action Items for Testing and Documentation

1. Create test cases for core functionality:

   - Order sync (full, recent, single)
   - Amazon customization workflow
   - Print task creation and management
   - Utility functions

2. Create documentation for all commands and options:

   - Update script documentation
   - Document command-line options
   - Document edge cases and error handling

3. Update crontab configuration to use the new scripts:

   ```bash
   # Sync recent orders every 15 minutes
   */15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts sync --mode=recent --hours=2 >> $LOG_DIR/cron_order_sync_recent_`date +\%Y\%m\%d`.log 2>&1

   # Sync all orders once a day
   0 3 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts sync --mode=all >> $LOG_DIR/cron_order_sync_all_`date +\%Y\%m\%d`.log 2>&1

   # Process Amazon customization every 15 minutes
   */15 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/order-sync.ts amazon workflow >> $LOG_DIR/cron_amazon_workflow_`date +\%Y\%m\%d`.log 2>&1

   # Additional cron jobs...
   ```

## Implementation Strategy

To systematically address these issues while maintaining functionality:

1. **Fix Import Paths First (Day 1)**:

   - Update tsconfig.json
   - Create directory structure
   - Fix import paths in all files
   - Verify compilation succeeds

2. **Address Type Errors (Day 1-2)**:

   - Fix OrderCreateInput/OrderUpdateInput issues
   - Ensure proper field names and types
   - Fix variable references
   - Verify type checking succeeds

3. **Implement Shared Modules (Day 2)**:

   - Implement database.ts (Prisma wrapper)
   - Implement logging.ts (Logger wrapper)
   - Implement metrics.ts (Metrics collection)
   - Implement shipstation.ts (API client)

4. **Implement Core Functionality (Day 3-4)**:

   - Implement order sync functionality
   - Implement Amazon customization
   - Implement print task management
   - Implement utility functions

5. **Complete Command Structure (Day 5)**:

   - Implement all commands and subcommands
   - Add option handling
   - Add validation and help text
   - Verify all commands work correctly

6. **Testing and Documentation (Day 6-7)**:
   - Test all functionality
   - Update documentation
   - Update crontab configuration
   - Create user guides

## Priority Order

Based on the criticality of issues and dependencies between components:

1. Import Path Issues (Critical - blocks everything)
2. Type Errors (Critical - blocks functionality)
3. Schema Alignment (Critical - ensures data integrity)
4. Command Structure (High - enables functionality)
5. Amazon Customization (High - key business functionality)
6. Print Tasks Implementation (High - key business functionality)
7. Utility Script Implementation (Medium - improves operations)
8. Metrics and Status Reporting (Medium - improves visibility)
9. Documentation and Testing (Medium - ensures quality)
10. ESLint Warnings (Low - code quality)

## Conclusion

This comprehensive plan addresses all the issues identified in the code analysis while aligning perfectly with the original TODO_V2 plan. By systematically addressing these issues, we will create a robust and maintainable codebase that supports all the required functionality. The refactored scripts will use consistent naming conventions, proper type definitions, and follow the current database schema structure.
