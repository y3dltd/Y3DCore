# Troubleshooting Guide

This document provides guidance for diagnosing and fixing common issues in Y3DHub.

## Common Issues

### Script Failures

- **Symptom**: A script (e.g., `amazon-customization.ts`) fails to run or exits with an error.
- **Diagnosis**:
  - Check the script logs (e.g., `$LOG_DIR/cron_amazon_workflow_*.log`).
  - Run the script manually with `--verbose` for more details.
  - Check database connectivity.
  - Verify environment variables (`$Y3D_DIR`, `$LOG_DIR`).
- **Fixes**:
  - Correct any configuration errors.
  - Address database issues.
  - Consult specific script documentation (e.g., `docs/Amazon/AMAZON_CUSTOMIZATION_UNIFIED_SCRIPT.md`).

### Data Discrepancies

- **Symptom**: Data in the UI or database doesn't match the source (e.g., ShipStation, Amazon).
- **Diagnosis**:
  - Check script logs for sync errors.
  - Manually compare data between systems.
  - Investigate timestamp conversion issues (see `docs/timezone-handling.md`).
  - **Print Tasks Pending for Shipped Orders**: If print tasks remain `pending` or `in_progress` even after the corresponding order is marked `shipped` in the database, this might have been due to an older version of the `fix-status-mismatch.ts` script.
- **Fixes**:
  - Ensure you are using the latest version of `fix-status-mismatch.ts` (updated April 17, 2025 or later).
  - Run the dedicated cleanup script: `npx tsx src/scripts/cleanup-shipped-tasks.ts` (use `--dry-run` first).
  - Alternatively, run the full workflow: `./scripts/workflow.sh` (use `--dry-run` first).
  - Rerun relevant sync scripts (`sync-orders.ts`).
  - Use fix commands if available (e.g., `amazon-customization.ts fix`).
  - Manually correct data if necessary.

### UI Errors

- **Symptom**: Errors or unexpected behavior in the web interface.
- **Diagnosis**:
  - Check the browser's developer console for errors.
  - Check the Next.js server logs.
  - Verify API endpoint responses.
- **Fixes**:
  - Clear browser cache.
  - Restart the Next.js server.
  - Debug frontend code.

[Add more common issues and troubleshooting steps.]

## Debugging Tools

- Verbose logging (`--verbose` flag in scripts)
- Dry runs (`--dry-run` flag in scripts)
- Browser developer tools
- Database query logs
- Specific order processing (`--order-id` flag)

## Deploying to Netlify via CLI

1. Install the Netlify CLI if you haven't already:

   ```bash
   npm install -g netlify-cli
   ```

2. Login to Netlify:

   ```bash
   netlify login
   ```

3. **Build your site (if required):**

   - For most frameworks (like Next.js, React, etc.), run:
     ```bash
     npm run build
     ```
   - Make sure the output directory matches your Netlify settings (e.g., `out`, `build`, or `.next`).

4. Deploy your site (from your project root):

   ```bash
   netlify deploy
   ```

   - For production:
     ```bash
     netlify deploy --prod
     ```

5. Follow the prompts to select your site or create a new one.
