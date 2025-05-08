import { PrismaClient, PrintOrderTask, OrderItem, Order } from '@prisma/client';
import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';

import { getLogger } from '@lib/shared/logging';
import { getShipstationOrders, updateOrderItemOptions } from '@lib/shipstation';

// Load environment variables
dotenvConfig();

// Setup logger
const logger = getLogger('manual-shipstation-update');

const prisma = new PrismaClient();

interface ScriptOptions {
  orderId: number;
  dryRun: boolean;
}

async function runManualUpdate(options: ScriptOptions): Promise<void> {
  logger.info(`--- Starting Manual ShipStation Update for Order ID: ${options.orderId} ---`);
  if (options.dryRun) {
    logger.info('--- DRY RUN MODE ENABLED ---');
  }

  try {
    // 1. Fetch PrintOrderTasks and related data for the given DB Order ID
    const tasks = await prisma.printOrderTask.findMany({
      where: { orderId: options.orderId },
      include: {
        orderItem: true, // Include the related OrderItem to get shipstationLineItemKey
        order: true, // Include the related Order to get shipstation_order_id
      },
    });

    if (!tasks || tasks.length === 0) {
      logger.error(`No PrintOrderTasks found for Order ID ${options.orderId}. Cannot proceed.`);
      return;
    }

    logger.info(`Found ${tasks.length} PrintOrderTask(s) for Order ID ${options.orderId}.`);

    // Group tasks by OrderItem ID to handle potential multiple tasks per item if needed later
    // For now, we'll process based on the first task found for each unique item key.
    const itemsToUpdate = new Map<
      string,
      { task: PrintOrderTask; orderItem: OrderItem; order: Order }
    >();

    for (const task of tasks) {
      if (
        task.orderItem?.shipstationLineItemKey &&
        task.order?.shipstation_order_id &&
        !itemsToUpdate.has(task.orderItem.shipstationLineItemKey)
      ) {
        itemsToUpdate.set(task.orderItem.shipstationLineItemKey, {
          task: task,
          orderItem: task.orderItem,
          order: task.order,
        });
      } else if (!task.orderItem?.shipstationLineItemKey) {
        logger.warn(
          `Task ID ${task.id} for Order ID ${options.orderId} is missing shipstationLineItemKey. Skipping.`
        );
      } else if (!task.order?.shipstation_order_id) {
        logger.warn(
          `Task ID ${task.id} for Order ID ${options.orderId} is missing shipstation_order_id on the parent order. Skipping.`
        );
      }
    }

    if (itemsToUpdate.size === 0) {
      logger.error(
        `No tasks with required ShipStation keys found for Order ID ${options.orderId}.`
      );
      return;
    }

    logger.info(`Found ${itemsToUpdate.size} unique ShipStation line items to potentially update.`);

    // Need the ShipStation Order ID (should be the same for all tasks in the order)
    const shipstationOrderId = tasks[0].order?.shipstation_order_id;
    if (!shipstationOrderId) {
      logger.error(`Could not determine ShipStation Order ID for DB Order ID ${options.orderId}.`);
      return;
    }

    // 2. Fetch the full order from ShipStation
    logger.info(`Fetching ShipStation order details for SS Order ID: ${shipstationOrderId}...`);
    const ssOrderResponse = await getShipstationOrders({ orderId: Number(shipstationOrderId) });

    if (!ssOrderResponse || !ssOrderResponse.orders || ssOrderResponse.orders.length === 0) {
      logger.error(
        `Failed to fetch order details from ShipStation for SS Order ID: ${shipstationOrderId}.`
      );
      return;
    }
    const ssOrder = ssOrderResponse.orders[0];
    logger.info(`Successfully fetched ShipStation order ${ssOrder.orderNumber}.`);

    // 3. Iterate and update each item
    for (const [lineItemKey, data] of itemsToUpdate.entries()) {
      const { task } = data;
      logger.info(
        `Processing update for LineItemKey: ${lineItemKey} using data from Task ID: ${task.id}`
      );

      // 4. Construct options from the PrintOrderTask data
      const ssOptions = [];
      if (task.custom_text) {
        ssOptions.push({ name: 'Name or Text', value: task.custom_text });
      }
      if (task.color_1) {
        ssOptions.push({ name: 'Colour 1', value: task.color_1 });
      }
      if (task.color_2) {
        ssOptions.push({ name: 'Colour 2', value: task.color_2 });
      }

      if (ssOptions.length === 0) {
        logger.warn(
          `No options constructed from Task ID ${task.id} for LineItemKey ${lineItemKey}. Skipping update.`
        );
        continue;
      }

      logger.debug(`Constructed options for ${lineItemKey}: ${JSON.stringify(ssOptions)}`);

      // 5. Call update function
      if (options.dryRun) {
        logger.info(
          `[Dry Run] Would call updateOrderItemOptions for LineItemKey ${lineItemKey} with options: ${JSON.stringify(ssOptions)}`
        );
      } else {
        logger.info(`Calling updateOrderItemOptions for LineItemKey ${lineItemKey}...`);
        try {
          const updateSuccess = await updateOrderItemOptions(
            lineItemKey,
            ssOptions,
            ssOrder // Pass the fetched ShipStation order object
          );

          if (updateSuccess) {
            logger.info(`Successfully updated options for LineItemKey ${lineItemKey}.`);
          } else {
            logger.error(
              `Failed to update options for LineItemKey ${lineItemKey} (updateOrderItemOptions returned false).`
            );
            // Consider adding to a list of failed items
          }
        } catch (updateError) {
          logger.error(
            `Error calling updateOrderItemOptions for LineItemKey ${lineItemKey}:`,
            { error: updateError }
          );
          // Consider adding to a list of failed items
        }
      }
    }

    logger.info(`--- Finished Manual ShipStation Update for Order ID: ${options.orderId} ---`);
  } catch (error) {
    logger.error(
      `An unexpected error occurred during manual update for Order ID ${options.orderId}:`,
      { error: error }
    );
  } finally {
    await prisma.$disconnect();
    logger.info('Database connection closed.');
  }
}

// --- Main Execution ---
async function main(): Promise<void> {
  const program = new Command();
  program
    .name('manual-shipstation-update')
    .description(
      'Manually push personalization details from DB PrintOrderTasks to ShipStation item options.'
    )
    .requiredOption('-o, --order-id <id>', 'Database Order ID to process', val => parseInt(val, 10))
    .option('--dry-run', 'Simulate without calling ShipStation update API', false)
    .action(async (options: ScriptOptions) => {
      if (isNaN(options.orderId)) {
        logger.error('Invalid Order ID provided.');
        process.exit(1);
      }
      await runManualUpdate(options);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('Error parsing command line arguments:', { error: error });
    process.exit(1);
  }
}

void main();
