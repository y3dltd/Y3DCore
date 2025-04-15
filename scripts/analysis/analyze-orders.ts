import { prisma } from '../../src/lib/prisma';

async function analyzeOrders() {
  try {
    console.log('Analyzing eBay orders...');
    const ebayOrders = await prisma.order.findMany({
      where: {
        AND: [
          { marketplace: 'eBay' },
          { customer_notes: { not: null } },
          { customer_notes: { not: '' } }
        ]
      },
      include: {
        items: {
          include: { product: true } // Include product
        }
      },
      take: 5
    });

    console.log(`Found ${ebayOrders.length} eBay orders with notes`);
    for (const order of ebayOrders) {
      console.log(`\n--- eBay Order ${order.shipstation_order_number} ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
    }

    console.log('\nAnalyzing Amazon orders...');
    const amazonOrders = await prisma.order.findMany({
      where: {
        AND: [
          { marketplace: 'Amazon' },
          { customer_notes: { not: null } },
          { customer_notes: { not: '' } }
        ]
      },
      include: {
        items: {
          include: { product: true } // Include product
        }
      },
      take: 5
    });

    console.log(`Found ${amazonOrders.length} Amazon orders with notes`);
    for (const order of amazonOrders) {
      console.log(`\n--- Amazon Order ${order.shipstation_order_number} ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
    }

    console.log('\nAnalyzing Etsy orders...');
    const etsyOrders = await prisma.order.findMany({
      where: {
        AND: [
          { marketplace: 'Etsy' },
          { customer_notes: { not: null } },
          { customer_notes: { not: '' } }
        ]
      },
      include: {
        items: {
          include: { product: true } // Include product
        }
      },
      take: 5
    });

    console.log(`Found ${etsyOrders.length} Etsy orders with notes`);
    for (const order of etsyOrders) {
      console.log(`\n--- Etsy Order ${order.shipstation_order_number} ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
    }

    // Look for orders with multiple names in a single line
    console.log('\nAnalyzing orders with potential multiple names...');
    const multiNameOrders = await prisma.order.findMany({
      where: {
        OR: [
          { customer_notes: { contains: ',' } },
          { customer_notes: { contains: '\n' } }
        ]
      },
      include: {
        items: {
          include: { product: true } // Include product
        }
      },
      take: 5
    });

    console.log(`Found ${multiNameOrders.length} orders with potential multiple names`);
    for (const order of multiNameOrders) {
      console.log(`\n--- Multi-Name Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
    }

    // Look for quantity mismatches
    console.log('\nAnalyzing orders with potential quantity mismatches...');
    const qtyMismatchOrders = await prisma.order.findMany({
      where: {
        AND: [
          { customer_notes: { not: null } },
          { customer_notes: { not: '' } }
        ]
      },
      include: {
        items: {
          where: {
            quantity: {
              gt: 1
            }
          },
          include: { product: true } // Include product
        }
      },
      take: 5
    });

    console.log(`Found ${qtyMismatchOrders.length} orders with potential quantity mismatches`);
    for (const order of qtyMismatchOrders) {
      if (order.items.length === 0) continue;
      console.log(`\n--- Qty Mismatch Order ${order.shipstation_order_number} (${order.marketplace}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
    }

  } catch (error) {
    console.error('Error analyzing orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeOrders();
