---
title: index
last-reviewed: 2025-04-18
maintainer: TBD
---

# Y3DHub - Order Management & Print Queue System

## Project Overview

Y3DHub is a modern Next.js web application designed to streamline the order
management and 3D print production workflow for a business selling personalized
3D printed items (like keyrings, signs, etc.) across multiple marketplaces
(e.g., eBay, Amazon, Etsy).

The primary goals are:

1.  **Centralized Order Viewing:** Aggregate orders from various sources
    (initially via ShipStation integration) into a single interface.
2.  **Automated Personalization Parsing:** Use AI (OpenAI GPT models) to
    interpret customer personalization notes and product options to determine
    the specific details required for each print job. Handles Amazon `CustomizedURL` fetching directly when available.
3.  **Print Queue Generation:** Automatically create individual print tasks
    based on the parsed personalization, handling scenarios where one order
    item might result in multiple distinct print jobs.
4.  **Print Queue Management:** Provide a web interface at `/print-queue` to
    view, manage, and track the status of print tasks.

## Key Features

- Order management with ShipStation integration
- Print task workflow with status tracking
- Integrated Amazon `CustomizedURL` processing during task creation
- AI-powered personalization text extraction (using OpenAI GPT-4o-mini) as fallback
- Automated print queue generation from orders
- Web interface for viewing orders and print queue (`/orders`, `/print-queue`)
- Handles multiple marketplaces (Amazon, Etsy, eBay) with specific parsing logic
- Detailed order history and tracking (via database)
- Product name mapping and simplification (planned/implicit)
- Task Details Modal for viewing/editing tasks
- Paginated tables with sorting and limit controls
- Dark mode UI theme
- Database logging system for operations tracking and debugging
- Analysis scripts for monitoring and maintaining data consistency
- Automatic cleanup of pending tasks for shipped orders

## Architecture & Technology Stack

- **Framework:** Next.js (v14.2.5 - App Router)
- **Language:** TypeScript
- **Database:** MySQL
- **ORM:** Prisma (v6.5.0 or similar recent version)
- **Styling:** Tailwind CSS
- **UI Library:** shadcn/ui (Radix UI + Tailwind CSS)
- **State Management:** Primarily React Server Components (RSC) state and props
  passing. Client Components (`'use client'`) use React hooks (`useState`,
  `useMemo`, `useRouter`, `usePathname`, `useSearchParams`, `useTransition`)
  where needed (e.g., `PrintQueueTable`, `OrdersPagination`, `SyncButton`).
- **API Layer:** Next.js Route Handlers (`src/app/api/...`) for backend
  endpoints. Direct data fetching within RSCs using Prisma Client.
- **AI Integration:** OpenAI API (GPT-4o-mini model) via the `openai` Node.js
  library. Used within a standalone script (`populate-print-queue.ts`).
- **External API Client:** Axios (for ShipStation) in
  `src/lib/shipstation/index.ts`.
- **Scripting:** `tsx` for running TypeScript scripts directly. `yargs` / `commander` for CLI
  argument parsing in scripts.
- **Tables:** TanStack Table v8
- **Date Handling:** `date-fns`, `date-fns-tz`
- **Notifications:** Sonner (for toasts)
- **Code Quality:** ESLint (v8), Prettier, lint-staged, Husky (configured via
  `package.json` and `eslint.config.mjs`).
- **IDE Integration:** Includes `.vscode/settings.json` and
  `.vscode/extensions.json` for recommended VS Code setup (format on save,
  ESLint/Prettier integration, Prisma tools, Tailwind IntelliSense).

## Project Structure

