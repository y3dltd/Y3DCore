# Amazon Order Color Processing

## Overview

This document outlines the process for handling Amazon orders with missing color information, including the scripts developed, workflow procedures, and recommendations for full end-to-end testing and diagnosing the workflow.

## Problem Statement

Some Amazon orders arrive with missing color information due to:
- CustomizedURL field missing in some orders
- Variations in JSON field naming in Amazon's customization data
- Inconsistent data extraction from Amazon's customization URLs
- Potential timing or timezone handling issues during sync/processing

This leads to incomplete orders in the print queue, tasks with missing colors in the DB, and potential fulfillment/shipping delays.

## End-to-End Testing & Diagnosis — Is the Full Workflow Working?

To fully check if the color and name customisations are propagating end-to-end (Amazon → DB → PrintTasks → ShipStation), and to diagnose potential issues (timezone, sync, ShipStation update delays):

### 1. **Check the Most Recent Data in the Database**

To check if the workflow is syncing recent orders (within the last 2 hours) and capturing personalization details, you can use the included diagnostic scripts:

#### a. **Check All Orders With Missing Colors**

Run:
```bash
npx tsx src/scripts/find-amazon-orders-with-missing-colors.ts
# Output: amazon-orders-missing-colors.json
```
This will list *all* Amazon orders/items/tasks still missing color1/color2 (and their taskIds, etc.). Check if orders within the last few hours are in this file; if so, they are either too new to be processed, or the workflow/data path is broken.

#### b. **Print Full DB Data for a Specific Amazon Order**

Use the diagnostic script:
```bash
npx tsx src/scripts/find-amazon-orders-with-missing-colors.ts
# Find your target orderId/orderNumber from output
# Then, check the DB Json with:
node check-database-order-customization.js  # or npx tsx src/scripts/check-database-order-customization.ts
```

#### c. **Directly Check a Single Order in Print Tasks Table**

Quickly check a single order's tasks:
- With `check-order.js`/`check-order.ts` (with your order number hardcoded)
- Or via Prisma Studio/DB tools
do:
```bash
node check-order.js # (edit it to match your order number)
```

This gives you a live snapshot of what your DB currently thinks the customizations for this order/item/task are.

### 2. **Test Amazon Customization Extraction (SP-API / URL)**

To check that Amazon Customization is being pulled (and if timezone handling affects whether "the latest" is fetched):

- Run `display-complete-amazon-order-data.js` (or `check-amazon-customization.js`)
- Review or save the API outputs (`amazon-order-complete-data.json`, etc.)
- Use `getOrderItems`/`getOrder` to ensure the Amazon SP-API returns the right set of order items and data.

If your test order/item data is present here *with* personalisation/color (or customizedURL pointing to a personalization zip), then the data *should* be possible to sync.

- To test Amazon Customization file extraction for a given item:
  - Use `fetchAndProcessAmazonCustomization(url)` in Node REPL / script, or re-run the batch color reprocessing script for just the target item

### 3. **Trigger a Full Manual Workflow for a Test Order**

**a. Force database and ShipStation update for a test order:**

```bash
npx tsx src/scripts/populate-print-queue.ts --order-id 026-5585200-4785105 -f --preserve-text
```
- This will force recreation of tasks, refetch Amazon URL if possible, and sync colors to ShipStation.
- `--preserve-text` helps retain the *name* if it was previously correct, guarding against AI overwrites.

**b. Manually Push DB Data into ShipStation Again:**
If some orders are not updating in ShipStation, but the DB is correct, you can trigger a direct sync:
```bash
npx tsx src/scripts/populate-print-queue.ts --order-id 026-5585200-4785105 --shipstation-sync-only
```
- This pushes what's currently in your DB to ShipStation item options.

### 4. **Check ShipStation UI (or Pull via API) For Updated Color/Names**

