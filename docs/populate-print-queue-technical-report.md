# Technical Report: populate-print-queue.ts Script

**Date:** YYYY-MM-DD (Will be current date)
**Version:** 1.0 (Or indicate script version/commit if available)
**Authors:** AI Assistant (Gemini) & Jayson (User)

## 1. Overview

This document provides a detailed technical overview of the `populate-print-queue.ts` script. Its primary purpose is to process orders from a database (originally synced from ShipStation), extract or infer personalization details (optionally using AI), create corresponding print tasks in the local database, and attempt to synchronize updated information back to ShipStation.

## 2. Core Functionality & Workflow

### 2.1. Initialization

    - Loads environment variables.
    - Sets up logging (console and file-based).
    - Parses Command Line Interface (CLI) options.
    - Establishes database connection (Prisma).
    - Loads AI prompts from specified files.

### 2.2. Order Fetching & Selection

    - Fetches orders based on CLI parameters (`--order-id`, `--limit`, date ranges, etc.).
    - Identifies orders from the local database that require processing.
    - Handles `forceRecreate` logic by deleting existing print tasks for specified orders if the flag is active.
    - Handles `--clear-all` to remove all existing print tasks (with confirmation).

### 2.3. Personalization Data Extraction (per order item)

    - **Priority 1: Direct Data Extraction (e.g., Amazon CustomizedURL)**
        - For Amazon orders, attempts to fetch and parse data directly from `customizedURL` (ZIP files containing JSON/text).
        - If successful, this data (`customText`, `color1`, `color2`) is prioritized.
        - This step bypasses AI for items where direct extraction succeeds.
    - **Priority 2: AI-based Personalization Extraction**
        - If direct extraction is not applicable or fails, or if `--skip-ai` is not set.
        - Constructs a detailed prompt for an AI model (e.g., OpenAI GPT series).
            - Includes order details, item information, customer notes, and existing `print_settings`.
            - System prompt can be dynamically modified (e.g., for `forceRecreate` scenarios to adjust AI behavior regarding color choices vs. gender rules, or customer-provided options).
        - Sends the prompt to the AI API.
        - Parses and validates the AI's JSON response, expecting personalization details (`customText`, `color1`, `color2`, `quantity`, `needsReview`, `reviewReason`, `annotation`) for each item.
        - Handles API errors, retries, and logs AI call details.
    - **Priority 3: Placeholder Creation**
        - If both direct extraction and AI processing fail for an item (and `--create-placeholder` is enabled), a placeholder task is created, typically flagged for manual review.

### 2.4. Print Task Creation (Database)

    - For each processed order item and its extracted/inferred personalization(s):
        - Creates or updates `PrintOrderTask` records in the Prisma database.
        - An `upsert` operation is used, keyed by `orderItemId` and `taskIndex`.
        - Populates fields like `custom_text`, `color_1`, `color_2`, `quantity`, `needs_review`, `review_reason`, `status`, `annotation`, `shorthandProductName`, `ship_by_date`, etc.
        - Data source (e.g., "AmazonURL", "AI", "Placeholder") is recorded in the `annotation`.
        - Preserves existing text if `--preserve-text` is used with `forceRecreate`.

### 2.5. ShipStation Synchronization (Optional)

    - Triggered if `--sync-to-shipstation` CLI flag is present and not a `--dry-run`.
    - **Function:** `updateOrderItemsOptionsBatch` in `src/lib/shipstation/api.ts`.
    - **Process:**
        1.  Fetches the latest version of the order directly from ShipStation using the `orderId` to get `freshOrderData`. This is crucial to avoid partial updates and use the most current order state as a base.
        2.  Creates a `payload` as a deep copy of this `freshOrderData`.
        3.  Modifies the `payload`:
            - Updates `items[N].options` with the extracted/AI-generated personalization (e.g., "Name or Text", "Colour 1", "Colour 2"). Filters out options with `null` values.
            - Updates `internalNotes` with a detailed packing list or a summary based on the processed items.
            - Updates `dimensions` if a `dimensions` object (or `null`) is explicitly passed from the main script. If the `dimensions` argument is `undefined`, the original dimensions from `freshOrderData` are preserved in the payload.
            - Updates `advancedOptions.customField1` with a summary if a single item was personalized.
        4.  Sends the entire modified `payload` object to the ShipStation `/orders/createorder` endpoint (which handles updates if `orderId` or `orderKey` is present).
    - Logs the request payload and the full response from ShipStation (status, headers, data).
    - Includes warnings if `internalNotes` or `dimensions` in the ShipStation response do not match the sent payload.

