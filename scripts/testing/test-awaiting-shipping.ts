import { prisma } from '../../src/lib/prisma';
import { spawn } from 'child_process';
import { format } from 'date-fns';
import * as fs from 'fs';

async function testAwaitingShipping() {
  try {
    console.log('Finding orders awaiting shipping...');

    // Find orders awaiting shipping
    const orders = await prisma.order.findMany({
      where: {
        order_status: 'awaiting_shipment'
      },
      select: {
        id: true,
        shipstation_order_number: true,
        marketplace: true
      },
      take: 10 // Limit to 10 orders for testing
    });

    console.log(`Found ${orders.length} orders awaiting shipping.`);

    if (orders.length === 0) {
      console.log('No orders awaiting shipping found.');
      return;
    }

    // Create a log file for the test results
    const timestamp = format(new Date(), 'yyyy-MM-dd-HH-mm-ss');
    const logFile = `logs/test-awaiting-shipping-${timestamp}.log`;

    // Make sure the logs directory exists
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }

    console.log('Testing each order with the populate-print-queue script...');
    console.log(`Results will be logged to ${logFile}`);

    // Process each order
    for (const order of orders) {
      console.log(`\nProcessing Order ${order.id} (${order.shipstation_order_number}) - ${order.marketplace}...`);

      // Run the populate-print-queue script with --dry-run flag
      const command = `npm run populate-queue -- --order-id ${order.id} --dry-run`;
      console.log(`Running: ${command}`);

      // Execute the command
      const child = spawn(command, { shell: true });

      // Collect output
      let output = '';

      child.stdout.on('data', (data) => {
        const dataStr = data.toString();
        output += dataStr;
        process.stdout.write(dataStr);
      });

      child.stderr.on('data', (data) => {
        const dataStr = data.toString();
        output += dataStr;
        process.stderr.write(dataStr);
      });

      // Wait for the command to complete
      await new Promise((resolve) => {
        child.on('close', (code) => {
          console.log(`Order ${order.id} processing completed with exit code ${code}`);
          resolve(code);
        });
      });

      // Log the results
      fs.appendFileSync(logFile, `\n\n--- Order ${order.id} (${order.shipstation_order_number}) - ${order.marketplace} ---\n`);
      fs.appendFileSync(logFile, output);
      fs.appendFileSync(logFile, `\n--- End of Order ${order.id} ---\n`);
    }

    console.log('\nTest completed. Check the log file for detailed results.');

  } catch (error) {
    console.error('Error testing awaiting shipping orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAwaitingShipping();
