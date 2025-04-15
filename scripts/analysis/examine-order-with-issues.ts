import { prisma } from '../../src/lib/prisma';

async function examineOrderWithIssues(orderId: number) {
  try {
    console.log(`Examining order ${orderId}...`);
    
    // Get the order with items
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
    
    // Get the AI call log for this order
    const aiLog = await prisma.aiCallLog.findFirst({
      where: {
        orderId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (aiLog) {
      console.log('\nAI Call Log:');
      console.log(`  ID: ${aiLog.id}`);
      console.log(`  Success: ${aiLog.success}`);
      console.log(`  Tasks Generated: ${aiLog.tasksGenerated}`);
      console.log(`  Needs Review Count: ${aiLog.needsReviewCount}`);
      
      // Parse the AI response
      try {
        const responseObj = JSON.parse(aiLog.rawResponse);
        console.log(`\nAI Response:\n${JSON.stringify(responseObj, null, 2)}`);
      } catch (e) {
        if (e instanceof Error) {
          console.log(`Could not parse AI response: ${e.message}`);
        } else {
          console.log(`Could not parse AI response: ${String(e)}`);
        }
      }
    } else {
      console.log('\nNo AI call log found for this order.');
    }
    
    // Get the print tasks for this order
    const printTasks = await prisma.printOrderTask.findMany({
      where: {
        orderId
      }
    });
    
    console.log(`\nPrint Tasks (${printTasks.length}):`);
    for (const task of printTasks) {
      console.log(`\n  Task ID: ${task.id}`);
      console.log(`  Item ID: ${task.orderItemId}`);
      console.log(`  Custom Text: ${task.custom_text || 'None'}`);
      console.log(`  Color: ${task.color_1 || 'None'}`);
      console.log(`  Needs Review: ${task.needs_review}`);
      console.log(`  Review Reason: ${task.review_reason || 'None'}`);
    }
    
  } catch (error) {
    console.error('Error examining order with issues:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get order ID from command line argument
const orderId = process.argv[2] ? parseInt(process.argv[2], 10) : 29321;
examineOrderWithIssues(orderId);
