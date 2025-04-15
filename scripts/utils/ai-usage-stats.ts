import { prisma } from '../../src/lib/prisma';
import { format } from 'date-fns';

async function generateAiUsageStats() {
  try {
    console.log('Generating AI Usage Statistics...');
    console.log('================================');
    
    // Get today's date and yesterday's date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    
    console.log(`Report Date: ${todayStr}`);
    console.log(`Reporting for: ${yesterdayStr}`);
    console.log('');
    
    // Get total AI calls for yesterday
    const totalCalls = await prisma.aiCallLog.count({
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        }
      }
    });
    
    // Get successful AI calls for yesterday
    const successfulCalls = await prisma.aiCallLog.count({
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        },
        success: true
      }
    });
    
    // Get failed AI calls for yesterday
    const failedCalls = await prisma.aiCallLog.count({
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        },
        success: false
      }
    });
    
    // Get total tasks generated for yesterday
    const totalTasks = await prisma.aiCallLog.aggregate({
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        },
        success: true
      },
      _sum: {
        tasksGenerated: true
      }
    });
    
    // Get total tasks needing review for yesterday
    const tasksNeedingReview = await prisma.aiCallLog.aggregate({
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        },
        success: true
      },
      _sum: {
        needsReviewCount: true
      }
    });
    
    // Get average processing time for yesterday
    const avgProcessingTime = await prisma.aiCallLog.aggregate({
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        },
        success: true
      },
      _avg: {
        processingTimeMs: true
      }
    });
    
    // Get calls by model for yesterday
    const callsByModel = await prisma.aiCallLog.groupBy({
      by: ['modelUsed'],
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        }
      },
      _count: {
        id: true
      }
    });
    
    // Get calls by marketplace for yesterday
    const callsByMarketplace = await prisma.aiCallLog.groupBy({
      by: ['marketplace'],
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        }
      },
      _count: {
        id: true
      }
    });
    
    // Print the statistics
    console.log('AI Usage Statistics:');
    console.log('-------------------');
    console.log(`Total AI Calls: ${totalCalls}`);
    console.log(`Successful Calls: ${successfulCalls} (${(successfulCalls / totalCalls * 100).toFixed(2)}%)`);
    console.log(`Failed Calls: ${failedCalls} (${(failedCalls / totalCalls * 100).toFixed(2)}%)`);
    console.log(`Total Tasks Generated: ${totalTasks._sum.tasksGenerated || 0}`);
    console.log(`Tasks Needing Review: ${tasksNeedingReview._sum.needsReviewCount || 0} (${((tasksNeedingReview._sum.needsReviewCount || 0) / (totalTasks._sum.tasksGenerated || 1) * 100).toFixed(2)}%)`);
    console.log(`Average Processing Time: ${(avgProcessingTime._avg.processingTimeMs || 0).toFixed(2)}ms (${((avgProcessingTime._avg.processingTimeMs || 0) / 1000).toFixed(2)}s)`);
    
    console.log('\nCalls by Model:');
    console.log('--------------');
    callsByModel.forEach(model => {
      console.log(`${model.modelUsed}: ${model._count.id} (${(model._count.id / totalCalls * 100).toFixed(2)}%)`);
    });
    
    console.log('\nCalls by Marketplace:');
    console.log('-------------------');
    callsByMarketplace.forEach(marketplace => {
      console.log(`${marketplace.marketplace || 'Unknown'}: ${marketplace._count.id} (${(marketplace._count.id / totalCalls * 100).toFixed(2)}%)`);
    });
    
    // Get the most common error messages
    const errorMessages = await prisma.aiCallLog.groupBy({
      by: ['errorMessage'],
      where: {
        createdAt: {
          gte: new Date(`${yesterdayStr}T00:00:00Z`),
          lt: new Date(`${todayStr}T00:00:00Z`)
        },
        success: false,
        errorMessage: {
          not: null
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 5
    });
    
    if (errorMessages.length > 0) {
      console.log('\nMost Common Error Messages:');
      console.log('--------------------------');
      errorMessages.forEach(error => {
        console.log(`${error.errorMessage}: ${error._count.id} occurrences`);
      });
    }
    
    console.log('\nEnd of Report');
    console.log('=============');
    
  } catch (error) {
    console.error('Error generating AI usage statistics:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateAiUsageStats();
