# Y3DHub - Order Management & Print Queue System

## Project Overview

Y3DHub is a modern Next.js web application designed to streamline the order
management and 3D print production workflow for a business selling personalized
3D printed items (like keyrings, signs, etc.) across multiple marketplaces
(e.g., eBay, Amazon, Etsy).

The primary goals are:

1. **Centralized Order Viewing:** Aggregate orders from various sources
   (initially via ShipStation integration) into a single interface.
2. **Automated Personalization Parsing:** Use AI (OpenAI GPT models) to
   interpret customer personalization notes and product options to determine
   the specific details required for each print job.
3. **Print Queue Generation:** Automatically create individual print tasks
   based on the parsed personalization, handling scenarios where one order
   item might result in multiple distinct print jobs.
4. **Print Queue Management:** Provide a web interface at `/print-queue` to
   view, manage, and track the status of print tasks.

## Key Features

- Order management with ShipStation integration
- Print task workflow with status tracking
- AI-powered personalization text extraction (using OpenAI GPT-4o-mini)
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
- **Scripting:** `tsx` for running TypeScript scripts directly. `yargs` for CLI
  argument parsing in scripts.
- **Tables:** TanStack Table v8
- **Date Handling:** `date-fns`
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
├── scripts/                # Analysis and utility scripts
│   └── analysis/           # Analysis, logging, and cleanup scripts
│       ├── cleanup.ts      # Scripts for cleaning up inconsistent data states
│       ├── logging.ts      # Database logging utilities
│       ├── orders.ts       # Order analysis utilities
│       ├── README.md       # Documentation for analysis scripts
│       └── sync-orders-wrapper.ts # Wrapper for sync-orders.ts with logging
│   ├── migrations/
│   └── schema.prisma
├── public/                 # Static assets
├── scripts/                # Analysis and utility scripts
│   └── analysis/           # Analysis, logging, and cleanup scripts
│       ├── cleanup.ts      # Scripts for cleaning up inconsistent data states
│       ├── logging.ts      # Database logging utilities
│       ├── orders.ts       # Order analysis utilities
│       ├── README.md       # Documentation for analysis scripts
│       └── sync-orders-wrapper.ts # Wrapper for sync-orders.ts with logging
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
│   │   ├── errors.ts       # Error handling utilities
│   │   └── utils.ts        # Utility functions (e.g., cn for classnames)
│   ├── scripts/            # Standalone scripts
│   │   ├── sync-orders.ts  # Script to sync orders from ShipStation
│   │   ├── populate-print-queue.ts # Script to generate print tasks via AI
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
    `status` (Enum `OrderStatus`), timestamps, notes, `total_price`.
  - **Relations:** `customer` (Optional), `items` (One-to-Many with
    `OrderItem`), `printTasks` (One-to-Many with `PrintOrderTask`).
- **`Customer`**: Represents a customer.
  - **Key Fields:** `id` (PK), `name`, `email` (Unique), `phone`, address
    fields, `shipstation_customer_id` (Unique).
  - **Relations:** Has many `Order`, has many `PrintOrderTask`.
- **`OrderItem`**: Represents a line item within an order.
  - **Key Fields:** `id` (PK), `orderId` (FK to `Order`), `sku`, `model_name`,
    `quantity`, `unit_price`, `print_settings` (Json?).
  - **Relations:** Belongs to `Order`. _Crucially, currently lacks a direct
    relation back from `PrintOrderTask`._
- **`PrintOrderTask`**: Represents an individual print job derived from an
  `OrderItem`.
  - **Key Fields:** `id` (PK), `orderId` (FK to `Order`), `customerId` (FK to
    `Customer`), `sku`, `product_name`, `custom_text`, `quantity`, `color_1`,
    `color_2`, `ship_by_date`, `status` (Enum `PrintTaskStatus`),
    `needs_review` (Boolean), `review_reason`.
  - **Relations:** Belongs to `Order`, belongs to `Customer` (optional).
  - **Unique Constraint (Temporary & Flawed):**
    `@@unique([orderId, sku, product_name], name: "orderId_sku_productName")`.
    This constraint is insufficient to uniquely identify tasks split from the
    same `OrderItem` if they share the same original SKU and product name.
    **This is a high-priority issue to fix.**
