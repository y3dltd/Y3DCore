# ---

# title: Code Structure

# last-reviewed: 2025-04-18

# maintainer: TBD

# ---

# Code Structure Guide

This document provides a detailed explanation of the Y3DHub codebase structure, focusing on the organization of modules, scripts, and their interactions.

## Directory Structure Overview

The codebase follows a clear directory structure that separates concerns and promotes maintainability:

```text
src/
├── lib/               # Core library modules
│   ├── orders/        # Order-related functionality
│   │   ├── amazon/    # Amazon-specific order handling (customization fetching)
│   │   ├── sync.ts    # Order synchronization logic (fetching from ShipStation, upserting orders/items)
│   │   ├── mappers.ts # Data mapping functions (ShipStation -> Prisma)
│   │   ├── metrics.ts # Order-related metrics (Placeholder)
│   │   └── status.ts  # Order status reporting (Placeholder)
│   ├── print-tasks/   # Print task functionality
│   │   ├── creation.ts # Task creation logic (Moved from populate-print-queue.ts) - TODO: Create this file
│   │   ├── update.ts  # Task update logic (Placeholder)
│   │   ├── cleanup.ts # Task cleanup logic (Placeholder)
│   │   ├── metrics.ts # Task-related metrics (Placeholder)
│   │   └── status.ts  # Task status reporting (Placeholder)
│   ├── utils/         # Utility functions (Placeholder/TBD)
│   │   ├── check.ts   # System verification
│   │   ├── fix.ts     # Issue remediation
│   │   ├── backup.ts  # Backup functionality
│   │   └── stats.ts   # Statistics generation
│   ├── shared/        # Shared utilities
│   │   ├── shipstation.ts # ShipStation API client
│   │   ├── database.ts    # Database client wrapper (Prisma)
│   │   ├── logging.ts     # Logging utilities (Pino)
│   │   ├── metrics.ts     # Metrics collection
│   │   └── date-utils.ts  # Date handling utilities (date-fns, date-fns-tz)
│   └── prisma.ts      # Prisma client instance
├── scripts/           # Command-line scripts (Entry points)
│   ├── order-sync.ts  # Script for syncing orders from ShipStation
│   ├── populate-print-queue.ts # Script for populating print tasks (uses AI, Amazon URL)
│   ├── utils.ts       # Utility script (Placeholder/TBD)
│   └── ...            # Other scripts (e.g., user management)
├── app/               # Next.js application
│   ├── api/           # API routes
│   ├── orders/        # Order pages
│   ├── print-queue/   # Print queue pages
│   └── ...            # Other application pages
└── components/        # React components
    ├── ui/            # UI components (shadcn/ui)
    └── ...            # Other components
```

## Core Modules

### Orders Module (`lib/orders/`)

The orders module handles order synchronization with ShipStation and related data mapping.

#### Key Files

- **`sync.ts`**: Core order synchronization logic.
- `syncAllPaginatedOrders(options)`: Synchronizes all orders from ShipStation based on modification date, handling pagination and retries. Uses `upsertOrderWithItems`.
- `syncRecentOrders(options)`: Synchronizes recent orders based on a time window (handles timezone conversion for ShipStation). Uses `syncAllPaginatedOrders`.
- `syncSingleOrder(orderId, options)`: Synchronizes a specific order by ShipStation ID. Uses `upsertOrderWithItems`.
- `syncShipStationTags(options)`: Synchronizes ShipStation tags.
- `upsertOrderWithItems(orderData, progressId, options)`: Upserts a single order, its customer, products, and items into the database.
- `upsertCustomerFromOrder(ssOrder, options)`: Upserts customer based on email.
- `upsertProductFromItem(tx, ssItem, options)`: Upserts product based on SKU or ShipStation Product ID within a transaction.
- **`mappers.ts`**: Functions for mapping data between ShipStation API format and Prisma schema.
- `mapAddressToCustomerFields(addr)`
- `mapSsItemToProductData(ssItem)`
- `mapSsItemToOrderItemData(ssItem, productId)`
- `mapOrderToPrisma(ssOrder, dbCustomerId?)`
- Includes timezone conversion for dates (`convertShipStationDateToUTC`).
- **`metrics.ts`**: (Placeholder) Intended for order metrics collection.
- **`status.ts`**: (Placeholder) Intended for order status reporting.

