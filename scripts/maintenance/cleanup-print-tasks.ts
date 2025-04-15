#!/usr/bin/env ts-node
/**
 * Cleanup Print Tasks Script
 *
 * This script finds all print tasks that are still pending or in-progress
 * but belong to orders that have already been shipped or cancelled,
 * and marks them as completed.
 *
 * Usage:
 *   npm run cleanup-print-tasks
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --verbose    Show detailed logs
 */

import { PrismaClient, PrintTaskStatus } from '@prisma/client';
import logger from '../../src/lib/logger';

// Initialize Prisma client
const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');

async function cleanupPrintTasks() {
  try {
    logger.info('Starting print tasks cleanup script');

    // Find all orders with status "shipped" or "cancelled"
    const shippedOrCancelledOrders = await prisma.order.findMany({
      where: {
        order_status: {
          in: ['shipped', 'cancelled']
        }
      },
      select: {
        id: true,
        order_status: true,
        shipstation_order_number: true
      }
    });

    logger.info(`Found ${shippedOrCancelledOrders.length} shipped or cancelled orders`);

    // Find all pending or in-progress print tasks for these orders
    const orderIds = shippedOrCancelledOrders.map(order => order.id);

    const pendingTasks = await prisma.printOrderTask.findMany({
      where: {
        orderId: { in: orderIds },
        status: { in: [PrintTaskStatus.pending, PrintTaskStatus.in_progress] }
      },
      include: {
        order: {
          select: {
            shipstation_order_number: true,
            order_status: true
          }
        }
      }
    });

    logger.info(`Found ${pendingTasks.length} pending or in-progress print tasks for shipped/cancelled orders`);

    if (pendingTasks.length === 0) {
      logger.info('No tasks to update. Exiting.');
      return;
    }

    // Group tasks by order for better logging
    const tasksByOrder: Record<string, typeof pendingTasks> = {};
    pendingTasks.forEach(task => {
      const orderNumber = task.order?.shipstation_order_number || `Order ID: ${task.orderId}`;
      if (!tasksByOrder[orderNumber]) {
        tasksByOrder[orderNumber] = [];
      }
      tasksByOrder[orderNumber].push(task);
    });

    // Log details if verbose
    if (isVerbose) {
      Object.entries(tasksByOrder).forEach(([orderNumber, tasks]) => {
        logger.info(`Order ${orderNumber} (${tasks[0].order?.order_status}) has ${tasks.length} tasks to update`);
        tasks.forEach(task => {
          logger.info(`  - Task ID: ${task.id}, Status: ${task.status}, Created: ${task.created_at}`);
        });
      });
    }

    if (isDryRun) {
      logger.info('DRY RUN: Would update the status of these tasks to "completed"');
      logger.info(`DRY RUN: Would update ${pendingTasks.length} tasks`);
    } else {
      // Update all tasks to completed
      const taskIds = pendingTasks.map(task => task.id);
      const updateResult = await prisma.printOrderTask.updateMany({
        where: { id: { in: taskIds } },
        data: {
          status: PrintTaskStatus.completed,
          updated_at: new Date()
        }
      });

      logger.info(`Successfully updated ${updateResult.count} print tasks to "completed" status`);
    }

  } catch (error) {
    logger.error('Error in cleanup script:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
cleanupPrintTasks()
  .then(() => {
    logger.info('Print tasks cleanup completed successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Unhandled error in cleanup script:', error);
    process.exit(1);
  });
