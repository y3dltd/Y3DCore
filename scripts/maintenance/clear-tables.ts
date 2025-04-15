import { prisma } from '../../src/lib/prisma';

async function clearTables() {
  try {
    console.log('Clearing AI call logs and print tasks tables...');

    // Clear AI call logs
    const deletedLogs = await prisma.aiCallLog.deleteMany({});
    console.log(`Deleted ${deletedLogs.count} AI call logs.`);

    // Clear print tasks
    const deletedTasks = await prisma.printOrderTask.deleteMany({});
    console.log(`Deleted ${deletedTasks.count} print tasks.`);

    console.log('Tables cleared successfully.');
  } catch (error) {
    console.error('Error clearing tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearTables();
