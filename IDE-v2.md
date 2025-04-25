# Y3DHub Project Context v2

This document provides a comprehensive, up-to-date index and context for the Y3DHub codebase, based on the _actual files
provided in this chat_. Use this as the authoritative context for AI-assisted development, onboarding, or documentation.

---

## Project Purpose

Y3DHub is a Next.js-based platform for managing 3D printing workflows, integrating with ShipStation for order import,
OpenAI for personalization extraction, and OpenSCAD for automated STL generation. It supports multi-marketplace order
management, print task tracking, and a review system for ambiguous or AI-extracted data.

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
- `src/scripts/order-sync.ts` — Legacy/alternative CLI for order sync
- `src/scripts/print-tasks.ts` — Print task management CLI
- `src/scripts/find-orders-without-print-tasks.ts` — Find orders missing print tasks
- `src/scripts/fix-status-mismatch.ts` — Fix order/task status mismatches
- `src/scripts/cleanup-shipped-tasks.ts` — Clean up shipped/cancelled tasks
- `src/scripts/get-order-customization.ts` — Amazon order customization fetch
- `src/scripts/manual-shipstation-update.ts` — Manual ShipStation update
- `src/scripts/reprocess-amazon-colors.ts` — Reprocess Amazon color data
- `src/scripts/review-existing-tasks.ts` — Review and update existing tasks
- `src/scripts/seed-test-user.ts` — Seed a test user
- `src/scripts/test-spapi-connection.ts` — Test Amazon SP-API connection
- `src/scripts/update-discrepant-tasks.ts` — Update tasks with AI/notes corrections
- `src/scripts/users.ts` — User management CLI
- `src/scripts/utils.ts` — Utility CLI

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

### Documentation

- `README.md` — Project overview, setup, and workflow instructions
- `docs/guides/code-structure.md` — Detailed code structure and module guide

---

## Core Workflows

1. **Order Synchronization**

   - CLI: `scripts/sync-orders.ts` or `src/scripts/order-sync.ts`
   - Fetches orders from ShipStation, upserts customers/products/items, and updates tags.
   - Uses `src/lib/orders/sync.ts`, `src/lib/orders/mappers.ts`, and ShipStation API helpers.

2. **Print Task Generation**

   - CLI: `scripts/populate-print-queue.ts`
   - Identifies eligible orders, extracts personalization (Amazon URL or AI), and creates/upserts print tasks.
   - Uses `src/lib/orders/amazon/customization.ts`, OpenAI prompts, and task creation logic.

3. **STL Rendering**

   - Worker: `src/workers/stl-render-worker.ts`
   - Continuously processes pending print tasks, generates STL files using OpenSCAD, and updates task status.

4. **Task Status Management**

   - CLI: `scripts/complete-shipped-print-tasks.ts`
   - Marks tasks as completed for orders marked as shipped.

5. **Frontend Print Queue**

   - Pages: `src/app/print-queue/page.tsx`, `src/app/print-queue/PrintQueueClient.tsx`
   - Table: `src/components/print-queue-table.tsx`
   - Modal: `src/components/print-task-detail-modal.tsx`
   - API: `src/app/api/print-tasks/bulk-status/route.ts`

6. **Authentication**
   - NextAuth.js with Prisma adapter (`src/lib/auth.ts`)
   - Login page: `src/app/login/page.tsx`
   - Middleware: `src/middleware.ts`

---

## How to Use This Context

- Reference this file and `/IDEDocs` for authoritative project context.
- For onboarding, debugging, or AI-assisted development, use the file index above to locate relevant logic.
- For documentation or code summaries, use the README and `docs/guides/code-structure.md`.

---

## Next Steps

- To slim down context, remove files from `/IDEDocs` and update this index.
- To add more context, add any missing files and update this index.
- For further documentation, see `/docs` and the README.

---

_This document and `/IDEDocs` together provide a full, navigable context for AI-assisted development on Y3DHub._