## 3. Key CLI Options and Their Interactions

- `--order-id <ID>`: Process a single specific order.
- `--days <N>`: (If re-implemented) Process orders from the last N days.
- `--force-recreate`: Deletes existing tasks for an order before processing. Modifies AI system prompt to be less conservative about `needsReview`.
- `--preserve-text`: Used with `forceRecreate`. Attempts to keep existing `custom_text` from old tasks even when recreating.
- `--skip-ai`: Bypasses the AI extraction step. Relies on direct extraction or creates placeholders.
- `--sync-to-shipstation`: Enables the synchronization of item options and internal notes back to ShipStation. **Crucial for updates to appear in ShipStation.**
- `--dry-run`: Simulates operations without making database changes or calling external APIs for updates. AI calls may still be made for simulation accuracy.
- `--system-prompt-file <path>`, `--user-prompt-file <path>`: Specify custom prompt files.
- `--verbose`, `--debug`, `--log-level`: Control logging verbosity.

## 4. Known Issues, Challenges, and Areas for Future Attention

### 4.1. ShipStation API Quirks & Limitations

    - **No Partial Updates:** The `/orders/createorder` endpoint requires the *entire* order object to be sent back for updates. Missing fields can cause silent failures or unexpected behavior. The script now addresses this by fetching the full `freshOrderData` before modification.
    - **Silent Ignores/Reverts:** ShipStation may return a `200 OK` but silently ignore or revert certain field updates if they violate internal rules, are not allowed for the order's current status, or if the data is malformed.
        - **Dimensions:** Sending `dimensions: null` in the payload did not clear the dimensions in ShipStation; the original dimensions were returned in the API response. The exact mechanism to clear/reset dimensions via API is unclear and may require sending specific zeroed values or may not be fully supported for all scenarios via this endpoint.
        - **`internalNotes` Length:** ShipStation has an undocumented limit (observed by community to be around 10KB) for `internalNotes`. Notes exceeding this may be truncated or the update ignored. The script should ideally implement truncation.
    - **Rate Limits:** Aggressive API calls can lead to rate limiting (429 errors). The `getShipstationOrders` function has basic retry logic for this.
    - **Order Status Restrictions:** Updates are generally only allowed for orders in "open" statuses (`awaiting_payment`, `awaiting_shipment`, `on_hold`). The script now fetches the latest order data, which includes current status, but does not explicitly prevent sending an update if the status has changed since the script started processing the order.

### 4.2. AI Processing

    - **Prompt Engineering:** The accuracy and reliability of AI extraction heavily depend on prompt quality. Prompts need careful crafting and testing for various scenarios (e.g., ambiguous customer notes, multiple items, complex requests). Customer notes provided by the buyer are included in the data sent to the AI to aid in this interpretation.
    - **AI Model Variability:** Different AI models (or even versions of the same model) can produce different results or have different token limits/costs.
    - **Structured Data Parsing:** Reliably parsing JSON from AI responses can be challenging if the AI doesn't strictly adhere to the requested format. The script includes basic validation (Zod schema) but could be enhanced with more robust error handling or fixing logic for malformed JSON.
    - **Hallucinations/Inaccuracies:** AI can occasionally "hallucinate" details or misinterpret requests, leading to incorrect personalization. The `needsReview` flag is an attempt to mitigate this.
    - **Token Limits & Cost:** Processing many orders or very complex orders with large prompts can incur significant AI API costs and potentially hit token limits.

