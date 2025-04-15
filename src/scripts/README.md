# Background Processing Scripts

This directory contains scripts responsible for background data synchronization and processing tasks essential for the application's workflow.

## Table of Contents

- [Order Synchronization (`sync-orders.ts`)](#order-synchronization-sync-ordersts)
  - [Purpose](#purpose)
  - [Process Flow](#process-flow)
  - [Key Logic Points](#key-logic-points)
  - [Usage](#usage)
  - [Configuration](#configuration)
- [Print Task Population (`populate-print-queue.ts`)](#print-task-population-populate-print-queuets)
  - [Purpose](#purpose-1)
  - [Process Flow](#process-flow-1)
  - [Key Logic Points](#key-logic-points-1)
  - [Usage & Flags](#usage--flags)
  - [Configuration](#configuration-1)
- [Database Logging (`ScriptRunLog`)](#database-logging-scriptrunlog)
- [Running Scripts (Cron/Scheduled Tasks)](#running-scripts-cronscheduled-tasks)

---

## Order Synchronization (`sync-orders.ts`)

### Purpose

Fetches recent order data from the ShipStation API and synchronizes it with the local application database (`Customer`, `Product`, `Order`, `OrderItem` tables).

### Process Flow

1.  **Authentication:** Connects to ShipStation using API Key/Secret.
2.  **Fetch Data:** Retrieves orders modified since a specific start date (logic might need refinement for continuous syncing).
3.  **Iterate Orders:** Processes each fetched ShipStation order individually.
4.  **Upsert Customer:** Creates a new `Customer` record or updates an existing one based on `shipstation_customer_id` or email/name, using the shipping address details.
5.  **Transaction Per Order:** Starts a Prisma transaction (`prisma.$transaction`) to ensure atomicity for all changes related to a single order.
6.  **Process Items (within Transaction):** For each `item` in the ShipStation order:
    - **Upsert Product:** Creates/updates a `Product`. It first tries to match using `shipstation_product_id` (if provided), falling back to `sku` (trimmed of whitespace). If the name is missing from ShipStation, it uses the placeholder `"Product Needs Name"`. Handles potential unique constraint errors on upsert by attempting a lookup.
    - **Upsert OrderItem:** Creates/updates an `OrderItem`, linking it via `productId` to the corresponding `Product` record and via `orderId` to the parent `Order`. Uses `shipstationLineItemKey` as the primary key for upserting.
7.  **Upsert Order:** Creates/updates the main `Order` record (using `shipstation_order_id` for upserting), linking it to the upserted `Customer`. Maps standard and custom/optional fields.
8.  **Commit/Rollback:** The transaction commits if all upserts within it succeed. If any database error occurs, the entire transaction for that order is rolled back.

### Key Logic Points

- **Upsert Strategy:** Heavily relies on `prisma.*.upsert` with unique fields (`shipstation_order_id`, `shipstation_customer_id`, `sku`, `shipstation_product_id`, `shipstationLineItemKey`) to ensure data consistency and avoid duplicates.
- **Product Linking:** Critical step to link `OrderItems` to canonical `Product` records based on SKU or ShipStation ID.
- **Data Integrity:** Transactions prevent partially synchronized orders. Fallback names and SKU trimming help handle inconsistent source data.
- **Error Handling:** Logs errors during customer/product/order upserts but typically continues processing other orders. Transaction failures are logged.

### Usage

```bash
# Ensure environment variables are set in .env
npm run sync-orders
# or directly
tsx src/scripts/sync-orders.ts
```

_(Note: Lacks command-line flags for date ranges or specific order sync. Environment variables control API keys.)_

### Configuration

Requires environment variables (in `.env`):

- `DATABASE_URL`: Database connection string.
- `SHIPSTATION_API_KEY`: ShipStation API Key.
- `SHIPSTATION_API_SECRET`: ShipStation API Secret.

---

## Print Task Population (`populate-print-queue.ts`)

### Purpose

Identifies orders requiring personalized print tasks, uses OpenAI to interpret personalization details from `OrderItem.print_settings`, and creates `PrintOrderTask` records for the print queue UI. Designed for frequent execution (e.g., cron).

### Process Flow

1.  **Log Script Start:** Creates an initial entry in `ScriptRunLog` with `status: 'running'`.
2.  **Find Eligible Orders:** Queries the database (`findOrdersForProcessing`) for orders meeting criteria:
    - `order_status` is `awaiting_shipment` or `on_hold`.
    - Contains at least one `OrderItem` where `print_settings` is not null AND `productId` is greater than 0.
    - **Crucially (for efficiency):** Excludes orders where _any_ item already has _any_ associated `PrintOrderTask`. (`NOT: { items: { some: { printTasks: ... } } }`). This prevents reprocessing completed/partially completed orders in normal runs.
    - Respects the `ORDER_PROCESSING_LIMIT` (default 10).
    - Logs initial candidates and final selected orders (after filtering out those with existing tasks).
3.  **Iterate Through Orders:** Loops through the fetched orders (up to the limit). If 0 orders selected, finishes early.
4.  **Transaction Per Order:** Starts a database transaction (`prisma.$transaction`) for each selected order.
5.  **Filter Processable Items:** Within the transaction, filters the order's items again to ensure `print_settings`, `productId`, and `product` data are present.
6.  **Iterate Through Items:** Loops through the processable items within the current order.
7.  **Check Existing Item Tasks:** Queries `tx.printOrderTask.findFirst` for the current `orderItemId`.
    - If tasks exist AND the `--force-recreate` flag was **NOT** used, logs `Skipping Item X: Print task(s) already exist...` and `continue`s to the next item.
    - If tasks exist AND `--force-recreate` **WAS** used, logs deletion, runs `tx.printOrderTask.deleteMany`, then proceeds.
8.  **AI Call:** If tasks don't exist (or were just deleted by `--force-recreate`), waits `AI_CALL_DELAY_MS`, then calls `extractOrderPersonalization` with item details and order context.
9.  **Validate AI Response:**
    - Checks for API errors, JSON parsing errors, missing `tasks` array.
    - Validates structure of each task in the `tasks` array.
    - Calculates `totalQuantity` from valid AI tasks.
    - **Quantity Check:** If `totalQuantity !== originalItem.quantity`, considers it an AI error, returns an error state (`{tasks: [], error: 'Quantity mismatch...', ...}`).
    - If valid, returns the validated tasks and review status.
10. **Handle AI Result:**
    - If `extractOrderPersonalization` returned an error state (API error, parse error, quantity mismatch, etc.) OR empty tasks:
      - Logs the specific reason for skipping task creation.
      - If `CREATE_PLACEHOLDER_ON_AI_ERROR` is true AND there was an error (not just 0 tasks returned), attempts to create a single placeholder task marked for review. Logs success/failure of placeholder creation.
      - `continue`s to the next item.
11. **Create Tasks:** If the AI result was valid:
    - Loops through `taskDetail` in `aiResult.tasks`.
    - Prepares `taskData` object, connecting `Order`, `OrderItem`, and `Product`.
    - Logs the `taskData` being attempted (if not dry run).
    - Calls `tx.printOrderTask.create({ data: taskData })`.
    - Logs success or handles errors:
      - `P2002` (Unique Constraint): Logs a warning (`Skipping Task X: Unique constraint violation...`) and continues.
      - Other Errors: Logs the full error and **re-throws it** to ensure the **entire order transaction is rolled back**.
12. **Commit/Rollback:** The transaction attempts to `COMMIT` after all items in an order are processed. If any error was thrown during item processing (step 11), the transaction automatically `ROLLBACK`.
13. **Log Order Failure:** If the transaction for an order fails (catches error in `main`), logs a specific `ScriptRunLog` entry with `status: 'order_failure'`, order ID, and error details.
14. **Update Final Script Log:** In the `finally` block:
    - Determines overall status (`success`, `partial_success`, `success_no_orders`, or `failed` if caught by main try/catch).
    - Updates the initial `ScriptRunLog` entry with the end time, final status, and summary details (counts, failed IDs).

### Key Logic Points

- **Batching & Filtering:** Processes orders in limited batches (`ORDER_PROCESSING_LIMIT`), efficiently filtering out already processed orders in normal runs.
- **Item Skipping:** Avoids redundant AI calls for items already processed within a potentially partially processed order (unless forced).
- **Targeted Re-creation:** `--force-recreate` flag allows deleting and regenerating tasks for specific items/orders without clearing everything.
- **Robust AI Validation:** Checks structure, types, and critically, the total quantity returned by the AI against the order item.
- **Transactional Integrity:** Ensures all tasks for an order are created together or none are (rollback on error).
- **Comprehensive Logging:** Logs script start/end, order processing status, item skipping reasons, AI errors, task creation attempts/data/outcomes, and transaction failures to both console and the `ScriptRunLog` database table.

### Usage & Flags

```bash
# Normal run (processes next batch of unprocessed orders)
npm run populate-queue

# Force recreate tasks for a specific order
npm run populate-queue -- --order-id 123 --force-recreate

# Force recreate tasks for the next batch of orders
npm run populate-queue -- --force-recreate

# See other flags (--days-back, --dry-run, --clear-all, --prune-shipped)
npm run populate-queue -- --help
```

### Configuration

Requires environment variables (in `.env`):

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `AI_CALL_DELAY_MS` (Default: `100`)
- `CREATE_PLACEHOLDER_ON_AI_ERROR` (Default: `false`)
- `ORDER_PROCESSING_LIMIT` (Default: `10`)

---

## Database Logging (`ScriptRunLog`)

Tracks script executions:

- **Initial Entry:** Created at start (`status: 'running'`).
- **Order Failure Entry:** Created _if_ an order's transaction fails (`status: 'order_failure'`). Contains specific order ID and error.
- **Final Update:** Initial entry updated at end with `runEndedAt`, final `status` (`success`, `partial_success`, `success_no_orders`, `failed`), and JSON `details` (counts, failed IDs).

Monitor this table for script health and potential alerting on `'failed'` or `'order_failure'` statuses.

---

## Running Scripts (Cron/Scheduled Tasks)

Schedule these scripts using cron (Linux/macOS) or Task Scheduler (Windows).

- `sync-orders.ts`: Schedule less frequently (e.g., every 15-60 minutes) as needed for data freshness.
- `populate-print-queue.ts`: Schedule
