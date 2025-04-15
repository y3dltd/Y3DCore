#!/usr/bin/env ts-node
/**
 * Check Order History Script
 * 
 * This script checks the history of a specific order's status changes
 * 
 * Usage:
 *   npx tsx scripts/check-order-history.ts <order-number>
 */

import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

async function checkOrderHistory(orderNumber: string) {
  try {
    console.log(`Checking order history for: ${orderNumber}`);
    
    // Find the order
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: orderNumber
      },
      select: {
        id: true,
        order_status: true,
        created_at: true,
        updated_at: true
      }
    });
    
    if (!order) {
      console.log(`Order ${orderNumber} not found.`);
      return;
    }
    
    // Print current order status
    console.log('\nCurrent Order Status:');
    console.log(`Status: ${order.order_status}`);
    console.log(`Created: ${order.created_at}`);
    console.log(`Last Updated: ${order.updated_at}`);
    
    // Check for order status history in the database
    // Note: This assumes you have a table that tracks order status changes
    // If you don't have such a table, this will need to be modified
    try {
      const statusHistory = await prisma.$queryRaw`
        SELECT * FROM OrderStatusHistory 
        WHERE orderId = ${order.id} 
        ORDER BY timestamp ASC
      `;
      
      if (Array.isArray(statusHistory) && statusHistory.length > 0) {
        console.log('\nOrder Status History:');
        statusHistory.forEach((entry: any, index: number) => {
          console.log(`${index + 1}. ${entry.oldStatus} -> ${entry.newStatus} (${entry.timestamp})`);
        });
      } else {
        console.log('\nNo status history found in OrderStatusHistory table.');
      }
    } catch (error) {
      console.log('\nOrderStatusHistory table may not exist or there was an error querying it.');
    }
    
    // Check for AI calls related to this order to see if there are any clues
    console.log('\nChecking AI calls for this order...');
    const aiCalls = await prisma.aiCallLog.findMany({
      where: {
        orderId: order.id
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        id: true,
        createdAt: true,
        success: true,
        errorMessage: true,
        promptSent: true
      }
    });
    
    if (aiCalls.length === 0) {
      console.log('No AI calls found for this order.');
    } else {
      console.log(`Found ${aiCalls.length} AI calls for this order:`);
      
      // Look for clues in the AI prompts about order status
      for (const call of aiCalls) {
        if (call.promptSent && call.promptSent.includes('order_status')) {
          console.log(`\nAI call ${call.id} (${call.createdAt}) contains order status information:`);
          
          // Extract the part of the prompt that mentions order status
          const lines = call.promptSent.split('\n');
          for (const line of lines) {
            if (line.includes('order_status')) {
              console.log(`  ${line.trim()}`);
            }
          }
        }
      }
    }
    
    // Check the sync logs for this order
    console.log('\nChecking sync logs for this order...');
    try {
      const syncLogs = await prisma.$queryRaw`
        SELECT * FROM SyncLog 
        WHERE JSON_CONTAINS(details, JSON_OBJECT('orderId', ${order.id})) 
        OR JSON_CONTAINS(details, JSON_OBJECT('orderNumber', ${orderNumber}))
        ORDER BY createdAt ASC
      `;
      
      if (Array.isArray(syncLogs) && syncLogs.length > 0) {
        console.log(`Found ${syncLogs.length} sync logs for this order.`);
        syncLogs.forEach((log: any, index: number) => {
          console.log(`\nSync Log ${index + 1}:`);
          console.log(`  Time: ${log.createdAt}`);
          console.log(`  Type: ${log.syncType}`);
          console.log(`  Status: ${log.status}`);
          if (log.details) {
            try {
              const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
              if (details.orderStatus) {
                console.log(`  Order Status: ${details.orderStatus}`);
              }
            } catch (e) {
              console.log(`  Could not parse details: ${e}`);
            }
          }
        });
      } else {
        console.log('No sync logs found for this order.');
      }
    } catch (error) {
      console.log('\nError querying sync logs:', error);
    }
    
  } catch (error) {
    console.error('Error checking order history:', error);
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
checkOrderHistory(orderNumber)
  .then(() => {
    console.log('\nOrder history check completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
