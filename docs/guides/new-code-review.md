---
title: Code Review Process
last-reviewed: 2025-04-18
maintainer: TBD
---

# Code Review Process

Full code review focused on order‑sync, Amazon customisation, and print‑task logic under src/lib.
I group feedback by theme, then by file, and finish with concrete next‑steps.
────────────────────────────────────────
Cross‑cutting observations
────────────────────────────────────────
• File size / modularity
− orders/sync.ts (1 213 LOC) and shipstation/db-sync.ts (930 LOC) are far above the 300‑line guideline.
− They each mix API‑paging, progress tracking, domain mapping, DB upserts and metric logging.
→ Split into focused modules (e.g. customers/, products/, orders/, progress/, metrics/).
→ Keep “transactional” logic (one order + its items) in a separate pure function that is easy to unit‑test.
• Duplication
− upsertCustomerFromOrder, upsertProductFromItem, mapping helpers and date conversion are duplicated in orders/* and shipstation/*.
→ Move to lib/shared/{customers,products,mappers}.ts and re‑use.
• Type ownership
− ShipStation & Amazon types appear in multiple barrels. Expose them from one canonical lib/integrations/shipstation/types.ts and avoid type Foo = Prisma.Bar.
− Prefer interface over type for contracts you control (matches your custom instruction).
• Error handling
− Good use of structured logging, but failures that continue loops should escalate aggregated context to the caller.
− Consider a typed Result<T,E> utility to propagate errors without boolean flags.
• Concurrency / rate‑limits
− await is called inside for loops (serial). That’s safe for rate‑limits but slow when you are DB‑bound.
→ Adopt p‑map or a home‑grown semaphore to process items in parallel with e.g. concurrency = 5, still respecting ShipStation API delay.
• Testing
− No unit or integration tests found for these critical paths (except amazon/__tests__ folder but empty).
→ Add tests for:
1) mapping accuracy (mapSsItemToOrderItemData, date conversion)
2) idempotent upserts (unique constraints)
3) Amazon JSON extraction edge‑cases (colour tags, nested customisation).
• Logging
− Some string interpolation is expensive (template literals creating long messages) when log‑level is > info.
→ Guard heavy logs or use a logger that lazily evaluates.
• Environment / secrets
− API keys for ShipStation are not visible here—good—but make sure shipstationApi pulls from process.env and not userland import.
────────────────────────────────────────
File‑specific feedback
────────────────────────────────────────
A. orders/mappers.ts
✔ Clear pure functions, mostly side‑effect‑free.
✘ convertShipStationDateToUTC calls toDate inside a hot loop; cache SHIPSTATION_TIMEZONE parser or move conversion downstream only for persisted timestamps.
✘ consider returning undefined instead of null for absent optional fields to avoid Prisma JsonNull gymnastics and let .optional() schema handle defaults.
B. orders/sync.ts
• Large monolithic file; split per concern.
• upsertProductFromItem
− shipstation_product_id uniqueness conflict handled, but isNewProduct flag equals createdAt==updatedAt, which fails if DB triggers update timestamp. Better: check prisma.$transaction returns product.$transactionInfo?.wasCreated.
• Pagination loop
− while (page <= totalPages && success) is fine, but totalPages = Infinity until first page; if the first fetch errors out you waste a meaningless infinity loop guard.
• Metrics
− recordMetric is called only on success paths; wrap entire loop with try/finally to record global outcome.
• Dry‑run
− Good, but mocked objects have incomplete nullable fields some callers might later expect; consider a typed createMock<Customer>() helper.
C. orders/amazon/customization.ts
✔ Uses streaming unzip; good memory profile.
✔ Timeout via AbortController.
✘ isColourTag regex may mis‑detect “icoloration”; prepend \b(color|colour)\b.
✘ jsonFile[0]!.async (!) will throw if filtering returns empty; you already guard but do type‑narrow.
✘ allFields loops over top‑level keys only; nested structures are stringified as [object Object]. Consider flatMapKeys utility or persist JSON raw only.
✘ Not unit‑tested. Provide canned JSON fixtures.
D. orders/amazon/sync.ts
• Correctly supports targeted sync via orderId/itemId.
• findOrderItemsToProcess duplicates query logic across retries; extract.
• processOrderItem mixes IO (download), transform and DB; split into downloadFile, parseCustomization, persistResult.
• Missing concurrency control; simultaneous large downloads could thrash memory.
E. shipstation/db-sync.ts
• Very similar logic to orders/sync.ts; consolidate.
• generateSecureMockId presumably creates negative IDs for dry‑run; instead of fake IDs return null and adjust downstream code to handle optional customer.id.
• Uses relative imports like ../prisma that conflict with alias @/lib/... used elsewhere—standardise import strategy.
F. shipstation/index.ts
• Good barrel.
• Exposes both high‑level sync and low‑level clients; consider namespace separation to avoid accidental misuse.
────────────────────────────────────────
Suggested refactor plan
────────────────────────────────────────
Create new directories
src/lib/integrations/shipstation/{client,types,mappers.ts,upsert.ts}
src/lib/integrations/amazon/{customisation.ts,sync.ts}
src/lib/services/order-sync/{index.ts,progress.ts,metrics.ts}
Move duplicated upsert/mapping logic into shared pure modules; export small composable functions.
Replace giant sync.ts loops with orchestrators:
Apply to netlify.toml
Introduce p-limit (or own semaphore) for Amazon download & ShipStation item processing.
Add unit tests for pure helpers; stub Prisma with @prisma/client/runtime.
Adopt ESLint rule to prevent files > 300 LOC, deep nested try/catch, and duplicated code.
────────────────────────────────────────
Immediate quick‑wins
────────────────────────────────────────
• Extract duplicated upsertCustomerFromOrder into lib/shared/customers.ts.
• Replace Infinity placeholder with explicit let totalPages: number | null = null.
• Tighten isColourTag regex.
• Add npm run test amazon-custom with fixtures to guarantee parsing.
• Run ts-prune to drop unused exports (ShipStationTag etc.) and keep tree lean.
────────────────────────────────────────
Conclusion
────────────────────────────────────────
Overall the codebase shows thoughtful logging, dry‑run safeguards and clear domain mapping.
The primary areas to elevate it to production‑grade are (1) modularity, (2) eliminating duplication, (3) comprehensive tests, and (4) controlled parallelism for performance.
Applying the refactor plan in stages will improve maintainability, ease future features (e.g., other marketplaces), and align with your project’s clean‑code standards
