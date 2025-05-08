---
title: Command Reference
last-reviewed: 2025-04-18
maintainer: TBD
---

# Command‑Line Reference

This document enumerates all CLI entry points available in **Y3DHub**. Each command is defined in `src/scripts/` and uses **yargs** or **commander** for argument parsing.

> **Auto‑generated** – run `npm run docs:gen-commands` to refresh this table.

<!-- auto-table:start -->
| Command | Description | Script Path |
| --- | --- | --- |
| `npx tsx src/scripts/clean.ts` | Clean up project files and directories | src/scripts/clean.ts |
| `npx tsx src/scripts/cleanup-shipped-tasks.ts` | Finds and marks tasks as completed if their order is shipped/cancelled. | src/scripts/cleanup-shipped-tasks.ts |
| `npx tsx src/scripts/fix-status-mismatch.ts` | Check and fix mismatches between ShipStation order status and database order status. | src/scripts/fix-status-mismatch.ts |
| `npx tsx src/scripts/populate-print-queue.ts` | Fetch orders and create print tasks via AI. | src/scripts/populate-print-queue.ts |
| `npx tsx src/scripts/users.ts` | 'List all users', {}, async ( | src/scripts/users.ts |
<!-- auto-table:end -->

## Adding a New Command

1. Create your script in `src/scripts/<my-command>.ts` and export a `builder` from **yargs**.  
2. Add an npm script alias in *package.json* if it should be user‑facing.  
3. Run `npm run docs:gen-commands` and commit the updated table.
