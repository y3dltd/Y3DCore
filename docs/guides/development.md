---
title: Development Guide
last-reviewed: 2025-04-18
maintainer: TBD
---

# Development Guide

This guide explains how to set up a local development environment, follow the team's coding standards, and contribute effectively to **Y3DHub**.

## Prerequisites

| Tool            | Version  | Notes                       |
| --------------- | -------- | --------------------------- |
| Node.js         | 18.x     | `nvm install 18` recommended|
| npm             | 9.x+     | Project uses **npm**        |
| MySQL           | 8.x      | Accessible locally or via Docker |
| Git             | 2.40+    | Standard CLI                |
| PNPM / Yarn     | _Not required_ | The repo is locked to **npm** |

## Initial Setup

```bash
# 1. Clone
 git clone <repo-url> && cd y3dhub

# 2. Install deps (Post‑install runs `prisma generate` automatically)
 npm ci

# 3. Environment
 cp .env.example .env   # then edit credentials

# 4. Database (local MySQL)
 npx prisma migrate deploy     # apply schema
 npx prisma generate           # ensure client types
```

> **Docker users** – use `docker compose up -d db` if you have a compose file; adjust `DATABASE_URL` accordingly.

## Running the App

```bash
# Dev server (port 3002 per package.json)
npm run dev

# Background workers (optional, separate terminal)
# – STL render worker example
npm run worker:stl
```

Hot‑reload is enabled for both **Next.js** pages and **tsx** scripts.

## Core Scripts

| Command                          | Purpose                                         |
| -------------------------------- | ----------------------------------------------- |
| `npm run sync-orders -- ...`     | Sync orders from ShipStation                    |
| `npm run populate-queue -- ...`  | Generate print tasks                            |
| `npm run full-workflow -- ...`   | End‑to‑end: sync → queue → cleanup              |
| `npm run clean`                  | Remove build/cache artefacts                    |
| `npm test`                       | Unit tests via **Vitest**                       |

👉  See [Reference → Commands](../reference/commands.md) for full flag lists.

## Coding Standards

1. **ES Modules** – `"type": "module"` in *package.json*. Use `import`/`export` only.
2. **Functional Style** – Prefer pure functions. Avoid classes unless interop forces them.
3. **TypeScript Strictness** – `noImplicitAny`, `exactOptionalPropertyTypes`, `strictNullChecks` are on. Fix red squiggles before commit.
4. **Naming** – Kebab‑case folders (`print-tasks/`), camelCase variables (`shipstationStoreId`).
5. **File Size** – Soft limit 300 LOC. Split large scripts (see ongoing refactor).
6. **Logging** – Use `src/lib/logger.ts` (Pino) – never `console.log` in production code.
7. **Error Handling** – Throw **typed** errors or return `Result<T, E>` (see `src/lib/errors.ts`).

## Project Structure Cheat‑Sheet

```
src/
  app/            # Next.js routes & pages (App Router)
  components/     # Re‑usable UI components (shadcn/ui)
  lib/
    orders/      # Order domain logic (sync, mappers, utils)
    print-tasks/ # Task creation/cleanup (in refactor)
    shared/      # Logger, metrics, ShipStation client, etc.
    ai/          # AI prompt builders & helpers
  scripts/        # CLI entry points (sync-orders.ts, populate-print-queue.ts, ...)
  workers/        # Long‑running background jobs (STL renderer)
```

## Git Hooks & Linting

`husky` + `lint-staged` run **ESLint** & **Prettier** on commit:

```bash
npm run lint           # lightweight – for staged files only
npm run lint:full      # deep scan of src/
```

Fixes can be auto‑applied:

```bash
npm run lint:fix
```

Markdown files are checked in CI via **markdownlint-cli**; update front‑matter `last-reviewed` when you touch docs.

## Testing

```bash
# Unit tests + coverage
npm run test:coverage

# Playwright E2E (optional)
npm run test:e2e
```

Vitest config lives in `vitest.config.ts`. For fetch mocks use `vitest-fetch-mock`.

## Database Tips

* **Studio** – `npx prisma studio` for a local GUI.
* **Reset**  – `npx prisma migrate reset` wipes & re‑seeds.
* **Migrations** – `npx prisma migrate dev --name <change>`; never edit SQL by hand.

## Common Pitfalls

| Problem                                 | Fix |
| --------------------------------------- | ------------------------------------------------------------ |
| Orders out of timezone window           | Use `--hours` not `--days-back` and check server UTC offset. |
| Print task duplicates after re‑run      | Use `--force-recreate` or clear `PrintOrderTask` table.      |
| STL worker failing silently             | Increase `logger` level to `debug`; check `system_logs`.     |

## Updating Docs

All docs live under `docs/`. Every change **must** update the `last-reviewed` field.

## Next Steps

*Run `npm run full-workflow -- --dry-run` to verify your setup without touching ShipStation.* 
