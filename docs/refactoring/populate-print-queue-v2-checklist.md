# Checklist: Implementing and Testing `populate-print-queue-v2.ts`

This document outlines the remaining tasks and testing procedures required to complete the refactoring of the print queue population script (`populate-print-queue-v2.ts`).

**Status:** In Progress (Skeleton Created)

## I. Implementation Tasks

- **[ ] `orchestrator.ts` - Order Fetching:**
  - Replace the placeholder `getOrdersToProcessV2` function with robust logic adapted from the original `getOrdersToProcess` (likely found in `src/lib/order-processing.ts` - _needs verification_).
  - Ensure it correctly handles `--order-id` (DB ID, SS Order Number, SS Order ID) and `--limit`.
  - Implement `--force-recreate` logic (e.g., delete tasks for fetched orders _before_ calling `processSingleOrder`).
- **[ ] `aiProcessor.ts` - Prompt Modification:**
  - Refine the `userPromptInstructions` added within `extractPersonalizationWithAI` to clearly guide the AI on using `preProcessed` fields vs. original `printSettings`/`customerNotes`. Test this prompt thoroughly.
- **[ ] `scripts/populate-print-queue-v2.ts` - Pre-run Operations:**
  - Implement `--clear-all` functionality (with confirmation prompt).
  - Decide on and implement the best approach for `--force-recreate` (either in the entry script before fetching or passed down to the orchestrator).
  - Consider adding the `fixInvalidStlRenderStatus` call (or similar pre-run checks) if deemed necessary for this script version.
- **[ ] `scripts/populate-print-queue-v2.ts` - `--shipstation-sync-only` Mode:**
  - Decide if this mode is still required with the new V2 logic.
  - If yes, implement the specific logic path (likely calling `shipstationSync.syncAmazonDataToShipstation` or a similar dedicated function using _existing DB task data_ instead of fresh Amazon extractions). If no, remove the option.
- **[ ] Code Review & Refinement:**
  - Review all new modules for clarity, efficiency, error handling, and adherence to project standards.
  - Add comprehensive JSDoc comments to all new functions and types.
  - Ensure consistent and informative logging throughout.

## II. Testing Checklist

**Goal:** Verify all logic paths, options, and safeguards function correctly. Use `--dry-run` extensively before live tests. Use `--debug-file` for detailed investigation.

- **[ ] Basic Functionality (Non-Amazon Order):**
  - Run with `--order-id` for a non-Amazon order.
  - Verify: AI is called, DB tasks are created correctly based on AI output, ShipStation sync is _not_ attempted based on Amazon data.
- **[ ] Amazon Order - Successful URL Extraction:**
  - Run with `--order-id` for an Amazon order with a valid `CustomizedURL`.
  - Verify: `amazonExtractor` succeeds, AI receives pre-processed data, DB tasks are created based on AI output, `shipstationSync` updates ShipStation using the _direct Amazon extraction data_.
- **[ ] Amazon Order - Failed URL Extraction (e.g., bad URL, fetch error):**
  - Run with `--order-id` for an Amazon order with an invalid `CustomizedURL`.
  - Verify: `amazonExtractor` fails gracefully, AI receives original data, DB tasks are created based on AI output (or placeholder if AI fails), ShipStation sync uses _AI data_ as fallback.
- **[ ] Amazon Order - Missing URL:**
  - Run with `--order-id` for an Amazon order _without_ a `CustomizedURL` in `print_settings`.
  - Verify: `amazonExtractor` is skipped/returns 'Not Applicable', AI receives original data, DB tasks are created based on AI output, ShipStation sync uses _AI data_ as fallback.
- **[ ] `--dry-run` Flag:**
  - Run various scenarios above with `--dry-run`.
  - Verify: Logs indicate actions _would_ be taken, but no actual changes occur in the database or ShipStation.
- **[ ] `--preserve-text` Flag:**
  - Run with an order that has existing tasks, using `-f` (force recreate) and `--preserve-text`.
  - Verify: New tasks are created, but the `custom_text` field retains the value from the _original_ tasks, overriding the AI's suggestion (check logs/debug output). Verify this works for both successful AI runs and placeholder creation.
- **[ ] `--create-placeholder=false` Flag:**
  - Run with an order where AI is expected to fail or return no data, using `--create-placeholder=false`.
  - Verify: No placeholder task is created, appropriate warnings are logged.
- **[ ] Shipped Order Test:**
  - Run with `--order-id` for an order known to be "shipped" in ShipStation, where Amazon extraction _would_ succeed.
  - Verify: `shipstationSync` logs a warning and skips the update attempt. DB tasks should still be created/updated correctly.
- **[ ] Limit / Batch Processing:**
  - Run without `--order-id` but with `--limit`.
  - Verify: Correct number of orders are processed.
  - Run without `--limit` (on a safe dataset).
  - Verify: Script processes multiple orders correctly.
- **[ ] Error Handling:**
  - Simulate API failures (e.g., invalid OpenAI key, temporary network issues - may require code modification for testing).
  - Simulate DB transaction failures.
  - Verify: Errors are logged correctly, script exits gracefully (or continues to next order where appropriate), transaction rollbacks occur.

## III. Integration and Deployment

- **[ ] Update Workflow Scripts:**
  - Modify `scripts/workflow.sh` (or create `workflow-v2.sh`) to call `populate-print-queue-v2.ts` instead of the original script. Ensure all necessary arguments are passed correctly.
- **[ ] Update Crontab:**
  - Identify all crontab entries that execute the original `populate-print-queue.ts`.
  - Update these entries to point to `populate-print-queue-v2.ts`.
  - Verify cron schedules and arguments are still appropriate for the new script.
- **[ ] Final Production Deployment:**
  - After thorough testing and verification on a staging environment (if available), deploy the new script and modules to production.
  - Monitor initial production runs closely.
- **[ ] Deprecate/Remove Old Script:**
  - Once the new script is stable in production, consider renaming or removing the original `populate-print-queue.ts` to avoid accidental execution.
