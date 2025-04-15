import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyzeOrder(orderId) {
  // Fetch order with all related data
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: true
        }
      },
      printTasks: true
    }
  });
  
  if (!order) {
    console.log(`Order with ID ${orderId} not found.`);
    return;
  }
  
  console.log(`\n=== ORDER DETAILS ===`);
  console.log(`ID: ${order.id}`);
  console.log(`Order Number: ${order.shipstation_order_number}`);
  console.log(`Marketplace: ${order.marketplace}`);
  console.log(`Status: ${order.order_status}`);
  
  // Personalization analysis
  console.log(`\n=== PERSONALIZATION TEXT ANALYSIS ===`);
  console.log(`Raw Customer Notes: "${order.customer_notes}"`);
  
  // Extract just the text portion from the notes
  const textMatch = order.customer_notes?.match(/Text:\s*([\s\S]*?)(?:$|(?=Item ID:))/i);
  if (textMatch && textMatch[1]) {
    const personalText = textMatch[1].trim();
    console.log(`\nExtracted Text: "${personalText}"`);
    
    // Analyze text structure
    const lines = personalText.split('\n').filter(line => line.trim() !== '');
    console.log(`Lines detected: ${lines.length}`);
    
    if (lines.length > 1) {
      console.log(`\nLine-by-line breakdown:`);
      lines.forEach((line, i) => {
        console.log(`  Line ${i+1}: "${line.trim()}"`);
      });
      console.log(`\n⚠️ MULTI-LINE TEXT DETECTED - Should potentially be split into multiple personalizations`);
    }
  }
  
  // Order items
  console.log(`\n=== ORDER ITEMS ===`);
  for (const item of order.items) {
    console.log(`\nItem ID: ${item.id}`);
    console.log(`SKU: ${item.sku}`);
    console.log(`Product Name: ${item.product?.name || 'Unknown'}`);
    console.log(`Quantity: ${item.quantity}`);
  }
  
  // Print tasks
  console.log(`\n=== PRINT TASKS ===`);
  for (const task of order.printTasks) {
    console.log(`\nTask ID: ${task.id}`);
    console.log(`Product Name: ${task.product_name}`);
    console.log(`Custom Text: "${task.custom_text}"`);
    console.log(`Color 1: ${task.color_1}`);
    console.log(`Color 2: ${task.color_2}`);
    console.log(`Quantity: ${task.quantity}`);
    
    // Check if this text contains newlines that might indicate it should have been split
    if (task.custom_text?.includes('\n')) {
      console.log(`⚠️ This print task contains newlines but wasn't split into separate tasks`);
      const textLines = task.custom_text.split('\n').filter(line => line.trim() !== '');
      if (textLines.length > 1) {
        console.log(`  This should likely be ${textLines.length} separate print tasks`);
        console.log(`  - Names detected: ${textLines.map(l => `"${l.trim()}"`).join(', ')}`);
        console.log(`  - Each should have a quantity of: ${task.quantity / textLines.length}`);
      }
    }
  }
  
  // Fetch and analyze AI Logs
  const aiLogs = await prisma.aiCallLog.findMany({
    where: { orderId: orderId },
    orderBy: { createdAt: 'desc' }
  });
  
  if (aiLogs.length > 0) {
    console.log(`\n=== AI PROCESSING LOGS (${aiLogs.length} entries) ===`);
    
    // Analyze each log
    for (let i = 0; i < aiLogs.length; i++) {
      const log = aiLogs[i];
      console.log(`\nLog #${i+1} (${log.createdAt}):`);
      console.log(`Model Used: ${log.modelUsed}`);
      console.log(`Success: ${log.success}`);
      
      try {
        const response = JSON.parse(log.rawResponse || '{}');
        const itemPersonalizations = response.itemPersonalizations || {};
        
        for (const itemId in itemPersonalizations) {
          const item = itemPersonalizations[itemId];
          console.log(`\n  Item #${itemId}:`);
          
          if (item.personalizations && Array.isArray(item.personalizations)) {
            console.log(`  Number of personalizations: ${item.personalizations.length}`);
            
            item.personalizations.forEach((p, idx) => {
              console.log(`\n  Personalization #${idx+1}:`);
              console.log(`    Text: "${p.customText}"`);
              console.log(`    Color 1: ${p.color1}`);
              console.log(`    Quantity: ${p.quantity}`);
              console.log(`    Needs review: ${p.needsReview}`);
            });
            
            // Analyze if text contains newlines but wasn't split
            if (item.personalizations.length === 1) {
              const customText = item.personalizations[0].customText;
              if (customText && customText.includes('\n')) {
                const textLines = customText.split('\n').filter(line => line.trim() !== '');
                if (textLines.length > 1) {
                  console.log(`\n  ⚠️ AI RETURNED A SINGLE PERSONALIZATION WITH MULTIPLE LINES:`);
                  console.log(`    Lines detected: ${textLines.length}`);
                  textLines.forEach((line, i) => {
                    console.log(`    Line ${i+1}: "${line.trim()}"`);
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`  Error parsing response: ${error.message}`);
        console.log(`  Raw Response: ${log.rawResponse?.substring(0, 200)}...`);
      }
    }
    
    // Compare the first and last logs to see what changed
    if (aiLogs.length > 1) {
      console.log(`\n=== COMPARING FIRST AND LAST AI RESPONSES ===`);
      
      try {
        const firstLog = aiLogs[aiLogs.length - 1];
        const lastLog = aiLogs[0];
        
        const firstResponse = JSON.parse(firstLog.rawResponse || '{}');
        const lastResponse = JSON.parse(lastLog.rawResponse || '{}');
        
        console.log(`\nFirst processing (${firstLog.createdAt}):`);
        const firstItems = firstResponse.itemPersonalizations || {};
        
        console.log(`\nLatest processing (${lastLog.createdAt}):`);
        const lastItems = lastResponse.itemPersonalizations || {};
        
        for (const itemId in firstItems) {
          if (lastItems[itemId]) {
            const firstPersonalizations = firstItems[itemId].personalizations || [];
            const lastPersonalizations = lastItems[itemId].personalizations || [];
            
            console.log(`\nItem #${itemId}:`);
            console.log(`  - First processing: ${firstPersonalizations.length} personalizations`);
            console.log(`  - Latest processing: ${lastPersonalizations.length} personalizations`);
            
            if (firstPersonalizations.length !== lastPersonalizations.length) {
              console.log(`  ⚠️ NUMBER OF PERSONALIZATIONS CHANGED`);
            }
          }
        }
      } catch (error) {
        console.log(`Error comparing responses: ${error.message}`);
      }
    }
  } else {
    console.log(`\n=== NO AI LOGS FOUND FOR THIS ORDER ===`);
  }
}

async function main() {
  const orderId = 29398; // The OrderID from the request
  
  console.log(`Analyzing Order ID: ${orderId}...`);
  await analyzeOrder(orderId);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
