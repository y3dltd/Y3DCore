import { PrismaClient } from '@prisma/client';

// Create a Prisma client instance
const prisma = new PrismaClient();

async function fixTaskStatuses() {
  console.log('Fixing PrintOrderTask statuses...');
  
  // 1. Fix tasks that were incorrectly set to in_progress
  // These were likely changed by the old worker before we fixed it
  const fixInProgressTasks = await prisma.$queryRaw`
    UPDATE PrintOrderTask
    SET status = 'completed'
    WHERE status = 'in_progress'
    AND stl_path IS NOT NULL
  `;
  
  console.log('Fixed tasks with status="in_progress" to completed if they have STL paths');
  
  // 2. Reset any still-running tasks
  const resetRunningTasks = await prisma.$queryRaw`
    UPDATE PrintOrderTask
    SET stl_render_state = 'pending'
    WHERE stl_render_state = 'running'
  `;
  
  console.log('Reset tasks with stl_render_state="running" back to pending');
  
  // 3. Standardize 'success' to 'completed' in stl_render_state
  const standardizeSuccessTasks = await prisma.$queryRaw`
    UPDATE PrintOrderTask
    SET stl_render_state = 'completed'
    WHERE stl_render_state = 'success'
  `;
  
  console.log('Standardized stl_render_state="success" to "completed"');
  
  // Check the status after fixes
  const statusCountsAfter = await prisma.$queryRaw`
    SELECT status, COUNT(*) as count 
    FROM PrintOrderTask 
    GROUP BY status
    ORDER BY count DESC
  `;
  
  console.log('\nTask statuses after fixes:');
  console.table(statusCountsAfter as any[]);
  
  const combinedStatusCountsAfter = await prisma.$queryRaw`
    SELECT status, stl_render_state, COUNT(*) as count 
    FROM PrintOrderTask 
    GROUP BY status, stl_render_state
    ORDER BY status, stl_render_state
  `;
  
  console.log('\nTasks by status and stl_render_state after fixes:');
  console.table(combinedStatusCountsAfter as any[]);
  
  // Now check tasks that are ready for processing
  const readyForProcessing = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM PrintOrderTask
    WHERE stl_render_state = 'pending'
    AND productId IN (SELECT id FROM Product WHERE sku = 'PER-KEY3D-STY3-Y3D')
  `;
  
  const typedReadyResult = readyForProcessing as { count: bigint }[];
  console.log(`\nTasks ready for STL rendering with correct SKU: ${Number(typedReadyResult[0].count)}`);
  
  console.log('\nAll statuses have been corrected. You can now run the worker to process tasks:');
  console.log('npx tsx src/workers/stl-render-worker.ts');
  
  await prisma.$disconnect();
}

// Run the function
fixTaskStatuses()
  .catch(e => {
    console.error('Error fixing task statuses:', e);
    process.exit(1);
  });
