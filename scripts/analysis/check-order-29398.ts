#!/usr/bin/env ts-node
/**
 * Check Order 29398 Script
 *
 * This script checks the print tasks for order 29398 (05-12926-36577)
 *
 * Usage:
 *   npx tsx scripts/check-order-29398.ts
 */

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

async function checkOrder29398() {
  try {
    const orderId = 29398;
    console.log(`Checking order ID: ${orderId} (05-12926-36577)`);

    // Find the order
    const order = await prisma.order.findUnique({
      where: {
        id: orderId
      },
      select: {
        id: true,
        shipstation_order_number: true,
        order_status: true,
        created_at: true,
        updated_at: true,
        customer_notes: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      console.log(`Order ID ${orderId} not found.`);
      return;
    }

    // Print order details
    console.log('\nOrder Details:');
    console.log(`ID: ${order.id}`);
    console.log(`Order Number: ${order.shipstation_order_number}`);
    console.log(`Status: ${order.order_status}`);
    console.log(`Created: ${order.created_at}`);
    console.log(`Updated: ${order.updated_at}`);
    console.log(`Customer Notes: ${order.customer_notes || 'None'}`);

    // Print items
    console.log('\nOrder Items:');
    order.items.forEach((item, index) => {
      console.log(`\nItem ${index + 1}:`);
      console.log(`  ID: ${item.id}`);
      console.log(`  Product: ${item.product?.name || 'Unknown'}`);
      console.log(`  Quantity: ${item.quantity}`);
    });

    // Get print tasks for this order
    const printTasks = await prisma.printOrderTask.findMany({
      where: {
        orderId: orderId
      },
      orderBy: {
        id: 'asc'
      }
    });

    if (printTasks.length === 0) {
      console.log('\nNo print tasks found for this order.');
      return;
    }

    console.log(`\nFound ${printTasks.length} print tasks:`);

    // Print task details
    printTasks.forEach((task, index) => {
      console.log(`\nTask ${index + 1}:`);
      console.log(`  ID: ${task.id}`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Custom Text: ${task.custom_text}`);
      console.log(`  Color 1: ${task.color_1}`);
      console.log(`  Color 2: ${task.color_2 || 'None'}`);
      console.log(`  Quantity: ${task.quantity}`);
      console.log(`  Needs Review: ${task.needs_review ? 'Yes' : 'No'}`);
      console.log(`  Review Reason: ${task.review_reason || 'None'}`);
      console.log(`  Created: ${task.created_at}`);
      console.log(`  Updated: ${task.updated_at}`);
    });

    // Check AI call logs for this order
    console.log('\nAI Call Logs:');
    const aiCalls = await prisma.aiCallLog.findMany({
      where: {
        orderId: orderId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    });

    if (aiCalls.length === 0) {
      console.log('No AI call logs found for this order.');
    } else {
      const aiCall = aiCalls[0];
      console.log(`  ID: ${aiCall.id}`);
      console.log(`  Model: ${aiCall.modelUsed}`);
      console.log(`  Success: ${aiCall.success}`);
      console.log(`  Tasks Generated: ${aiCall.tasksGenerated}`);
      console.log(`  Created: ${aiCall.createdAt}`);

      // Print the raw response
      if (aiCall.rawResponse) {
        console.log('\nAI Response:');
        console.log(aiCall.rawResponse);
      }
    }

  } catch (error) {
    console.error('Error checking order:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
checkOrder29398()
  .then(() => {
    console.log('\nOrder check completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
