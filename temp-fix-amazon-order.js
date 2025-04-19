import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

// The target Amazon order number
const TARGET_ORDER = '205-2163483-4200322';

async function main() {
  try {
    console.log(`Checking if order ${TARGET_ORDER} exists in database...`);
    
    // Try to find the order
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: TARGET_ORDER
      },
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true,
        order_status: true
      }
    });

    if (order) {
      console.log(`Order found in database:`, order);
      
      // If order exists, run the populate-print-queue command directly
      console.log(`Running populate-print-queue for order ID ${order.id}...`);
      
      // Use spawn instead of exec for better output handling
      const populateProcess = spawn('npx', ['tsx', 'src/scripts/populate-print-queue.ts', `--order-id=${order.id}`, '--force-recreate', '--preserve-text'], {
        stdio: 'inherit' // This will pipe output directly to our terminal
      });
      
      // Handle process completion
      populateProcess.on('close', (code) => {
        console.log(`populate-print-queue process exited with code ${code}`);
        prisma.$disconnect();
      });
      
      // Just in case there's an error spawning the process
      populateProcess.on('error', (err) => {
        console.error('Failed to start populate-print-queue process:', err);
        prisma.$disconnect();
      });
      
      // Don't disconnect from prisma here - we'll do it when the child process exits
      return;
    } else {
      console.log(`Order ${TARGET_ORDER} not found in database. Attempting to sync from ShipStation...`);
      
      // Run order-sync to fetch the order from ShipStation
      console.log(`Running order-sync to fetch the order...`);
      const syncProcess = spawn('npx', ['tsx', 'src/scripts/order-sync.ts', 'sync', '--mode=recent', '--hours=72', '--skip-tags'], {
        stdio: 'inherit'
      });
      
      // Wait for the sync process to complete
      await new Promise((resolve, reject) => {
        syncProcess.on('close', (code) => {
          if (code === 0) {
            console.log('Sync completed successfully');
            resolve();
          } else {
            console.error(`Sync process exited with code ${code}`);
            resolve(); // Still continue even if sync fails
          }
        });
        
        syncProcess.on('error', (err) => {
          console.error('Failed to start sync process:', err);
          resolve(); // Still continue even if sync fails
        });
      });
      
      // Check again if order exists after sync
      const syncedOrder = await prisma.order.findFirst({
        where: {
          shipstation_order_number: TARGET_ORDER
        },
        select: {
          id: true,
          shipstation_order_number: true,
          marketplace: true,
          order_status: true
        }
      });
      
      if (syncedOrder) {
        console.log(`Order successfully synced and found in database:`, syncedOrder);
        
        // Now run populate-print-queue with the synced order ID
        console.log(`Running populate-print-queue for order ID ${syncedOrder.id}...`);
        
        const populateProcess = spawn('npx', ['tsx', 'src/scripts/populate-print-queue.ts', `--order-id=${syncedOrder.id}`, '--force-recreate', '--preserve-text'], {
          stdio: 'inherit'
        });
        
        // Handle process completion
        populateProcess.on('close', (code) => {
          console.log(`populate-print-queue process exited with code ${code}`);
          prisma.$disconnect();
        });
        
        populateProcess.on('error', (err) => {
          console.error('Failed to start populate-print-queue process:', err);
          prisma.$disconnect();
        });
        
        return;
      } else {
        console.log(`Order ${TARGET_ORDER} still not found after sync. This order may not exist in ShipStation.`);
      }
    }
  } catch (error) {
    console.error('Error in main function:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 
