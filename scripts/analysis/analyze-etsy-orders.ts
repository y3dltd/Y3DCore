import { prisma } from '../../src/lib/prisma';

async function analyzeEtsyOrders() {
  try {
    console.log('Analyzing Etsy orders with multiple items or quantities...');
    
    // Find Etsy orders with multiple items
    const multiItemEtsyOrders = await prisma.order.findMany({
      where: {
        AND: [
          { marketplace: 'Etsy' },
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
      take: 15
    });

    console.log(`Found ${multiItemEtsyOrders.length} Etsy orders with notes`);
    
    for (const order of multiItemEtsyOrders) {
      console.log(`\n--- Etsy Order ${order.shipstation_order_number} (ID: ${order.id}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}, Quantity: ${item.quantity}, SKU: ${item.product?.sku || 'N/A'}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
      
      // Count total quantity across all items
      const totalQuantity = order.items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
      console.log(`Total quantity: ${totalQuantity}`);
      
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
      
      // Check for personalization in print_settings
      for (const item of order.items) {
        if (item.print_settings) {
          const settings = Array.isArray(item.print_settings) ? item.print_settings : [item.print_settings];
          for (const setting of settings) {
            if (typeof setting === 'object' && setting !== null) {
              // Type assertion after checking typeof setting === 'object' && setting !== null
              const settingObj = setting as { Personalization?: string; personalization?: string };
              if (settingObj.Personalization || settingObj.personalization) {
                // hasPersonalization = true; // Removed as unused
                console.log(`📝 Found personalization in print_settings: ${settingObj.Personalization || settingObj.personalization}`);
              }
            }
          }
        }
      }
      
      // Check for quantity mismatches
      for (const item of order.items) {
        if (item.quantity > 1 && item.print_settings) {
          const settings = Array.isArray(item.print_settings) ? item.print_settings : [item.print_settings];
          for (const setting of settings) {
            if (typeof setting === 'object' && setting !== null) {
              // Type assertion after checking typeof setting === 'object' && setting !== null
              const settingObj = setting as { Personalization?: string; personalization?: string };
              if (settingObj.Personalization || settingObj.personalization) {
                const personalization = settingObj.Personalization || settingObj.personalization || ''; // Ensure personalization is a string
                // Count potential names in personalization
                const commaCount = (personalization.match(/,/g) || []).length;
                const newlineCount = (personalization.match(/\n/g) || []).length;
                const andCount = (personalization.match(/\s+and\s+/gi) || []).length;
                
                const estimatedNameCount = Math.max(1, commaCount + 1, newlineCount + 1, andCount + 1);
                
                if (estimatedNameCount !== item.quantity) {
                  console.log(`⚠️ POTENTIAL MISMATCH: Item ${item.id} has quantity ${item.quantity} but approximately ${estimatedNameCount} names in personalization`);
                }
              }
            }
          }
        }
      }
    }
    
    // Find Etsy orders with special formatting
    console.log('\n\nAnalyzing Etsy orders with special formatting...');
    const specialFormattingOrders = await prisma.order.findMany({
      where: {
        marketplace: 'Etsy',
        OR: [
          { customer_notes: { contains: '(' } },
          { customer_notes: { contains: ')' } },
          { customer_notes: { contains: '-' } },
          { customer_notes: { contains: ':' } },
          { customer_notes: { contains: '*' } },
          { customer_notes: { contains: 'please' } },
          { customer_notes: { contains: 'Please' } },
          { customer_notes: { contains: 'urgent' } },
          { customer_notes: { contains: 'Urgent' } },
        ]
      },
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            print_settings: true
          }
        }
      },
      take: 10
    });
    
    console.log(`Found ${specialFormattingOrders.length} Etsy orders with special formatting`);
    
    for (const order of specialFormattingOrders) {
      console.log(`\n--- Etsy Order ${order.shipstation_order_number} (ID: ${order.id}) ---`);
      console.log(`Customer Notes: ${order.customer_notes}`);
      console.log('Items:');
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}, Quantity: ${item.quantity}, Print Settings: ${JSON.stringify(item.print_settings)}`);
      }
      
      // Check for special instructions
      const specialInstructions = [
        { pattern: /urgent/i, description: "Urgent request" },
        { pattern: /asap/i, description: "ASAP request" },
        { pattern: /please note/i, description: "Special note" },
        { pattern: /by\s+\w+day/i, description: "Deadline by day" },
        { pattern: /need(ed)?\s+by/i, description: "Needed by date" },
        { pattern: /gift/i, description: "Gift indication" },
        { pattern: /special/i, description: "Special request" },
        { pattern: /important/i, description: "Important note" }
      ];
      
      for (const { pattern, description } of specialInstructions) {
        if (pattern.test(order.customer_notes || '')) {
          console.log(`📌 Found ${description} in customer notes`);
        }
      }
    }
    
    // Find Etsy orders with quantity > 1 for any item
    console.log('\n\nAnalyzing Etsy orders with quantity > 1 for any item...');
    const etsyOrdersWithQtyGt1 = await prisma.order.findMany({
      where: {
        marketplace: 'Etsy',
        items: {
          some: {
            quantity: {
              gt: 1
            }
          }
        }
      },
      include: {
        items: {
          where: {
            quantity: {
              gt: 1
            }
          }
        }
      },
      take: 10
    });
    
    console.log(`Found ${etsyOrdersWithQtyGt1.length} Etsy orders with quantity > 1 for any item`);
    
    for (const order of etsyOrdersWithQtyGt1) {
      console.log(`\n--- Etsy Order ${order.shipstation_order_number} (ID: ${order.id}) ---`);
      console.log(`Customer Notes: ${order.customer_notes || 'No customer notes'}`);
      console.log('Items with quantity > 1:');
      for (const item of order.items) {
        console.log(`  - Item ID: ${item.id}, Quantity: ${item.quantity}, Print Settings: ${JSON.stringify(item.print_settings)}`);
        
        // Analyze print_settings for personalization
        if (item.print_settings) {
          const settings = Array.isArray(item.print_settings) ? item.print_settings : [item.print_settings];
          for (const setting of settings) {
            if (typeof setting === 'object' && setting !== null) {
              // Type assertion after checking typeof setting === 'object' && setting !== null
              const settingObj = setting as { Personalization?: string; personalization?: string };
              if (settingObj.Personalization || settingObj.personalization) {
                const personalization = settingObj.Personalization || settingObj.personalization || ''; // Ensure personalization is a string
                console.log(`    Personalization: ${personalization}`);
                
                // Check if personalization might contain multiple names
                const commaCount = (personalization.match(/,/g) || []).length;
                const newlineCount = (personalization.match(/\n/g) || []).length;
                const andCount = (personalization.match(/\s+and\s+/gi) || []).length;
                
                if (commaCount > 0 || newlineCount > 0 || andCount > 0) {
                  console.log(`    ⚠️ Personalization might contain multiple names (commas: ${commaCount}, newlines: ${newlineCount}, 'and': ${andCount})`);
                }
              }
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error analyzing Etsy orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeEtsyOrders();
