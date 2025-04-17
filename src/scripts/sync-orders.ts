// External dependencies
import * as dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Explicitly load environment variables
dotenv.config();

// Internal imports with relative paths
import { logger } from '../lib/shared/logging'; // Import from shared module
import {
  syncAllPaginatedOrders,
  syncRecentOrders,
  syncSingleOrder,
  syncShipStationTags, // Import should now work after re-export
  SyncOptions, // Import SyncOptions type
} from '../lib/shared/shipstation';

// Define command-line arguments and get the inferred type
const argvBuilder = yargs(hideBin(process.argv))
  .option('mode', {
    alias: 'm',
    choices: ['all', 'recent', 'tags', 'single'] as const,
    description: 'Sync mode: all orders, recent orders, single order, or just tags',
    default: 'recent' as const,
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
    description:
      'Number of hours to look back for recent orders (overrides lookback-days if specified)',
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

// Explicitly type argv using ArgumentsCamelCase
type ArgvType = {
  mode: 'all' | 'recent' | 'tags' | 'single';
  orderId?: string;
  forceStartDate?: string;
  lookbackDays: number;
  hours?: number;
  batchSize: number;
  skipTags?: boolean;
  dryRun: boolean;
};

const argv = argvBuilder.parseSync() as ArgvType;

async function main(args: ArgvType) {
  // Use the explicit type
  logger.info('Starting ShipStation sync process...');
  const startTime = Date.now();

  // Create SyncOptions object from arguments
  const syncOptions: SyncOptions = {
    dryRun: args.dryRun, // Use args parameter
  };

  if (syncOptions.dryRun) {
    logger.warn('[Script][Dry Run] DRY RUN MODE ENABLED. No database changes will be made.');
  }

  try {
    // 1. Sync Tags (unless skipped)
    // Use args parameter
    if (!args.skipTags && args.mode !== 'single' && args.mode !== 'tags') {
      logger.info('[Script] Syncing ShipStation tags...');
      // Pass options to syncShipStationTags
      await syncShipStationTags(syncOptions);
      logger.info('[Script] Tag sync complete.');
    } else if (args.mode === 'tags') {
      logger.info('[Script] Syncing ShipStation tags only...');
      await syncShipStationTags(syncOptions);
      logger.info('[Script] Tag sync complete.');
      // Exit early if only syncing tags
      const endTime = Date.now();
      logger.info(`[Script] Tag-only sync finished in ${(endTime - startTime) / 1000} seconds.`);
      process.exit(0);
    } else {
      logger.info('[Script] Skipping tag sync (--skip-tags specified or single order mode).');
    }

    // 2. Start the order sync based on mode
    // Define syncResult with a type that matches the expected return structures
    let syncResult: {
      success: boolean;
      ordersProcessed?: number;
      ordersFailed?: number;
      error?: string;
    };

    switch (
      args.mode // Use args parameter
    ) {
      case 'all':
        logger.info('[Script] Starting full order sync...');
        // Call syncAllPaginatedOrders correctly, passing options object
        syncResult = await syncAllPaginatedOrders({
          dryRun: syncOptions.dryRun,
          overrideStartDate: args.forceStartDate,
        });
        break;

      case 'recent':
        // Use args parameter
        if (args.hours !== undefined) {
          logger.info(`[Script] Starting recent orders sync (${args.hours} hours)...`);
          const daysEquivalent = args.hours / 24;
          // Pass options to syncRecentOrders
          syncResult = await syncRecentOrders(daysEquivalent, syncOptions);
        } else {
          // Ensure lookbackDays is passed as number
          logger.info(`[Script] Starting recent orders sync (${args.lookbackDays} days)...`);
          // Pass options to syncRecentOrders
          syncResult = await syncRecentOrders(Number(args.lookbackDays), syncOptions);
        }
        break;

      case 'single':
        // Use args parameter
        if (!args.orderId) {
          throw new Error('Order ID is required for single order sync mode');
        }
        logger.info(`[Script] Syncing single order: ${args.orderId}...`);
        // Pass options to syncSingleOrder and convert orderId to number
        syncResult = await syncSingleOrder(parseInt(args.orderId, 10), syncOptions);
        break;

      // 'tags' mode is handled above

      default:
        // This should be unreachable due to yargs choices, but good practice
        logger.error(`[Script] Invalid sync mode encountered: ${args.mode}`);
        throw new Error(`Invalid sync mode: ${args.mode}`);
    }

    // Log results
    if (syncResult.success) {
      logger.info(`[Script] Sync completed successfully.`);
      if (syncResult.ordersProcessed !== undefined) {
        logger.info(`[Script] Orders Processed: ${syncResult.ordersProcessed}`);
      }
      if (syncResult.ordersFailed !== undefined) {
        logger.info(`[Script] Orders Failed: ${syncResult.ordersFailed}`);
      }
    } else {
      logger.error(`[Script] Sync failed. Error: ${syncResult.error || 'Unknown error'}`);
    }
  } catch (error) {
    // Logger in syncAllPaginatedOrders should have logged specifics
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Use args parameter here
    logger.error(`[Script] Sync process failed (Mode: ${args.mode}): ${errorMsg}`, { error });
    const endTime = Date.now();
    logger.info(
      `[Script] Sync process finished with errors in ${(endTime - startTime) / 1000} seconds.`
    );
    process.exit(1); // Exit with error code
  }

  const endTime = Date.now();
  logger.info(
    `[Script] Sync process finished successfully in ${(endTime - startTime) / 1000} seconds.`
  );
  process.exit(0); // Exit successfully
}

main(argv); // Pass parsed args to main
