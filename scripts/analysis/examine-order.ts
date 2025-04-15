import { prisma } from '../../src/lib/prisma';

async function examineOrder(orderId: number) {
  try {
    console.log(`Examining order ${orderId}...`);
    
    const order = await prisma.order.findUnique({
      where: {
        id: orderId
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
    
    if (!order) {
      console.log(`Order ${orderId} not found.`);
      return;
    }
    
    console.log(`\n--- Order ${order.id} (${order.shipstation_order_number}) ---`);
    console.log(`Marketplace: ${order.marketplace}`);
    console.log(`Customer Notes:\n${order.customer_notes || 'No customer notes'}`);
    
    console.log('\nItems:');
    for (const item of order.items) {
      console.log(`\n  Item ID: ${item.id}`);
      console.log(`  Quantity: ${item.quantity}`);
      console.log(`  SKU: ${item.product?.sku || 'N/A'}`);
      console.log(`  Product Name: ${item.product?.name || 'Unknown Product'}`);
      console.log(`  Print Settings: ${JSON.stringify(item.print_settings, null, 2)}`);
    }
    
  } catch (error) {
    console.error('Error examining order:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get order ID from command line argument
const orderId = process.argv[2] ? parseInt(process.argv[2], 10) : 29312;
examineOrder(orderId);
