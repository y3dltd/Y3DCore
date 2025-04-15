/**
 * This script updates all existing ShipStation timestamps in the database
 * to convert them from PST to UTC.
 *
 * It adds 8 hours to all order_date, payment_date, ship_by_date, and shipped_date fields
 * to correct the timezone difference.
 */

import { prisma } from '../../src/lib/prisma';
import { toDate } from 'date-fns-tz';

// ShipStation uses Pacific Time (America/Los_Angeles)
const SHIPSTATION_TIMEZONE = 'America/Los_Angeles';

/**
 * Converts a date from PST to UTC
 */
function convertToUTC(date: Date | null): Date | null {
  if (!date) return null;

  try {
    // Use date-fns-tz to convert from Pacific Time to UTC
    // First convert the date to an ISO string in the local timezone
    const dateStr = date.toISOString().replace('Z', '');

    // Then parse it as if it were in Pacific Time
    return toDate(dateStr, { timeZone: SHIPSTATION_TIMEZONE });
  } catch (error) {
    console.error(`Error converting date ${date.toISOString()} from Pacific Time to UTC:`, error);

    // Fallback to the simple method
    const pstOffsetHours = 8; // Approximate PST offset
    return new Date(date.getTime() + (pstOffsetHours * 60 * 60 * 1000));
  }
}

async function migrateTimestamps() {
  try {
    console.log('Starting timestamp migration...');

    // Get all orders
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        order_date: true,
        payment_date: true,
        ship_by_date: true,
        shipped_date: true,
      }
    });

    console.log(`Found ${orders.length} orders to update.`);

    // Process orders in batches to avoid memory issues
    const batchSize = 100;
    let updatedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(orders.length / batchSize)}...`);

      // Process each order in the batch
      const updates = batch.map(async (order) => {
        try {
          // Convert dates from PST to UTC
          const updatedOrderDate = convertToUTC(order.order_date);
          const updatedPaymentDate = convertToUTC(order.payment_date);
          const updatedShipByDate = convertToUTC(order.ship_by_date);
          const updatedShippedDate = convertToUTC(order.shipped_date);

          // Update the order
          await prisma.order.update({
            where: { id: order.id },
            data: {
              order_date: updatedOrderDate,
              payment_date: updatedPaymentDate,
              ship_by_date: updatedShipByDate,
              shipped_date: updatedShippedDate,
            }
          });

          updatedCount++;
        } catch (error) {
          console.error(`Error updating order ${order.id}:`, error);
          errorCount++;
        }
      });

      // Wait for all updates in the batch to complete
      await Promise.all(updates);

      console.log(`Completed batch ${i / batchSize + 1}. Updated ${updatedCount} orders so far.`);
    }

    console.log(`Migration completed. Updated ${updatedCount} orders. Errors: ${errorCount}.`);
  } catch (error) {
    console.error('Error migrating timestamps:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateTimestamps();
