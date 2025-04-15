import { prisma } from '../../src/lib/prisma';

async function checkAiLogs() {
  try {
    // Count total logs
    const totalLogs = await prisma.aiCallLog.count();
    console.log(`Total AI call logs: ${totalLogs}`);

    // Count successful vs failed calls
    const successfulCalls = await prisma.aiCallLog.count({
      where: {
        success: true
      }
    });

    const failedCalls = await prisma.aiCallLog.count({
      where: {
        success: false
      }
    });

    console.log(`Successful calls: ${successfulCalls} (${(successfulCalls / totalLogs * 100).toFixed(2)}%)`);
    console.log(`Failed calls: ${failedCalls} (${(failedCalls / totalLogs * 100).toFixed(2)}%)`);

    // Get logs with review needed
    const reviewLogs = await prisma.aiCallLog.findMany({
      where: {
        needsReviewCount: {
          gt: 0
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });

    console.log('\nSample logs with review needed:');
    for (const log of reviewLogs) {
      console.log(`\n--- AI Call Log ${log.id} ---`);
      console.log(`Order: ${log.orderId} (${log.orderNumber || 'No order number'})`);
      console.log(`Marketplace: ${log.marketplace || 'Unknown'}`);
      console.log(`Success: ${log.success}`);
      console.log(`Tasks Generated: ${log.tasksGenerated}`);
      console.log(`Needs Review Count: ${log.needsReviewCount}`);

      // Get a sample of the response to see what's happening
      try {
        const responseObj = JSON.parse(log.rawResponse);
        console.log(`Response Sample: ${JSON.stringify(responseObj, null, 2).substring(0, 500)}...`);
      } catch (e) {
        if (e instanceof Error) {
          console.log(`Could not parse response: ${e.message}`);
        } else {
          console.log(`Could not parse response: ${String(e)}`);
        }
      }
    }

    // Get recent logs
    const recentLogs = await prisma.aiCallLog.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });

    console.log('\nMost recent AI call logs:');

    for (const log of recentLogs) {
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
    console.error('Error checking AI logs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAiLogs();
