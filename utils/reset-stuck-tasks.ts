import { PrismaClient } from '@prisma/client';

// Create a Prisma client instance
const prisma = new PrismaClient();

async function resetStuckTasks() {
  console.log('Resetting stuck tasks...');
  
  // Reset tasks stuck in 'running' state back to 'pending'
  const stuckRunningTasks = await prisma.printOrderTask.updateMany({
    where: {
      stl_render_state: 'running'
    },
    data: {
      stl_render_state: 'pending',
      // Don't change the status, just reset the STL render state
    }
  });
  
  console.log(`Reset ${stuckRunningTasks.count} tasks from 'running' to 'pending' state.`);
  
  // Display information about tasks that will be processed
  const targetTasks = await prisma.printOrderTask.findMany({
    where: {
      stl_render_state: 'pending',
      product: {
        sku: 'PER-KEY3D-STY3-Y3D'
      }
    },
    select: {
      id: true,
      status: true,
      stl_render_state: true,
      render_retries: true
    },
    take: 10 // Just show a sample
  });
  
  console.log('Sample of tasks that will be processed by the worker:');
  console.table(targetTasks);
  
  const pendingCount = await prisma.printOrderTask.count({
    where: {
      stl_render_state: 'pending',
      product: {
        sku: 'PER-KEY3D-STY3-Y3D'
      }
    }
  });
  
  console.log(`\nTotal tasks ready for processing: ${pendingCount}`);
  console.log('\nYou can now run the worker with:');
  console.log('npx tsx src/workers/stl-render-worker.ts');
  
  await prisma.$disconnect();
}

// Run the function
resetStuckTasks()
  .catch(e => {
    console.error('Error resetting tasks:', e);
    process.exit(1);
  });
