import { prisma } from '../../src/lib/prisma';

async function runFinalTest() {
  try {
    console.log('Running final test...');

    // Clear the database
    console.log('Clearing database...');
    const deletedLogs = await prisma.aiCallLog.deleteMany({});
    console.log(`Deleted ${deletedLogs.count} AI call logs.`);

    const deletedTasks = await prisma.printOrderTask.deleteMany({});
    console.log(`Deleted ${deletedTasks.count} print tasks.`);

    // Run the sync-orders script
    console.log('\nRunning sync-orders script...');
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      const { stdout, stderr } = await execPromise('npm run sync-orders -- --hours=2');
      console.log('Sync orders completed successfully.');
    } catch (error) {
      console.error('Error running sync-orders:', error);
    }

    // Run the populate-print-queue script
    console.log('\nRunning populate-print-queue script...');
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      const { stdout, stderr } = await execPromise('npm run populate-queue -- --limit=10');
      console.log('Populate print queue completed successfully.');
    } catch (error) {
      console.error('Error running populate-print-queue:', error);
    }

    // Check the results
    console.log('\nChecking results...');

    const aiCallLogs = await prisma.aiCallLog.count();
    console.log(`Found ${aiCallLogs} AI call logs in the database.`);

    const printTasks = await prisma.printOrderTask.count();
    console.log(`Found ${printTasks} print tasks in the database.`);

    if (aiCallLogs > 0 && printTasks > 0) {
      console.log('\nFinal test passed! Both scripts are working correctly.');
    } else {
      console.log('\nFinal test failed. Please check the scripts for errors.');
    }

  } catch (error) {
    console.error('Error running final test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runFinalTest();
