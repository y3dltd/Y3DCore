#!/usr/bin/env ts-node
/**
 * Check Order Script
 *
 * This script checks the details of a specific order and its print tasks
 *
 * Usage:
 *   npx tsx scripts/check-order.ts <order-number>
 */

import { PrismaClient, PrintTaskStatus } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

async function checkOrder(orderNumber: string) {
  try {
    console.log(`Checking order: ${orderNumber}`);

    // Find the order
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: orderNumber
      },
      include: {
        printTasks: true,
        items: {
          include: {
            product: true,
            printTasks: true
          }
        }
      }
    });

    if (!order) {
      console.log(`Order ${orderNumber} not found.`);
      return;
    }

    // Print order details
    console.log('\nOrder Details:');
    console.log(`ID: ${order.id}`);
    console.log(`Marketplace: ${order.marketplace}`);
    console.log(`Order Number: ${order.shipstation_order_number}`);
    console.log(`Status: ${order.order_status}`);
    console.log(`Created: ${order.created_at}`);
    console.log(`Updated: ${order.updated_at}`);

    // Print task details
    console.log(`\nPrint Tasks (${order.printTasks.length}):`);

    if (order.printTasks.length === 0) {
      console.log('No print tasks found for this order.');
    } else {
      // Group tasks by status
      const tasksByStatus = order.printTasks.reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('Tasks by status:');
      Object.entries(tasksByStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });

      // Count tasks that need review
      const needsReviewCount = order.printTasks.filter(task => task.needs_review).length;
      console.log(`\nTasks needing review: ${needsReviewCount}`);

      // Print details of tasks needing review
      if (needsReviewCount > 0) {
        console.log('\nTasks needing review details:');
        const reviewTasks = order.printTasks.filter(task => task.needs_review);
        reviewTasks.forEach((task, index) => {
          console.log(`\nTask ${index + 1}:`);
          console.log(`  ID: ${task.id}`);
          console.log(`  Status: ${task.status}`);
          console.log(`  Product: ${task.shorthandProductName || 'Unknown'}`);
          console.log(`  Product ID: ${task.productId || 'Unknown'}`);
          console.log(`  Custom Text: ${task.custom_text}`);
          console.log(`  Review Reason: ${task.review_reason}`);
          console.log(`  Created: ${task.created_at}`);
          console.log(`  Updated: ${task.updated_at}`);
        });
      }

      // Check for AI calls related to this order
      console.log('\nChecking AI calls for this order...');
      const aiCalls = await prisma.aiCallLog.findMany({
        where: {
          orderId: order.id
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (aiCalls.length === 0) {
        console.log('No AI calls found for this order.');
      } else {
        console.log(`Found ${aiCalls.length} AI calls for this order:`);
        aiCalls.forEach((call, index) => {
          console.log(`\nAI Call ${index + 1}:`);
          console.log(`  ID: ${call.id}`);
          console.log(`  Model: ${call.modelUsed}`);
          console.log(`  AI Provider: ${call.aiProvider}`);
          console.log(`  Created: ${call.createdAt}`);

          // Print a snippet of the prompt and response
          if (call.promptSent) {
            const promptSnippet = call.promptSent.substring(0, 100) + (call.promptSent.length > 100 ? '...' : '');
            console.log(`  Prompt: ${promptSnippet}`);
          }

          if (call.rawResponse) {
            const responseSnippet = call.rawResponse.substring(0, 100) + (call.rawResponse.length > 100 ? '...' : '');
            console.log(`  Response: ${responseSnippet}`);
          }

          console.log(`  Success: ${call.success}`);
          console.log(`  Tasks Generated: ${call.tasksGenerated}`);
          console.log(`  Needs Review Count: ${call.needsReviewCount}`);
          if (call.errorMessage) {
            console.log(`  Error: ${call.errorMessage}`);
          }
        });
      }
    }

  } catch (error) {
    console.error('Error checking order:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get order number from command line arguments
const orderNumber = process.argv[2];

if (!orderNumber) {
  console.error('Please provide an order number as a command line argument.');
  process.exit(1);
}

// Run the script
checkOrder(orderNumber)
  .then(() => {
    console.log('\nOrder check completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
