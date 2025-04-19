import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  syncAllPaginatedOrders,
  syncRecentOrders,
  syncShipStationTags,
  syncSingleOrder,
  type SyncOptions, // Import the options type
} from '@/lib/orders/sync';
import { logger } from '@/lib/shared/logging';

// Helper function to handle async commands and logging
async function runCommand(commandName: string, handler: () => Promise<unknown>) {
  logger.info(`[${commandName}] Starting command...`);
  try {
    await handler();
    logger.info(`[${commandName}] Command completed successfully.`);
    process.exit(0);
  } catch (error) {
    logger.error(`[${commandName}] Command failed:`, { error });
    process.exit(1);
  }
}

// Create and execute the CLI
const cli = yargs(hideBin(process.argv))
  .scriptName('order-sync')
  .command(
    'sync',
    'Sync orders from ShipStation',
    yargs => {
      return yargs
        .option('mode', {
          alias: 'm',
          describe: 'Sync mode',
          choices: ['all', 'recent', 'single'] as const,
          default: 'recent' as const,
        })
        .option('order-id', {
          alias: 'id',
          describe: 'ShipStation Order ID to sync (for single mode)',
          type: 'string',
        })
        .option('days-back', {
          alias: 'd',
          describe: 'Number of days to look back (for recent mode)',
          type: 'number',
          default: 2,
        })
        .option('hours', {
          alias: 'h',
          describe: 'Number of hours to look back (for recent mode, overrides days-back)',
          type: 'number',
        })
        .option('force-start-date', {
          alias: 'f',
          describe: 'Force sync to start from this ISO date (YYYY-MM-DDTHH:mm:ss.sssZ)',
          type: 'string',
        })
        .option('sync-tags', {
          describe: 'Sync ShipStation tags before processing orders',
          type: 'boolean',
          default: false,
        })
        .option('verbose', {
          alias: 'v',
          describe: 'Show verbose output',
          type: 'boolean',
          default: false,
        })
        .option('dry-run', {
          describe: "Don't make any changes to the database or ShipStation",
          type: 'boolean',
          default: false,
        })
        .check(argv => {
          if (argv.mode === 'single' && !argv.orderId) {
            throw new Error('Missing required argument: --order-id is required for single mode');
          }
          if (argv.mode !== 'recent' && (argv.hours || argv.daysBack !== 2)) {
            logger.warn('--hours and --days-back options are only used in recent mode.');
          }
          if (argv.mode !== 'all' && argv.forceStartDate) {
            logger.warn('--force-start-date option is typically used in all mode.');
          }
          return true;
        });
    },
    async argv => {
      await runCommand('Sync', async () => {
        // Prepare options object
        const options: SyncOptions = {
          dryRun: argv.dryRun,
        };

        logger.info(`Starting sync with mode: ${argv.mode}${options.dryRun ? ' (DRY RUN)' : ''}`);

        if (argv.syncTags) {
          logger.info('Syncing ShipStation tags...');
          await syncShipStationTags(options);
          logger.info('Tag sync complete.');
        }

        let result: {
          success: boolean;
          ordersProcessed?: number;
          ordersFailed?: number;
          error?: string;
        };

        switch (argv.mode) {
          case 'all':
            // Pass options and forceStartDate to syncAllPaginatedOrders
            result = await syncAllPaginatedOrders(options, argv.forceStartDate);
            break;
          case 'recent':
            const lookbackDays = argv.hours ? argv.hours / 24 : argv.daysBack;
            // Pass options to syncRecentOrders
            result = await syncRecentOrders(lookbackDays, options);
            break;
          case 'single':
            // Pass options to syncSingleOrder - convert orderId to number if needed
            result = await syncSingleOrder(argv.orderId as string, options);
            break;
          default:
            logger.error(`Invalid sync mode: ${argv.mode}`);
            throw new Error(`Invalid sync mode: ${argv.mode}`);
        }

        if (result.success) {
          logger.info(
            `Sync finished successfully. Processed: ${result.ordersProcessed ?? 'N/A'}, Failed: ${result.ordersFailed ?? 'N/A'}${options.dryRun ? ' (DRY RUN)' : ''}`
          );
        } else {
          logger.error(
            `Sync failed. Error: ${result.error ?? 'Unknown error'}. Processed: ${result.ordersProcessed ?? 'N/A'}, Failed: ${result.ordersFailed ?? 'N/A'}${options.dryRun ? ' (DRY RUN)' : ''}`
          );
          throw new Error(result.error || 'Sync failed with unknown error');
        }
      });
    }
  )
  // Placeholder for amazon command
  .command('amazon', 'Process Amazon customization', yargs => {
    return yargs
      .command(
        'sync',
        'Download and process Amazon customization files',
        () => { },
        async () => {
          await runCommand('Amazon Sync', async () => {
            logger.warn('Amazon sync command not yet implemented.');
          });
        }
      )
      .command(
        'update',
        'Update order items and ShipStation with personalization data',
        () => { },
        async () => {
          await runCommand('Amazon Update', async () => {
            logger.warn('Amazon update command not yet implemented.');
          });
        }
      )
      .command(
        'workflow',
        'Run the entire Amazon customization workflow',
        () => { },
        async () => {
          await runCommand('Amazon Workflow', async () => {
            logger.warn('Amazon workflow command not yet implemented.');
          });
        }
      )
      .command(
        'fix',
        'Find and fix orders with missing personalization data',
        () => { },
        async () => {
          await runCommand('Amazon Fix', async () => {
            logger.warn('Amazon fix command not yet implemented.');
          });
        }
      )
      .demandCommand();
  })
  .help()
  .demandCommand()
  .strict();

// Execute the command
cli.parse();
