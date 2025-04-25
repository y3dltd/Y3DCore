# Y3DHub Project Context Files

This document serves as an index and high-level guide to the Y3DHub project codebase, with the detailed content of key
files stored in the `./IDEDocs` directory. This structure is designed to provide a comprehensive context for AI models
assisting with development tasks.

## Project Overview

Y3DHub is a web application built with Next.js designed to streamline the workflow for a 3D printing business. Its
primary goal is to automate the process from receiving orders (via ShipStation) to generating printable 3D models (using
OpenSCAD) and managing the print task lifecycle.

Key aspects identified from the provided files include:

- **Order Synchronization**: Scripts (`scripts/sync-orders.ts`, `scripts/workflow.sh`) and library code
  (`src/lib/orders/sync.ts`, `src/lib/shipstation/api.ts`, `src/lib/shipstation/client.ts`,
  `src/lib/shipstation/types.ts`, `src/lib/orders/mappers.ts`, `src/lib/shipstation/db-sync.ts`) handle fetching orders,
  items, customers, and tags from ShipStation and upserting them into the MySQL database (defined in
  `prisma/schema.prisma`) via Prisma (`src/lib/shared/database.ts`).
- **Print Task Generation**: The `scripts/populate-print-queue.ts` script is responsible for creating `PrintOrderTask`
  records in the database. It attempts to extract personalization data first from Amazon `CustomizedURL`s
  (`src/lib/orders/amazon/customization.ts`) and falls back to using OpenAI (`src/lib/ai/`) based on prompts (though the
  prompt files themselves were not provided).
- **STL Rendering**: The `src/workers/stl-render-worker.ts` is a background process that finds pending
  `PrintOrderTask`s, uses OpenSCAD files (`openscad/DualColour.scad`, `openscad/RegKey.scad`, `openscad/iPhoneCable.scad`,
  `openscad/DualColourNew2.json`) via the `src/lib/openscad/index.ts` library to generate STL files, and updates the task
  status and file path.
- **Task Management UI**: The `src/app/print-queue/page.tsx` and `src/app/print-queue/PrintQueueClient.tsx` provide
  the frontend interface for viewing and filtering print tasks. API routes like
  `src/app/api/print-tasks/bulk-status/route.ts` handle updates from the UI.
- **Authentication**: The application uses NextAuth.js (`src/lib/auth.ts`) with a Credentials provider and Prisma
  adapter (`prisma/schema.prisma`). Middleware (`src/middleware.ts`) protects routes, and API routes use
  `getServerSession`. Password hashing is handled in `src/lib/server-only/auth-password.ts`.
- **Error Handling & Logging**: Standardized API error responses are managed in `src/lib/errors.ts`. Logging across
  the application uses a custom logger wrapper (`src/lib/shared/logging.ts`).
- **Database Schema**: The `prisma/schema.prisma` file defines the structure of the database, including models for
  `Product`, `Order`, `Customer`, `OrderItem`, `PrintOrderTask`, `AmazonCustomizationFile`, `Tag`, `User`, `Account`,
  `Session`, `VerificationToken`, `SyncProgress`, `SyncMetrics`, `AiCallLog`, and `Metric`, along with enums like
  `PrintTaskStatus` and `StlRenderStatus`.
- **CLI Scripts**: Various scripts (`scripts/workflow.sh`, `scripts/sync-orders.ts`,
  `scripts/populate-print-queue.ts`, `scripts/complete-shipped-print-tasks.ts`) automate key processes.

## Files Provided in Previous Conversation

The following files were provided and used to build the context:

- `openscad/DualColour.scad`
- `openscad/DualColourNew2.json`
- `openscad/RegKey.scad`
- `openscad/iPhoneCable.scad`
- `public/logo.png` (Note: Image content cannot be included in text context)
- `prisma/schema.prisma`
- `scripts/complete-shipped-print-tasks.ts`
- `scripts/populate-print-queue.ts`
- `scripts/sync-orders.ts`
- `scripts/workflow.sh`
- `src/app/api/print-tasks/bulk-status/route.ts`
- `src/app/api/sync/shipstation/route.ts`
- `src/app/print-queue/PrintQueueClient.tsx`
- `src/app/print-queue/page.tsx`
- `src/components/print-queue-table.tsx`
- `src/components/print-task-detail-modal.tsx`
- `src/lib/errors.ts`
- `src/lib/order-processing.ts`
- `src/lib/orders/amazon/customization.ts`
- `src/lib/orders/mappers.ts`
- `src/lib/orders/sync.ts`
- `src/lib/server-only/auth-password.ts`
- `src/lib/shared/database.ts`
- `src/lib/shared/logging.ts`
- `src/lib/shared/shipstation.ts`
- `src/lib/shipstation/api.ts`
- `src/lib/shipstation/client.ts`
- `src/lib/shipstation/db-sync.ts`
- `src/lib/shipstation/types.ts`
- `src/lib/openscad/index.ts`
- `src/middleware.ts`
- `src/types/print-tasks.ts`
- `src/workers/stl-render-worker.ts`