```text
./
├── prisma/                 # Prisma schema, migrations, client
├── scripts/                # Analysis and utility scripts (May be deprecated/refactored)
│   └── analysis/           # Analysis, logging, and cleanup scripts
│       ├── cleanup.ts      # Scripts for cleaning up inconsistent data states
│       ├── logging.ts      # Database logging utilities
│       ├── orders.ts       # Order analysis utilities
│       ├── README.md       # Documentation for analysis scripts
│       └── sync-orders-wrapper.ts # Wrapper for sync-orders.ts with logging
│   ├── migrations/
│   └── schema.prisma
├── public/                 # Static assets
├── src/
│   ├── app/                # Next.js App Router directory
│   │   ├── api/            # API Route Handlers (e.g., /api/sync/shipstation)
│   │   ├── orders/         # Orders list page ([id] for details)
│   │   ├── print-queue/    # Print queue page
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Home page
│   ├── components/         # React components
│   │   ├── layout/         # Layout components (e.g., Navbar)
│   │   ├── ui/             # shadcn/ui components
│   │   ├── sync-button.tsx
│   │   ├── limit-selector.tsx
│   │   ├── orders-pagination.tsx
│   │   ├── print-queue-table.tsx
│   │   └── print-task-detail-modal.tsx
│   ├── lib/                # Core libraries, utilities, external API clients
│   │   ├── prisma.ts       # Prisma client instance
│   │   ├── shipstation/    # ShipStation API client logic & DB sync
│   │   ├── orders/         # Order processing logic (sync, mappers, amazon)
│   │   ├── print-tasks/    # Print task related logic (e.g., creation)
│   │   ├── shared/         # Shared utilities (logging, metrics, etc.)
│   │   ├── errors.ts       # Error handling utilities
│   │   └── utils.ts        # Utility functions (e.g., cn for classnames)
│   ├── scripts/            # Standalone scripts (Entry points)
│   │   ├── sync-orders.ts  # Script to sync orders from ShipStation
│   │   ├── populate-print-queue.ts # Script to generate print tasks
│   │   └── prompt-template.txt     # AI prompt template for the script
│   └── middleware.ts       # Next.js middleware (if any)
├── docs/                   # Additional documentation (Plans, Summaries, etc.)
├── .env                    # Environment variables (not committed)
├── .env.example            # Example environment file
├── .gitignore
├── components.json         # shadcn/ui configuration
├── eslint.config.mjs       # ESLint configuration
├── next.config.js          # Next.js configuration
├── package.json
├── postcss.config.mjs      # PostCSS configuration (for Tailwind)
├── README.md               # This file
└── tsconfig.json           # TypeScript configuration
```

## Database (`prisma/schema.prisma`)

The database schema defines the core entities:

- **`Order`**: Represents an imported order.
  - **Key Fields:** `id` (PK), `shipstation_order_id` (Unique),
    `shipstation_order_number`, `customerId` (FK), `order_status`,
    `internal_status` (Enum `InternalOrderStatus`), timestamps, notes, `total_price`.
  - **Relations:** `customer` (Optional), `items` (One-to-Many with
    `OrderItem`), `printTasks` (One-to-Many with `PrintOrderTask`).
- **`Customer`**: Represents a customer.
  - **Key Fields:** `id` (PK), `name`, `email` (Unique), `phone`, address
    fields, `shipstation_customer_id` (Unique).
  - **Relations:** Has many `Order`, has many `PrintOrderTask`.
- **`OrderItem`**: Represents a line item within an order.
  - **Key Fields:** `id` (PK), `orderId` (FK to `Order`), `productId` (FK to `Product`),
    `quantity`, `unit_price`, `print_settings` (Json?).
  - **Relations:** Belongs to `Order`, belongs to `Product`, has many `PrintOrderTask`, has one `AmazonCustomizationFile`.
- **`PrintOrderTask`**: Represents an individual print job derived from an
  `OrderItem`.
  - **Key Fields:** `id` (PK), `orderId` (FK to `Order`), `orderItemId` (FK to `OrderItem`), `productId` (FK to `Product`), `customerId` (FK to
    `Customer`), `custom_text`, `quantity`, `color_1`,
    `color_2`, `ship_by_date`, `status` (Enum `PrintTaskStatus`),
    `needs_review` (Boolean), `review_reason`, `annotation` (String?).
  - **Relations:** Belongs to `Order`, `OrderItem`, `Product`, `Customer` (optional).
  - **Unique Constraint:** `@@unique([orderItemId, taskIndex])`.
- **`Product`**: Represents a product definition.
  - **Key Fields:** `id` (PK), `sku` (Unique), `name`, `shipstation_product_id` (Unique).
  - **Relations:** Has many `OrderItem`, has many `PrintOrderTask`.