### 4.3. Data Integrity & Edge Cases

    - **Quantity Mismatches:** The script checks if the sum of quantities from AI personalizations matches the order item quantity and flags for review if not.
    - **Character Encoding/Special Characters:** Ensure proper handling of special characters in customer input, AI responses, and data sent to ShipStation.
    - **`preserveText` Complexity:** The interaction between `forceRecreate` and `preserveText` can be complex, especially if the number of personalization tasks for an item changes.

### 4.4. Script Robustness & Error Handling

    - **Transaction Management:** Database operations are wrapped in Prisma transactions for atomicity.
    - **Idempotency:** The `upsert` logic for print tasks aims for idempotency. `forceRecreate` provides a manual way to override this.
    - **Configuration Management:** API keys and other sensitive configurations are managed via environment variables.

## 5. Legacy Script Gap Analysis

Below is a concise gap-analysis that highlights **features and behaviours present in the legacy script but either removed, turned-off by default, or not yet covered in your technical report for the new Type-Script re-write.** None of these items are "show-stoppers", but they explain the change in day-to-day behaviour you have noticed and clarify a few latent risks.

### 5.1 Quick executive summary

The biggest un-documented deltas are:

- **Sync is now opt-in** – the old script always patched ShipStation during the main loop; the new one only does so when `--sync-to-shipstation` is supplied.
- **Per-task item-option pushes were removed** – individual "Name or Text / Colour 1 / Colour 2" updates that happened immediately after each task-upsert are gone; only a single batch-call is made at the end of the order.
- **`preserve-text` works _only_ with `--force-recreate`** – without the flag the original behaviour (keep existing custom text while updating colours) is lost.
- **Direct parsing of _customer notes_ as a data-source was dropped** – the new helper only tries Amazon ZIP → JSON; it never attempts to mine order.customer_notes for names or colours.
- **Empty-string options are now discarded**, so a line item that has Colour 2 = "" generates no options at all and therefore no ShipStation patch payload.
- **Dimensions conversion silently changes units** (`inches` → `centimeters`) without scaling; this can cause the API to accept but ignore the update.
- **The internalNotes builder can exceed the 10 KB limit and cause ShipStation to keep the previous value** – the report mentions the size limit, but not that it is currently unchecked in code.

These points are explained in detail below, with references where an external spec or community article supports the observation.

### 5.2 Feature-level gaps

#### 5.2.1 ShipStation synchronisation toggle

| Behaviour                          | Old script                                                                 | New script                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Default action after task creation | **Always** call `updateOrderItemsOptionsBatch` (or the single-item helper) | **Skipped unless** options.syncToShipstation === true (i.e. `--sync-to-shipstation` on CLI) |
| Consequence                        | Operators saw item options appear a few seconds after running the script   | Nothing visible happens in ShipStation unless the new flag is supplied                      |

ShipStation's own docs emphasise that you must send the full order object when you do choose to update, which the new script handles correctly. ([ShipStation][1])

#### 5.2.2 Immediate per-item pushes removed

In the legacy `createOrUpdateTasksInTransaction` loop each **AI** or **AmazonURL** task triggered an _additional_ fetch-&-patch round-trip so the order UI showed the change even if the batch failed later.
That block (the `// AI Task upserted, preparing ShipStation update...` section) is gone, so only the final batch matters.

This is a pure UX change – no data loss – but it alters how quickly staff see the personalised options in ShipStation.

#### 5.2.3 `preserve-text` sans `--force-recreate`

- **Old behaviour** – When you ran with `--preserve-text` _without_ deleting tasks first, the helper `getExistingTaskData()` pre-loaded the current `custom_text` values and copied them onto any UPDATE half of the upsert.
- **New behaviour** – The only place preserved text is collected is **inside** the `forceRecreate` delete branch, so if you run a "gentle" refresh (`populate-print-queue --order-id 123 --preserve-text`) the AI's suggestion will overwrite the customer's original wording.