Additionally, for maximum context, I recommend including:

- `src/lib/order-utils.ts`
- `src/lib/prisma/utils.ts`
- `src/lib/ai/prompts/prompt-system-optimized.txt`
- `src/lib/ai/prompts/prompt-user-template-optimized.txt`
- `src/app/login/page.tsx`

Please provide the content of these files. Once I have them all, I will create the `/IDEDocs` directory and the `IDE.md`
index as planned.
=======

# Y3DHub Project Context Files

This document serves as an index and high-level guide to the Y3DHub project codebase, with the detailed content of key
files stored in the `./IDEDocs` directory. This structure is designed to provide a comprehensive context for AI models
assisting with development tasks.

---

## Project Overview

Y3DHub is a modern Next.js application for managing 3D printing tasks and orders, featuring integrations with
ShipStation API, OpenAI-powered text extraction, and comprehensive task management for 3D printing businesses.

**Key workflows:**

- Order synchronization from ShipStation (with customer, product, and tag upsert)
- Print task generation (AI/LLM extraction, Amazon customization, review system)
- STL rendering (OpenSCAD, background worker)
- Task status management (pending → in progress → completed)
- Authentication (NextAuth.js, Prisma adapter)
- Frontend print queue and task management UI

---

## Directory and File Index

All files below are available in `/IDEDocs` with their full content for reference.

### Backend / Core Logic

- `prisma/schema.prisma` — Full database schema (Products, Orders, Customers, PrintOrderTask, etc.)
- `src/lib/orders/sync.ts` — ShipStation sync logic (orders, tags, single/recent/all)
- `src/lib/orders/mappers.ts` — Data mapping: ShipStation → Prisma schema
- `src/lib/orders/amazon/customization.ts` — Amazon customization fetch/parse logic
- `src/lib/order-processing.ts` — Order selection/filtering, fix invalid STL status
- `src/lib/openscad/index.ts` — OpenSCAD rendering helpers (STL generation)
- `src/lib/shared/database.ts` — Prisma client setup and helpers
- `src/lib/shared/logging.ts` — Logger utility
- `src/lib/shared/shipstation.ts` — ShipStation API re-exports and sync helpers
- `src/lib/shipstation/api.ts` — ShipStation API calls (orders, tags, item updates)
- `src/lib/shipstation/client.ts` — ShipStation Axios client setup
- `src/lib/shipstation/db-sync.ts` — ShipStation tag sync to DB
- `src/lib/shipstation/types.ts` — ShipStation API TypeScript types
- `src/lib/errors.ts` — Standardized API error handling
- `src/lib/server-only/auth-password.ts` — Password hashing/verification
- `src/lib/order-utils.ts` — Marketplace order number detection
- `src/lib/prisma/utils.ts` — Prisma field helpers

### AI/LLM Integration

- `src/lib/ai/prompts/prompt-system-optimized.txt` — System prompt for AI extraction
- `src/lib/ai/prompts/prompt-user-template-optimized.txt` — User prompt template for AI extraction

### Scripts / Automation

- `scripts/workflow.sh` — Main workflow automation script (sync, task gen, status update)
- `scripts/sync-orders.ts` — CLI: ShipStation order sync
- `scripts/populate-print-queue.ts` — CLI: Print task generation (AI/Amazon)
- `scripts/complete-shipped-print-tasks.ts` — CLI: Mark tasks as completed for shipped orders
- `src/workers/stl-render-worker.ts` — Background STL rendering worker

### Frontend / API

- `src/app/print-queue/page.tsx` — Print queue page (server-side)
- `src/app/print-queue/PrintQueueClient.tsx` — Print queue client component
- `src/components/print-queue-table.tsx` — Print queue table (task list)
- `src/components/print-task-detail-modal.tsx` — Task detail modal (edit/review)
- `src/app/api/print-tasks/bulk-status/route.ts` — API: Bulk update task status
- `src/app/api/sync/shipstation/route.ts` — API: Trigger ShipStation sync
- `src/app/login/page.tsx` — Login page
- `src/middleware.ts` — Next.js middleware (route protection)
- `src/types/print-tasks.ts` — Print task types for frontend

### OpenSCAD Models

- `openscad/DualColour.scad` — Main customizable tag/keychain model
- `openscad/DualColourNew2.json` — Parameter sets for DualColour.scad
- `openscad/RegKey.scad` — Car registration keyring model
- `openscad/iPhoneCable.scad` — Cable clip model

### Assets

- `public/logo.png` — Project logo (image, not included in text context)

---

## How to Continue

If you need to continue this context in a new chat, provide this file and the `/IDEDocs` directory (or the list above)
to the AI. If you add new files, update this index.

If you want to slim down the context, you can remove files from `/IDEDocs` and update this index accordingly.

---

## Next Steps

- If you want to generate a slimmed-down version, decide which files are essential for your daily workflow and remove
  the rest from `/IDEDocs`.
- If you want to add more context, add any missing files (see above for suggestions).
- If you want to generate documentation or code summaries, ask the AI to use this index and the `/IDEDocs` content as