- **`AmazonCustomizationFile`**: Stores details about fetched Amazon customization data.
  - **Key Fields:** `id` (PK), `orderItemId` (Unique FK to `OrderItem`), `originalUrl`, `localFilePath`, `downloadStatus`, `processingStatus`.
  - **Relations:** Belongs to `OrderItem`.
- **Enums:** `InternalOrderStatus`, `PrintTaskStatus`.
- **`SystemLog`**: Represents a system log entry.
- **`Tag`**: Represents ShipStation tags.
- **`ScriptRunLog`**: Logs script executions.
- **`User`**: Represents application users.
- **`SyncProgress`**: Tracks the progress of sync operations.
- **`SyncMetrics`**: Stores metrics related to sync operations.
- **`AiCallLog`**: Logs calls made to AI services.
- **`Metric`**: Stores generic application metrics.

**Note:** After modifying `prisma/schema.prisma`, always run
`npx prisma migrate dev --name <migration_name>` to update the database schema
and `npx prisma generate` to update the Prisma Client types.

## Core Functionality & Detailed Data Flow

### 1. Order Ingestion (`src/lib/orders/sync.ts`, `src/scripts/order-sync.ts`)

1.  **Trigger:** Run `npx tsx src/scripts/order-sync.ts sync [options]`.
2.  **Sync Logic (`syncRecentOrders` / `syncAllPaginatedOrders` / `syncSingleOrder`):**
    - Determines start date/time based on mode (`recent`, `all`, `single`) and options (`--days-back`, `--hours`, `--order-date-start`, `--force-start-date`). Handles timezone conversion for `modifyDateStart` parameter sent to ShipStation.
    - Fetches orders page by page from ShipStation API (`getShipstationOrders` with retry logic).
    - For each order (`ssOrder`):
      - Calls `upsertOrderWithItems`.
    - **`upsertOrderWithItems`:**
      - Upserts the `Customer` using `upsertCustomerFromOrder` (based on email).
      - Upserts the `Product` for each item using `upsertProductFromItem` (based on SKU or ShipStation Product ID).
      - Upserts the `Order` using `mapOrderToPrisma` (based on `shipstation_order_id`).
      - Upserts `OrderItem`s using `mapSsItemToOrderItemData` (based on `shipstationLineItemKey`).
    - _(Optional)_ Syncs ShipStation tags (`syncShipStationTags`).
    - Updates `SyncProgress` table.
    - Returns counts/status.

### 2. Print Task Generation (`src/scripts/populate-print-queue.ts`)

1.  **Trigger:** Run `npx tsx src/scripts/populate-print-queue.ts [options]`.
2.  **Options:** Accepts flags like `--order-id`, `--limit`, `--force-recreate`, `--clear-all`, `--dry-run`.
3.  **Clear All (Optional):** If `--clear-all` is used, prompts for confirmation (unless `-y` is present) and deletes all existing `PrintOrderTask` records.
4.  **Order Fetching (`getOrdersToProcess`):**
    - If `--order-id` is provided, fetches that specific order.
    - Otherwise, fetches orders with status `awaiting_shipment`.
    - If `--force-recreate` is **not** used, it only fetches orders that have at least one item without any existing print tasks.
    - If `--force-recreate` **is** used, it fetches all `awaiting_shipment` orders (up to the limit), regardless of existing tasks.
5.  **AI Processing (`extractOrderPersonalization`):**
    - For each fetched order, constructs JSON input and calls the configured OpenAI API (`gpt-4o-mini` by default) to get structured personalization data (`{ "itemPersonalizations": {...} }`).
6.  **Task Upsert (`createOrUpdateTasksInTransaction`):**
    - For each item in an order:
      - **Amazon Check:** If it's an Amazon order with a `CustomizedURL`, attempts to fetch and process the URL using `fetchAndProcessAmazonCustomization`. If successful, uses this data for the task.
      - **eBay Check:** If not processed via Amazon URL and it's an eBay order with specific notes format, attempts to parse notes. If successful, uses this data.
      - **AI Fallback:** If neither Amazon nor eBay logic applies/succeeds, uses the data extracted by the AI (`aiData`).
      - **Placeholder:** If no data source succeeds, creates a placeholder task marked for review.
      - **DB Operation:** Uses Prisma transactions (`tx.printOrderTask.upsert`) to create or update tasks based on the determined data source. If `--force-recreate` was used, existing tasks for the item were deleted before this step.
