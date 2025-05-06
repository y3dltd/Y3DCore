#!/usr/bin/env npx tsx

import { PrismaClient, PrintTaskStatus, Prisma } from '@prisma/client';
import { Command } from 'commander';
import pino from 'pino';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Initialize environment and logger
dotenv.config();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const prisma = new PrismaClient();

// Helper function to check if a value is an option object
const isOptionObject = (opt: Prisma.JsonValue): opt is { name: string; value: Prisma.JsonValue } =>
  opt !== null && typeof opt === 'object' && !Array.isArray(opt) &&
  'name' in opt && typeof opt.name === 'string' && 'value' in opt;

// Helper function to extract color from print settings
function extractColorFromPrintSettings(item: any): string | null {
  if (!item.print_settings) return null;

  // Check for color in print settings
  if (Array.isArray(item.print_settings)) {
    const colorSetting = item.print_settings.find((setting: Prisma.JsonValue) =>
      isOptionObject(setting) &&
      (setting.name.toLowerCase().includes('color') ||
        setting.name.toLowerCase().includes('colour'))
    );

    if (colorSetting && isOptionObject(colorSetting) && typeof colorSetting.value === 'string') {
      return colorSetting.value;
    }
  }

  return null;
}

// Helper function to extract personalization data from eBay customer notes
function extractEbayPersonalizationData(
  customerNotes: string | null,
  item: any,
  product: any | null,
  originalQuantity: number
): {
  customText: string | null;
  color1: string | null;
  color2: string | null;
  needsReview: boolean;
  reviewReason: string | null;
} {
  if (!customerNotes) {
    return {
      customText: null,
      color1: null,
      color2: null,
      needsReview: true,
      reviewReason: "No customer notes found"
    };
  }

  // Default return values
  let customText: string | null = null;
  let color1: string | null = null;
  let color2: string | null = null;
  let needsReview = false;
  let reviewReason: string | null = null;

  // Extract product SKU or ID to match with notes
  const productSku = product?.sku || '';
  const productId = productSku.split('_')[1] || ''; // Extract ID part from SKU like wi_395107128418_6
  const productVariant = productSku.split('_')[2] || ''; // Extract variant part from SKU like wi_395107128418_6

  logger.debug(`[eBay][extractEbayPersonalizationData] Processing item with SKU=${productSku}, ID=${productId}, Variant=${productVariant}`);
  logger.debug(`[eBay][extractEbayPersonalizationData] Customer notes: ${customerNotes}`);

  // Parse the notes to extract personalization data
  // For eBay, we need to match the variant number with the color in the notes

  // First, let's extract all personalization blocks
  const personalizationBlocks: Array<{ itemId: string, color: string, text: string }> = [];

  // Parse customer notes for eBay format
  const lines = customerNotes.split('\n');
  let currentItemId = '';
  let currentColor = '';
  let currentText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    logger.debug(`[eBay][extractEbayPersonalizationData] Processing line: "${line}"`);

    if (line.startsWith('Item ID:')) {
      // If we already have data from a previous block, save it
      if (currentItemId && currentText) {
        personalizationBlocks.push({
          itemId: currentItemId,
          color: currentColor,
          text: currentText
        });
        logger.debug(`[eBay][extractEbayPersonalizationData] Added block: ID=${currentItemId}, Color=${currentColor}, Text=${currentText}`);
      }

      // Start a new block
      const itemIdMatch = line.match(/Item ID: (\d+)/);
      const colorMatch = line.match(/Color=([^,\n]+)/);

      currentItemId = itemIdMatch ? itemIdMatch[1] : '';
      currentColor = colorMatch ? colorMatch[1].trim() : '';
      currentText = '';

      logger.debug(`[eBay][extractEbayPersonalizationData] New block: ID=${currentItemId}, Color=${currentColor}`);
    }
    else if (line.startsWith('Text:')) {
      // The text value is on this line after "Text:"
      currentText = line.substring(5).trim();
      logger.debug(`[eBay][extractEbayPersonalizationData] Found Text: "${currentText}"`);
    }
  }

  // Add the last block if it exists
  if (currentItemId && currentText) {
    personalizationBlocks.push({
      itemId: currentItemId,
      color: currentColor,
      text: currentText
    });
    logger.debug(`[eBay][extractEbayPersonalizationData] Added final block: ID=${currentItemId}, Color=${currentColor}, Text=${currentText}`);
  }

  logger.debug(`[eBay][extractEbayPersonalizationData] Extracted ${personalizationBlocks.length} personalization blocks`);

  // Now find the matching block for this product
  for (const block of personalizationBlocks) {
    logger.debug(`[eBay][extractEbayPersonalizationData] Checking block: ID=${block.itemId}, Color=${block.color}, Text=${block.text}`);

    // Check if this block matches our product
    const idMatches = productId === block.itemId;

    // Check if the color matches the variant
    const colorMatches =
      // Direct match by variant number and color
      (productVariant === '6' && block.color === 'Light Blue') ||
      (productVariant === '15' && block.color === 'Rose Gold') ||
      // Or check if the color is in the print settings
      (Array.isArray(item.print_settings) &&
        item.print_settings.some((setting: Prisma.JsonValue) =>
          isOptionObject(setting) &&
          typeof setting.value === 'string' &&
          setting.value.toLowerCase() === block.color.toLowerCase()
        ));

    logger.debug(`[eBay][extractEbayPersonalizationData] Matching: ID=${idMatches}, Color=${colorMatches}, Product ID=${productId}, Variant=${productVariant}`);

    if (idMatches && colorMatches) {
      customText = block.text;
      color1 = block.color;
      logger.debug(`[eBay][extractEbayPersonalizationData] MATCH FOUND! Setting customText="${customText}", color1="${color1}"`);
      break;
    }
  }

  // Check for quantity mismatch
  if (originalQuantity > 1 && personalizationBlocks.length < originalQuantity) {
    needsReview = true;
    reviewReason = `QUANTITY_MISMATCH: OrderQty=${originalQuantity}, ParsedTotalQty=${personalizationBlocks.length}, NotesLines=${lines.length}. Used notes structure.`;
    logger.warn(`[eBay][extractEbayPersonalizationData] ${reviewReason}`);
  }

  logger.debug(`[eBay][extractEbayPersonalizationData] Final result: customText="${customText}", color1="${color1}", color2="${color2}", needsReview=${needsReview}, reviewReason="${reviewReason}"`);
  return { customText, color1, color2, needsReview, reviewReason };
}

