// src/scripts/get-order-customization.ts
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { getOrderItems } from '../lib/amazon/sp-api';

// Setup command line arguments
const argv = yargs(hideBin(process.argv))
  .option('orderId', {
    alias: 'o',
    description: 'The Amazon Order ID to fetch customization for',
    type: 'string',
    demandOption: true, // Make orderId required
  })
  .help()
  .alias('help', 'h')
  .parseSync(); // Use synchronous parsing for simplicity in script

async function findCustomizationUrl(orderId: string) {
  console.log(`--- Fetching customization for Order ID: ${orderId} ---`);
  try {
    const orderItemsResponse = await getOrderItems(orderId);

    if (!orderItemsResponse?.payload?.OrderItems) {
      console.error('No order items found in the response.');
      return;
    }

    const orderItems = orderItemsResponse.payload.OrderItems;
    let foundUrl = false;

    console.log(`Found ${orderItems.length} item(s) for order ${orderId}.`);

    for (const item of orderItems) {
      // Log the entire item object to see all available fields
      console.log(`--- Item Data (ID: ${item.OrderItemId}) ---`);
      console.log(JSON.stringify(item, null, 2)); // Pretty-print the JSON
      console.log(`--- End Item Data (ID: ${item.OrderItemId}) ---`);

      // Keep track if *any* customization URL was found (though we know it wasn't last time)
      if (item.BuyerCustomizedInfo?.CustomizedURL) {
        foundUrl = true;
      }
    }

    if (!foundUrl) {
      console.log('\n--- Summary: No customization URLs found for any items in this order. ---');
    } else {
      console.log('\n--- Summary: Customization URL(s) were found (logged above). ---');
    }
  } catch (error) {
    console.error(
      `--- Failed to fetch or process customization for Order ID: ${orderId} ---`,
      error
    );
    // Error details are logged within makeSpapiRequest/getOrderItems
    process.exitCode = 1; // Indicate failure
  }
}

// Get orderId from command line arguments
const orderIdToFetch = argv.orderId;

if (orderIdToFetch) {
  findCustomizationUrl(orderIdToFetch);
} else {
  console.error('Please provide an Order ID using the --orderId or -o flag.');
  process.exit(1);
}
