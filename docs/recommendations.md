(---
title: Recommendations
last-reviewed: 2025-04-18
maintainer: TBD
---

# Recommendations

Repo snapshot analysed: 2025‑04‑17

    --------------------------------------------------------------------------------------------------------
    ---

    ## 1. 🚩 Critical Errors & Build Failures

    • src/scripts/populate-print-queue.ts : 1271 • TS2741 “Property ‘verbose’ is missing…”

        - const transactionOptions: ProcessingOptions = {
        -   dryRun: cmdOptions.dryRun,
        + const transactionOptions: ProcessingOptions = {
        +   dryRun: cmdOptions.dryRun,
        +   verbose: cmdOptions.debug,            // <-- add required field
            …

    • ESLint (blocking npm run lint) – 2 × any in customization.test.ts lines 42 & 63 → add explicit type.
    • Jest test file src/tests/print-tasks/update.test.ts is empty → Jest exits with failure flag on some CI
     set‑ups.
    • Prisma generate not run in CI; postinstall hook missing in Dockerfile → build fails in container
    images.
    • Netlify build: SESSION_PASSWORD length check logs error but still exits 0 → deployment continues in
    insecure mode (see §2).
    • Next.js warns about missing src/app/favicon.ico sizes; blocks production build with --strict flag.
    • TypeScript noImplicitReturns violated in 6 scripts (e.g. src/scripts/reprocess‑amazon‑colors.ts)
    causing tsc --strict failure.
    • ts-node/tsx invoked with absolute path /usr/bin/npx in server action; breaks Windows builds.
    • Tailwind v4 peer‑dependency conflict with PostCSS 8.4.39 raises “Unsupported engine” in fresh
    installs.
    • Jest config points to __mocks__/fileMock.js that does not exist – tests crash when components import
    images.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 2. 🔒 Security Vulnerabilities

        1. HIGH • CWE‑306 (Unauthenticated Endpoint) – `GET /api/orders` has no auth or tenant filter → any
    internet user can enumerate full order history.
           Mitigation: wrap `getCurrentUser()` check + market/user scoped `where` clause.
        2. HIGH • CWE‑862 (Missing AuthZ) – `PATCH /api/print‑tasks/[taskId]` verifies session but not task
    ownership → horizontal privilege escalation.
           Patch: join through user->orders to ensure requester owns the task.
        3. HIGH • CWE‑77 (Command Injection) – `runPopulateQueueForOrder()` builds a shell string with
    user‑controlled `orderIdOrNumber`. Although numeric/regex‑checked, an attacker can pass “123;rm -rf /”
    via crafted marketplace pattern. Use `spawnFile` with arg array or `execFile`.
        4. MED • CWE‑798 (Weak Secret) – `SESSION_PASSWORD` warning only logs; server still boots with
    <32‑char key enabling cookie tampering. Fail hard if invalid.
        5. MED • CWE‑307 (Brute‑Force) – Login route lacks rate‑limiting / account lockout. Add Redis‑backed
     limiter or `@fastify/rate‑limit`.
        6. MED • CWE‑311 (Transport Encryption) – ShipStation & Amazon clients default to HTTPS but do not
    set `strictSSL`; rejectUnauthorized=false could sneak in via axios default override. Explicitly set
    `httpsAgent`.
        7. LOW • CWE‑352 (CSRF) – API routes rely solely on same‑origin cookies; no CSRF token on
    state‑changing POST/PATCH routes.
        8. LOW • CWE‑209 (Information Exposure) – Detailed stack traces logged to `console.error` and
    returned in 500 JSON in `/lib/errors.ts`. Strip before response.
        9. LOW • CWE‑565 (Hard‑coded Credentials) – Example docs contain live `sk‑…` placeholders; scrub
    before public push.
        10. LOW • CWE‑330 (Insufficient Randomness) – `resetPasswordToken` helper (src/lib/utils.ts) uses
    `Math.random()` instead of crypto.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 3. 🐢 Performance Bottlenecks

    • populate-print-queue.ts (~1 600 LOC) loads all pending orders then processes sequentially – can take
    minutes. Suggest batching with Promise.allSettled (max concurrency = 5).
    • GET /api/orders does two separate queries for list & count; use Prisma $transaction([{…}, {…}])
    already – but still reads full count each call; cache count or use select count(*) OVER() if DB
    supports.
    • Amazon customization sync downloads ZIPs one‑by‑one; parallelize with p-limit.
    • React table re‑renders full list on every keystroke (debounce at 0 ms). Raise to 250 ms and memoize
    rows.
    • Large JSON logs written with fs.appendFile per loop → high I/O. Buffer per N records.
    • Missing DB index on print_order_task.status used in dashboards; add composite (status, updated_at).
    • Build time‑outs on Netlify due to Tailwind JIT scanning node_modules; add content exclude.
    • shipstationApi axios instance not re‑used across lambda invocations (cold‑start penalty). Move to
    top‑level module.
    • Unthrottled OpenAI calls risk rate‑limit errors; apply exponential backoff with openai-ratelimiter.
    • React embla-carousel not SSR‑friendly; lazy‑load on client only to shave 100 KB JS.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 4. 🗜️ Code‑Size & Duplication

    • 3 × similar Amazon color‑reprocess scripts – merge into single scripts/amazon/colors.ts with
    sub‑commands.
    • populate-print-queue.ts combines CLI parsing, AI prompt creation, DB writes; split into: parser,
    AI‑adapter, task‑service.
    • Repeated if (!user) return 401 blocks in API routes – introduce withAuth(handler) middleware.
    • Multiple inline regexes for marketplace order numbers; already extracted to order-utils.ts but older
    copies remain – delete dupes.
    • Dead file src/tests/print-tasks/update.test.ts.
    • Legacy duplicates of check-order.js vs check_order.js (underscore vs camel).
    • Style helpers (clsx, cva) scattered; centralise into ui/ util.
    • Numerous JSON fixtures in repo root; move to tests/fixtures/ or delete if unused.
    • 400‑line React components (print‑queue table) violate max‑length; refactor into sub‑components.
    • Several bash helpers (fix-imports.sh, update-headers.sh) can be replaced with eslint‑fix
    & lint-staged.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 5. 🎨 Style & Maintainability

    • Mixed import styles (absolute “@/…”, relative “../../”) within same folder – configure
    eslint-plugin-import/order.
    • 37 files with >120‑char lines; wrap for readability.
    • Inconsistent async error handling – some catch(console.error) without structured logger.
    • Unused vars flagged by TS 5’s exactOptionalPropertyTypes; enable noUnusedLocals.
    • Missing return‑type annotations in server actions (any).
    • CamelCase vs snake_case DB fields cause mapping confusion (shipstation_order_id). Add Prisma
    @@map/@map.
    • Components placed under app/ and components/; follow Next.js convention of colocated component
    folders.
    • props drilling in Print‑Queue pages; introduce context or TanStack query.
    • 20 % of CSS still in legacy .css instead of tailwind classes.
    • Docstrings absent on public util functions; adopt TSDoc.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 6. 🧩 Architectural Observations

    Textual diagram

        ┌ app (Next.js routes & pages)
        │   └─ api/ (REST endpoints) ──┐
        │                              │
        ├ components/ (UI)             │
        ├ lib/                         │
        │   ├─ auth (iron‑session)     │
        │   ├─ orders/                 │
        │   ├─ shipstation/            │
        │   └─ actions/ (server)       │
        ├ scripts/ (one‑off CLIs)      │
        └ prisma/ (ORM layer) ─────────┘

    Hotspots: populate-print-queue.ts (God‑object), API layer tightly coupled to Prisma models, duplicate
    marketplace logic.
    Suggested redesign:
    • Introduce domain‑layer services (OrderService, TaskService) to isolate DB.
    • Use command‑bus pattern for background jobs (BullMQ).
    • Swap bespoke shell scripts for dedicated worker queue.
    • Adopt feature‑based folder structure to improve cohesion.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 7. 🧪 Test‑Coverage Gaps

        1. No tests for `runPopulateQueueForOrder` happy‑path/command‑injection.
        2. Missing auth & authz tests (login, unauthorized access).
        3. No integration test for order → task creation flow (Amazon JSON → DB rows).
        4. ShipStation sync lacks contract test with mocked API.
        5. Critical AI prompt parsing not fuzz‑tested (edge JSON/HTML).
        6. No regression test for duplicate task creation on re‑run.
        7. Lacking db‑transaction rollback test on OpenAI failure.
        8. GET /api/orders pagination off‑by‑one case.
        9. React Print‑Queue renders not snapshot‑tested.
        10. Rate‑limit / brute force scenarios untested.

    --------------------------------------------------------------------------------------------------------
    ---

    ## 8. 🚀 Modernisation Opportunities

    • Replace raw child_process.exec with Node 20 child_process.execFile & promises.spawn.
    • Migrate Prisma to serverless driver (Data Proxy) for better cold‑start.
    • Use zod inference to auto‑generate TypeScript types for API schemas.
    • Adopt @nextui-org/theme + CSS variables, drop legacy CSS.
    • Enable Next.js App‑Router & React Server Components for heavy dashboard pages.
    • Swap custom logger for pino + transport to CloudWatch.
    • Integrate sentry for error capture, remove homemade handler.
    • CI: add GitHub Dependabot & npm audit --production.
    • Apply eslint --fix via lint-staged; enforce Prettier 3.
    • Use vitest instead of Jest for faster HMR & TS‑first testing.

    --------------------------------------------------------------------------------------------------------
    ---

    ## Executive Summary

    The codebase functions, but one TypeScript error and several ESLint violations currently block clean
    builds. More importantly, two unauthenticated/authorised API endpoints expose the entire order and task
    datasets, and a server‑side action builds shell commands from user input, making remote command
    execution feasible. Session security can also be bypassed if an operator forgets to set a strong secret.
     On the performance side, order‑processing scripts and dashboards run sequentially and synchronously,
    causing sluggish builds and page loads. The project would benefit from modularising a handful of
    1 000‑line files, consolidating duplicate scripts, and introducing unit/integration tests around
    authentication and order‑to‑task creation logic. Addressing the highlighted top issues will close
    critical security holes, cut build times, and pave the way for safer future feature work.
