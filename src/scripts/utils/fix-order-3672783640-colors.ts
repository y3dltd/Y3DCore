import { PrismaClient } from '@prisma/client';
import { getLogger } from '@/lib/shared/logging';

const prisma = new PrismaClient();
const logger = getLogger('fix-order-3672783640-colors');

const TARGET_ORDER_NUMBER = '3672783640';

// Correct mapping of custom_text (name) to color_1
const correctColorMap: Record<string, string> = {
  Layan: 'Magenta',
  Ava: 'Red',
  Erona: 'Purple',
  Ka: 'Magenta',
  Erum: 'Blue',
  Ozlem: 'Purple',
  Moriam: 'Yellow',
  Halima: 'Yellow',
};

async function main(dryRun = true) {
  logger.info(
    `Starting fix for order ${TARGET_ORDER_NUMBER}. DRY RUN: ${dryRun}`,
  );

  try {
    // Step 1: Find the Order by shipstation_order_number and marketplace
    const orderToUpdate = await prisma.order.findFirst({
      where: {
        shipstation_order_number: TARGET_ORDER_NUMBER,
        marketplace: 'etsy', // Added marketplace filter for specificity
      },
    });

    if (!orderToUpdate) {
      logger.error(`Order with shipstation_order_number ${TARGET_ORDER_NUMBER} and marketplace 'etsy' not found.`);
      return;
    }

    logger.info(`Found order ID ${orderToUpdate.id} for shipstation_order_number ${TARGET_ORDER_NUMBER} (Etsy).`);

    // Step 2: Find PrintOrderTasks associated with this orderId
    const tasksToUpdate = await prisma.printOrderTask.findMany({
      where: {
        orderId: orderToUpdate.id, // Use the found order's ID
        custom_text: { // Only fetch tasks whose names are in our map
          in: Object.keys(correctColorMap),
        },
      },
      // No need to include order here anymore as we've already fetched it.
    });

    if (tasksToUpdate.length === 0) {
      logger.info(
        `No tasks found for order ${TARGET_ORDER_NUMBER} matching the names in the color map. Nothing to do.`,
      );
      return;
    }

    logger.info(`Found ${tasksToUpdate.length} tasks for order ${TARGET_ORDER_NUMBER} to potentially update.`);

    let updatedCount = 0;
    let alreadyCorrectCount = 0;

    for (const task of tasksToUpdate) {
      if (!task.custom_text) {
        logger.warn(
          `Task ID ${task.id} for order ${TARGET_ORDER_NUMBER} has no custom_text. Skipping.`, 
        );
        continue;
      }

      const correctColor = correctColorMap[task.custom_text];

      if (!correctColor) {
        logger.warn(
          `Task ID ${task.id} (custom_text: "${task.custom_text}") for order ${TARGET_ORDER_NUMBER} has no mapping for correct color. Skipping.`,
        );
        continue;
      }

      if (task.color_1 === correctColor) {
        logger.info(
          `Task ID ${task.id} (custom_text: "${task.custom_text}") already has correct color_1: "${task.color_1}". No update needed.`,
        );
        alreadyCorrectCount++;
      } else {
        logger.info(
          `Task ID ${task.id} (custom_text: "${task.custom_text}"): current color_1 "${task.color_1}", desired "${correctColor}". ${dryRun ? 'DRY RUN: Would update.' : 'Updating...'} `,
        );
        if (!dryRun) {
          await prisma.printOrderTask.update({
            where: { id: task.id },
            data: { color_1: correctColor, updated_at: new Date() },
          });
        }
        updatedCount++;
      }
    }

    logger.info('--- Summary ---');
    logger.info(`Target Order ID: ${orderToUpdate.id}`);
    logger.info(`Total tasks checked: ${tasksToUpdate.length}`);
    logger.info(`Tasks that would be/were updated: ${updatedCount}`);
    logger.info(`Tasks already correct: ${alreadyCorrectCount}`);
    if (dryRun) {
      logger.info('DRY RUN completed. No actual changes were made to the database.');
    } else {
      logger.info('Update process completed.');
    }
  } catch (error) {
    // Improved error logging
    if (error instanceof Error) {
      logger.error('Error during fix process:', { message: error.message, stack: error.stack, name: error.name });
    } else {
      logger.error('Error during fix process (unknown type):', { error });
    }
  } finally {
    await prisma.$disconnect();
  }
}

// To run the script:
// BUN_ENV=development bun run src/scripts/utils/fix-order-3672783640-colors.ts [--no-dry-run]
// or npx tsx src/scripts/utils/fix-order-3672783640-colors.ts [--no-dry-run]

// Get command line arguments
const args = process.argv.slice(2);
const noDryRunFlag = args.includes('--no-dry-run');

main(!noDryRunFlag) // if --no-dry-run is present, dryRun is false
  .then(() => {
    logger.info('Script finished execution.');
  })
  .catch((e) => {
    logger.error('Script failed with error:', e);
    process.exit(1);
  });
