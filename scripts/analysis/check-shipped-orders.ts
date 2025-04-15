import { prisma } from '../../src/lib/prisma';

async function checkShippedOrdersWithPendingTasks() {
  try {
    // Find shipped or cancelled orders with pending or in-progress print tasks
    const ordersWithPendingTasks = await prisma.order.findMany({
      where: {
        order_status: { in: ['shipped', 'cancelled'] },
        items: {
          some: {
            printTasks: {
              some: {
                status: { in: ['pending', 'in_progress'] }
              }
            }
          }
        }
      },
      include: {
        items: {
          include: {
            printTasks: {
              where: {
                status: { in: ['pending', 'in_progress'] }
              }
            }
          }
        }
      },
      orderBy: {
        updated_at: 'desc'
      },
      take: 10
    });

    console.log(`Found ${ordersWithPendingTasks.length} shipped/cancelled orders with pending print tasks:`);
    
    for (const order of ordersWithPendingTasks) {
      console.log(`\n--- Order ${order.id} (${order.shipstation_order_number || 'No order number'}) ---`);
      console.log(`Status: ${order.order_status}`);
      console.log(`Marketplace: ${order.marketplace || 'Unknown'}`);
      console.log(`Updated At: ${order.updated_at}`);
      
      let totalPendingTasks = 0;
      for (const item of order.items) {
        if (item.printTasks.length > 0) {
          console.log(`  Item ${item.id}: ${item.printTasks.length} pending tasks`);
          totalPendingTasks += item.printTasks.length;
        }
      }
      console.log(`Total pending tasks: ${totalPendingTasks}`);
    }

    // Also check for the most recent orders
    console.log('\n\nMost recent orders:');
    const recentOrders = await prisma.order.findMany({
      orderBy: {
        updated_at: 'desc'
      },
      take: 5
    });

    for (const order of recentOrders) {
      console.log(`\n--- Order ${order.id} (${order.shipstation_order_number || 'No order number'}) ---`);
      console.log(`Status: ${order.order_status}`);
      console.log(`Marketplace: ${order.marketplace || 'Unknown'}`);
      console.log(`Created At: ${order.created_at}`);
      console.log(`Updated At: ${order.updated_at}`);
    }

  } catch (error) {
    console.error('Error checking shipped orders with pending tasks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkShippedOrdersWithPendingTasks();
