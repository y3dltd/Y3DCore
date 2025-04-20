import { PrismaClient } from '@prisma/client';

// Create a Prisma client instance
const prisma = new PrismaClient();

async function checkStlRenderStatus() {
  console.log('Checking PrintOrderTask status...');
  
  // Get count of tasks with different stl_render_state values
  const statusCounts = await prisma.$queryRaw`
    SELECT stl_render_state, COUNT(*) as count 
    FROM PrintOrderTask 
    GROUP BY stl_render_state
  `;
  
  console.log('Tasks by stl_render_state:');
  console.table(statusCounts);
  
  // Get count of tasks with completed status but pending stl_render_state
  const mismatchedTasks = await prisma.printOrderTask.count({
    where: {
      status: 'completed',
      stl_render_state: 'pending'
    }
  });
  
  console.log(`Tasks with status='completed' and stl_render_state='pending': ${mismatchedTasks}`);
  
  // Get tasks for SKU 'PER-KEY3D-STY3-Y3D'
  const targetTasks = await prisma.printOrderTask.count({
    where: {
      product: {
        sku: 'PER-KEY3D-STY3-Y3D'
      },
      stl_render_state: 'pending'
    }
  });
  
  console.log(`Tasks for product SKU 'PER-KEY3D-STY3-Y3D' with stl_render_state='pending': ${targetTasks}`);
  
  // Check if there are any tasks in running state (possible stuck tasks)
  const runningTasks = await prisma.printOrderTask.findMany({
    where: {
      stl_render_state: 'running'
    },
    select: {
      id: true,
      status: true,
      custom_text: true,
      stl_render_state: true,
      render_retries: true,
      product: {
        select: {
          sku: true,
          name: true
        }
      }
    }
  });
  
  if (runningTasks.length > 0) {
    console.log('Tasks in running state (might be stuck):');
    console.table(runningTasks);
  } else {
    console.log('No tasks stuck in running state.');
  }
  
  await prisma.$disconnect();
}

// Run the function
checkStlRenderStatus()
  .catch(e => {
    console.error('Error checking task status:', e);
    process.exit(1);
  });