Go to the ShipStation web UI and check the order's item options:
- Are the colors and names present and correct?
- Is the timestamp of last modification recent? (If not, maybe the workflow isn't running as often as you think, or timezone is making you miss out-of-window orders)

**Note:** ShipStation can take a few minutes for updates to appear in the UI, and ignores updates for "shipped" orders.

### 5. **Check Your Cron/Automation for Timezone Issues**

- The crontab runs (in `crontab-config.txt`/`new_crontab.txt`) typically call `sync-orders.ts --hours=2`.
- This uses **UTC or server time**, but ShipStation API filters use Pacific Time for the `modifyDateStart`.
- Use recent local order timestamps to determine if your sync is pulling ALL the last 2 hours (cross-check the date/time math or add debug logs).
- If you notice orders from 2 hours ago are *not* updating, check (a) if the DB is missing the right orders (timezone mis-conversion), or (b) if print task creation is not catching them due to logic/skipped status.
  - Add debug logs to your worker scripts to print "processing order date xyz, comparing to last sync date abc"

## Color Reprocessing (Manual + URL)

To re-update ALL ShipStation items for orders with missing colors, the reprocess script is used:

```bash
npx tsx src/scripts/reprocess-amazon-colors.ts --dry-run
# To only update missing fields safely
npx tsx src/scripts/reprocess-amazon-colors.ts
# Use --generate-template and --use-manual-entries to fill in colors for stubborn/malformed orders
# See README.md for details
```

- **Safe:** Will only update print tasks where color_1 or color_2 is currently null, using AmazonURL or manual file.
- **ShipStation Sync included:** Script will push those changes to ShipStation at the item-level.

## Diagnosing Color/Name Not Updating in ShipStation

1. **If DB is updated, but ShipStation is NOT (and order is NOT shipped):**
   - Check print-queue script output/logs for API errors
   - Double-check `populate-print-queue.ts --order-id <order> --shipstation-sync-only`
   - Ensure print task holds correct data *and* that lineItemKey and orderId are correct
2. **If neither the DB nor ShipStation are updating:**
   - Check the `--hours=N` window logic in `sync-orders.ts` is pulling all expected orders from ShipStation (use verbose logging for debug)
   - Confirm the print task creation script *finds* the new/fresh order and doesn't skip it due to status/item filter logic
3. **If only the name is wrong after --force-recreate:**
   - Never use --force-recreate on live orders without --preserve-text, unless you want the AI to invent new names!
   - Always check AI output with --dry-run and --preserve-text before pushing live
4. **Timing:**
   - ShipStation API and database may be a few minutes behind each other. Give 5-10 minutes for update propagation.

## ShipStation "Already Shipped" Limitation

- **Once an order is shipped, ShipStation ignores subsequent updates to personalization fields!** Your script will notice, but the update will not propagate in the UI.

## Testing ShipStation Sync Before and After Shipping

- Always test your sync pipeline on a test order that is NOT shipped/fulfilled!
- For already shipped orders, you can still see updates in your local DB, but MUST mark new tasks/review externally.

## Full Debug Workflow

- Use all check scripts in `/home/jayson/y3dhubv3_copy/` (check-amazon-customization.js, check-database-order-customization.js, check-order.js)
- Use print-queue scripts in dry run, force-recreate, and preserve-text modes for diagnosis
- Always force a print/task/ShipStation refresh after confirming database data
- For naming issues: never update tasks with AI extraction unless you're certain the name field is needed to be replaced!

---

## Summary Table of All Scripts and Their Purpose

| Script/Utility                        | What It Does                                                               |
|---------------------------------------|----------------------------------------------------------------------------|
| find-amazon-orders-with-missing-colors.ts | List all Amazon orders/items with missing color info (Amazon → DB)         |
| reprocess-amazon-colors.ts            | Safe re-extraction of color info from Amazon URL or manual, updates DB+SS  |
| check-order.js / check-database-order-customization.js | Print all DB fields for a given order/item/task                   |
| populate-print-queue.ts --order-id ... [flags]| Force full refresh of print tasks for one order, updates DB + ShipStation |
| populate-print-queue.ts --shipstation-sync-only | Just send DB data to ShipStation (doesn't touch AI/URL/manual source)     |
| check-amazon-customization.js         | Show Amazon SP-API raw order/items data                                    |
| display-complete-amazon-order-data.js | Saves the full Amazon API order/items to file for review                   |
| check-order.js                        | Print DB task details for a specific order number                          |

## Best Practice: When Color Not Updating

- 1. Confirm order is still NOT shipped on ShipStation
- 2. Inspect DB via check-order.js (should show newest data)
- 3. If DB missing color → use reprocess-amazon-colors or full print-queue force-recreate
- 4. If DB has color but ShipStation doesn't: run populate-print-queue with --shipstation-sync-only
- 5. If AI is about to update name field, run with --preserve-text
- 6. If completely stuck: create an entry in manual-color-batch.json/template and re-run with --use-manual-entries

## Future Improvements

See main section in this file and also FUTURE_IMPROVEMENTS.md.

- Add logging of all inbound modification dates and sync times
- Add last-modified check to determine if timezone math is correct
- Consider forcing periodic full historical sync as backup
- Add dashboard or UI tools for checking/enforcing latest state
- Add warning if sync running out-of-window due to DST errors

---

If you follow this process you can fully trace every step:
- Amazon → item print_setting/CustomURL → parsed color/name
- → DB printTasks reflects correct colors/names
- → ShipStation item options get updated with the same
- → UI displays correct personalization to packing staff, customer, etc.

With the above scripted checks, you can isolate whether the problem is:
- ShipStation API window (timing/progress/modifyDateStart)
- Amazon data not available (URL is not present/JSON malformed)
- DB missing color due to script logic
- ShipStation not refreshing due to order being shipped
- AI/overwrite affecting the name field
- Or combination of the above.

If you need to test any step manually, all test/check scripts are already in your repo under /home/jayson/y3dhubv3_copy/.