#### Amazon Submodule (`lib/orders/amazon/`)

Handles fetching and processing Amazon-specific customization data.

- **`customization.ts`**
- `fetchAndProcessAmazonCustomization(url)`: Fetches the zip file from the `CustomizedURL`, extracts the JSON, and parses it (parsing logic might need refinement based on actual JSON structure).
- **`sync.ts`**: Contains the library logic for finding Amazon orders needing customization sync and orchestrating the fetch/process/store flow (used by `populate-print-queue.ts` now, but intended for `order-sync.ts amazon sync` command).
- `syncCustomizationFiles(options)`: Finds items with URLs and calls `processOrderItem`.
- `findOrderItemsToProcess(options)`: Finds eligible Amazon order items.
- `processOrderItem(item, options)`: Handles fetching/processing for a single item and updates `AmazonCustomizationFile` table.
- **`update.ts`**: (Placeholder) Intended for logic to update order items/tasks _after_ customization data is fetched.
- **`fix.ts`**: (Placeholder) Intended for fixing orders with missing personalization.
- **`workflow.ts`**: (Skeleton) Intended to orchestrate the full Amazon workflow (sync, update).

### Print Tasks Module (`lib/print-tasks/`)

Handles print task creation and potentially other task-related logic.

#### Key Files

- **`creation.ts`**: (To be created) Will contain the core logic moved from `populate-print-queue.ts` for creating tasks, including AI extraction and database interaction.
- `extractOrderPersonalization(...)`: (To be moved here) Handles AI call for personalization.
- `createOrUpdateTasksInTransaction(...)`: (To be moved here) Handles DB upsert logic for tasks.
- **`update.ts`**: (Placeholder) Intended for task update logic.
- **`cleanup.ts`**: (Placeholder) Intended for task cleanup logic.
- **`metrics.ts`**: (Placeholder) Intended for task metrics.
- **`status.ts`**: (Placeholder) Intended for task status reporting.

### Utilities Module (`lib/utils/`)

(Placeholder/TBD) Intended for general utility functions for system maintenance and diagnostics.

#### Key Files (Examples)

- **`check.ts`**: System verification.
- **`fix.ts`**: Issue remediation.
- **`backup.ts`**: Backup functionality.
- **`stats.ts`**: Statistics generation.

### Shared Module (`lib/shared/`)

Provides utilities used across multiple modules.

#### Key Files

- **`shipstation.ts`**: ShipStation API client (Axios instance, helper functions like `listTags`).
- **`database.ts`**: Prisma client wrapper/instance.
- **`logging.ts`**: Logging utilities (Pino setup).
- **`metrics.ts`**: Metrics collection helpers (`recordMetric`).
- **`date-utils.ts`**: Date handling utilities (using `date-fns` and `date-fns-tz`).

## Command-Line Scripts (`scripts/`)

Entry points for running backend processes.

### Order Sync Script (`scripts/order-sync.ts`)

Provides a command-line interface for triggering order synchronization from ShipStation. Uses functions from `lib/orders/sync.ts`. The `amazon` subcommands are currently placeholders and do not function.

### Populate Print Queue Script (`scripts/populate-print-queue.ts`)

Provides a command-line interface for generating print tasks.

- Fetches eligible orders using `lib/order-processing.ts`.
- Handles Amazon `CustomizedURL` fetching directly using `lib/orders/amazon/customization.ts`.
- Uses AI (via `extractOrderPersonalization`) as a fallback or for non-Amazon orders.
- Creates/updates tasks in the database using `createOrUpdateTasksInTransaction`.
- Includes options for targeting specific orders (`--order-id`), forcing recreation (`--force-recreate`), and clearing all tasks (`--clear-all`).

### Utilities Script (`scripts/utils.ts`)

(Placeholder/TBD) Intended as an entry point for various utility functions defined in `lib/utils/`.

## Module Interactions

