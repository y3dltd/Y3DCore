# ---

# title: Cron Job Configuration

# last-reviewed: 2025-04-18

# maintainer: TBD

# ---

# Cron Job Configuration

This document provides the recommended cron job configuration for the Y3DHub system. These cron jobs ensure that the database is kept up-to-date with the latest orders and that print tasks are generated and cleaned up as needed.

## Key Points & FAQ (Why npm run full-workflow runs >1 hour? Timezone issues?)

**Q: Why does `npm run full-workflow -- --mode recent --hours 1 --skip-tags` appear to pull much more than 1 hour's worth of data?**

### A: Timezone Mismatch (ShipStation uses Pacific Time, You specify UTC/Local)

- **Root Cause:**
  - ShipStation API expects `modifyDateStart` in Pacific Time (`America/Los_Angeles`), while the workflow (`sync-orders` and background scripts) often interpret or calculate `--hours 1` as local server time (likely UTC in your environment).
  - **This results in the system fetching a wider time range**: for example, 1 hour back _in UTC_ actually covers up to 8 extra hours (or 7 during daylight savings) because Pacific Time is behind UTC.

**_Example_**:

- If it is 10:00 UTC (server time) and you specify `--hours 1` (i.e. 09:00 UTC), the API request for ShipStation becomes `modifyDateStart=09:00 UTC`, but **ShipStation interprets this as 09:00 Pacific!**
- ShipStation thinks you want all orders _since 09:00 Pacific Time_, so it returns far more data (08:00 or 07:00 hours difference).

**_Consequences_**:

- Your script then pulls up to 8 hours of orders instead of 1 hour.
- If run in a loop or successive cron, it overlaps or duplicates work, and appears to take much longer, especially when using small ranges (1 hour).

**Q: Is it a bug in the script?**

- **Not a fundamental bug, but a timezone awareness pitfall.** The code base tries to handle timezones carefully (see `docs/timezone-handling.md`), but if you specify UTC times, ShipStation expects Pacific Time for `.modifyDateStart` and interprets all date params as such.

## How to Fix or Mitigate

**1. Always consider timezones when supplying --hours/--days-back or modifyDateStart!**

- When you pass `--hours N` to the workflow, double-check how your script computes the actual filter time sent to ShipStation.
- Consider adjusting the code to convert UTC/local time → Pacific Time before setting `modifyDateStart`, or explicitly use a wider window (e.g., with a buffer).

**2. What does the workflow do?**  (Relates to resource/time usage)
The `npm run full-workflow` command, by default, performs these steps:

  1. Syncs orders from ShipStation (using `src/scripts/sync-orders.ts`). If you specify `--hours 1`, see above for possible over-pulling.
  2. Populates the print queue (AI & Amazon customization extraction).
  3. (Optionally) Cleans up print tasks.

**3. Adjust for ShipStation's Pacific Time**

- If editing code or manually syncing, use a time window in Pacific (e.g., `date -d '1 hour ago PDT' +%Y-%m-%dT%H:%M:%SZ`).
- **Or**, use a slightly larger window for reliability and filter duplicate orders _after_ fetching, but be aware you may process more than the expected number of orders.
- For guaranteed incremental sync: always store the last ShipStation order’s `.modifyDate` (in UTC) after each run, and use it as the next `.modifyDateStart` but **convert to Pacific Time** before querying.

## Reference Snippet from the sync script

You’ll see logic similar to:

```js
const SHIPSTATION_TIMEZONE = "America/Los_Angeles";
modifyDateStart = format(tz(sub(new Date(), { hours: N }), SHIPSTATION_TIMEZONE), "yyyy-MM-dd'T'HH:mm:ss")
```

But if your code only does UTC math, it will pull an unexpectedly large window.

## Quick TL;DR (for production operations)

- If you specify `--hours 1` (with UTC), ShipStation gives all orders since "that Pacific hour" (which is currently 7 or 8 hours behind UTC), resulting in over-pulling orders.
- **Convert your intended window to Pacific before running when using manual or one-off runs.**
- The best practice is always store and use the last processed ShipStation `.modifyDate` from the API, and use that (in Pacific) as your next filter.

## Example Config Correction (in crontab/new_crontab.txt)

```
# Sync recent orders every 10 minutes (looking back 2 hours)
*/10 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/sync-orders.ts --hours=2 >> $LOG_DIR/cron_sync_orders_recent_`date +\%Y\%m\%d`.log 2>&1
```

**This approach uses a _wider window (2 hours)_ per 10-minute interval, which covers timezone mismatches, API delays, and ShipStation idiosyncrasies.**
Any duplicated orders are de-duplicated by upsert logic in the sync script.

**Avoid running with strictly small `--hours N` values (e.g., 1) unless you are certain your server and ShipStation operate in the same timezone.**

## See Also

- [docs/timezone-handling.md] -- Full explanation of date handling in Y3DHub
- [docs/COMMAND_REFERENCE.md] -- Details of all flags and sync script
- [src/scripts/sync-orders.ts] -- Source code for main sync script

---

# Original Sample Crontab Block (for reference)

```
# Sync recent orders every 10 minutes (looking back 2 hours)
*/10 * * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/sync-orders.ts --hours=2 >> $LOG_DIR/cron_sync_orders_recent_`date +\%Y\%m\%d`.log 2>&1

# Sync orders from the past day, three times daily (6am, 2pm, 10pm)
0 6,14,22 * * * cd $Y3D_DIR && /usr/bin/npx tsx src/scripts/sync-orders.ts --days=1 >> $LOG_DIR/cron_sync_orders_daily_`date +\%Y\%m\%d`.log 2>&1
```

This configuration deliberately uses a larger window (`--hours=2` or `--days=1`) than your cron interval, to ensure any drift or overlap is covered.

---

# See also

- [docs/timezone-handling.md] for full details on ShipStation/UTC/Pacific Time logic
- [docs/COMMAND_REFERENCE.md] for flags explanation
- [src/scripts/sync-orders.ts] for sync logic
- [src/lib/orders/sync.ts] for time window calculation logic

---

# Summary Table

| Option/Flag         | Meaning in Y3DHub Script                               | Effect re: ShipStation     |
|---------------------|--------------------------------------------------------|----------------------------|
| `--hours N`         | Fetch orders back to N hours in your system time/UTC   | ShipStation interprets it as Pacific, so actual window is wider |
| `--days-back N`     | Fetch back N days in system time                       | Same as above, but with days |
| `--force-start-date`| Force fetch from a specific date/time                  | Should use Pacific timezone |
| _Recommended_       | Use a buffer (fetch a wider window than your cron period), and always upsert/deduplicate in your sync step |