- **Enums:** `OrderStatus`, `PrintTaskStatus`.
- **`SystemLog`**: Represents a system log entry.
  - **Key Fields:** `id` (PK), `timestamp`, `level`, `category`, `message`, `details` (Json), `source`.
  - **Indexes:** `timestamp`, `level`, `category`.

**Note:** After modifying `prisma/schema.prisma`, always run
`npx prisma migrate dev --name <migration_name>` to update the database schema
and `npx prisma generate` to update the Prisma Client types.

## Core Functionality & Detailed Data Flow

### 1. Order Ingestion

(`src/lib/shipstation/`, `/api/sync/shipstation/route.ts`, `SyncButton`)

1. **Trigger:** User clicks "Sync ShipStation Orders" button (`SyncButton`).
2. **Client Request:** `SyncButton` makes a `POST` to `/api/sync/shipstation`.
3. **API Route:** `/api/sync/shipstation/route.ts` receives the request
   (**TODO: Add Auth**), calls `syncShipstationData` from
   `src/lib/shipstation/index.ts`.
4. **Sync Logic (`syncShipstationData`):**
   - Fetches orders page by page from ShipStation API (`getShipstationOrders`
     using `axios`).
   - For each order (`ssOrder`):
     - Calls `upsertOrderWithItems`.
   - **`upsertOrderWithItems`:**
     - Upserts the `Customer` using `upsertCustomerFromOrder` (based on
       `shipstation_customer_id` or `email`).
     - Upserts the `Order` using `mapOrderToPrisma` (based on
       `shipstation_order_id`).
     - **Deletes existing `OrderItem`s** for the order.
     - Creates new `OrderItem`s using `mapOrderItemToPrisma`, linking to the
       order.
   - Returns counts/status.

### 2. Print Task Generation (`src/scripts/populate-print-queue.ts`)

1. **Execution Methods:**
   - **Command Line:** Triggered manually via `npm run populate-queue` (accepts
     flags like `--order-id`, `--days-back`, `--dry-run`). Uses `yargs` for
     parsing.
   - **UI Tools Button:** Available in the Print Queue page. Allows entering either:
     - Internal database ID (e.g., "202")
     - Marketplace order number (e.g., "202-3558314-1389920")
     - The system automatically detects hyphenated marketplace order numbers and looks up the corresponding internal database ID
2. **Order Fetching (`findOrdersForProcessing`):** Queries local DB for
   `Order`s (status `awaiting_shipment`/`on_hold`) with `OrderItem`s based on
   flags.
3. **AI Processing Loop (`main` -> `extractOrderPersonalization`):**
   - Iterates through fetched orders.
   - Reads AI prompt template (`prompt-system-optimized.txt`).
   - Constructs JSON input with order/item details.
   - Injects JSON into the prompt.
   - Calls OpenAI API (`gpt-4o-mini`) with the prompt, requesting structured
     JSON (`{ "itemPersonalizations": {...} }`). Includes delay (`aiCallDelay`).
   - Parses AI response, validates structure. Handles
     basic errors by creating a "review needed" task. Validates required fields.
4. **Task Upsert Loop (`main` -> `createOrUpdateTasksInTransaction`):**
   - Iterates through AI-generated personalization data.
   - Finds the corresponding original `OrderItem`.
   - Constructs `PrintOrderTaskCreateInput`.
   - Uses Prisma transactions for data integrity.
   - If `--force-recreate` is specified, deletes existing tasks first.
   - Creates new tasks based on the AI-extracted personalization data.
5. **Completion:** Logs processing summary and refreshes the UI if triggered from the Tools button.

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

1. **Clone the repository:**

```bash
git clone <your-repository-url>
cd y3dhub
```

1. **Install dependencies:**

```bash
npm install
```

1. **Environment Variables:**
   - Create `.env` from `.env.example`. Fill in:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE_NAME"
OPENAI_API_KEY="your_openai_api_key"
SHIPSTATION_API_KEY="your_shipstation_key"
SHIPSTATION_API_SECRET="your_shipstation_secret"
SHIPSTATION_BASE_URL="https://ssapi.shipstation.com" # Default
# NEXT_PUBLIC_APP_URL="http://localhost:3000" # Optional
```

1. **Database Setup:**
   - Ensure MySQL DB exists.
   - Apply migrations: `npx prisma migrate dev --name init`
   - Generate client: `npx prisma generate`

## Running the Application

- **Development:** `npm run dev` (Access at
  [`http://localhost:3000`](http://localhost:3000))