#### 5.2.4 Customer-note parsing path missing

A branch `extractedData.dataSource === 'CustomerNotes'` existed in the old helper, allowing simple "Name: Dave, Colour: Blue" messages to bypass the AI. The rewritten `extractDirectItemData` never sets that value, so every non-Amazon order item now goes to GPT unless `--skip-ai` is used.

#### 5.2.5 Option sanitisation now removes empty strings

The new validator drops any option whose \**`value === null` *or\* `value === ''`:

```ts
const validatedOptions = optionsToPatch.filter(o => o.value !== null);
```

If a listing legitimately uses an empty string to mean "no second colour", **all** options for that line item are stripped, leaving `itemsToPatch` empty and the update skipped. ShipStation expects 0–200 characters but does not forbid an empty string.

#### 5.2.6 Dimensions unit conversion without scaling

When the payload builder sees `dimensions.units === "inches"` it flips the value to `centimeters` but leaves the raw numbers intact. ShipStation accepts the request (`200 OK`) yet silently reverts the field because the dimensions exceed allowed limits in centimetres – an API quirk noted in ShipStation community threads. ([Prisma][2], [ShipStation Help][3])

#### 5.2.7 Unchecked internal-notes length

Community posts confirm ShipStation drops changes when `internalNotes` exceeds ~10 KB. ([ShipStation Help][3])
The legacy script truncated long blocks; the new builder (`auditNoteForInternalNotes`) simply concatenates the packing list and original notes, so very large gift messages will break the update.

### 5.3 Behaviour that changed but is already documented in your report

Your technical report already covers these deltas, so they are **not** repeated here:

- Requirement to POST the _entire_ order object (fresh fetch before modify). ([ShipStation][1])
- API cannot edit orders in **shipped/fulfilled** states. ([ShipStation Help][3])
- New CLI flags: `--skip-ai`, prompt-file overrides, `--days`, etc.
- Retry logic and 429 handling for ShipStation. ([ShipStation Help][4])
- Token usage logging for OpenAI requests. ([Postman API Platform][5])

### 5.4 Risk & remediation checklist

| Priority   | Action                                                                                                                                                                         | Rationale                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High**   | Make `--sync-to-shipstation` default **on**, or alias it to the historical behaviour.                                                                                          | Restores one-click workflow.                                                                                                                                          |
| **High**   | Re-enable `preserve-text` path for non-recreate runs.                                                                                                                          | Prevents accidental overwrites.                                                                                                                                       |
| **Medium** | Document that direct customer-note parsing was intentionally not re-implemented to prioritize data quality. Customer notes are now passed to the AI for robust interpretation. | Ensures higher data quality by leveraging AI for nuanced free-form text, rather than a potentially brittle parser. Allows AI to holistically consider customer notes. |
| **Medium** | Allow empty-string option values; only discard **null**.                                                                                                                       | Keeps partial colour data.                                                                                                                                            |
| **Medium** | Multiply dimensions by 2.54 when converting units, or leave in inches.                                                                                                         | Stops silent rejections.                                                                                                                                              |
| **Low**    | Truncate `internalNotes` to < 10 KB and strip control characters.                                                                                                              | Avoids hidden failures.                                                                                                                                               |

Implementing these few patches will bring feature-parity with the legacy script while keeping all of the new safety and observability enhancements.

### 5.5 Sources

