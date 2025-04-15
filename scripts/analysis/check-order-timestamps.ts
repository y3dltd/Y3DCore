import { prisma } from '../../src/lib/prisma';

async function checkOrderTimestamps() {
  try {
    // Query the specific order
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: '3650328843'
      }
    });

    if (!order) {
      console.log('Order not found');
      return;
    }

    // Print all timestamps for the order
    console.log('Order Details:');
    console.log(`Order Number: ${order.shipstation_order_number}`);
    console.log(`Order ID: ${order.id}`);
    console.log(`ShipStation Order ID: ${order.shipstation_order_id}`);
    console.log(`Order Date: ${order.order_date} (${order.order_date?.toISOString()})`);
    console.log(`Payment Date: ${order.payment_date} (${order.payment_date?.toISOString()})`);
    console.log(`Ship By Date: ${order.ship_by_date} (${order.ship_by_date?.toISOString()})`);
    console.log(`Shipped Date: ${order.shipped_date} (${order.shipped_date?.toISOString()})`);
    console.log(`Last Sync Date: ${order.last_sync_date} (${order.last_sync_date?.toISOString()})`);
    console.log(`Created At: ${order.created_at} (${order.created_at?.toISOString()})`);
    console.log(`Updated At: ${order.updated_at} (${order.updated_at?.toISOString()})`);
    
    // Calculate time differences
    const now = new Date();
    const orderDate = order.order_date;
    const lastSyncDate = order.last_sync_date;
    
    if (orderDate) {
      const orderDateDiff = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60));
      console.log(`\nTime since order date: ${orderDateDiff} hours`);
    }
    
    if (lastSyncDate) {
      const lastSyncDateDiff = Math.floor((now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60));
      console.log(`Time since last sync: ${lastSyncDateDiff} hours`);
    }
    
    // Check current timezone settings
    console.log(`\nCurrent timezone offset: ${now.getTimezoneOffset() / -60} hours from UTC`);
    console.log(`Current time (local): ${now}`);
    console.log(`Current time (UTC): ${now.toISOString()}`);
    
  } catch (error) {
    console.error('Error checking order timestamps:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOrderTimestamps();