7.  **Completion:** Logs processing summary.

### 3. Frontend Display

- **`/` (`src/app/page.tsx`):** Server Component rendering `SyncButton`
  (Client Component).
- **`/orders` (`src/app/orders/page.tsx`):** Server Component
  (`force-dynamic`). Fetches paginated orders (`getOrders`), renders
  `OrdersPagination` and a table (`shadcn/ui`) with links to `/orders/[id]`.
- **`/print-queue` (`src/app/print-queue/page.tsx`):** Server Component.
  Fetches print tasks (`getPrintTasks`), renders `PrintQueueHeader` and `PrintQueueTable`.
- **`PrintQueueHeader` (`src/components/print-queue-header.tsx`):** Client Component.
  Displays the page title, last updated time, and action buttons including:
  - **Tools Button:** Opens the `PrintQueueToolsModal` for running maintenance tasks
  - **Cleanup Button:** Runs the `cleanShippedOrderTasks` action to mark tasks as completed
  - **Refresh Button:** Reloads the page to show the latest data
- **`PrintQueueToolsModal` (`src/components/print-queue-tools-modal.tsx`):** Client Component.
  Provides a dialog for entering an order ID or marketplace order number to run the
  `populate-print-queue.ts` script with the `--force-recreate` flag. Supports both internal
  database IDs and marketplace order numbers (e.g., "202-3558314-1389920").
- **`PrintQueueTable` (`src/components/print-queue-table.tsx`):** Client
  Component (`'use client'`). Uses `@tanstack/react-table`. Defines columns
  with sorting, selection, status/review badges, links, row actions. Manages
  client-side table state (sorting, selection).
- **`OrdersPagination` (`src/components/orders-pagination.tsx`):** Client
  Component. Uses router hooks to generate pagination links, preserving `limit`.
- **`LimitSelector` (`src/components/limit-selector.tsx`):** Client Component.
  Allows selecting items per page via `shadcn/ui` Select.
- **Layout & Styling (`src/app/layout.tsx`, `globals.css`, `navbar.tsx`):**
  Defines root layout, dark mode theme via `globals.css`, main navbar. Uses
  `Inter` font. Layout allows full-width content cards.

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm (or yarn/pnpm)
- Access to a MySQL database instance
- ShipStation API Credentials (Key and Secret)
- OpenAI API Key

### Installation & Setup

1.  **Clone the repository:**

```bash
git clone <your-repository-url>
cd y3dhub
```

2.  **Install dependencies:**

```bash
npm install
```

3.  **Environment Variables:**
    - Create `.env` from `.env.example`. Fill in:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME"
OPENAI_API_KEY="your_openai_api_key"
SHIPSTATION_API_KEY="your_shipstation_key"
SHIPSTATION_API_SECRET="your_shipstation_secret"
SHIPSTATION_BASE_URL="https://ssapi.shipstation.com" # Default
# NEXT_PUBLIC_APP_URL="http://localhost:3000" # Optional
```

4.  **Database Setup:**
    - Ensure MySQL DB exists.
    - Apply migrations: `npx prisma migrate dev --name init` (or subsequent migration name)
    - Generate client: `npx prisma generate`

## Running the Application

- **Development:** `npm run dev` (Access at
  [`http://localhost:3000`](http://localhost:3000))
- **Build:** `npm run build`
- **Production Start:** `npm run start`

## Available Scripts (via `npm run` or `npx tsx`)

- `dev`, `build`, `start`: Standard Next.js scripts.
- `lint`: Run ESLint checks.
- `populate-queue [--flags]`: Alias for `npx tsx src/scripts/populate-print-queue.ts`. Generates print tasks. Key flags: `--limit <num>`, `--order-id <db_id>`, `--force-recreate`, `--clear-all`, `--dry-run`.
- `sync-orders [--flags]`: Alias for `npx tsx src/scripts/order-sync.ts sync`. Syncs orders from ShipStation. Key flags: `--mode <recent|all|single>`, `--days-back <num>`, `--order-date-start <date>`, `--order-date-end <date>`, `--order-id <ss_id>`, `--skip-tags`, `--dry-run`.