- **Build:** `npm run build`
- **Production Start:** `npm run start`

## Available Scripts (via `npm run`)

- `dev`, `build`, `start`: Standard Next.js scripts.
- `lint`: Run ESLint checks.
- `populate-queue [--flags]`: Run AI print task generation. Use `--dry-run` for testing.
- `sync-orders [--flags]`: Run order synchronization from various marketplaces.

See [Scripts Documentation](./docs/scripts/SCRIPTS.md) for detailed documentation on all scripts, their options, and usage examples.

**Important Notes for Scripts:**

- Require `.env` file with API keys and `DATABASE_URL`.
- Scripts use `tsx` for execution.
- `populate-print-queue` processes orders in batches and might need multiple
  runs. See `src/scripts/README.md` for details.
- Print tasks are automatically marked as completed when an order status changes to 'shipped' or 'cancelled' in ShipStation.

## API Routes

Located under `src/app/api/`. Handle:

- ShipStation Sync Trigger: `POST /api/sync/shipstation`
- Task Updates: `PATCH /api/print-tasks/[taskId]`,
  `PATCH /api/print-tasks/[taskId]/status` (Implemented & Authenticated)
- Bulk Task Updates: `PATCH /api/print-tasks/bulk-status`,
  `PATCH /api/tasks/bulk-update-name` (Note: Updates `PrintOrderTask` fields
  only).

## Current Status & Recent Work (as of April 1, 2025)

- **Core Setup:** Next.js v14.2.5, Prisma/MySQL, Shadcn UI.
- **`populate-print-queue` Script:** Functional but limited by the flawed
  unique key. Includes AI processing, prompt, CLI flags (`yargs`), rate
  limiting.
- **Frontend:** `/orders`, `/print-queue` pages with pagination
  (`OrdersPagination`) and limit controls (`LimitSelector`). `PrintQueueTable`
  uses TanStack Table v8 with sorting, selection, client-side status toggle.
  Dark mode implemented. Full-width layout. Hydration/serialization issues
  resolved.
- **ShipStation Sync:** Basic API route (`/api/sync/shipstation`) and library
  function (`syncShipstationData`) exist. DB sync logic (`db-sync.ts`)
  refactored.
- **Build Process:** Stabilized on Next.js 14. Font changed to `Inter`.

## Known Issues & Limitations

**Based on Code Reviews (April 1, 2025):**

- **CRITICAL: `PrintOrderTask` Unique Constraint:** The temporary
  `@@unique([orderId, sku, product_name])` is **fundamentally flawed** and
  prevents reliable creation of multiple tasks split from a single `OrderItem`.
  This blocks the core functionality of print queue generation and is the
  **highest priority** technical debt.
- **CRITICAL: Lack of API Security:** API routes (especially
  `POST /api/sync/shipstation`) lack authentication/authorization, creating a
  significant security vulnerability. Unauthorized access could trigger syncs,
  expose data, or incur costs.
- **HIGH: Lack of Automated Testing:** The absence of unit and integration
  tests makes refactoring risky, increases the chance of regressions, and makes
  verifying complex logic (sync, AI parsing) difficult.
- **MEDIUM: Inefficient ShipStation Sync Logic:** The current
  `upsertOrderWithItems` deletes and recreates all items for an order on every
  sync. This is inefficient and risks data integrity if `OrderItem` IDs need to
  be stable (e.g., for future relations).
- **MEDIUM: `populate-print-queue` Script Issues:**
  - **Idempotency:** Lacks true idempotency, especially post-schema fix.
    Running it multiple times could create duplicates or miss updates.
  - **AI Response Validation:** Insufficient validation of OpenAI API response
    structure and content. Malformed responses can cause errors or invalid data.
  - **Error Handling:** Basic error handling might mask the root cause of AI or
    parsing failures.
  - **Destructive Flags:** Flags like `--clear-all` lack strong safeguards
    against accidental data loss.
- **MEDIUM: Filter State Persistence:** Filter/search parameters on the
  `/orders` page are lost during pagination or limit changes, harming UX.
