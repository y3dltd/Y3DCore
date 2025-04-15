import { prisma } from '../../src/lib/prisma';

async function checkPrintTasks() {
  try {
    console.log('Checking print tasks...');
    
    // Count total tasks
    const totalTasks = await prisma.printOrderTask.count();
    console.log(`Total print tasks: ${totalTasks}`);
    
    // Count tasks by status
    const tasksByStatus = await prisma.printOrderTask.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    });
    
    console.log('\nTasks by status:');
    tasksByStatus.forEach(status => {
      console.log(`${status.status}: ${status._count.id}`);
    });
    
    // Count tasks that need review
    const needsReviewTasks = await prisma.printOrderTask.count({
      where: {
        needs_review: true
      }
    });
    
    console.log(`\nTasks that need review: ${needsReviewTasks}`);
    
    // Get sample of tasks that need review
    const reviewTasks = await prisma.printOrderTask.findMany({
      where: {
        needs_review: true
      },
      include: {
        order: true,
        orderItem: {
          include: {
            product: true
          }
        }
      },
      take: 5
    });
    
    console.log('\nSample tasks that need review:');
    for (const task of reviewTasks) {
      console.log(`\n--- Task ${task.id} ---`);
      console.log(`Order: ${task.orderId} (${task.order.shipstation_order_number})`);
      console.log(`Marketplace: ${task.order.marketplace}`);
      console.log(`Product: ${task.orderItem.product.name}`);
      console.log(`Custom Text: ${task.custom_text || 'None'}`);
      console.log(`Color: ${task.color_1 || 'None'}`);
      console.log(`Review Reason: ${task.review_reason || 'None'}`);
    }
    
    // Get sample of successful tasks
    const successTasks = await prisma.printOrderTask.findMany({
      where: {
        needs_review: false
      },
      include: {
        order: true,
        orderItem: {
          include: {
            product: true
          }
        }
      },
      take: 5
    });
    
    console.log('\nSample successful tasks:');
    for (const task of successTasks) {
      console.log(`\n--- Task ${task.id} ---`);
      console.log(`Order: ${task.orderId} (${task.order.shipstation_order_number})`);
      console.log(`Marketplace: ${task.order.marketplace}`);
      console.log(`Product: ${task.orderItem.product.name}`);
      console.log(`Custom Text: ${task.custom_text || 'None'}`);
      console.log(`Color: ${task.color_1 || 'None'}`);
    }
    
  } catch (error) {
    console.error('Error checking print tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPrintTasks();
