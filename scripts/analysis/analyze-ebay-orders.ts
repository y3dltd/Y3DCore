import { prisma } from '../../src/lib/prisma';

async function analyzeEbayOrders() {
  try {
    console.log('Analyzing eBay orders with multiple items or quantities...');
    
    // Find eBay orders with multiple items
    const multiItemEbayOrders = await prisma.order.findMany({
      where: {
        AND: [
          { marketplace: { in: ['ebay', 'ebay_v2'] } },
          { customer_notes: { not: null } },
          { customer_notes: { not: '' } }
        ]
      },
      include: {
        items: {
          include: {
            product: true // Include product to access SKU
          }
        }
      },
      take: 10
    });

    console.log(`Found ${multiItemEbayOrders.length} eBay orders with notes`);
    
    for (const order of multiItemEbayOrders) {
      console.log(`\n--- eBay Order ${order.shipstation_order_number} (ID: ${order.id}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}, Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
      
      // Count "Item ID:" occurrences in customer notes
      const itemIdMatches = (order.customer_notes || '').match(/Item ID:/gi);
      const itemIdCount = itemIdMatches ? itemIdMatches.length : 0;
      
      // Count total quantity across all items
      const totalQuantity = order.items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
      
      console.log(`Item ID blocks in notes: ${itemIdCount}, Total quantity: ${totalQuantity}`);
      
      // Flag potential mismatches
      if (itemIdCount > 0 && itemIdCount !== totalQuantity) {
        console.log(`⚠️ POTENTIAL MISMATCH: Item ID blocks (${itemIdCount}) != Total quantity (${totalQuantity})`);
      }
    }
    
    // Find eBay orders with quantity > 1 for any item
    console.log('\n\nAnalyzing eBay orders with quantity > 1 for any item...');
    const ebayOrdersWithQtyGt1 = await prisma.order.findMany({
      where: {
        AND: [
          { marketplace: { in: ['ebay', 'ebay_v2'] } },
          { customer_notes: { not: null } },
          { customer_notes: { not: '' } },
          { items: { some: { quantity: { gt: 1 } } } }
        ]
      },
      include: {
        items: {
          where: {
            quantity: {
              gt: 1
            }
          },
          include: { // Also include product here
            product: true
          }
        }
      },
      take: 10
    });
    
    console.log(`Found ${ebayOrdersWithQtyGt1.length} eBay orders with quantity > 1 for any item`);
    
    for (const order of ebayOrdersWithQtyGt1) {
      console.log(`\n--- eBay Order ${order.shipstation_order_number} (ID: ${order.id}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items with quantity > 1:');
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}, Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
      
      // Look for patterns that might indicate multiple names for a single item
      const multiNamePatterns = [
        { pattern: /,\s*[A-Z]/g, description: "Comma-separated names" },
        { pattern: /\n[A-Z]/g, description: "Newline-separated names" },
        { pattern: /\s+and\s+[A-Z]/gi, description: "Names separated by 'and'" },
        { pattern: /\d+\.\s*[A-Z]/g, description: "Numbered list of names" },
        { pattern: /[A-Z][a-z]+\s*[-:]\s*[A-Za-z]+/g, description: "Name-color pairs" }
      ];
      
      for (const { pattern, description } of multiNamePatterns) {
        const matches = (order.customer_notes || '').match(pattern);
        if (matches && matches.length > 0) {
          console.log(`🔍 Found potential ${description}: ${matches.length} matches`);
        }
      }
    }
    
    // Find eBay orders with specific variation patterns
    console.log('\n\nAnalyzing eBay orders with variation patterns...');
    const ebayOrdersWithVariations = await prisma.order.findMany({
      where: {
        marketplace: {
          in: ['ebay', 'ebay_v2']
        },
        customer_notes: {
          contains: 'Variation:'
        }
      },
      include: {
        items: { // Also include product here
          include: {
            product: true
          }
        }
      },
      take: 10
    });
    
    console.log(`Found ${ebayOrdersWithVariations.length} eBay orders with variation patterns`);
    
    for (const order of ebayOrdersWithVariations) {
      console.log(`\n--- eBay Order ${order.shipstation_order_number} (ID: ${order.id}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}, Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
      
      // Extract variation patterns
      const variationMatches = (order.customer_notes || '').match(/Variation:.*?(?=\n|$)/g);
      if (variationMatches) {
        console.log('Variation patterns:');
        for (const match of variationMatches) {
          console.log(`  - ${match}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error analyzing eBay orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeEbayOrders();