- **MEDIUM: Print Queue Actions & State:** Status updates (`PrintQueueTable`)
  are UI-only and not persisted to the backend.
- **MEDIUM: Input Validation:** Need for input validation (e.g., using `zod`)
  on API routes to prevent errors or security issues from malformed requests.
- **LOW: Order Detail Page Missing:** `/orders/[id]` page is not yet
  implemented.
- **LOW: Redundant Order Status Field:** `Order` model has `order_status`
  (String) and `status` (Enum `OrderStatus`). Needs clarification/consolidation.
- **LOW: Potential Filter Fetching Inefficiency:** Repeatedly fetching distinct
  filter options (`getFilterOptions`) might be inefficient; consider caching.

## Future Work & TODOs (Elaborated & Prioritized)

**Based on Code Reviews (April 1, 2025):**

1. **CRITICAL: Fix `PrintOrderTask` Unique Constraint:** Add `orderItemId` and
   `splitIndex` fields to `PrintOrderTask`, define a new unique constraint
   (e.g., `@@unique([orderItemId, splitIndex])`), run migrations, and update
   `populate-print-queue` script's upsert logic.
2. **HIGH: Secure API Routes:** Implement robust authentication/authorization
   (middleware or route handlers) for all API routes, especially mutation
   endpoints like `/api/sync/shipstation`.
3. **HIGH: Add Automated Tests:** Implement a testing strategy. Start with:
   - Unit tests (Vitest/Jest) for utilities, mappers.
   - Integration tests for critical flows: `syncShipstationData`,
     `populate-print-queue` (mocking externals), API routes.
   - Activate and write Playwright E2E tests using the existing config.
4. **MEDIUM: Enhance ShipStation Sync:** Refactor `upsertOrderWithItems` for
   granular updates (create/update/delete based on item keys) instead of
   delete/recreate. Improve error propagation from sub-functions.
5. **MEDIUM: Enhance `populate-print-queue` Script:**
   - Implement robust AI response validation (e.g., using `zod`).
   - Improve error handling (log details, create specific review tasks).
   - Implement true idempotency using Prisma `upsert` with the _new_ unique key.
   - Add stronger safeguards/confirmation for destructive flags (`--clear-all`).
6. **MEDIUM: Fix Filter Persistence on Pagination:** Update `OrdersPagination`
   and `LimitSelector` to preserve existing filter `searchParams` when
   generating links.
7. **MEDIUM: Implement Print Queue Actions:** Create backend API route(s)
   (e.g., `PATCH /api/print-tasks/[id]/status`) to persist status changes.
   Update `PrintQueueTable` to call these APIs (using `fetch`, `react-query`,
   or `swr`) and remove temporary client-state logic.
8. **MEDIUM: Implement API Input Validation:** Use `zod` or similar to validate
   request bodies/params on API routes.
9. **LOW/MEDIUM: Build Order Detail Page (`/orders/[id]`):** Fetch and display
   full order details, items, and linked tasks.
10. **LOW/MEDIUM: Add UI Filtering/Searching:** Implement UI controls and
    backend logic for robust filtering/searching on `/orders` and
    `/print-queue`.
11. **LOW: Clarify/Consolidate `Order.status` vs `Order.order_status`:** Decide
    if both are needed, update schema/logic.
12. **LOW: Optimize Filter Option Fetching (If Needed):** Consider caching
    strategies if `getFilterOptions` becomes slow.

## Deployment

Standard Next.js deployment:

1. Ensure Node.js (v18+) support.
2. Set environment variables on the server.
3. Run `npm run build`.
4. Run production migrations: `npx prisma migrate deploy`.
5. Start: `npm run start`.
6. Use a process manager (PM2) or platform service (Vercel, Netlify, etc.).

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
  `src/scripts/README.md`.
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

## Documentation

All documentation is now centralized in the [docs](./docs) directory. Key documentation includes:

- [Scripts Documentation](./docs/scripts/SCRIPTS.md) - Detailed documentation for all scripts
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

- **Monitor resource usage:**

  ```bash
  pm2 monit
  ```

- **Save the current process list (for startup on reboot):**
  ```bash
  pm2 save
  ```
  _(You might need to configure PM2 startup scripts for your OS for this to work automatically after reboot. See `pm2 startup` command)_.
