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
- **Fixes**:
  - Rerun relevant sync scripts.
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