See [Scripts Documentation](./docs/COMMAND_REFERENCE.md) for detailed documentation on all scripts, their options, and usage examples.

**Important Notes for Scripts:**

- Require `.env` file with API keys and `DATABASE_URL`.
- Scripts use `tsx` for execution.
- `populate-print-queue` processes orders in batches (controlled by `--limit`). It now handles Amazon URL fetching directly.
- Print tasks are automatically marked as completed when an order status changes to 'shipped' or 'cancelled' in ShipStation (This logic might need verification/implementation).

## API Routes

Located under `src/app/api/`. Handle:

- ShipStation Sync Trigger: `POST /api/sync/shipstation`
- Task Updates: `PATCH /api/print-tasks/[taskId]`,
  `PATCH /api/print-tasks/[taskId]/status` (Implemented & Authenticated)
- Bulk Task Updates: `PATCH /api/print-tasks/bulk-status`,
  `PATCH /api/tasks/bulk-update-name` (Note: Updates `PrintOrderTask` fields
  only).

## Current Status & Recent Work (as of April 16, 2025)

- **Core Setup:** Next.js v14.2.5, Prisma/MySQL, Shadcn UI.
- **`populate-print-queue` Script:**
  - Integrates Amazon `CustomizedURL` fetching.
  - Falls back to AI extraction (OpenAI GPT-4o-mini) if URL is missing/fails.
  - Includes `--force-recreate` flag to reprocess orders regardless of existing tasks.
  - Includes `--clear-all` flag to delete all tasks before processing.
  - Includes `--order-id` flag for specific order processing.
  - Uses `commander` for argument parsing.
  - Includes enhanced logging.
- **Frontend:** `/orders`, `/print-queue` pages with pagination
  (`OrdersPagination`) and limit controls (`LimitSelector`). `PrintQueueTable`
  uses TanStack Table v8 with sorting, selection, client-side status toggle.
  Dark mode implemented. Full-width layout. Hydration/serialization issues
  resolved.
- **ShipStation Sync:**
  - `order-sync.ts` script handles fetching orders/tags.
  - Correctly handles timezone conversion for `modifyDateStart` filter.
  - `amazon` subcommands in `order-sync.ts` are currently placeholders.
- **Database:** Added `annotation` field to `PrintOrderTask`.

## Known Issues & Limitations

**Based on Code Reviews (April 16, 2025):**

- **CRITICAL: `PrintOrderTask` Unique Constraint:** The temporary
  `@@unique([orderId, sku, product_name])` was fixed and replaced with `@@unique([orderItemId, taskIndex])`. **RESOLVED**
- **CRITICAL: Lack of API Security:** API routes (especially
  `POST /api/sync/shipstation`) lack authentication/authorization, creating a
  significant security vulnerability. Unauthorized access could trigger syncs,
  expose data, or incur costs.
- **HIGH: Lack of Automated Testing:** The absence of unit and integration
  tests makes refactoring risky, increases the chance of regressions, and makes
  verifying complex logic (sync, AI parsing) difficult.
- **MEDIUM: Inefficient ShipStation Sync Logic:** The current
  `upsertOrderWithItems` might still be inefficient for large updates if not using `shipstationLineItemKey` consistently. Needs review.
- **MEDIUM: `populate-print-queue` Script Issues:**
  - **Idempotency:** While `--force-recreate` helps, true idempotency based on content might be better long-term.
  - **AI Response Validation:** Relies on Zod schema, but complex edge cases might still cause issues.
  - **Error Handling:** Improved, but complex failures might need more specific handling.
- **MEDIUM: Filter State Persistence:** Filter/search parameters on the
  `/orders` page are lost during pagination or limit changes, harming UX.
- **MEDIUM: Print Queue Actions & State:** Status updates (`PrintQueueTable`)
  are UI-only and not persisted to the backend.
