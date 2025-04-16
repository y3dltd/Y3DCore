# Amazon Order Color Processing

## Overview

This document outlines the process for handling Amazon orders with missing color information, including the scripts developed, workflow procedures, and recommendations for future improvements.

## Problem Statement

Some Amazon orders arrive with missing color information due to:
- CustomizedURL field missing in some orders
- Variations in JSON field naming in Amazon's customization data
- Inconsistent data extraction from Amazon's customization URLs

This leads to incomplete orders in the print queue and potential fulfillment delays.

## Scripts Developed

### 1. Find Amazon Orders with Missing Colors

**Script**: `src/scripts/find-amazon-orders-with-missing-colors.ts`

**Purpose**: Identifies Amazon orders that have missing color information by:
- Scanning orders with the "amazon" source
- Checking for missing color_1 or color_2 values in print tasks
- Outputting a JSON file listing all affected orders and items

**Usage**:
```bash
npx tsx src/scripts/find-amazon-orders-with-missing-colors.ts
```

**Output**: Generates `amazon-orders-missing-colors.json` with detailed information about affected orders

### 2. Reprocess Amazon Colors

**Script**: `src/scripts/reprocess-amazon-colors.ts`

**Purpose**: Updates orders with missing color information using:
- Amazon CustomizedURL extraction (when available)
- Manual color entries provided via a JSON file

**Features**:
- Dry run mode for previewing changes
- Manual entry support for orders without CustomizedURL
- Template generation for creating manual color entries
- Order-specific processing with `--order-id` flag
- Database updates with correct color information
- ShipStation synchronization

**Usage**:
```bash
# Generate a template for manual color entries
npx tsx src/scripts/reprocess-amazon-colors.ts --generate-template

# Process using manual entries (dry run)
npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --manual-file your-entries.json --dry-run

# Process using manual entries (actual update)
npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --manual-file your-entries.json

# Process specific order
npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --manual-file your-entries.json --order-id 123
```

### 3. Amazon Customization Parser

**File**: `src/lib/orders/amazon/customization.ts`

**Updates**: Improved parser logic to handle variations in JSON field naming for:
- Custom text extraction
- Color identification and normalization
- Enhanced type safety and error handling

## Workflow Process

1. **Identification**:
   - Run `find-amazon-orders-with-missing-colors.ts` to identify affected orders
   - Review `amazon-orders-missing-colors.json` to understand the scope

2. **Manual Entry Preparation**:
   - Generate a template: `reprocess-amazon-colors.ts --generate-template`
   - Fill in color information for orders without CustomizedURL
   - Save as a JSON file (e.g., `manual-color-batch.json`)

3. **Validation**:
   - Run in dry-run mode to verify expected changes
   - Ensure color information is correctly mapped

4. **Processing**:
   - Run the script without dry-run flag to apply changes
   - Verify database and ShipStation updates

5. **Verification**:
   - Check print queue for updated color information
   - Confirm ShipStation has correct product options

## Example Usage

For batch processing multiple orders:
```bash
# Generate the template
npx tsx src/scripts/reprocess-amazon-colors.ts --generate-template

# Fill in manual-color-batch.json with proper color information

# Validate with dry run
npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --manual-file manual-color-batch.json --dry-run

# Process orders
npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --manual-file manual-color-batch.json
```

For processing a single order:
```bash
npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --manual-file manual-color-batch.json --order-id 617
```

## Future Improvements

1. **Prevention**:
   - Implement validation during initial order import to flag missing colors
   - Add automated alerts for orders with missing color information

2. **Automation**:
   - Develop a UI for manually entering missing color information
   - Create a scheduled job to periodically check for and fix missing colors
   - Implement intelligent color prediction based on product name patterns

3. **Resilience**:
   - Add retry mechanisms for Amazon URL extraction failures
   - Implement fallback strategies when color information can't be determined
   - Create a recovery process for orders with incorrect color assignments

4. **Monitoring**:
   - Add telemetry to track frequency of missing color data
   - Create dashboards to monitor error rates and resolution times
   - Implement alerting for critical order processing failures

5. **Integration**:
   - Add direct integration with ShipStation's API for real-time order updates
   - Develop a system to batch process color updates during off-peak hours
   - Create reporting tools to track all manual interventions

## Conclusion

The scripts and process documented here provide a reliable method for handling Amazon orders with missing color information. By following the outlined workflow, you can ensure that orders are properly updated with the correct color details, leading to accurate fulfillment and improved customer satisfaction.

The solution addresses immediate needs while the suggested improvements outline a path toward a more automated and resilient system for the future. 
