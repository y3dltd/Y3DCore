import { prisma } from '../../src/lib/prisma';

async function checkOrderLogs(orderId: number) {
  try {
    const logs = await prisma.aiCallLog.findMany({
      where: {
        orderId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`Found ${logs.length} AI call logs for order ${orderId}`);
    
    for (const log of logs) {
      console.log(`\n--- AI Call Log ${log.id} ---`);
      console.log(`Script: ${log.scriptName}`);
      console.log(`Order: ${log.orderId} (${log.orderNumber || 'No order number'})`);
      console.log(`Marketplace: ${log.marketplace || 'Unknown'}`);
      console.log(`AI Provider: ${log.aiProvider}`);
      console.log(`Model: ${log.modelUsed}`);
      console.log(`Processing Time: ${log.processingTimeMs}ms`);
      console.log(`Success: ${log.success}`);
      console.log(`Tasks Generated: ${log.tasksGenerated}`);
      console.log(`Needs Review Count: ${log.needsReviewCount}`);
      console.log(`Created At: ${log.createdAt}`);
      
      if (!log.success) {
        console.log(`Error Message: ${log.errorMessage}`);
      }
      
      // Don't print the full prompt and response as they're too large
      console.log(`Prompt Length: ${log.promptSent.length} chars`);
      console.log(`Response Length: ${log.rawResponse.length} chars`);
    }
  } catch (error) {
    console.error('Error checking order logs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get order ID from command line argument
const orderId = process.argv[2] ? parseInt(process.argv[2], 10) : 29312;
checkOrderLogs(orderId);
