import { PrismaClient } from '@prisma/client';

// Use raw queries to avoid enum validation

// Create a Prisma client instance
const prisma = new PrismaClient();

async function checkTaskStatuses() {
  console.log('Checking PrintOrderTask statuses...');
  
  // Count tasks by main status
  const statusCounts = await prisma.$queryRaw`
    SELECT status, COUNT(*) as count 
    FROM PrintOrderTask 
    GROUP BY status
    ORDER BY count DESC
  `;
  
  console.log('Tasks by main status:');
  console.table(statusCounts);
  
  // Get a breakdown by both status and stl_render_state
  const combinedStatusCounts = await prisma.$queryRaw`
    SELECT status, stl_render_state, COUNT(*) as count 
    FROM PrintOrderTask 
    GROUP BY status, stl_render_state
    ORDER BY status, stl_render_state
  `;
  
  console.log('\nTasks by status and stl_render_state:');
  console.table(combinedStatusCounts);
  
  // Find any tasks that might be in abnormal states (e.g., in_progress status)
  const inProgressTasks = await prisma.$queryRaw`
    SELECT id, status, stl_render_state, custom_text, updated_at 
    FROM PrintOrderTask 
    WHERE status = 'in_progress'
    ORDER BY updated_at DESC
    LIMIT 10
  `;
  
  // Type assertion for array
  const typedInProgressTasks = inProgressTasks as any[];
    
  if (typedInProgressTasks.length > 0) {
    console.log('\nTasks with status="in_progress" (potentially unintended status changes):');
    console.table(typedInProgressTasks);
    
    const totalInProgressResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM PrintOrderTask
      WHERE status = 'in_progress'
    `;
    // Type assertion for result
    const typedResult = totalInProgressResult as { count: bigint }[];
    const totalInProgress = Number(typedResult[0].count);
    
    console.log(`\nTotal tasks with status="in_progress": ${totalInProgress}`);
  } else {
    console.log('\nNo tasks with status="in_progress" found.');
  }
  
  // Show latest tasks that were updated
  const recentlyUpdated = await prisma.$queryRaw`
    SELECT id, status, stl_render_state, custom_text, updated_at
    FROM PrintOrderTask
    ORDER BY updated_at DESC
    LIMIT 10
  `;
  
  // Type assertion for array
  const typedRecentlyUpdated = recentlyUpdated as any[];
    
  console.log('\nMost recently updated tasks:');
  console.table(typedRecentlyUpdated);
  
  await prisma.$disconnect();
}

// Run the function
checkTaskStatuses()
  .catch(e => {
    console.error('Error checking task statuses:', e);
    process.exit(1);
  });
