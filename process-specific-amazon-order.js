import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

// The specific Amazon order number we want to process
const TARGET_ORDER = '202-5372118-2925947';

async function main() {
  try {
    console.log(`Checking if order ${TARGET_ORDER} exists in database...`);
    
    // Try to find the order by shipstation_order_number
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: TARGET_ORDER
      },
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true,
        order_status: true,
        items: {
          select: {
            id: true,
            print_settings: true,
            printTasks: {
              select: {
                id: true,
                custom_text: true,
                color_1: true,
                color_2: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      console.log(`ERROR: Order ${TARGET_ORDER} not found in database. Attempting to sync from ShipStation...`);
      
      // Run order-sync to fetch the order from ShipStation
      console.log(`Running order-sync to fetch the order...`);
      const syncProcess = spawn('npx', ['tsx', 'src/scripts/order-sync.ts', 'sync', '--mode=single', '--order-id', TARGET_ORDER, '--skip-tags'], {
        stdio: 'inherit'
      });
      
      // Wait for the sync process to complete
      await new Promise((resolve) => {
        syncProcess.on('close', (code) => {
          console.log(`Sync process exited with code ${code}`);
          resolve();
        });
        
        syncProcess.on('error', (err) => {
          console.error('Failed to start sync process:', err);
          resolve();
        });
      });
      
      // Check again if order exists after sync
      const syncedOrder = await prisma.order.findFirst({
        where: {
          shipstation_order_number: TARGET_ORDER
        },
        select: {
          id: true,
          shipstation_order_number: true
        }
      });
      
      if (!syncedOrder) {
        console.log(`ERROR: Order ${TARGET_ORDER} still not found after sync attempt. Exiting.`);
        return;
      }
      
      console.log(`Successfully synced order. Found with ID: ${syncedOrder.id}`);
      return main(); // Restart the process now that the order is synced
    }

    const targetId = order.id;
    console.log(`Found order in database:`, {
      id: targetId,
      shipstation_order_number: order.shipstation_order_number,
      marketplace: order.marketplace,
      order_status: order.order_status,
      items: order.items.map(item => ({
        id: item.id,
        hasCustomization: item.print_settings ? true : false,
        existingTasks: item.printTasks.length
      }))
    });
    
    // First, delete any existing tasks for this order
    console.log(`Deleting existing print tasks for order ID ${targetId}...`);
    const deleteResult = await prisma.printOrderTask.deleteMany({
      where: { orderId: targetId }
    });
    
    console.log(`Deleted ${deleteResult.count} existing print tasks.`);
    
    // Now run the populate script with a very specific command line
    console.log(`Running populate-print-queue for order ID ${targetId}...`);
    
    // Use spawn with stdio: 'inherit' to see output directly
    const populateProcess = spawn('npx', [
      'tsx', 
      'src/scripts/populate-print-queue.ts', 
      `--order-id=${targetId}`, 
      '--force-recreate', 
      '--preserve-text',
      '--log-level=debug' // Add debug logging
    ], {
      stdio: 'inherit' // This will pipe output directly to our terminal
    });
    
    // Handle process completion
    populateProcess.on('close', (code) => {
      console.log(`populate-print-queue process exited with code ${code}`);
      
      // Check the results after running
      checkResults(targetId).then(() => {
        prisma.$disconnect();
      });
    });
    
    // Error handling
    populateProcess.on('error', (err) => {
      console.error('Failed to start populate-print-queue process:', err);
      prisma.$disconnect();
    });

  } catch (error) {
    console.error('Error in main function:', error);
    await prisma.$disconnect();
  }
}

// Function to check the results after processing
async function checkResults(targetId) {
  try {
    const updatedOrder = await prisma.order.findUnique({
      where: {
        id: targetId
      },
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true,
        order_status: true,
        items: {
          select: {
            id: true,
            print_settings: true,
            printTasks: {
              select: {
                id: true,
                custom_text: true,
                color_1: true,
                color_2: true,
                status: true,
                needs_review: true,
                review_reason: true
              }
            }
          }
        }
      }
    });

    if (!updatedOrder) {
      console.log(`ERROR: Order with database ID ${targetId} not found after processing.`);
      return;
    }

    console.log('\n====== RESULTS AFTER PROCESSING ======');
    console.log(`Order ID: ${updatedOrder.id} (${updatedOrder.shipstation_order_number})`);
    
    for (const item of updatedOrder.items) {
      console.log(`\nItem ID: ${item.id}`);
      console.log(`CustomizedURL in print_settings: ${item.print_settings && item.print_settings.CustomizedURL ? 'YES' : 'NO'}`);
      
      if (item.printTasks.length === 0) {
        console.log('  No print tasks were created for this item.');
      } else {
        console.log(`  ${item.printTasks.length} print tasks found:`);
        
        item.printTasks.forEach((task, idx) => {
          console.log(`  Task ${idx + 1}:`);
          console.log(`    ID: ${task.id}`);
          console.log(`    Text: ${task.custom_text}`);
          console.log(`    Color 1: ${task.color_1}`);
          console.log(`    Color 2: ${task.color_2}`);
          console.log(`    Status: ${task.status}`);
          console.log(`    Needs Review: ${task.needs_review}`);
          if (task.needs_review) {
            console.log(`    Review Reason: ${task.review_reason}`);
          }
        });
      }
    }
    
    console.log('\n====== END RESULTS ======');
    
  } catch (error) {
    console.error('Error checking results:', error);
  }
}

main(); 
