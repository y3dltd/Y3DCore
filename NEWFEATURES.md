# Print Queue Improvements

## Overview
This document outlines the planned improvements to the print queue page to enhance usability, visibility, and efficiency.

## Changes to Implement

### 1. Default Display Settings
- **Default to 250 tasks per page** (user can go up to 1000 per page)
- **Most recent tasks first** by default
- **Limit selector options**: 50, 100, 250, 500, 1000

### 2. Column Reordering
Change layout from:
```
Status, Review, Order #, Shipping Method, Product SKU, Qty, Color 1, Color 2, Custom Text, Ship By
```

To:
```
Product SKU (truncated to 15 chars), Product Name (truncated to 15 chars), Qty, Color 1, Color 2, Custom Text, Status, Review?, Ship By, Order #, Shipping Method
```

### 3. Sorting Functionality
- **Enable sorting by any column** (currently only ship by date)
- **Display relative dates** for Ship By dates (e.g., "Tomorrow" or "Today" instead of the date)
- **Allow advanced ordering by multiple columns** (e.g., by Color 1, Color 2, SKU)

### 4. Task Totals Display
- **Show total number of pending tasks**
- **Show total number of completed tasks**
- **Display totals for the current page**

### 5. Enhanced Filtering
- **Filter by Color 1**
- **Filter by Color 2**
- **Filter by both colors simultaneously**
- **Improved text search** across all relevant fields

### 6. Color Display Improvements
- **Use rounded boxes with text inside** for better visibility
- **Ensure proper contrast** for all color names
- **Consistent styling** across the application
- **Special handling** for problematic colors like Light Blue, Magenta, and White

### 7. UI/UX Enhancements
- **Responsive design** for all screen sizes
- **Improved loading states**
- **Better error handling**
- **Keyboard shortcuts** for common actions

## Implementation Approach
1. Update default limit in page.tsx
2. Create new column definitions with reordered columns
3. Implement relative date formatting for Ship By dates
4. Add task totals calculation and display
5. Enhance filtering capabilities
6. Ensure consistent color styling
7. Test thoroughly across different scenarios

## Benefits
- **Improved efficiency** for users managing print tasks
- **Better visibility** of important information
- **Enhanced filtering** to find specific tasks quickly
- **Consistent experience** across the application
