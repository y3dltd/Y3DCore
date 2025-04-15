#!/usr/bin/env ts-node
/**
 * Verify Print Tasks Script
 * 
 * This script verifies that all orders with "awaiting_shipment" status have print tasks
 * 
 * Usage:
 *   npx tsx scripts/verify-print-tasks.ts
 */

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

async function verifyPrintTasks() {
  try {
    console.log('Verifying print tasks for all orders with "awaiting_shipment" status...');
    
    // Find all orders with "awaiting_shipment" status
    const orders = await prisma.order.findMany({
      where: {
        order_status: 'awaiting_shipment'
      },
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true,
        created_at: true,
        items: {
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                name: true
              }
            }
          }
        },
        printTasks: {
          select: {
            id: true,
            status: true,
            custom_text: true,
            color_1: true,
            quantity: true,
            needs_review: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    console.log(`Found ${orders.length} orders with "awaiting_shipment" status.`);
    
    // Verify that each order has print tasks
    let ordersWithoutTasks = 0;
    let ordersWithTasks = 0;
    let totalTasks = 0;
    let needsReviewTasks = 0;
    
    for (const order of orders) {
      const taskCount = order.printTasks.length;
      totalTasks += taskCount;
      
      if (taskCount === 0) {
        ordersWithoutTasks++;
        console.log(`Order ${order.id} (${order.shipstation_order_number}) has no print tasks.`);
      } else {
        ordersWithTasks++;
        
        // Count tasks that need review
        const reviewTasks = order.printTasks.filter(task => task.needs_review);
        needsReviewTasks += reviewTasks.length;
        
        if (reviewTasks.length > 0) {
          console.log(`Order ${order.id} (${order.shipstation_order_number}) has ${reviewTasks.length} tasks that need review.`);
        }
      }
    }
    
    // Print summary
    console.log('\nSummary:');
    console.log(`Total orders: ${orders.length}`);
    console.log(`Orders with tasks: ${ordersWithTasks}`);
    console.log(`Orders without tasks: ${ordersWithoutTasks}`);
    console.log(`Total tasks: ${totalTasks}`);
    console.log(`Tasks that need review: ${needsReviewTasks}`);
    
    // Check for specific issues
    console.log('\nChecking for specific issues...');
    
    // Check for tasks with null custom_text
    const tasksWithNullText = await prisma.printOrderTask.count({
      where: {
        custom_text: null,
        order: {
          order_status: 'awaiting_shipment'
        }
      }
    });
    console.log(`Tasks with null custom_text: ${tasksWithNullText}`);
    
    // Check for tasks with null color_1
    const tasksWithNullColor = await prisma.printOrderTask.count({
      where: {
        color_1: null,
        order: {
          order_status: 'awaiting_shipment'
        }
      }
    });
    console.log(`Tasks with null color_1: ${tasksWithNullColor}`);
    
    // Check for tasks with quantity > 1
    const tasksWithMultipleQuantity = await prisma.printOrderTask.count({
      where: {
        quantity: {
          gt: 1
        },
        order: {
          order_status: 'awaiting_shipment'
        }
      }
    });
    console.log(`Tasks with quantity > 1: ${tasksWithMultipleQuantity}`);
    
  } catch (error) {
    console.error('Error verifying print tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
verifyPrintTasks()
  .then(() => {
    console.log('\nVerification completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