- **MEDIUM: Input Validation:** Need for input validation (e.g., using `zod`)
  on API routes to prevent errors or security issues from malformed requests.
- **LOW: Order Detail Page Missing:** `/orders/[id]` page is not yet
  implemented.
- **LOW: Redundant Order Status Field:** `Order` model has `order_status`
  (String) and `internal_status` (Enum `InternalOrderStatus`). Needs clarification/consolidation.
- **LOW: Potential Filter Fetching Inefficiency:** Repeatedly fetching distinct
  filter options (`getFilterOptions`) might be inefficient; consider caching.

## Future Work & TODOs (Elaborated & Prioritized)

**Based on Code Reviews (April 16, 2025):**

1.  **HIGH: Secure API Routes:** Implement robust authentication/authorization
    (middleware or route handlers) for all API routes, especially mutation
    endpoints like `/api/sync/shipstation`.
2.  **HIGH: Add Automated Tests:** Implement a testing strategy. Start with:
    - Unit tests (Vitest/Jest) for utilities, mappers, core logic.
    - Integration tests for critical flows: `syncRecentOrders`,
      `populate-print-queue` (mocking externals), API routes.
    - Activate and write Playwright E2E tests using the existing config.
3.  **MEDIUM: Enhance ShipStation Sync:** Review `upsertOrderWithItems` for efficiency, especially regarding item updates and handling of missing `shipstationLineItemKey`. Improve error propagation.
4.  **MEDIUM: Enhance `populate-print-queue` Script:**
    - Implement robust AI response validation (e.g., using `zod`).
    - Improve error handling (log details, create specific review tasks).
    - Consider true idempotency based on content hash if needed.
5.  **MEDIUM: Fix Filter Persistence on Pagination:** Update `OrdersPagination`
    and `LimitSelector` to preserve existing filter `searchParams` when
    generating links.
6.  **MEDIUM: Implement Print Queue Actions:** Create backend API route(s)
    (e.g., `PATCH /api/print-tasks/[id]/status`) to persist status changes.
    Update `PrintQueueTable` to call these APIs (using `fetch`, `react-query`,
    or `swr`) and remove temporary client-state logic.
7.  **MEDIUM: Implement API Input Validation:** Use `zod` or similar to validate
    request bodies/params on API routes.
8.  **LOW/MEDIUM: Build Order Detail Page (`/orders/[id]`):** Fetch and display
    full order details, items, and linked tasks.
9.  **LOW/MEDIUM: Add UI Filtering/Searching:** Implement UI controls and
    backend logic for robust filtering/searching on `/orders` and
    `/print-queue`.
10. **LOW: Clarify/Consolidate `Order.status` vs `Order.order_status`:** Decide
    if both are needed, update schema/logic.
11. **LOW: Optimize Filter Option Fetching (If Needed):** Consider caching
    strategies if `getFilterOptions` becomes slow.
12. **Fix `order-sync.ts amazon` commands:** Connect the script's subcommands to the library functions in `src/lib/orders/amazon/`.

## Deployment

Standard Next.js deployment:

1.  Ensure Node.js (v18+) support.
2.  Set environment variables on the server.
3.  Run `npm run build`.
4.  Run production migrations: `npx prisma migrate deploy`.
5.  Start: `npm run start`.
6.  Use a process manager (PM2) or platform service (Vercel, Netlify, etc.).

## Project Rules & Conventions

- **Code Style:** Follow ESLint/Prettier rules (`npm run lint`). Format on save.
- **Commits:** Use conventional commit messages. Lint pre-commit (Husky).
- **Branching:** Feature branches (`feature/...`), Pull Requests.
- **TypeScript:** Use strictly. Avoid `any`. Leverage Prisma types.
- **Environment Variables:** Keep `.env` local. Use provider's env management
  for deployment.
- **Prisma Migrations:** Use `npx prisma migrate dev`. Commit migrations.
- **Components:** Prefer Server Components. Use `'use client'` only when
  necessary.
- **API Routes:** Use Route Handlers (`src/app/api/.../route.ts`).
- **Scripts:** Place in `src/scripts`. Use `tsx`. Document in
  `docs/COMMAND_REFERENCE.md`.