The modules interact with each other in a structured manner:

- **Scripts** act as entry points, parse arguments, and call functions within **lib modules**.
- **`lib/orders/sync.ts`** interacts with **ShipStation API** (via `lib/shared/shipstation.ts`) and the **database** (via `lib/shared/database.ts` and mappers) to sync order data.
- **`scripts/populate-print-queue.ts`** uses **`lib/order-processing.ts`** to find orders, **`lib/orders/amazon/customization.ts`** to fetch Amazon data, its own internal AI logic (`extractOrderPersonalization`), and database logic (`createOrUpdateTasksInTransaction`) to manage print tasks.
- **All modules** utilize **shared utilities** (`lib/shared/`) for common operations like logging, metrics, and date handling.

```text
[scripts/order-sync.ts] ---> [lib/orders/sync.ts] ---> [lib/shared/*] ---> [ShipStation API]
                                     |                     |
                                     v                     v
                                [Database (Order, Item, etc.)]

[scripts/populate-print-queue.ts] ---> [lib/order-processing.ts] ---> [Database]
              |                                  |
              |-----> [lib/orders/amazon/customization.ts] ---> [Amazon URL Fetch]
              |                                  |
              |-----> [AI Extraction (Internal)] ---------> [OpenAI API]
              |                                  |
              |-----> [Task Creation (Internal)] ---------> [Database (PrintTask)]
```

## Error Handling Strategy

The codebase implements a consistent error handling strategy:

- **Try-catch blocks** in key functions.
- **Retries** for transient errors in ShipStation API calls (`getShipstationOrders`).
- **Transaction rollbacks** for database operations using `prisma.$transaction`.
- **Detailed error logging** using Pino, including context.
- **Graceful degradation** (e.g., creating placeholder tasks on failure).

## Global Options

Most scripts and commands support common options like `--dry-run`, `--limit`, `--order-id`, and logging controls. Refer to `docs/COMMAND_REFERENCE.md` for specifics per script.

## Conclusion

This structure aims for separation of concerns, with library modules containing core reusable logic and scripts acting as entry points. The integration of Amazon URL fetching into `populate-print-queue.ts` deviates slightly from a pure modular approach but achieves the desired single-step task creation workflow.

For more details on specific aspects of the system, see:

- [COMMAND_REFERENCE.md](./COMMAND_REFERENCE.md) for a comprehensive list of commands and options
- [DATABASE.md](./DATABASE.md) for information on the database schema and field standards
- [API_REFERENCE.md](./API_REFERENCE.md) for documentation on API endpoints
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for help with common issues
- [TESTING.md](./TESTING.md) for information on testing strategies and test coverage

## Alternate Overview (File Structure Focus)

This section provides an overview focused just on the key directories and files.

### Project Root

- `src/` – Main application source

  - `app/` – Next.js App Router pages and API routes
  - `api/` – Backend API endpoints (orders, tasks, auth, etc.)
  - `orders/` – UI pages for order management
  - `print-queue/` – UI pages for print task workflows
  - `components/` – Shared React components
  - `lib/` – Reusable libraries
  - `db/` – Prisma database utilities
  - `shipstation/` – ShipStation API integration
  - `ai/` – OpenAI integration utilities
  - `openscad/` – OpenSCAD model generation scripts
  - `scripts/` – TypeScript scripts for backend jobs
  - `sync-orders.ts` – Sync orders from ShipStation
  - `populate-print-queue.ts` – Generate print tasks
  - `complete-shipped-print-tasks.ts` – Close completed tasks
  - `types/` – Custom TypeScript type definitions
  - `workers/` – Background worker processes
  - `stl-render-worker.ts` – STL rendering worker

- `prisma/` – Prisma schema and migrations

- `scripts/` – Shell automation scripts

  - `workflow.sh` – Full end-to-end workflow runner

- `openscad/` – Raw OpenSCAD model files and scripts

- `docs/` – Project documentation

  - `guides/` – How-to and conceptual guides

- `public/` – Static assets and generated STL files

## How to Navigate

Use this guide as a map when contributing or debugging—each directory encapsulates a specific concern.
