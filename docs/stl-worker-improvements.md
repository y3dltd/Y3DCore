# STL Render Worker: Improvements & Roadmap

## Quick Wins (Minutes – 1 Hour)
- **Environment flags:** Expose `MAX_RETRIES`, `CONCURRENCY`, `POLL_INTERVAL_MS`, `SKIP_IF_EXISTS`, `FORCE` as `process.env.*` (with sensible defaults). Makes tuning in prod/staging trivial.
- **Centralise SKU logic:** Move `supportedStaticSKUs` and `supportedPrefix` to `src/lib/sku-utils.ts`. Import in both `reserveTask` and `resetAllTasksToPending`.
- **Structured logging:** Replace scattered `console.*` calls with a logger (e.g., Pino or Winston, JSON output). Include `taskId`, `sku`, and iteration in every log line for grep-ability.
- **Graceful shutdown:** Trap `SIGINT`/`SIGTERM`; set a stop flag so `workerLoop` finishes the current iteration and `await prisma.$disconnect()` before exit. Prevents dangling DB connections.
- **Prisma `updateMany` vs raw SQL:** For `processTask` success/error updates, wrap `$executeRaw` in `try/catch` so a DB error doesn’t crash the worker.
- **Order status constant:** If `order_status` is an enum in Prisma, import it and use (e.g., `OrderStatus.awaiting_shipment`) to catch typos at compile-time.
- **Lint rule:** Enable `no-floating-promises` to flag fire-and-forget calls; at least `.catch(console.error)` them to avoid unhandled rejection crashes.
- **Concurrency:** Use `p-queue` or `Promise.allSettled` for concurrency in `workerLoop` instead of manual `activeTasks` bookkeeping.

## Medium Tasks (½–1 Day)
- **Move reservation logic:** Migrate task-reservation transaction into a Prisma stored procedure or DB event to remove two round-trips.
- **Replace polling:** Use a lightweight queue (e.g., Redis Lists or BullMQ) for pending tasks; worker blocks on `BLPOP` for efficiency.
- **File-system cache:** Use `fs.stat` once per directory, memoise results in memory for the iteration to reduce disk hits.
- **Metrics:** Add Prometheus client; counters for completed/failed tasks, histogram for render duration. Expose `/api/metrics` endpoint for Grafana.
- **Tests:**
  - Unit test `slug`, `getProductFolder`, `getAlphaFolder`.
  - Integration test for `processTask` using `sqlite:memory:` and mocked renderers.

## Long-term / Feature Ideas
- **Front-end integration:** Admin dashboard tile with queue depth, successes, failures, concurrency, last render duration. Add UI to trigger `--refresh` via API.
- **Auto-scaling:** If queue depth > N, spin up additional worker Pods (Kubernetes HPA based on Prometheus metric).
- **Abort/re-queue:** Store PID and start-time; if task runs > 15 min, mark as timeout and schedule retry.
- **Webhooks:** After successful render, enqueue ShipStation field update or email notification.
- **Move rendering to service:** Separate container with OpenSCAD/GPU; worker only orchestrates, uploads STL to S3, stores signed URL in DB.

---

These improvements will make the worker more fault-tolerant, observable, and easier to maintain. Let me know which items you’d like to tackle next for concrete code patches.
