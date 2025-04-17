'use server';

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

import { detectMarketplaceOrderNumber, MARKETPLACE_PATTERNS } from '../order-utils';
import { prisma } from '../prisma';
import { syncSingleOrder } from '../shipstation';

const execFile = promisify(execFileCb);

interface RunScriptResult {
  success: boolean;
  output?: string;
  error?: string;
}

// Marketplace order number patterns and detection function are now imported from @/lib/order-utils

/**
 * Finds the internal database ID for an order based on marketplace order number.
 * @param orderNumber - The marketplace order number (e.g., "202-3558314-1389920")
 * @returns The internal database ID or null if not found
 */
async function findOrderIdByMarketplaceNumber(orderNumber: string): Promise<number | null> {
  try {
    // Try to find the order by shipstation_order_number
    const order = await prisma.order.findFirst({
      where: {
        shipstation_order_number: orderNumber,
      },
      select: {
        id: true,
        marketplace: true,
      },
    });

    if (order) {
      console.log(
        `[Server Action] Found order ID ${order.id} for marketplace order number ${orderNumber} (${order.marketplace})`
      );
      return order.id;
    }

    console.log(`[Server Action] No order found with marketplace order number ${orderNumber}`);
    return null;
  } catch (error) {
    console.error(`[Server Action] Error finding order by marketplace number:`, error);
    return null;
  }
}

/**
 * Executes the populate-print-queue script for a specific order with force-recreate.
 * WARNING: Executes a shell command. Ensure proper security context.
 * @param orderId - The ID of the order to process.
 */
