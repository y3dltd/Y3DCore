# Deprecated Scripts

This document lists scripts that were part of the Y3DHub system but have been superseded by the consolidated scripts (`src/scripts/order-sync.ts`, `src/scripts/print-tasks.ts`, `src/scripts/utils.ts`) as outlined in `TODO_V2.md`. Their descriptions are kept here for historical reference during the transition.

## Order Synchronization (Superseded by `src/scripts/order-sync.ts`)

### sync-orders.ts (Original in `src/scripts/`)

**Purpose**: Synchronized orders from various marketplaces (eBay, Etsy, Amazon, Shopify) to the Y3DHub database.
**Usage**: `npm run sync-orders -- [options]`
**Options**: `--hours`, `--days`, `--force-update`, `--marketplace`, `--order-id`, `--dry-run`
**Logging**: To `logs/sync-orders-YYYY-MM-DDTHH-MM-SS.log`

## Print Task Management (Superseded by `src/scripts/print-tasks.ts`)

### populate-print-queue.ts (Original in `src/scripts/`)

**Purpose**: Analyzed orders and created print tasks for personalized items using AI. Processed 'awaiting_shipment' orders.
**Usage**: `npm run populate-queue -- [options]`
**Options**: `--limit`, `--order-id`, `--force-recreate`, `--create-placeholder`, `--clear-all`, `--dry-run`, `--debug`
**AI Integration**: Used OpenAI's GPT-4o-mini.
**Logging**: To `logs/populate-print-queue-YYYY-MM-DDTHH-MM-SS.log` and database AI logs.

### cleanup-print-tasks.ts (Original likely in `scripts/maintenance/`)

**Purpose**: Found and marked as completed pending/in-progress print tasks for shipped/cancelled orders.
**Usage**: `npm run cleanup-print-tasks -- [options]`
**Options**: `--dry-run`, `--verbose`
**Logging**: To console.

## Monitoring and Maintenance (Superseded by `src/scripts/utils.ts`)

### check-ai-logs.ts (Original likely in `scripts/utils/` or `scripts/analysis/`)

**Purpose**: Checked AI call logs in the database for debugging and monitoring.
**Usage**: `npx tsx scripts/check-ai-logs.ts`
**Output**: Stats on AI calls.

### ai-usage-stats.ts (Original likely in `scripts/utils/` or `scripts/analysis/`)

**Purpose**: Generated statistics on AI usage for monitoring and billing.
**Usage**: `npx tsx scripts/ai-usage-stats.ts`
**Output**: Daily AI usage stats.

## Cron Job Configuration (Superseded by configuration in `TODO_V2.md`)

The original `SCRIPTS.md` contained cron job examples for the individual scripts. These are now replaced by the consolidated cron jobs targeting the new unified scripts.