- **Error Handling:** Use try/catch, provide feedback. Use `lib/errors.ts`.
- **Secrets:** Store securely (local `.env`, deployment env variables).

## Environment Variables Summary

Ensure these are in `.env`:

- `DATABASE_URL`
- `OPENAI_API_KEY` (if using `--ai-provider openai`)
- `OPEN_ROUTER_API_KEY` (if using `--ai-provider openrouter`)
- `SHIPSTATION_API_KEY`
- `SHIPSTATION_API_SECRET`
- `SHIPSTATION_BASE_URL` (Default: `https://ssapi.shipstation.com`)
- `OLLAMA_URL` (optional, if using `--ai-provider ollama` and not default
  localhost)
- `LMSTUDIO_URL` (optional, if using `--ai-provider lmstudio` and not default
  localhost)
- `LMSTUDIO_MODEL` (optional, if using `--ai-provider lmstudio` and not default
  `local-model`)
- `SESSION_PASSWORD` (for user authentication)
- `SYNC_API_KEY` (for `/api/sync/shipstation` endpoint security)

## Notes on Recent Changes

- Added a comprehensive database logging system:

  - Created a `system_logs` table in the database to store logs
  - Implemented a logging utility with different log levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
  - Added categorization for logs (ORDER_SYNC, PRINT_TASK, SYSTEM, etc.)
  - Created scripts for viewing and analyzing logs

- Added analysis and cleanup scripts:

  - Created a script to check for and fix pending print tasks for shipped orders
  - Added a script to find inconsistencies in the database
  - Created a wrapper for the sync-orders script with database logging
  - Organized scripts in a dedicated `scripts/analysis` directory with documentation

- Enhanced the Tools button functionality in the Print Queue to support marketplace order numbers (e.g., "202-3558314-1389920"):
  - Added `findOrderIdByMarketplaceNumber` function to look up internal database IDs from marketplace order numbers
  - Modified `runPopulateQueueForOrder` to detect and handle hyphenated marketplace order numbers
  - Improved error messages and user feedback for order number lookups
  - Updated the UI to clarify that both internal IDs and marketplace order numbers are accepted
- Downgraded Next.js to 14.2.5 (stable) from canary.
- Downgraded React/React-DOM to v18 from v19 canary/RC.
- Downgraded ESLint to v8 from v9 to satisfy `eslint-config-next` peer
  dependency.
- Resolved various dependency conflicts arising from version mismatches by
  cleaning `node_modules` and `package-lock.json` and performing a clean
  install.
- Renamed `next.config.ts` to `next.config.js`.
- Adjusted dependencies for compatibility.
- Changed font from `Geist` to `Inter`.
- Removed code referencing non-existent fields on `PrintOrderTask`.
- Refactored `src/lib/shipstation/db-sync.ts` to fix type errors.
- Fixed `Decimal` serialization warnings for Client Components.
- Minor ESLint suppression remains in `db-sync.ts`.
- Added date range flags (`--order-date-start`, `--order-date-end`) to
  `sync-orders` script for historical data fetching.
- Refactored `sync-orders` script execution to preload environment variables.
- Refactored `upsertCustomerFromOrder` to prioritize email lookups.
- Fixed `React.forwardRef` warning in UI Button component.
- Refactored `populate-print-queue` to use new schema and handle AI quantity
  splitting/mismatches.
- Fixed `PrintOrderTask` unique key constraint.
- Added simple API Key auth to `/api/sync/shipstation` endpoint.
- Added multiple AI provider options (`openai`, `openrouter`, `ollama`,
  `lmstudio`) to `populate-print-queue` script.
- Refined system prompt for AI personalization extraction for better accuracy
  and structure.
- Added file logging and debug logging capabilities to `populate-print-queue`.
- Added test script (`test.ts`) for isolated AI prompt testing.
- Added script (`create-user.ts`, `reset-user-password.ts`) for user management.
- Set project to use ES Modules (`"type": "module"` in `package.json`).
- Renamed `next.config.js` to `next.config.cjs` for module compatibility.
- Added print task status update API (`PATCH /api/print-tasks/[taskId]/status`)
  with authentication.
