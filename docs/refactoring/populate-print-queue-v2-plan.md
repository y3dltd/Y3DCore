# Plan v6: Refactored Order Processing Script (`populate-print-queue-v2.ts`)

**Date:** 2025-04-21

**Status:** Approved

## 1. Goal

- Create a new script (`src/scripts/populate-print-queue-v2.ts`) and associated library modules to replace the existing `populate-print-queue.ts`.
- Implement the desired workflow safely for a production environment:
  - **Amazon Orders:** Attempt Amazon `CustomizedURL` extraction _before_ calling the AI.
  - **AI Input:** Use the extracted Amazon data (if successful) or original item data as input for the AI.
  - **Database Tasks:** Use the _AI's output_ to create/update `PrintTask` records in the database, respecting options like `--preserve-text`.
  - **ShipStation Sync:** Update ShipStation item options _only_ with data from successful Amazon URL extractions. Crucially, check the ShipStation order status first and skip updates for "shipped" or "fulfilled" orders.
- Leave the original `src/scripts/populate-print-queue.ts` untouched during development and testing.

## 2. Proposed Modular Structure

- **Entry Point:** `src/scripts/populate-print-queue-v2.ts`
  - Handles argument parsing (`commander`), environment setup, logging initialization.
  - Calls the main orchestrator function.
- **Core Logic Library:** `src/lib/order-processing-v2/` (New Directory)
  - `config.ts`: Defines and manages script options/env vars.
  - `logger.ts`: Configures and provides the Pino logger instance.
  - `prompts.ts`: Loads AI system/user prompts. **The user prompt template will be modified** to instruct the AI to prioritize any pre-processed data provided for an item.
  - `amazonExtractor.ts`: Contains logic specifically for fetching and parsing the Amazon `CustomizedURL`. Returns a structured result indicating success/failure and data.
  - `aiProcessor.ts`: Contains the `extractOrderPersonalization` logic, adapted to accept the pre-processed order data structure as input before calling the OpenAI API.
  - `dbTasks.ts`: Contains logic for creating/updating `PrintTask` records within a database transaction, using the AI results and respecting the `--preserve-text` option.
  - `shipstationSync.ts`: Contains logic for the batch ShipStation update. It will:
    - Accept only data derived from _successful_ Amazon URL extractions.
    - Check the order status in ShipStation _before_ attempting updates (using `getShipstationOrders`).
    - Skip updates and log warnings for orders marked as "shipped" or "fulfilled".
    - Utilize the existing `updateOrderItemsOptionsBatch` function, preserving its internal notes logic.
  - `orchestrator.ts`: Contains the main `processOrders` function that coordinates the entire workflow per order (fetch, pre-process, AI call, DB transaction, ShipStation sync).
  - `types.ts`: Defines shared TypeScript interfaces for this module.

## 3. Refined Logic Flow

1. The `orchestrator` fetches orders eligible for processing.
2. For each order:
    a. Initialize `preProcessedDataForAI` (structure to build AI input).
    b. Initialize `shipstationUpdateData` (Map: `Map<lineItemKey, { name: string, value: string }[]>`).
    c. Loop through the order's items _in memory_:
    i. Check if the item belongs to an Amazon order (using `order.marketplace` or regex `^\d{3}-\d{7}-\d{7}$` on `order.shipstation_order_number`).
    ii. **If Amazon:** - Call `amazonExtractor.extractCustomizationData`. - If extraction is _successful_: - Populate `preProcessedDataForAI` for this item using the _extracted data_. - Add the _extracted data_ to `shipstationUpdateData` for the item's `shipstationLineItemKey`. - If extraction _fails_: - Populate `preProcessedDataForAI` for this item using _original data_ (e.g., URL, placeholders). - Do _not_ add anything to `shipstationUpdateData`.
    iii. **If not Amazon:** - Populate `preProcessedDataForAI` using _original data_. - Do _not_ add anything to `shipstationUpdateData`.
    d. Call `aiProcessor.extractOrderPersonalization` with the fully built `preProcessedDataForAI`.
    e. Start a database transaction.
    f. Inside the transaction:
    i. Call `dbTasks.createOrUpdateTasks` using the _AI results_.
    ii. Call `shipstationSync.updateShipstationBatch`, passing _only_ the `shipstationUpdateData` map. (The sync function checks shipped status internally).
    g. Log results.

## 4. Mermaid Diagram

```mermaid
graph TD
    A[Start Script v2] --> B{Fetch Orders};
    B --> C{Loop through Orders};
    C --> D{Is ShipStation Sync Only Option?};
    D -- Yes --> E[Call shipstationSync (Existing Tasks)]; %% Separate path for explicit sync
    D -- No --> F[Start Order Processing (Orchestrator)];
    F --> G{Loop through Items (In Memory)};
    G --> H{Is Order Amazon?};
    H -- Yes --> I[Call amazonExtractor];
    I --> J{Extraction Successful?};
    J -- Yes --> JA[Store Amazon Result for SS Update AND Prepare AI Input w/ Extracted Data];
    J -- No --> JB[Prepare AI Input w/ Original Data (e.g., URL)];
    H -- No --> K[Prepare AI Input w/ Original Data];
    JA --> G;
    JB --> G;
    K --> G;
    G -- End Loop --> L[Call aiProcessor w/ Prepared Input];
    L --> M{AI Extraction Successful?};
    M -- Yes --> N[Start DB Transaction];
    M -- No --> O[Log AI Extraction Failure];
    N --> P{Loop through Original Order Items}; %% DB Task Loop
    P --> Q[Get AI Data for Item (from step L)];
    Q --> R{AI Data Exists?};
    R -- Yes --> S[Prepare DB Task Data using AI Data (respect --preserve-text)];
    R -- No --> T[Prepare Placeholder DB Task Data];
    S --> U[Call dbTasks.upsertTask];
    T --> U;
    U --> P;
    P -- End Loop --> Z[Call shipstationSync w/ Stored Successful Amazon Results (Checks Shipped Status Internally)];
    Z --> AA{Commit Transaction};
    AA --> BB[Log Success/Failure];
    O --> BB;
    BB --> CC[Append to Debug Log];
    CC --> C;
    C -- End Loop --> DD[End Script];
    E --> DD;
```

## 5. Next Steps

- Switch to 'code' mode to begin implementing the new script and modules according to this plan.
- Create the new directory structure.
- Develop each module (`amazonExtractor`, `aiProcessor`, `dbTasks`, `shipstationSync`, `orchestrator`, etc.).
- Implement the entry point script (`populate-print-queue-v2.ts`).
- Thoroughly test the new script in a non-production environment, covering various scenarios (Amazon orders with/without URL, non-Amazon orders, AI failures, shipped orders).
- Update the `scripts/workflow.sh` script (or create a new one) to use the v2 script once validated.