export async function runPopulateQueueForOrder(
  orderIdOrNumber: string | number
): Promise<RunScriptResult> {
  // Basic validation
  if (!orderIdOrNumber) {
    return { success: false, error: 'Order ID or number is required.' };
  }

  // Convert to string for processing
  const orderStr = String(orderIdOrNumber);

  // Detect if this is a marketplace order number
  const detection = detectMarketplaceOrderNumber(orderStr);
  let dbOrderId: number | null = null;

  if (detection.isMarketplaceNumber) {
    console.log(
      `[Server Action] Input appears to be a ${detection.marketplace || 'unknown'} marketplace order number: ${orderStr}`
    );
    dbOrderId = await findOrderIdByMarketplaceNumber(orderStr);

    if (!dbOrderId) {
      return {
        success: false,
        error: `Could not find an order with marketplace number: ${orderStr}. Please check the order number and try again.`,
      };
    }
    console.log(`[Server Action] Found database ID ${dbOrderId} for marketplace order ${orderStr}`);
  } else {
    // Try to parse as a direct database ID
    const parsedId = parseInt(orderStr, 10);
    if (isNaN(parsedId)) {
      // Not a valid number and not a recognized marketplace format
      return {
        success: false,
        error: `Invalid input format: "${orderStr}". Please enter a valid order ID (number) or marketplace order number.\n\nValid marketplace formats include:\n- Amazon: 123-1234567-1234567\n- eBay: 12-12345-12345\n- Etsy: 1234567890\n- Shopify: #1001 or 1001`,
      };
    }

    // It's a number, but let's check if it might actually be an Etsy order number
    // that was mistakenly entered as an internal ID
    if (parsedId > 1000000000 && MARKETPLACE_PATTERNS.etsy.test(orderStr)) {
      // This looks like an Etsy order number
      const etsyOrderId = await findOrderIdByMarketplaceNumber(orderStr);
      if (etsyOrderId) {
        // We found it as an Etsy order
        console.log(
          `[Server Action] Input ${orderStr} appears to be an Etsy order number, not an internal ID`
        );
        dbOrderId = etsyOrderId;
        console.log(`[Server Action] Found database ID ${dbOrderId} for Etsy order ${orderStr}`);
      } else {
        // Not found as Etsy order, treat as internal ID
        dbOrderId = parsedId;
      }
    } else {
      // Regular internal ID
      dbOrderId = parsedId;
    }
  }

  // Build args array for execFile
  const args = [
    'tsx',
    'src/scripts/populate-print-queue.ts',
    `--order-id=${dbOrderId}`,
    '--force-recreate',
  ];
  console.log(`[Server Action] Executing execFile: npx ${args.join(' ')}`);

  try {
    // Execute the command using execFile
    const { stdout, stderr } = await execFile('npx', args, {
      cwd: process.cwd(), // Ensure execution in the project root
    });

    // Combine stdout and stderr for "full debugging" output
    const combinedOutput = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`.trim();

    // Create a more informative success message
    const successMessage = orderStr.includes('-')
      ? `Command executed successfully for marketplace order ${orderStr} (DB ID: ${dbOrderId}).`
      : `Command executed successfully for order ID ${dbOrderId}.`;

    console.log(`[Server Action] ${successMessage}`);
    console.log(`[Server Action] Output:\n${combinedOutput}`); // Log output server-side too

    return { success: true, output: combinedOutput };
  } catch (error: unknown) {
    console.error(`[Server Action] Error executing command for order ${dbOrderId}:`, error);

    // Type guard to check if error is an object with properties
    let errorMessage = 'Unknown execution error';
    let stdoutContent = '';
    if (typeof error === 'object' && error !== null) {
      errorMessage =
        (error as { stderr?: string }).stderr || (error as Error).message || errorMessage;
      stdoutContent = (error as { stdout?: string }).stdout || '';
    }

    return {
      success: false,
      error: `Command failed: ${errorMessage}`,
      output: stdoutContent, // Include stdout even on failure if available
    };
  }
}

/**
 * Syncs a specific order from ShipStation by its ID or marketplace order number.
 * @param orderIdOrNumber - The ID or marketplace order number of the order to sync.
 */
export async function syncOrderFromShipStation(
  orderIdOrNumber: string | number
): Promise<RunScriptResult> {
  // Basic validation
  if (!orderIdOrNumber) {
    return { success: false, error: 'Order ID or number is required.' };
  }

  // Convert to string for processing
  const orderStr = String(orderIdOrNumber);

  try {
    // Detect if this is a marketplace order number
    const detection = detectMarketplaceOrderNumber(orderStr);
    let shipstationOrderId: string | null = null;
    let dbOrderId: number | null = null;

    if (detection.isMarketplaceNumber) {
      console.log(
        `[Server Action] Input appears to be a ${detection.marketplace || 'unknown'} marketplace order number: ${orderStr}`
      );
      // First, find the database ID to get the ShipStation order ID
      const order = await prisma.order.findFirst({
        where: {
          shipstation_order_number: orderStr,
        },
        select: {
          id: true,
          shipstation_order_id: true,
          marketplace: true,
        },
      });

      if (!order) {
        return {
          success: false,
          error: `Could not find an order with marketplace number: ${orderStr}. Please check the order number and try again.`,
        };
      }

      shipstationOrderId = order.shipstation_order_id;
      dbOrderId = order.id;
      console.log(
        `[Server Action] Found ShipStation order ID ${shipstationOrderId} for ${order.marketplace} order ${orderStr}`
      );
    } else {
      // Try to parse as a direct database ID
      const parsedId = parseInt(orderStr, 10);
      if (isNaN(parsedId)) {
        // Not a valid number and not a recognized marketplace format
        return {
          success: false,
          error: `Invalid input format: "${orderStr}". Please enter a valid order ID (number) or marketplace order number.\n\nValid marketplace formats include:\n- Amazon: 123-1234567-1234567\n- eBay: 12-12345-12345\n- Etsy: 1234567890\n- Shopify: #1001 or 1001`,
        };
      }

      // It's a number, but let's check if it might actually be an Etsy order number
      // that was mistakenly entered as an internal ID
      if (parsedId > 1000000000 && MARKETPLACE_PATTERNS.etsy.test(orderStr)) {
        // This looks like an Etsy order number
        const order = await prisma.order.findFirst({
          where: {
            shipstation_order_number: orderStr,
          },
          select: {
            id: true,
            shipstation_order_id: true,
            marketplace: true,
          },
        });

        if (order) {
          // We found it as an Etsy order
          console.log(
            `[Server Action] Input ${orderStr} appears to be an Etsy order number, not an internal ID`
          );
          shipstationOrderId = order.shipstation_order_id;
          dbOrderId = order.id;
          console.log(
            `[Server Action] Found ShipStation order ID ${shipstationOrderId} for Etsy order ${orderStr}`
          );
        } else {
          // Not found as Etsy order, treat as internal ID
          // Look up the ShipStation order ID from the database
          const order = await prisma.order.findUnique({
            where: {
              id: parsedId,
            },
            select: {
              shipstation_order_id: true,
              shipstation_order_number: true,
              marketplace: true,
            },
          });

          if (!order) {
            return {
              success: false,
              error: `Order with ID ${parsedId} not found in the database.`,
            };
          }

          shipstationOrderId = order.shipstation_order_id;
          dbOrderId = parsedId;
          console.log(
            `[Server Action] Found ShipStation order ID ${shipstationOrderId} for database ID ${dbOrderId}`
          );
        }
      } else {
        // Regular internal ID
        // Look up the ShipStation order ID from the database
        const order = await prisma.order.findUnique({
          where: {
            id: parsedId,
          },
          select: {
            shipstation_order_id: true,
            shipstation_order_number: true,
            marketplace: true,
          },
        });

        if (!order) {
          return {
            success: false,
            error: `Order with ID ${parsedId} not found in the database.`,
          };
        }

        shipstationOrderId = order.shipstation_order_id;
        dbOrderId = parsedId;
        console.log(
          `[Server Action] Found ShipStation order ID ${shipstationOrderId} for database ID ${dbOrderId}`
        );
      }
    }

    if (!shipstationOrderId) {
      return {
        success: false,
        error: `Could not find ShipStation order ID for the provided order.`,
      };
    }

    // Call the syncSingleOrder function with the ShipStation order ID
    console.log(`[Server Action] Syncing order ${shipstationOrderId} from ShipStation...`);
    const result = await syncSingleOrder(shipstationOrderId);

    if (result.success) {
      const successMessage = `Successfully synced order from ShipStation. Database ID: ${dbOrderId}, ShipStation ID: ${shipstationOrderId}`;
      console.log(`[Server Action] ${successMessage}`);
      return {
        success: true,
        output: successMessage,
      };
    } else {
      console.error(
        `[Server Action] Failed to sync order ${shipstationOrderId} from ShipStation:`,
        result.error
      );
      return {
        success: false,
        error: result.error || 'Unknown error occurred during sync',
        output: `Attempted to sync order ${shipstationOrderId} but failed.`,
      };
    }
  } catch (error) {
    console.error(`[Server Action] Error syncing order from ShipStation:`, error);

    let errorMessage = 'Unknown error occurred during sync';
    if (typeof error === 'object' && error !== null && 'message' in error) {
      errorMessage = (error as Error).message;
    }

    return {
      success: false,
      error: `Sync failed: ${errorMessage}`,
    };
  }
}
