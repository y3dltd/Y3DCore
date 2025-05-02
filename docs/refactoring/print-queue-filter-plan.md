# Print Queue Filter Enhancement Plan

## Objective

The objective is to enhance the `/print-queue` page by:

1. Ensuring the default view of the print queue table does not include items that "need review".
2. Adding a "None" option to the Colour 1 and Colour 2 filters, allowing users to filter for tasks where the corresponding color field is either null or an empty string.

## Plan

1. **Modify Server-Side Logic (`src/app/print-queue/page.tsx`):**

    - **Change Default Needs Review Filter:** In the `PrintQueuePage` component, change the default value for the `needsReview` search parameter validation from `'all'` to `'no'`.
    - **Implement "None" Color Filter Logic:** In the `getPrintTasks` function, modify the `whereClause` logic for `validatedColor1` and `validatedColor2`. If the value is `"none"`, filter for tasks where the color field is `null` or an empty string (`""`). Otherwise, use the existing `contains` logic.

2. **Modify Client-Side Component (`src/components/print-queue-filters.tsx`):**
    - **Add "None" Option to Color Selects:** Add a new `SelectItem` with `value="none"` and `label="None"` to the `Select` components for "Color 1" and "Color 2".
    - **Update Color Filter State and Search Param Logic:** Modify the `onValueChange` handlers for the color `Select` components. When `"none"` is selected, set the local state to `"none"` and update the search parameter to `color1=none` or `color2=none`. When `"all"` is selected, set the local state to `''` and remove the search parameter. For other values, set the local state and search parameter to the selected color.
    - **Update `isAnyFilterActive`:** Include checks for `color1 === 'none'` or `color2 === 'none'` in the `isAnyFilterActive` calculation.
    - **Update `handleClearAllFilters`:** Ensure clearing all filters resets `color1` and `color2` local state to `''` and removes the corresponding search parameters.
    - **Update `useEffect` for Syncing State:** Ensure the `useEffect` hook correctly sets the local `color1` and `color2` state to `"none"` if the search parameter is `"none"`.

## Mermaid Diagram

```mermaid
graph TD
    A[User Request] --> B{Modify Print Queue}
    B --> C[Exclude Needs Review by Default]
    B --> D[Add "None" Color Filter Option]

    C --> C1[Modify src/app/print-queue/page.tsx]
    C1 --> C2[Change default needsReview filter to 'no']

    D --> D1[Modify src/app/print-queue/page.tsx]
    D1 --> D2[Update getPrintTasks to handle 'none' keyword for colors]
    D2 --> D3[Filter for color IS NULL OR color = '']

    D --> D4[Modify src/components/print-queue-filters.tsx]
    D4 --> D5[Add "None" option to color filter UI]
    D5 --> D6[Update search param logic to use 'none' keyword]
    D5 --> D7[Update isAnyFilterActive and Clear All logic]

    C2 --> E{Plan Complete}
    D6 --> E
    D3 --> E
    D7 --> E
    E --> F[Present Plan to User]
    F --> G{User Approval?}
    G -- Yes --> H[Offer to write plan to Markdown]
    H --> I{Write to Markdown?}
    I -- Yes --> J[Write Plan to Markdown File]
    I -- No --> K[Proceed to Implementation]
    G -- No --> F
    J --> K
    K --> L[Switch to Code Mode]
    L --> M[Implement Changes]
```
