"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const customization_1 = require("../lib/orders/amazon/customization");
const shipstation_1 = require("../lib/shared/shipstation");
const prisma = new client_1.PrismaClient();
// For command-line arguments
const isDryRun = process.argv.includes('--dry-run');
const generateTemplate = process.argv.includes('--generate-template');
const useManualEntries = process.argv.includes('--use-manual-entries');
const manualEntriesFile = process.argv.includes('--manual-file')
    ? process.argv[process.argv.indexOf('--manual-file') + 1]
    : 'amazon-manual-colors.json';
// Function to extract CustomizedURL from print_settings
function extractCustomizationUrl(printSettings) {
    if (!printSettings)
        return null;
    try {
        // Handle array format: [{name: 'CustomizedURL', value: 'https://...'}]
        if (Array.isArray(printSettings)) {
            const urlSetting = printSettings.find(setting => setting &&
                typeof setting === 'object' &&
                'name' in setting &&
                setting.name === 'CustomizedURL' &&
                'value' in setting);
            if (urlSetting && typeof urlSetting === 'object' && 'value' in urlSetting) {
                return typeof urlSetting.value === 'string' ? urlSetting.value : null;
            }
        }
        // Handle object format: {CustomizedURL: 'https://...'}
        else if (typeof printSettings === 'object' && printSettings !== null) {
            const settingsRecord = printSettings;
            if ('CustomizedURL' in settingsRecord && typeof settingsRecord.CustomizedURL === 'string') {
                return settingsRecord.CustomizedURL;
            }
        }
    }
    catch (error) {
        console.error('Error extracting CustomizedURL:', error);
    }
    return null;
}
async function reprocessOrderItem(orderId, itemId, manualEntries = []) {
    console.log(`Reprocessing order ${orderId}, item ${itemId}`);
    // Get order item with its tasks
    const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        include: {
            order: true,
            printTasks: true,
        },
    });
    if (!item) {
        console.log(`Item ${itemId} not found`);
        return null;
    }
    // Try to get data from Amazon URL first
    const customizedUrl = extractCustomizationUrl(item.print_settings);
    let amazonData = null;
    let dataSource = 'amazon-url';
    if (customizedUrl) {
        amazonData = await (0, customization_1.fetchAndProcessAmazonCustomization)(customizedUrl);
        if (amazonData) {
            console.log(`Extracted data from Amazon URL:`, {
                customText: amazonData.customText,
                color1: amazonData.color1,
                color2: amazonData.color2,
            });
        }
        else {
            console.log(`Failed to process CustomizedURL for item ${itemId}`);
        }
    }
    else {
        console.log(`No CustomizedURL found for item ${itemId}`);
    }
    // If no Amazon data and we have manual entries, try to find one
    if (!amazonData && useManualEntries && manualEntries.length > 0) {
        // Find the order in manual entries
        const orderEntry = manualEntries.find(entry => entry.orderId === orderId);
        if (orderEntry) {
            // Find the specific item in that order
            const itemEntry = orderEntry.items.find(entry => entry.itemId === itemId);
            if (itemEntry) {
                amazonData = {
                    customText: itemEntry.customText,
                    color1: itemEntry.color1,
                    color2: itemEntry.color2,
                    allFields: {},
                    rawJsonData: {},
                };
                dataSource = 'manual-entry';
                console.log(`Using manual entry for item ${itemId}:`, {
                    customText: amazonData.customText,
                    color1: amazonData.color1,
                    color2: amazonData.color2,
                });
            }
        }
    }
    // If we have no data, return null
    if (!amazonData) {
        return null;
    }
    let tasksUpdated = 0;
    // Update tasks with new color information - only update missing (null) colors
    for (const task of item.printTasks) {
        // Only update color fields that are currently null
        const updateData = {
            annotation: task.annotation
                ? `${task.annotation} (${dataSource === 'amazon-url' ? 'Reprocessed with enhanced parser' : 'Updated from manual entry'})`
                : dataSource === 'amazon-url'
                    ? 'Reprocessed with enhanced parser'
                    : 'Updated from manual entry',
        };
        // Only set color_1 if it's currently null
        if (task.color_1 === null && amazonData.color1 !== null) {
            updateData.color_1 = amazonData.color1;
        }
        // Only set color_2 if it's currently null
        if (task.color_2 === null && amazonData.color2 !== null) {
            updateData.color_2 = amazonData.color2;
        }
        // Skip if no colors need to be updated
        if (!updateData.color_1 && !updateData.color_2) {
            console.log(`Task ${task.id} already has colors set, skipping update.`);
            continue;
        }
        if (isDryRun) {
            console.log(`[DRY RUN] Would update task ${task.id} with:`, updateData);
        }
        else {
            await prisma.printOrderTask.update({
                where: { id: task.id },
                data: updateData,
            });
            console.log(`Updated task ${task.id} with colors:`, updateData.color_1 ? `color_1: ${updateData.color_1}` : 'color_1: unchanged', updateData.color_2 ? `color_2: ${updateData.color_2}` : 'color_2: unchanged');
        }
        tasksUpdated++;
    }
    // Update ShipStation if order is still active and not in dry run mode
    if (!isDryRun && item.order.shipstation_order_id && item.shipstationLineItemKey) {
        // Only update ShipStation if we have colors to add
        if (amazonData.color1 || amazonData.color2) {
            try {
                // Fetch the order from ShipStation
                const ssOrderResponse = await (0, shipstation_1.getShipstationOrders)({
                    orderId: Number(item.order.shipstation_order_id),
                });
                if (ssOrderResponse?.orders?.length > 0) {
                    const ssOrder = ssOrderResponse.orders[0];
                    // Prepare the options to update
                    const ssOptions = [];
                    if (amazonData.customText) {
                        ssOptions.push({ name: 'Name or Text', value: amazonData.customText });
                    }
                    if (amazonData.color1) {
                        ssOptions.push({ name: 'Colour 1', value: amazonData.color1 });
                    }
                    if (amazonData.color2) {
                        ssOptions.push({ name: 'Colour 2', value: amazonData.color2 });
                    }
                    if (ssOptions.length > 0) {
                        const updateSuccess = await (0, shipstation_1.updateOrderItemOptions)(item.shipstationLineItemKey, ssOptions, ssOrder);
                        console.log(`ShipStation update ${updateSuccess ? 'succeeded' : 'failed'}`);
                    }
                }
            }
            catch (error) {
                console.error(`Error updating ShipStation:`, error);
            }
        }
        else {
            console.log(`No color information to update in ShipStation.`);
        }
    }
    return {
        itemId,
        updatedTasks: tasksUpdated,
        newData: {
            customText: amazonData.customText,
            color1: amazonData.color1,
            color2: amazonData.color2,
        },
        source: dataSource,
    };
}
async function generateTemplateFile(ordersToProcess) {
    // Create template structure for manual entries
    const template = [];
    for (const order of ordersToProcess) {
        const orderEntry = {
            orderId: order.orderId,
            orderNumber: order.orderNumber || 'Unknown',
            items: [],
        };
        for (const item of order.itemsWithMissingColors) {
            // Check if this item has a CustomizedURL
            const hasCustomizedUrl = await checkIfItemHasCustomizedUrl(item.itemId);
            // Only include items without a CustomizedURL
            if (!hasCustomizedUrl) {
                orderEntry.items.push({
                    itemId: item.itemId,
                    productName: item.productName || 'Unknown Product',
                    customText: null,
                    color1: null,
                    color2: null, // To be filled manually
                });
            }
        }
        // Only add orders that have items without CustomizedURLs
        if (orderEntry.items.length > 0) {
            template.push(orderEntry);
        }
    }
    // Write template to file
    await promises_1.default.writeFile(manualEntriesFile, JSON.stringify(template, null, 2));
    console.log(`Template generated with ${template.length} orders requiring manual entries`);
    console.log(`Edit ${manualEntriesFile} to add color information`);
    console.log('Then run this script with --use-manual-entries to apply the changes');
}
async function checkIfItemHasCustomizedUrl(itemId) {
    const item = await prisma.orderItem.findUnique({
        where: { id: itemId },
        select: { print_settings: true },
    });
    if (!item)
        return false;
    const customizedUrl = extractCustomizationUrl(item.print_settings);
    return customizedUrl !== null;
}
async function main() {
    const filePath = path_1.default.join(process.cwd(), 'amazon-orders-missing-colors.json');
    try {
        // Check if the file exists
        await promises_1.default.access(filePath);
    }
    catch {
        console.error(`File not found: ${filePath}`);
        console.error(`Please run find-amazon-orders-with-missing-colors.ts first to generate the file.`);
        return;
    }
    // Read the file with orders to reprocess
    const ordersJson = await promises_1.default.readFile(filePath, 'utf-8');
    const ordersToReprocess = JSON.parse(ordersJson);
    console.log(`Found ${ordersToReprocess.length} orders to reprocess`);
    // If generate template mode, create template file and exit
    if (generateTemplate) {
        await generateTemplateFile(ordersToReprocess);
        return;
    }
    // Load manual entries if enabled
    let manualEntries = [];
    if (useManualEntries) {
        try {
            const manualEntriesJson = await promises_1.default.readFile(manualEntriesFile, 'utf8');
            manualEntries = JSON.parse(manualEntriesJson);
            console.log(`Loaded ${manualEntries.length} orders with manual color entries.`);
        }
        catch (error) {
            console.error(`Error loading manual entries file: ${error instanceof Error ? error.message : String(error)}`);
            console.error(`Make sure to run with --generate-template first and fill in the file: ${manualEntriesFile}`);
            process.exit(1);
        }
    }
    // Ask for confirmation
    if (!isDryRun) {
        console.log('This script will update the color information for the identified orders.');
        console.log('WARNING: This will modify database records and update ShipStation.');
        console.log('Press Ctrl+C to abort or wait 5 seconds to continue...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    else {
        console.log('DRY RUN MODE: No changes will be made to the database or ShipStation');
    }
    console.log(`Starting reprocessing${isDryRun ? ' (DRY RUN)' : ''}...`);
    const results = [];
    const amazonResults = [];
    const manualResults = [];
    const skippedItems = [];
    for (const order of ordersToReprocess) {
        console.log(`Processing order ${order.orderNumber} (ID: ${order.orderId})`);
        for (const item of order.itemsWithMissingColors) {
            const result = await reprocessOrderItem(order.orderId, item.itemId, manualEntries);
            if (result) {
                results.push(result);
                if (result.source === 'amazon-url') {
                    amazonResults.push(result);
                }
                else {
                    manualResults.push(result);
                }
            }
            else {
                skippedItems.push({
                    orderId: order.orderId,
                    orderNumber: order.orderNumber,
                    itemId: item.itemId,
                    productName: item.productName,
                });
            }
        }
    }
    // Generate summary
    const summary = {
        total: {
            processed: results.length,
            amazonUrl: amazonResults.length,
            manualEntry: manualResults.length,
            skipped: skippedItems.length,
        },
        skippedItems: skippedItems,
    };
    console.log(`Reprocessing complete.`);
    console.log(`${isDryRun ? 'Would have updated' : 'Updated'} ${results.length} items:`);
    console.log(`- From Amazon URLs: ${amazonResults.length}`);
    console.log(`- From manual entries: ${manualResults.length}`);
    console.log(`- Skipped (no data): ${skippedItems.length}`);
    if (skippedItems.length > 0 && !generateTemplate) {
        console.log(`\nItems that couldn't be processed (try running with --generate-template to create a manual entries file):`);
        skippedItems.forEach(item => {
            console.log(`- Order ${item.orderNumber}, Item ${item.itemId}: ${item.productName}`);
        });
    }
    // Write results to file
    const resultsFilename = isDryRun
        ? 'amazon-reprocess-dryrun-results.json'
        : 'amazon-reprocess-results.json';
    await promises_1.default.writeFile(resultsFilename, JSON.stringify({ results, summary }, null, 2));
    return { results, summary };
}
// Display help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage:
  npx tsx src/scripts/reprocess-amazon-colors.ts [options]

Options:
  --dry-run                 Run without making actual changes
  --generate-template       Generate a template file for manual color entries
  --use-manual-entries      Use manual entries from the JSON file
  --manual-file <path>      Specify a custom path for the manual entries file
                            (default: amazon-manual-colors.json)
  --help, -h                Show this help message
  
Examples:
  npx tsx src/scripts/reprocess-amazon-colors.ts --generate-template
  npx tsx src/scripts/reprocess-amazon-colors.ts --dry-run
  npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries
  npx tsx src/scripts/reprocess-amazon-colors.ts --use-manual-entries --dry-run
  `);
    process.exit(0);
}
main()
    .then(() => {
    const fileName = isDryRun
        ? 'amazon-reprocess-dryrun-results.json'
        : 'amazon-reprocess-results.json';
    console.log(`Results saved to ${fileName}`);
})
    .catch(e => {
    console.error('Script error:', e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