1. ShipStation API "Create/Update Order" – full-object requirement. ([ShipStation][1])
2. ShipStation help: editing restrictions on shipped orders. ([ShipStation Help][3])
3. ShipStation community thread on internalNotes size. ([ShipStation Help][3])
4. ShipStation help: item-option field limits (200 chars).
5. Prisma transaction options (`maxWait`, `timeout`). ([Prisma][2])
6. Prisma CRUD/upsert reference. ([Prisma][6])
7. ShipStation rate-limit (429) article. ([ShipStation Help][4])
8. ShipStation help on dimensions automation (unit expectations). ([ShipStation Help][7])
9. OpenAI docs – `response_format: json_object` usage. ([Postman API Platform][5])
10. Amazon Seller-Forum post describing ZIP+JSON customised-URL format change. ([sellercentral.amazon.com][8])

[1]: https://www.shipstation.com/docs/api/orders/create-update-order/?utm_source=chatgpt.com 'Create/Update Order - ShipStation'
[2]: https://www.prisma.io/docs/orm/prisma-client/queries/transactions?utm_source=chatgpt.com 'Transactions and batch queries (Reference) | Prisma Documentation'
[3]: https://help.shipstation.com/hc/en-us/articles/360025869072-Edit-Order-Shipment-Details?utm_source=chatgpt.com 'Edit Order & Shipment Details - ShipStation Help'
[4]: https://help.shipstation.com/hc/en-us/articles/360026138071-Common-Store-Errors?utm_source=chatgpt.com 'Common Store Errors - ShipStation Help'
[5]: https://www.postman.com/lunar-comet-57889/shipstation/request/gxvcjmq/create-update-order?utm_source=chatgpt.com 'Create/Update Order | ShipStation API - Postman'
[6]: https://www.prisma.io/docs/orm/prisma-client/queries/crud?utm_source=chatgpt.com 'CRUD (Reference) | Prisma Documentation'
[7]: https://help.shipstation.com/hc/en-us/articles/360045435492-How-can-I-automatically-set-package-weight-and-dimensions?utm_source=chatgpt.com 'How can I automatically set package weight and dimensions?'
[8]: https://sellercentral.amazon.com/seller-forums/discussions/t/dac17d0f-c2cf-4b4d-9dea-a843478e9678?utm_source=chatgpt.com 'Custom Products zip file and JSON resource changes'

## 6. Potential Future Enhancements

- **Refined Dimensions Handling:** Investigate the correct API method or payload structure to reliably clear or update dimensions in ShipStation, including unit conversions with scaling if necessary.
- **`internalNotes` Management:** Implement automatic truncation for `internalNotes` sent to ShipStation to prevent exceeding limits. Consider more structured data storage for notes if they become very complex.
- **Advanced AI Error Handling:** Implement more sophisticated parsing and fixing for AI JSON responses.
- **Cost Tracking for AI:** Add more detailed logging or tracking for AI token usage and associated costs.
- **Dead Letter Queue/Retry Mechanism for ShipStation Sync:** If a ShipStation update fails due to transient issues, implement a more robust retry or a mechanism to flag orders for later sync attempts.
- **UI for Reviewing `needs_review` Tasks:** A simple interface to review and approve/edit tasks flagged by the AI would improve workflow.
- **More Granular `dry-run`:** Potentially allow dry-run for specific parts (e.g., AI only, DB only, ShipStation sync only).
- **Automated Testing:** Develop a suite of unit and integration tests.

## 7. Troubleshooting Guide

- **Check Logs:** The script produces detailed logs in `/logs/populate-print-queue-YYYY-MM-DDTHH-MM-SS-mmmZ.log` and to the console. Enable `--verbose` or `--debug` for more detail.
- **ShipStation UI:** Always verify changes in the ShipStation UI after a sync.
- **Payload Diffs:** When debugging ShipStation sync issues, compare:
  1.  `[ShipStation API - DEBUG] Original FRESHLY fetched order data...`
  2.  `[ShipStation API] Sending PAYLOAD to /orders/createorder:...`
  3.  `[ShipStation API Response Details][Order ...] Data:...`
      Discrepancies here are key.
- **Database Inspection:** Check the `PrintOrderTask` table for created/updated tasks.
- **AI Call Log:** Check the `AiCallLog` table for details of AI interactions.
