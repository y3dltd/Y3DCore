import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

// The exact Amazon order we want to check
const TARGET_ORDER = '202-5372118-2925947';

async function main() {
  try {
    console.log(`Checking database for Amazon order: ${TARGET_ORDER}`);

    // Check if order exists in the DB
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: TARGET_ORDER
      },
      select: {
        id: true,
        shipstation_order_id: true,
        shipstation_order_number: true,
        marketplace: true,
        order_status: true,
        order_date: true,
        items: {
          select: {
            id: true,
            productId: true,
            print_settings: true,
            product: {
              select: {
                name: true
              }
            },
            printTasks: true
          }
        }
      }
    });

    if (!order) {
      console.log(`Order ${TARGET_ORDER} NOT FOUND in database`);
      
      console.log('Attempting to sync with ShipStation...');
      
      // Spawn a child process to run sync-orders for this specific order
      console.log(`Running: npx tsx src/scripts/order-sync.ts sync --mode=single --order-id=${TARGET_ORDER} --skip-tags`);
      
      const syncProcess = spawn('npx', [
        'tsx', 
        'src/scripts/order-sync.ts', 
        'sync', 
        '--mode=single',
        `--order-id=${TARGET_ORDER}`,
        '--skip-tags'
      ], {
        stdio: 'inherit'
      });
      
      // Wait for completion
      await new Promise((resolve) => {
        syncProcess.on('close', (code) => {
          console.log(`Sync process exited with code ${code}`);
          resolve();
        });
      });
      
      // Check again after sync attempt
      await checkAfterSync();
      
    } else {
      // Order found, display detailed info
      console.log('ORDER FOUND IN DATABASE:');
      console.log('------------------------');
      console.log(`Order ID (DB): ${order.id}`);
      console.log(`ShipStation ID: ${order.shipstation_order_id}`);
      console.log(`ShipStation Order Number: ${order.shipstation_order_number}`);
      console.log(`Marketplace: ${order.marketplace}`);
      console.log(`Status: ${order.order_status}`);
      console.log(`Date: ${order.order_date}`);
      console.log('\nItems:');
      
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}`);
        console.log(`    Product: ${item.product?.name || 'Unknown'}`);
        console.log(`    Has CustomizedURL: ${item.print_settings && item.print_settings.CustomizedURL ? 'YES' : 'NO'}`);
        if (item.print_settings && item.print_settings.CustomizedURL) {
          console.log(`    URL: ${item.print_settings.CustomizedURL}`);
        }
        console.log(`    Print Tasks: ${item.printTasks.length}`);
        console.log('');
      }
      
      // Ask if we want to process this order
      console.log('\nDo you want to process this order with the populate-print-queue script? (y/n)');
      
      // Since we can't easily get user input in this environment, let's just go ahead
      console.log('Automatically proceeding to process this order...');
      await processOrder(order.id);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function checkAfterSync() {
  // Check if order exists in the DB after sync attempt
  const order = await prisma.order.findFirst({
    where: {
      shipstation_order_number: TARGET_ORDER
    },
    select: {
      id: true,
      shipstation_order_id: true,
      shipstation_order_number: true
    }
  });
  
  if (order) {
    console.log(`Success! Order ${TARGET_ORDER} was found after sync. DB ID: ${order.id}`);
    await processOrder(order.id);
  } else {
    console.log(`Failed. Order ${TARGET_ORDER} was NOT found after sync attempt.`);
    console.log('This could mean:');
    console.log('1. The order number is incorrect');
    console.log('2. The order is not in ShipStation');
    console.log('3. There was an issue with the sync process');
  }
}

async function processOrder(orderId) {
  console.log(`\nProcessing order ID ${orderId} with populate-print-queue...`);
  
  // First delete any existing tasks
  console.log('Deleting any existing print tasks...');
  const deleteResult = await prisma.printOrderTask.deleteMany({
    where: { orderId }
  });
  console.log(`Deleted ${deleteResult.count} existing tasks.`);
  
  // Run the populate-print-queue script with the specific order ID
  console.log(`Running: npx tsx src/scripts/populate-print-queue.ts --order-id=${orderId} --force-recreate --preserve-text`);
  
  const populateProcess = spawn('npx', [
    'tsx', 
    'src/scripts/populate-print-queue.ts', 
    `--order-id=${orderId}`, 
    '--force-recreate', 
    '--preserve-text'
  ], {
    stdio: 'inherit'
  });
  
  // Wait for completion
  await new Promise((resolve) => {
    populateProcess.on('close', (code) => {
      console.log(`populate-print-queue process exited with code ${code}`);
      resolve();
    });
  });
  
  // Check the results
  const finalOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      shipstation_order_number: true,
      items: {
        select: {
          id: true,
          printTasks: {
            select: {
              id: true,
              custom_text: true,
              color_1: true,
              color_2: true,
              status: true,
              needs_review: true
            }
          }
        }
      }
    }
  });
  
  console.log('\nFINAL RESULTS:');
  console.log(`Order: ${finalOrder?.shipstation_order_number}`);
  
  if (finalOrder) {
    for (const item of finalOrder.items) {
      console.log(`\nItem ID: ${item.id}`);
      console.log(`Print Tasks: ${item.printTasks.length}`);
      
      for (const task of item.printTasks) {
        console.log(`  Task ID: ${task.id}`);
        console.log(`  Text: ${task.custom_text}`);
        console.log(`  Color 1: ${task.color_1}`);
        console.log(`  Color 2: ${task.color_2 || 'N/A'}`);
        console.log(`  Status: ${task.status}`);
        console.log(`  Needs Review: ${task.needs_review ? 'YES' : 'NO'}`);
      }
    }
  }
}

main(); 