// Command: Find orders with quantity mismatches
async function findQuantityMismatches(options: { marketplace?: string, limit?: number }) {
  try {
    const marketplace = options.marketplace || 'ebay';
    const limit = options.limit || 10;

    console.log(`Finding orders with quantity mismatches (marketplace: ${marketplace}, limit: ${limit})...`);

    // Find all print tasks with "QUANTITY_MISMATCH" in the review reason
    const tasks = await prisma.printOrderTask.findMany({
      where: {
        review_reason: {
          contains: 'QUANTITY_MISMATCH'
        },
        orderItem: {
          order: {
            marketplace: {
              contains: marketplace
            }
          }
        }
      },
      include: {
        orderItem: {
          include: {
            order: true,
            product: true
          }
        }
      },
      orderBy: {
        updated_at: 'desc'
      },
      take: limit * 5 // Get more tasks to ensure we get enough unique orders
    });

    console.log(`Found ${tasks.length} tasks with quantity mismatches`);

    // Group by order
    const orderMap = new Map();
    for (const task of tasks) {
      const orderNumber = task.orderItem.order.shipstation_order_number;
      if (!orderMap.has(orderNumber)) {
        orderMap.set(orderNumber, []);
      }
      orderMap.get(orderNumber).push(task);
    }

    console.log(`Found ${orderMap.size} orders with quantity mismatches`);

    // Print order details
    let count = 0;
    for (const [orderNumber, tasks] of orderMap.entries()) {
      if (count >= limit) break;

      const order = tasks[0].orderItem.order;
      console.log(`\nOrder: ${orderNumber} (ID: ${order.id})`);
      console.log(`Marketplace: ${order.marketplace}`);
      console.log(`Customer Notes: ${order.customer_notes}`);

      // Group by item
      const itemMap = new Map();
      for (const task of tasks) {
        const itemId = task.orderItem.id;
        if (!itemMap.has(itemId)) {
          itemMap.set(itemId, []);
        }
        itemMap.get(itemId).push(task);
      }

      for (const [itemId, itemTasks] of itemMap.entries()) {
        const item = itemTasks[0].orderItem;
        console.log(`\n  Item: ${itemId} (SKU: ${item.product?.sku}, Quantity: ${item.quantity})`);
        console.log(`  Print Tasks (${itemTasks.length}):`);
        for (const task of itemTasks) {
          console.log(`    Task ${task.id}: Text="${task.custom_text}", Color="${task.color_1}", NeedsReview=${task.needs_review}, Reason="${task.review_reason}"`);
        }
      }

      console.log(`\n  To fix this order, run: npx tsx src/scripts/order-utils.ts fix ${orderNumber}`);
      count++;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

// Command: Fix an order with quantity mismatches
async function fixQuantityMismatch(orderNumber: string, options: { force?: boolean }) {
  try {
    console.log(`Processing order ${orderNumber}`);

    // Find the order
    const order = await prisma.order.findFirst({
      where: { shipstation_order_number: orderNumber },
      include: {
        items: {
          include: {
            product: true,
            printTasks: true
          }
        }
      }
    });

    if (!order) {
      console.error(`Order not found: ${orderNumber}`);
      return;
    }

    console.log(`Found order ${orderNumber} (ID: ${order.id})`);

    // Check if this is an eBay order
    const isEbay = order.marketplace?.toLowerCase().includes('ebay');
    if (!isEbay && !options.force) {
      console.warn(`Order ${orderNumber} is not an eBay order. Use --force to process anyway.`);
      return;
    }

    // Process each item
    for (const item of order.items) {
      console.log(`Processing item ${item.id} (SKU: ${item.product?.sku})`);

      // Skip if no product
      if (!item.product) {
        console.warn(`Item ${item.id} has no product. Skipping.`);
        continue;
      }

      // Extract personalization data
      const ebayData = extractEbayPersonalizationData(
        order.customer_notes,
        item,
        item.product,
        item.quantity
      );

      // Check for quantity mismatch
      const hasQuantityMismatch = item.printTasks.some(task =>
        task.review_reason?.includes('QUANTITY_MISMATCH') ||
        task.annotation?.includes('QUANTITY_MISMATCH')
      );

      // Parse the actual quantity from the review reason if available
      let actualQuantity = item.quantity;
      const quantityMatch = item.printTasks[0]?.review_reason?.match(/OrderQty=(\d+)/);
      if (quantityMatch && quantityMatch[1]) {
        actualQuantity = parseInt(quantityMatch[1], 10);
        console.log(`Found actual quantity ${actualQuantity} from review reason`);
      }

      if (hasQuantityMismatch || ebayData.needsReview || options.force) {
        console.log(`Item ${item.id} has quantity mismatch or needs review. Creating ${actualQuantity} tasks.`);

        // Extract existing text values from tasks
        const existingTexts: string[] = [];
        for (const task of item.printTasks) {
          if (task.custom_text) {
            existingTexts.push(task.custom_text);
          }
        }
        console.log(`Found ${existingTexts.length} existing text values: ${existingTexts.join(', ')}`);

        // Delete existing tasks
        if (item.printTasks.length > 0) {
          console.log(`Deleting ${item.printTasks.length} existing tasks for item ${item.id}`);
          await prisma.printOrderTask.deleteMany({
            where: { orderItemId: item.id }
          });
        }

        // Create tasks for each quantity
        for (let i = 0; i < actualQuantity; i++) {
          // Use existing text if available, otherwise use the extracted text
          const textToUse = existingTexts[i] || ebayData.customText || `Item ${i + 1}`;

          const taskData = {
            orderItem: { connect: { id: item.id } },
            product: { connect: { id: item.product.id } },
            order: { connect: { id: order.id } },
            taskIndex: i,
            shorthandProductName: item.product.name || 'Unknown',
            quantity: 1, // Each task represents 1 item
            custom_text: textToUse,
            color_1: ebayData.color1 || extractColorFromPrintSettings(item),
            color_2: ebayData.color2,
            ship_by_date: order.ship_by_date,
            needs_review: true, // Mark for review
            review_reason: ebayData.reviewReason || "Created by order-utils script",
            status: PrintTaskStatus.pending,
            marketplace_order_number: order.shipstation_order_number,
            annotation: `Created by order-utils script. Using text: ${textToUse}`
          };

          const task = await prisma.printOrderTask.create({
            data: taskData
          });

          console.log(`Created task ${task.id} for item ${item.id} (${i + 1}/${actualQuantity})`);
        }
      } else {
        console.log(`Item ${item.id} does not need quantity mismatch fix. Skipping.`);
      }
    }

    console.log(`Finished processing order ${orderNumber}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

// Command: Show order details
async function showOrderDetails(orderNumber: string) {
  try {
    console.log(`Showing details for order ${orderNumber}`);

    const order = await prisma.order.findFirst({
      where: { shipstation_order_number: orderNumber },
      include: {
        items: {
          include: {
            product: true,
            printTasks: true
          }
        }
      }
    });

    if (!order) {
      console.log('Order not found');
      return;
    }

    console.log(`Order: ${order.id}, Marketplace: ${order.marketplace}`);
    console.log(`Customer Notes: ${order.customer_notes}`);

    // Process each item
    for (const item of order.items) {
      console.log(`\nItem: ${item.id}, Product: ${item.product?.sku}, Quantity: ${item.quantity}`);
      console.log(`Print Settings: ${JSON.stringify(item.print_settings)}`);

      console.log(`Print Tasks (${item.printTasks.length}):`);
      for (const task of item.printTasks) {
        console.log(`  Task ${task.id}: Text="${task.custom_text}", Color="${task.color_1}", NeedsReview=${task.needs_review}, Reason="${task.review_reason}"`);
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

// Command: Reprocess an order
async function reprocessOrder(orderNumber: string) {
  try {
    console.log(`Reprocessing order ${orderNumber}`);

    // Check if the populate-print-queue.ts script exists
    const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'populate-print-queue.ts');
    if (!fs.existsSync(scriptPath)) {
      console.error(`Script not found: ${scriptPath}`);
      return;
    }

    // Run the populate-print-queue.ts script
    const { execSync } = require('child_process');
    const command = `npx tsx ${scriptPath} --order-id ${orderNumber}`;

    console.log(`Running command: ${command}`);
    const output = execSync(command, { encoding: 'utf-8' });

    console.log(output);
    console.log(`Finished reprocessing order ${orderNumber}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
  }
}

// Command: Fix status mismatches between ShipStation and database
async function fixStatusMismatch(options: { orderId?: string, fix?: boolean, verbose?: boolean }) {
  try {
    const { orderId, fix, verbose } = options;

    // Query for the order
    const where = orderId ? { shipstation_order_number: orderId } : { shipstation_order_id: { not: null } };

    console.log(`Checking order status${orderId ? ` for order ${orderId}` : 's'}...`);

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        shipstation_order_id: true,
        shipstation_order_number: true,
        order_status: true, // Internal status
        marketplace: true,
        customerId: true,
        items: {
          select: {
            id: true,
            productId: true,
            shipstationLineItemKey: true,
            printTasks: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (orders.length === 0) {
      console.log('No orders found matching criteria.');
      return { ordersChecked: 0, ordersUpdated: 0, tasksUpdated: 0 };
    }

    console.log(`Found ${orders.length} orders to check.`);

    // Status mapping from ShipStation to our DB
    const statusMapping: Record<string, string> = {
      'awaiting_payment': 'pending',
      'awaiting_shipment': 'pending',
      'shipped': 'shipped',
      'cancelled': 'cancelled',
      'on_hold': 'pending',
    };

    let ordersChecked = 0;
    let ordersUpdated = 0;
    let tasksUpdated = 0;

    for (const order of orders) {
      try {
        console.log(`Checking order ${order.id} (ShipStation ${order.shipstation_order_number || 'unknown'})...`);

        if (!order.shipstation_order_id) {
          console.warn(`Order ${order.id} has no ShipStation order ID. Skipping.`);
          continue;
        }

        // Get current status from ShipStation
        const { execSync } = require('child_process');
        const command = `npx tsx src/scripts/shipstation-api.ts get-order ${order.shipstation_order_id}`;

        console.log(`Running command: ${command}`);
        const output = execSync(command, { encoding: 'utf-8' });

        // Parse the output to get the order status
        const ssOrderMatch = output.match(/"orderStatus":\s*"([^"]+)"/);
        if (!ssOrderMatch) {
          console.warn(`Could not parse ShipStation order status for order ${order.id}. Skipping.`);
          continue;
        }

        const ssStatus = ssOrderMatch[1];
        const dbStatus = order.order_status;

        ordersChecked++;

        // Map ShipStation status to our DB status
        const mappedStatus = statusMapping[ssStatus] || dbStatus;

        if (mappedStatus !== dbStatus) {
          console.log(`Status mismatch! ShipStation has "${ssStatus}" (maps to "${mappedStatus}"), DB has "${dbStatus}"`);

          if (fix) {
            // Update the order status
            await prisma.order.update({
              where: { id: order.id },
              data: { order_status: mappedStatus }
            });

            console.log(`✓ Updated order ${order.id} status from "${dbStatus}" to "${mappedStatus}"`);
            ordersUpdated++;

            // If order is shipped or cancelled, update any pending tasks
            if (mappedStatus === 'shipped' || mappedStatus === 'cancelled') {
              const taskIdsToUpdate: number[] = [];

              for (const item of order.items) {
                for (const task of item.printTasks) {
                  if (task.status === 'pending' || task.status === 'in_progress') {
                    taskIdsToUpdate.push(task.id);
                  }
                }
              }

              if (taskIdsToUpdate.length > 0) {
                // Update tasks
                const newStatus = mappedStatus === 'shipped' ? 'completed' : 'cancelled';
                await prisma.printOrderTask.updateMany({
                  where: { id: { in: taskIdsToUpdate } },
                  data: {
                    status: newStatus,
                    updated_at: new Date()
                  }
                });

                tasksUpdated += taskIdsToUpdate.length;
                console.log(`✓ Updated ${taskIdsToUpdate.length} print tasks to ${newStatus}.`);
              } else {
                console.log(`No pending or in-progress print tasks found for order ${order.id} to update.`);
              }
            }
          } else {
            // Log if it's a dry run and status would change
            console.log(`Would update order ${order.id} status from "${dbStatus}" to "${mappedStatus}" (dry run).`);

            // Check for tasks that would be updated
            if (mappedStatus === 'shipped' || mappedStatus === 'cancelled') {
              let pendingTaskCount = 0;

              for (const item of order.items) {
                for (const task of item.printTasks) {
                  if (task.status === 'pending' || task.status === 'in_progress') {
                    pendingTaskCount++;
                  }
                }
              }

              if (pendingTaskCount > 0) {
                console.log(`Would update ${pendingTaskCount} print tasks to ${mappedStatus === 'shipped' ? 'completed' : 'cancelled'} (dry run).`);
              }
            }
          }
        } else {
          // Log if status is already correct
          console.log(`✓ Order ${order.id} status is correct: "${dbStatus}"`);
        }

        if (verbose) {
          console.log(`Order details: ${JSON.stringify(order, null, 2)}`);
        }
      } catch (error) {
        console.error(`Error processing order ${order.id}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log('\nStatus check complete:');
    console.log(`- Orders checked: ${ordersChecked}`);
    console.log(`- Orders updated: ${ordersUpdated}`);
    console.log(`- Print tasks updated: ${tasksUpdated}`);

    return { ordersChecked, ordersUpdated, tasksUpdated };
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    return { ordersChecked: 0, ordersUpdated: 0, tasksUpdated: 0 };
  }
}

// Command: Fix STL render status issues
async function fixStlRenderStatus() {
  try {
    console.log('Fixing PrintOrderTask stl_render_state values...');

    // Fix tasks with empty or null stl_render_state
    const result = await prisma.$executeRaw`
      UPDATE PrintOrderTask
      SET stl_render_state = 'pending'
      WHERE stl_render_state = '' OR stl_render_state IS NULL
    `;

    console.log(`Fixed ${result} PrintOrderTask records with invalid stl_render_state values`);

    // Fix tasks that were incorrectly set to in_progress
    const fixInProgressTasks = await prisma.$executeRaw`
      UPDATE PrintOrderTask
      SET status = 'completed'
      WHERE status = 'in_progress'
      AND stl_path IS NOT NULL
    `;

    console.log(`Fixed ${fixInProgressTasks} tasks with status="in_progress" to completed if they have STL paths`);

    // Reset any still-running tasks
    const resetRunningTasks = await prisma.$executeRaw`
      UPDATE PrintOrderTask
      SET stl_render_state = 'pending'
      WHERE stl_render_state = 'running'
    `;

    console.log(`Reset ${resetRunningTasks} tasks with stl_render_state="running" to pending`);

    return { fixedNullValues: result, fixedInProgressTasks: fixInProgressTasks, resetRunningTasks };
  } catch (error) {
    console.error('Error fixing STL render status:', error instanceof Error ? error.message : String(error));
    return { fixedNullValues: 0, fixedInProgressTasks: 0, resetRunningTasks: 0 };
  }
}

// Command: Check task status statistics
async function checkTaskStatus() {
  try {
    console.log('Checking PrintOrderTask status...');

    // Get count of tasks with different status values
    const statusCounts = await prisma.$queryRaw`
      SELECT status, COUNT(*) as count
      FROM PrintOrderTask
      GROUP BY status
    `;

    console.log('Tasks by status:');
    console.table(statusCounts);

    // Get count of tasks with different stl_render_state values
    const renderStatusCounts = await prisma.$queryRaw`
      SELECT stl_render_state, COUNT(*) as count
      FROM PrintOrderTask
      GROUP BY stl_render_state
    `;

    console.log('Tasks by stl_render_state:');
    console.table(renderStatusCounts);

    // Get count of tasks with completed status but pending stl_render_state
    const mismatchedTasks = await prisma.printOrderTask.count({
      where: {
        status: 'completed',
        stl_render_state: 'pending'
      }
    });

    console.log(`Tasks with status='completed' and stl_render_state='pending': ${mismatchedTasks}`);

    // Check if there are any tasks in running state (possible stuck tasks)
    const runningTasks = await prisma.printOrderTask.findMany({
      where: {
        stl_render_state: 'running'
      },
      select: {
        id: true,
        status: true,
        custom_text: true,
        stl_render_state: true,
        render_retries: true,
        product: {
          select: {
            sku: true,
            name: true
          }
        }
      },
      take: 10
    });

    if (runningTasks.length > 0) {
      console.log('Tasks in running state (might be stuck):');
      console.table(runningTasks);
    } else {
      console.log('No tasks stuck in running state.');
    }

    return { statusCounts, renderStatusCounts, mismatchedTasks, runningTasks };
  } catch (error) {
    console.error('Error checking task status:', error instanceof Error ? error.message : String(error));
    return { statusCounts: [], renderStatusCounts: [], mismatchedTasks: 0, runningTasks: [] };
  }
}

// Command: Batch reprocess multiple orders
async function batchReprocessOrders(options: { limit?: number, marketplace?: string, status?: string }) {
  try {
    const { limit = 10, marketplace, status } = options;

    console.log(`Finding up to ${limit} orders to reprocess...`);

    // Build the where clause
    const where: any = {};

    if (marketplace) {
      where.marketplace = { contains: marketplace };
    }

    if (status) {
      where.order_status = status;
    }

    // Find orders to process
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true,
        order_status: true
      },
      orderBy: {
        created_at: 'desc'
      },
      take: limit
    });

    if (orders.length === 0) {
      console.log('No orders found matching criteria.');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`Found ${orders.length} orders to process.`);

    let succeeded = 0;
    let failed = 0;

    for (const order of orders) {
      console.log(`Processing order ${order.id} (${order.shipstation_order_number})...`);

      try {
        // Run the populate-print-queue.ts script for this order
        const { execSync } = require('child_process');
        const command = `npx tsx src/scripts/populate-print-queue.ts --order-id ${order.shipstation_order_number}`;

        console.log(`Running command: ${command}`);
        const output = execSync(command, { encoding: 'utf-8' });

        console.log(`Successfully processed order ${order.id}.`);
        succeeded++;
      } catch (error) {
        console.error(`Failed to process order ${order.id}:`, error instanceof Error ? error.message : String(error));
        failed++;
      }
    }

    console.log('\nBatch processing complete:');
    console.log(`- Orders processed: ${orders.length}`);
    console.log(`- Succeeded: ${succeeded}`);
    console.log(`- Failed: ${failed}`);

    return { processed: orders.length, succeeded, failed };
  } catch (error) {
    console.error('Error batch processing orders:', error instanceof Error ? error.message : String(error));
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}

// Main program
async function main() {
  const program = new Command();

  program
    .name('order-utils')
    .description('Utility script for managing orders and print tasks')
    .version('1.0.0');

  // Find orders with quantity mismatches
  program
    .command('find')
    .description('Find orders with quantity mismatches')
    .option('-m, --marketplace <marketplace>', 'Marketplace to search (default: ebay)')
    .option('-l, --limit <limit>', 'Maximum number of orders to show', '10')
    .action((options) => {
      findQuantityMismatches({
        marketplace: options.marketplace,
        limit: parseInt(options.limit, 10)
      }).finally(() => prisma.$disconnect());
    });

  // Fix an order with quantity mismatches
  program
    .command('fix <orderNumber>')
    .description('Fix an order with quantity mismatches')
    .option('-f, --force', 'Force processing even if not an eBay order')
    .action((orderNumber, options) => {
      fixQuantityMismatch(orderNumber, {
        force: options.force
      }).finally(() => prisma.$disconnect());
    });

  // Show order details
  program
    .command('show <orderNumber>')
    .description('Show order details')
    .action((orderNumber) => {
      showOrderDetails(orderNumber).finally(() => prisma.$disconnect());
    });

  // Reprocess an order
  program
    .command('reprocess <orderNumber>')
    .description('Reprocess an order using populate-print-queue.ts')
    .action((orderNumber) => {
      reprocessOrder(orderNumber).finally(() => prisma.$disconnect());
    });

  // Fix status mismatches
  program
    .command('fix-status')
    .description('Fix status mismatches between ShipStation and database')
    .option('-o, --order-id <orderId>', 'Specific order to check')
    .option('-f, --fix', 'Apply fixes (without this flag, runs in dry-run mode)', false)
    .option('-v, --verbose', 'Show detailed information', false)
    .action((options) => {
      fixStatusMismatch({
        orderId: options.orderId,
        fix: options.fix,
        verbose: options.verbose
      }).finally(() => prisma.$disconnect());
    });

  // Fix STL render status
  program
    .command('fix-stl')
    .description('Fix STL render status issues')
    .action(() => {
      fixStlRenderStatus().finally(() => prisma.$disconnect());
    });

  // Check task status
  program
    .command('check-tasks')
    .description('Check task status statistics')
    .action(() => {
      checkTaskStatus().finally(() => prisma.$disconnect());
    });

  // Batch reprocess orders
  program
    .command('batch-reprocess')
    .description('Batch reprocess multiple orders')
    .option('-l, --limit <limit>', 'Maximum number of orders to process', '10')
    .option('-m, --marketplace <marketplace>', 'Filter by marketplace (e.g., amazon, ebay)')
    .option('-s, --status <status>', 'Filter by order status (e.g., pending, shipped)')
    .action((options) => {
      batchReprocessOrders({
        limit: parseInt(options.limit, 10),
        marketplace: options.marketplace,
        status: options.status
      }).finally(() => prisma.$disconnect());
    });

  program.parse();
}

main().catch(console.error);
