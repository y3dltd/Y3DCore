#!/usr/bin/env ts-node
/**
 * Reprocess All Orders Script
 * 
 * This script reprocesses all orders with "awaiting_shipment" status
 * 
 * Usage:
 *   npx tsx scripts/reprocess-all-orders.ts
 */

import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import * as readline from 'readline';

// Initialize Prisma client
const prisma = new PrismaClient();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askForConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function reprocessAllOrders() {
  try {
    // Find all orders with "awaiting_shipment" status
    const orders = await prisma.order.findMany({
      where: {
        order_status: 'awaiting_shipment'
      },
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true,
        created_at: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    console.log(`Found ${orders.length} orders with "awaiting_shipment" status.`);
    
    // Ask for confirmation
    const confirmed = await askForConfirmation(
      `This will reprocess ${orders.length} orders. Are you sure you want to proceed? (y/n): `
    );
    
    if (!confirmed) {
      console.log('Operation cancelled.');
      return;
    }
    
    // Process orders in batches to avoid overloading the system
    const batchSize = 10;
    const totalBatches = Math.ceil(orders.length / batchSize);
    
    console.log(`Processing orders in ${totalBatches} batches of ${batchSize}...`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min((batchIndex + 1) * batchSize, orders.length);
      const batchOrders = orders.slice(batchStart, batchEnd);
      
      console.log(`\nProcessing batch ${batchIndex + 1}/${totalBatches} (orders ${batchStart + 1}-${batchEnd})...`);
      
      for (const order of batchOrders) {
        console.log(`Processing order ${order.id} (${order.shipstation_order_number})...`);
        
        // Run the populate-print-queue script for this order
        await new Promise<void>((resolve, reject) => {
          const process = spawn('npm', ['run', 'populate-queue', '--', `--order-id=${order.id}`], {
            stdio: 'inherit'
          });
          
          process.on('close', (code) => {
            if (code === 0) {
              console.log(`Successfully processed order ${order.id}.`);
              resolve();
            } else {
              console.error(`Failed to process order ${order.id} with exit code ${code}.`);
              resolve(); // Continue with next order even if this one fails
            }
          });
          
          process.on('error', (err) => {
            console.error(`Error processing order ${order.id}:`, err);
            resolve(); // Continue with next order even if this one fails
          });
        });
        
        // Add a small delay between orders to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`Completed batch ${batchIndex + 1}/${totalBatches}.`);
      
      // Add a delay between batches to avoid overloading the system
      if (batchIndex < totalBatches - 1) {
        console.log('Waiting 5 seconds before processing next batch...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log('\nAll orders have been processed.');
    
  } catch (error) {
    console.error('Error reprocessing orders:', error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

// Run the script
reprocessAllOrders()
  .then(() => {
    console.log('\nOperation completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
