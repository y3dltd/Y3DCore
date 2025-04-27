import { PrismaClient, Prisma } from '@prisma/client';
import { Command } from 'commander';
import { getShipstationOrders } from '../src/lib/shipstation/api'; // Adjusted path
import { ShipStationOrderItem, ShipStationOrder, ShipStationApiParams } from '../src/lib/shipstation/types'; // Adjusted path
import { addDays, subDays, formatISO } from 'date-fns'; // For date calculations
import { exec } from 'child_process'; // Re-added for automatic execution
import util from 'util';             // Re-added for automatic execution

const prisma = new PrismaClient();
const execPromise = util.promisify(exec); // Re-added for automatic execution

interface Options {
    days?: number;
    dryRun?: boolean;
}

interface DbOrderInfo {
    dbTaskCount: number;
    hasAmazonUrl: boolean; // Track if the URL was found in DB specifically
}

interface ApiOrderInfo {
    ssItemCount: number;
    hasAmazonUrl: boolean; // Track if the URL was found in API specifically
}

// Function to find orders with Amazon URLs in the local database
async function findOrdersInDb(days?: number): Promise<Map<string, DbOrderInfo>> {
    console.log(`\n🔍 Checking local database...${days ? ` (last ${days} days)` : ' (all time)'}`);
    const dbOrderInfoMap = new Map<string, DbOrderInfo>();

    let dateFilter: Prisma.OrderWhereInput = {};
    if (days !== undefined && days > 0) {
        const startDate = subDays(new Date(), days);
        dateFilter = {
            created_at: {
                gte: startDate,
            },
        };
        console.log(`   - Filtering orders created since: ${startDate.toISOString()}`);
    }

    const ordersWithPotentialIssues = await prisma.order.findMany({
        where: {
            AND: [
                dateFilter,
                {
                    OR: [ // Find orders if EITHER they have an amazon URL OR potentially missing tasks
                        { // Condition 1: Has an Amazon URL item
                            items: {
                                some: {
                                    amazonCustomizationFiles: {
                                        is: {
                                            originalUrl: {
                                                contains: 'amazon.com',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        // We might add a condition here later to explicitly check for task count mismatch
                        // if needed, but for now, finding the URL is the primary trigger.
                    ]
                }
            ]
        },
        select: {
            id: true,
            shipstation_order_number: true,
            _count: { // Get the total count of tasks for the ORDER
                select: { printTasks: true },
            },
            items: { // Still need item details to confirm the URL presence
                select: {
                    amazonCustomizationFiles: {
                        select: {
                            originalUrl: true,
                        },
                    },
                },
            },
        },
    });

    console.log(`   Checked DB. Found ${ordersWithPotentialIssues.length} orders with potential issues to analyze.`);

    for (const order of ordersWithPotentialIssues) {
        if (!order.shipstation_order_number) continue; // Skip if no SS order number

        // Check if this specific order actually has an item with an amazon URL
        const hasUrlInDb = order.items.some(item =>
            item.amazonCustomizationFiles?.originalUrl?.includes('amazon.com')
        );

        const dbTaskCount = order._count.printTasks;

        // Store info, prioritizing existing data if order seen multiple ways
        const existingInfo = dbOrderInfoMap.get(order.shipstation_order_number);
        dbOrderInfoMap.set(order.shipstation_order_number, {
            dbTaskCount: dbTaskCount,
            hasAmazonUrl: existingInfo?.hasAmazonUrl || hasUrlInDb, // Keep true if ever found
        });

        // Log if URL found in this specific check
        if (hasUrlInDb) {
            console.log(`   - DB Order ${order.shipstation_order_number}: Found Amazon URL. Task Count: ${dbTaskCount}`);
        }
    }
    return dbOrderInfoMap;
}

// Function to find orders with Amazon URLs via ShipStation API
async function findOrdersInShipStation(days?: number): Promise<Map<string, ApiOrderInfo>> {
    console.log(`\n🔍 Checking ShipStation API (awaiting_shipment)...${days ? ` (created last ${days} days)` : ' (all time)'}`);
    const apiOrderInfoMap = new Map<string, ApiOrderInfo>();
    let currentPage = 1;
    let totalPages = 1;
    let ordersChecked = 0;
    const apiParams: ShipStationApiParams = {
        orderStatus: 'awaiting_shipment',
        sortBy: 'CreateDate',
        sortDir: 'DESC',
        pageSize: 100,
    };
    if (days !== undefined && days > 0) {
        apiParams.createDateStart = formatISO(subDays(new Date(), days));
        console.log(`   - Filtering orders created since: ${apiParams.createDateStart}`);
    }

    try {
        do {
            apiParams.page = currentPage;
            const response = await getShipstationOrders(apiParams);

            if (!response || !response.orders) {
                console.warn(`[ShipStation Check] No orders found on page ${currentPage} or failed fetch.`);
                break;
            }
            totalPages = response.pages;
            console.log(`   Checking page ${currentPage}/${totalPages}... (${response.orders.length} orders)`);

            for (const order of response.orders) {
                ordersChecked++;
                let foundUrlInApi = false;
                const ssItemCount = order.items.length;

                for (const item of order.items) {
                    if (item.options && Array.isArray(item.options)) {
                        for (const option of item.options) {
                            const checkValue = `${option.name} ${option.value}`.toLowerCase();
                            if (checkValue.includes('amazon.com')) {
                                console.log(`   - API Order ${order.orderNumber}: Found Amazon URL in Item Option: ${option.name}`);
                                foundUrlInApi = true;
                                break;
                            }
                        }
                    }
                    if (foundUrlInApi) break;
                }
                // Check internal notes if not found in options
                if (!foundUrlInApi && order.internalNotes?.toLowerCase().includes('amazon.com/images')) {
                    console.log(`   - API Order ${order.orderNumber}: Found Amazon URL in Internal Notes.`);
                    foundUrlInApi = true;
                }

                if (foundUrlInApi) {
                    const existingInfo = apiOrderInfoMap.get(order.orderNumber);
                    apiOrderInfoMap.set(order.orderNumber, {
                        ssItemCount: ssItemCount,
                        hasAmazonUrl: existingInfo?.hasAmazonUrl || foundUrlInApi, // Should always be true here
                    });
                }
            }
            currentPage++;
        } while (currentPage <= totalPages);

    } catch (error) {
        console.error('\n[ShipStation Check] Error fetching orders from ShipStation API:', error);
    }

    console.log(`   Finished ShipStation check. Checked ${ordersChecked} orders. Found ${apiOrderInfoMap.size} orders with URLs.`);
    return apiOrderInfoMap;
}

// Main execution logic
async function main(options: Options) {
    console.log('Starting script to check for unprocessed Amazon URLs...');
    console.log(`Options: Days=${options.days ?? 'All'}, Dry Run=${options.dryRun ?? false}`);

    const dbResults = await findOrdersInDb(options.days);
    const apiResults = await findOrdersInShipStation(options.days);

    const combinedOrderNumbers = new Set([...dbResults.keys(), ...apiResults.keys()]);

    if (combinedOrderNumbers.size === 0) {
        console.log('\n✅ No orders found with Amazon URLs via DB or ShipStation API.');
        return;
    }

    console.log(`\n---\n📊 Analysis Results: Found ${combinedOrderNumbers.size} unique orders with potential issues ---`);

    const ordersToReprocess = [];
    const ordersToSyncOrReview = [];
    const ordersWithIncompleteData = [];

    for (const orderNum of Array.from(combinedOrderNumbers).sort()) {
        const dbInfo = dbResults.get(orderNum);
        const apiInfo = apiResults.get(orderNum);

        const dbTaskCount = dbInfo?.dbTaskCount ?? -1; // Use -1 to indicate data not found
        const ssItemCount = apiInfo?.ssItemCount ?? -1; // Use -1 to indicate data not found
        const urlFoundInDb = dbInfo?.hasAmazonUrl ?? false;
        const urlFoundInApi = apiInfo?.hasAmazonUrl ?? false;

        let status = '';
        let recommendation = '';
        let isSyncRecommended = false;
        let isReprocessRecommended = false;

        // Determine status based on where the URL was found
        if (urlFoundInDb && urlFoundInApi) status = 'URL in DB & API';
        else if (urlFoundInDb) status = 'URL in DB only';
        else if (urlFoundInApi) status = 'URL in API only';
        else status = 'URL check inconclusive (found via other means?)'; // Should not happen with current logic

        // Determine recommendation based on counts (only if we have both counts)
        if (dbTaskCount !== -1 && ssItemCount !== -1) {
            if (dbTaskCount < ssItemCount) {
                recommendation = 'Reprocess (Missing Tasks)';
                isReprocessRecommended = true;
                ordersToReprocess.push(orderNum);
            } else {
                // If tasks >= items, but URL was found, it suggests a sync issue or stale data
                recommendation = 'Sync/Review (Tasks OK)';
                isSyncRecommended = true;
                ordersToSyncOrReview.push(orderNum);
            }
        } else {
            // If we only found URL in one place, we lack complete data for comparison
            recommendation = 'Incomplete Data';
            ordersWithIncompleteData.push(orderNum); // Group these separately
            if (urlFoundInDb) {
                isReprocessRecommended = true;
                ordersToReprocess.push(orderNum); // Default to reprocess if found in DB
            } else {
                isSyncRecommended = true;
                ordersToSyncOrReview.push(orderNum); // Default to sync/review if found only in API
            }
        }

        console.log(`   - ${orderNum}: DB Tasks: ${dbTaskCount === -1 ? 'N/A' : dbTaskCount}, SS Items: ${ssItemCount === -1 ? 'N/A' : ssItemCount} | Status: ${status} | Recommendation: ${recommendation}`);
    }

    // --- Output Summary & Actions --- 
    console.log('\n--- Summary & Actions ---');

    if (options.dryRun) {
        console.log('\n\n** Dry Run Enabled **');
        console.log(` - ${ordersToReprocess.length} orders flagged for potential reprocessing (-f).`);
        console.log(` - ${ordersToSyncOrReview.length} orders flagged for potential sync/review (--shipstation-sync-only).`);
        if (ordersWithIncompleteData.length > 0) {
            console.log(` - Note: ${ordersWithIncompleteData.length} orders had incomplete data for full comparison.`);
        }
        console.log('\nNo actions will be executed.');

    } else {
        // --- Reprocess Recommendations (Manual) ---
        if (ordersToReprocess.length > 0) {
            console.log(`\n🚨 ${ordersToReprocess.length} Orders Recommended for Manual Reprocessing (use -f):`);
            ordersToReprocess.forEach(num => console.log(`      ${num}`));
            console.log('   Command: npx tsx src/scripts/populate-print-queue.ts --order-id "ORDER_NUMBER" -f --verbose');
            console.warn('   ⚠️ Use -f carefully, it deletes existing tasks!');
        }

        // --- Sync/Review Recommendations (Automatic Execution) ---
        if (ordersToSyncOrReview.length > 0) {
            console.log(`\n⚡ Attempting Automatic Sync for ${ordersToSyncOrReview.length} Orders (using --shipstation-sync-only):`);
            for (const orderNum of ordersToSyncOrReview) {
                console.log(`   🔄 Syncing order: ${orderNum}...`);
                try {
                    const command = `npx tsx src/scripts/populate-print-queue.ts --order-id "${orderNum}" --shipstation-sync-only --verbose`;
                    const { stdout, stderr } = await execPromise(command);
                    console.log(`      STDOUT: ${stdout.substring(0, 300)}...`);
                    if (stderr) {
                        console.error(`      STDERR: ${stderr}`);
                    }
                    console.log(`   ✅ Finished syncing ${orderNum}.`);
                } catch (error: unknown) {
                    let errorMessage = 'Unknown error';
                    if (error instanceof Error) {
                        errorMessage = error.message;
                    }
                    console.error(`   ❌ Failed to sync order ${orderNum}:`, errorMessage);
                }
            }
            console.log('\n   Finished automatic sync attempts.');
            console.log('   Review the output above for success/failure of each sync.');
        }

        // --- Final Guidance ---
        if (ordersToReprocess.length === 0 && ordersToSyncOrReview.length === 0) {
            console.log('\n✅ No specific actions needed based on the analysis.');
        }
    }

    console.log('\nScript finished.');
}

// --- CLI Setup ---
const program = new Command();
program
    .version('1.0.0')
    .description('Check DB and ShipStation for orders with unprocessed Amazon URLs and suggest reprocessing.')
    .option('-d, --days <number>', 'Limit check to orders created in the last N days', parseInt)
    .option('--dry-run', 'Perform checks but do not suggest reprocessing commands')
    .parse(process.argv);

const options = program.opts<Options>();

// --- Run Main --- 
main(options)
    .catch(async (e) => {
        console.error('\n❌ Script failed unexpectedly:', e);
        await prisma.$disconnect();
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        console.log('\n🔌 Database connection closed.');
    }); 