- Updated PrintQueueTable UI to display `needs_review` status with tooltip for
  reason, and personalization details (`custom_text`, `color_1`, `color_2`).
- Added logging for AI `annotation` field during task creation.
- Added Shipped Date and Tracking Number (with copy button) columns to the main
  Orders table.
- Clarified and consolidated internal vs external order status fields in the
  database schema (`Order.internal_status` and `InternalOrderStatus` enum).
- Created Order Detail page (`/orders/[id]`) showing order, customer, shipment,
  items, and print task details.
- Enhanced DatePicker component with preset buttons (Today, Tomorrow, etc.).
- Added warning log during product sync if an existing SKU has a different
  ShipStation Product ID.
- **Added `annotation` field to `PrintOrderTask` model and migrated DB.**
- **Modified `populate-print-queue.ts` to integrate Amazon URL fetching, add `--clear-all` flag, enhance logging, and fix `--force-recreate` behavior.**
- **Fixed timezone calculation in `order-sync.ts` for recent order fetching.**

## Documentation

All documentation is now centralized in the [docs](./docs) directory. Key documentation includes:

- [Scripts Documentation](./docs/COMMAND_REFERENCE.md) - Detailed documentation for all scripts
- [Improvements](./docs/development/IMPROVEMENTS.md) - Completed and planned improvements
- [Development Guidelines](./docs/development/DEVELOPMENT.md) - Development guidelines and best practices
- [Timezone Handling](./docs/development/timezone-handling.md) - Timezone handling documentation

See the [Documentation Index](./docs/index.md) for a complete list of available documentation.

## Running in Production with PM2

This project uses [PM2](https://pm2.keymetrics.io/) to manage the Next.js application process in the background, ensuring it stays running and facilitating easy log management.

### Prerequisites

- Node.js and npm installed.
- PM2 installed globally:
  ```bash
  npm install -g pm2
  ```

### Setup

1.  **Build the application:**

    ```bash
    npm run build
    ```

2.  **Start the application using PM2:**
    Navigate to the project root directory (`/home/jayson/y3dhub/`) in your terminal and run:
    ```bash
    pm2 start ecosystem.config.js
    ```
    This will start the Next.js application on port 8081 as defined in `ecosystem.config.js`.

### Common PM2 Commands

- **List running processes:**

  ```bash
  pm2 list
  # or
  pm2 status
  ```

- **View logs (real-time):**

  ```bash
  pm2 logs y3dhub-nextjs
  # or just 'pm2 logs' for all apps
  ```

- **View older logs:**

  ```bash
  pm2 logs y3dhub-nextjs --lines 1000 # Show last 1000 lines
  ```

  Logs are typically stored in `~/.pm2/logs/`.

- **Stop the application:**

  ```bash
  pm2 stop y3dhub-nextjs
  ```

- **Restart the application:**

  ```bash
  pm2 restart y3dhub-nextjs
  ```

- **Delete the application from PM2:**

  ```bash
  pm2 delete y3dhub-nextjs
  ```

## Full Workflow CLI

Run the entire end-to-end system (ShipStation sync → print queue → Amazon customization) with:

```bash
npm run full-workflow -- [options]
```


Options:
- `--mode <all|recent|single>`  Which orders to sync (default: recent)
- `--order-id <ID>`             Only sync a single order (requires `--mode single`)
- `--days-back <N>`             Days to look back when mode is `recent` (default: 2)
- `--hours <N>`                 Hours to look back when mode is `recent` (overrides `--days-back`)
- `--dry-run`                   Show actions without making any changes
- `--verbose`                   Enable verbose console output
- `--skip-tags`                 Skip ShipStation tag synchronization (tags-only sync should be run separately)

Concurrency:
The workflow uses a filesystem lock on `/tmp/y3dhub_workflow.lock` to ensure only one instance runs at a time.

Exit codes:
- `0` on success
- Non-zero if any step fails; the workflow aborts on the first error.

- **Monitor resource usage:**

  ```bash
  pm2 monit
  ```

- **Save the current process list (for startup on reboot):**
  ```bash
  pm2 save
  ```
  _(You might need to configure PM2 startup scripts for your OS for this to work automatically after reboot. See `pm2 startup` command)_.
