// filepath: /home/jayson/y3dhub/testing/check-order.js
import { PrismaClient } from '@prisma/client';
import util from 'util';
import { Command } from 'commander';

const prisma = new PrismaClient();

async function checkSpecificOrder(orderId, options = { compareResponses: false, showFullResponse: false }) {
  // First, fetch the order with its items
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: true
        }
      },
      printTasks: true
    }
  });
  
  if (!order) {
    console.log(`Order with ID ${orderId} not found.`);
    return;
  }
  
  console.log(`\n=== ORDER DETAILS ===`);
  console.log(`ID: ${order.id}`);
  console.log(`Order Number: ${order.shipstation_order_number}`);
  console.log(`Marketplace: ${order.marketplace}`);
  console.log(`Status: ${order.order_status}`);
  console.log(`Customer Notes: ${order.customer_notes}`);
  
  // For eBay orders, analyze personalization format more carefully
  if (order.marketplace?.toLowerCase().includes('ebay') && order.customer_notes) {
    console.log(`\n=== PERSONALIZATION ANALYSIS ===`);
    
    // Check for newlines in the text
    const personalTextMatch = order.customer_notes.match(/Text:\s*(.*?)(?=\n|$)/s);
    if (personalTextMatch && personalTextMatch[1]) {
      const text = personalTextMatch[1].trim();
      console.log(`Extracted Text: "${text}"`);
      
      // Count lines in the text
      const lines = text.split('\n').filter(line => line.trim() !== '');
      console.log(`Number of lines in text: ${lines.length}`);
      if (lines.length > 1) {
        console.log(`Line-by-line breakdown:`);
        lines.forEach((line, i) => {
          console.log(`  Line ${i+1}: "${line.trim()}"`);
        });
      }
      
      // Detect if there are likely multiple names (simple heuristic)
      const commaNames = text.split(',').filter(name => name.trim() !== '');
      const andNames = text.split(' and ').filter(name => name.trim() !== '');
      const ampNames = text.split('&').filter(name => name.trim() !== '');
      
      if (lines.length > 1 || commaNames.length > 1 || andNames.length > 1 || ampNames.length > 1) {
        console.log('\n⚠️ POTENTIAL MULTI-NAME DETECTION:');
        console.log(`- Names across lines: ${lines.length > 1 ? 'YES' : 'NO'}`);
        console.log(`- Names separated by commas: ${commaNames.length > 1 ? 'YES' : 'NO'}`);
        console.log(`- Names separated by 'and': ${andNames.length > 1 ? 'YES' : 'NO'}`);
        console.log(`- Names separated by '&': ${ampNames.length > 1 ? 'YES' : 'NO'}`);
      }
    }
  }
  
  console.log(`\n=== ORDER ITEMS ===`);
  for (const item of order.items) {
    console.log(`\nItem ID: ${item.id}`);
    console.log(`SKU: ${item.sku}`);
    console.log(`Product Name: ${item.product?.name || 'Unknown'}`);
    console.log(`Quantity: ${item.quantity}`);
    console.log(`Print Settings: ${JSON.stringify(item.print_settings, null, 2)}`);
  }
  
  console.log(`\n=== PRINT TASKS ===`);
  for (const task of order.printTasks) {
    console.log(`\nTask ID: ${task.id}`);
    console.log(`Product Name: ${task.product_name}`);
    console.log(`Custom Text: "${task.custom_text}"`);
    console.log(`Color 1: ${task.color_1}`);
    console.log(`Color 2: ${task.color_2}`);
    console.log(`Quantity: ${task.quantity}`);
    console.log(`Needs Review: ${task.needs_review}`);
    console.log(`Review Reason: ${task.review_reason}`);
    console.log(`Status: ${task.status}`);
  }
  
  // Check for quantity mismatch
  const totalTaskQuantity = order.printTasks.reduce((sum, task) => sum + task.quantity, 0);
  const totalOrderQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  
  if (totalTaskQuantity !== totalOrderQuantity) {
    console.log(`\n⚠️ QUANTITY MISMATCH DETECTED:`);
    console.log(`- Total items ordered: ${totalOrderQuantity}`);
    console.log(`- Total items in print tasks: ${totalTaskQuantity}`);
  }
  
  // Check AI logs for this order
  const aiLogs = await prisma.aiCallLog.findMany({
    where: {
      orderId: orderId
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  if (aiLogs.length > 0) {
    console.log(`\n=== AI PROCESSING LOGS (${aiLogs.length} entries) ===`);
    
    // Show detailed log info
    for (const log of aiLogs) {
      console.log(`\nLog ID: ${log.id}`);
      console.log(`Created: ${log.createdAt}`);
      console.log(`Success: ${log.success}`);
      console.log(`Model Used: ${log.modelUsed}`);
      
      if (options.showFullResponse) {
        console.log(`Full Raw Response:`);
        console.log(log.rawResponse);
      } else {
        try {
          const parsedResponse = JSON.parse(log.rawResponse || '{}');
          console.log(`Parsed Response (truncated):`);
          console.log(JSON.stringify(parsedResponse, null, 2).substring(0, 500) + '...');
        } catch (e) {
          console.log(`Raw Response (truncated): ${(log.rawResponse || '').substring(0, 500)}...`);
        }
      }
    }
  } else {
    console.log(`\n=== NO AI LOGS FOUND FOR THIS ORDER ===`);
  }
}

// Simple version for testing directly
const orderId = 29398; // The OrderID from your request
checkSpecificOrder(orderId, { showFullResponse: false })
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
