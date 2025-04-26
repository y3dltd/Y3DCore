"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// External dependencies
const dotenv = __importStar(require("dotenv"));
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
// Explicitly load environment variables
dotenv.config();
// Internal imports with relative paths
const logging_1 = require("../lib/shared/logging"); // Import from shared module
const shipstation_1 = require("../lib/shared/shipstation");
// Define command-line arguments and get the inferred type
const argvBuilder = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .option('mode', {
    alias: 'm',
    choices: ['all', 'recent', 'tags', 'single'],
    description: 'Sync mode: all orders, recent orders, single order, or just tags',
    default: 'recent',
})
    .option('order-id', {
    alias: 'o',
    type: 'string',
    description: 'ShipStation Order ID to sync (only used with mode=single)',
})
    .option('force-start-date', {
    alias: 'f',
    type: 'string',
    description: 'Force sync to start from this date (YYYY-MM-DD or ISO format)',
})
    .option('lookback-days', {
    alias: ['d', 'days'],
    type: 'number',
    description: 'Number of days to look back for recent orders',
    default: 2,
})
    .option('hours', {
    alias: 'h',
    type: 'number',
    description: 'Number of hours to look back for recent orders (overrides lookback-days if specified)',
})
    .option('batch-size', {
    // This option seems unused in the current logic, but keep definition
    alias: 'b',
    type: 'number',
    description: 'Number of orders to process in each batch',
    default: 100,
})
    .option('skip-tags', {
    type: 'boolean',
    description: 'Skip tag synchronization',
    default: false,
})
    .option('dry-run', {
    type: 'boolean',
    description: 'Run the sync without making any database changes',
    default: false,
})
    .help();
const argv = argvBuilder.parseSync();
async function main(args) {
    // Use the explicit type
    logging_1.logger.info('Starting ShipStation sync process...');
    const startTime = Date.now();
    // Create SyncOptions object from arguments
    const syncOptions = {
        dryRun: args.dryRun, // Use args parameter
    };
    if (syncOptions.dryRun) {
        logging_1.logger.warn('[Script][Dry Run] DRY RUN MODE ENABLED. No database changes will be made.');
    }
    try {
        // 1. Sync Tags (unless skipped)
        // Use args parameter
        if (!args.skipTags && args.mode !== 'single' && args.mode !== 'tags') {
            logging_1.logger.info('[Script] Syncing ShipStation tags...');
            // Pass options to syncShipStationTags
            await (0, shipstation_1.syncShipStationTags)(syncOptions);
            logging_1.logger.info('[Script] Tag sync complete.');
        }
        else if (args.mode === 'tags') {
            logging_1.logger.info('[Script] Syncing ShipStation tags only...');
            await (0, shipstation_1.syncShipStationTags)(syncOptions);
            logging_1.logger.info('[Script] Tag sync complete.');
            // Exit early if only syncing tags
            const endTime = Date.now();
            logging_1.logger.info(`[Script] Tag-only sync finished in ${(endTime - startTime) / 1000} seconds.`);
            process.exit(0);
        }
        else {
            logging_1.logger.info('[Script] Skipping tag sync (--skip-tags specified or single order mode).');
        }
        // 2. Start the order sync based on mode
        // Define syncResult with a type that matches the expected return structures
        let syncResult;
        switch (args.mode // Use args parameter
        ) {
            case 'all':
                logging_1.logger.info('[Script] Starting full order sync...');
                // Call syncAllPaginatedOrders correctly, passing options object
                syncResult = await (0, shipstation_1.syncAllPaginatedOrders)({
                    dryRun: syncOptions.dryRun,
                    overrideStartDate: args.forceStartDate,
                });
                break;
            case 'recent':
                // Use args parameter
                if (args.hours !== undefined) {
                    logging_1.logger.info(`[Script] Starting recent orders sync (${args.hours} hours)...`);
                    const daysEquivalent = args.hours / 24;
                    // Pass options to syncRecentOrders
                    syncResult = await (0, shipstation_1.syncRecentOrders)(daysEquivalent, syncOptions);
                }
                else {
                    // Ensure lookbackDays is passed as number
                    logging_1.logger.info(`[Script] Starting recent orders sync (${args.lookbackDays} days)...`);
                    // Pass options to syncRecentOrders
                    syncResult = await (0, shipstation_1.syncRecentOrders)(Number(args.lookbackDays), syncOptions);
                }
                break;
            case 'single':
                // Use args parameter
                if (!args.orderId) {
                    throw new Error('Order ID is required for single order sync mode');
                }
                logging_1.logger.info(`[Script] Syncing single order: ${args.orderId}...`);
                // Pass options to syncSingleOrder and ensure orderId is passed as string
                syncResult = await (0, shipstation_1.syncSingleOrder)(args.orderId, syncOptions);
                break;
            // 'tags' mode is handled above
            default:
                // This should be unreachable due to yargs choices, but good practice
                logging_1.logger.error(`[Script] Invalid sync mode encountered: ${args.mode}`);
                throw new Error(`Invalid sync mode: ${args.mode}`);
        }
        // Log results
        if (syncResult.success) {
            logging_1.logger.info(`[Script] Sync completed successfully.`);
            if (syncResult.ordersProcessed !== undefined) {
                logging_1.logger.info(`[Script] Orders Processed: ${syncResult.ordersProcessed}`);
            }
            if (syncResult.ordersFailed !== undefined) {
                logging_1.logger.info(`[Script] Orders Failed: ${syncResult.ordersFailed}`);
            }
        }
        else {
            logging_1.logger.error(`[Script] Sync failed. Error: ${syncResult.error || 'Unknown error'}`);
        }
    }
    catch (error) {
        // Logger in syncAllPaginatedOrders should have logged specifics
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Use args parameter here
        logging_1.logger.error(`[Script] Sync process failed (Mode: ${args.mode}): ${errorMsg}`, { error });
        const endTime = Date.now();
        logging_1.logger.info(`[Script] Sync process finished with errors in ${(endTime - startTime) / 1000} seconds.`);
        process.exit(1); // Exit with error code
    }
    const endTime = Date.now();
    logging_1.logger.info(`[Script] Sync process finished successfully in ${(endTime - startTime) / 1000} seconds.`);
    process.exit(0); // Exit successfully
}
main(argv); // Pass parsed args to main
