import { PrismaClient, Prisma } from '@prisma/client';

import { getLogger } from './shared/logging';

// Initialize logger for this module
const logger = getLogger('order-processing');

// Define the type for an Order including its items, products, and print tasks
export type OrderWithItemsAndProducts = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        product: true;
        printTasks: true;
      };
    };
  };
}>;

/**
 * Fetches orders from the database, optionally filtered by ID, ShipStation Order Number,
 * or ShipStation Order ID, or limited.
 * Includes related items and product details for each item.
 *
 * By default (if no specific identifier provided), only returns orders that:
 * 1. Have status 'awaiting_shipment' (excluding 'on_hold' orders)
 * 2. Have at least one item without an existing print task (unless forceRecreate is true)
 *
 * If a specific orderIdentifier is provided, these default filters are bypassed.
 * It tries to find by database ID (if identifier is purely numeric),
 * then by shipstation_order_number, then by shipstation_order_id.
 *
 * @param db - The PrismaClient instance.
 * @param orderIdentifier - Optional specific order ID (database ID), ShipStation Order Number, or ShipStation Order ID to fetch.
 * @param limit - Optional limit on the number of orders to fetch if orderIdentifier is not provided.
 * @param forceRecreate - Optional flag to bypass the check for existing print tasks.
 * @returns A promise resolving to an array of orders with their items and products.
 */
export async function getOrdersToProcess(
  db: PrismaClient,
  orderIdentifier?: string, // Renamed parameter for clarity
  limit?: number,
  forceRecreate?: boolean // Add forceRecreate flag
): Promise<OrderWithItemsAndProducts[]> {
  logger.info(
    `[getOrdersToProcess] Received args: orderIdentifier='${orderIdentifier}', limit=${limit}, forceRecreate=${forceRecreate}`
  );

  // Define the common include structure here
  const includeClause = {
    items: {
      include: {
        product: true,
        printTasks: true, // Include print tasks to check if they exist
      },
    },
  };
  // Define the common orderBy structure using Prisma enum
  const orderByClause: Prisma.OrderOrderByWithRelationInput = {
    order_date: Prisma.SortOrder.desc,
  };

  if (orderIdentifier) {
    // --- MODIFIED LOGIC: Try DB ID (if numeric), then ShipStation Order Number, then ShipStation Order ID ---
    let foundOrders: OrderWithItemsAndProducts[] = [];

    // 1. Try parsing as integer and searching by database ID *only if the identifier consists purely of digits*
    const isNumeric = /^\d+$/.test(orderIdentifier); // Check if string contains only digits
    if (isNumeric) {
      const potentialId = parseInt(orderIdentifier, 10);
      // Double check isNaN just in case, though regex should cover it
      if (!isNaN(potentialId)) {
        logger.debug(
          `[getOrdersToProcess] Identifier '${orderIdentifier}' is numeric. Attempting to find order by database ID: ${potentialId}`
        );
        foundOrders = (await db.order.findMany({
          where: { id: potentialId },
          include: includeClause,
          orderBy: orderByClause,
        })) as OrderWithItemsAndProducts[];
        if (foundOrders.length > 0) {
          logger.info(`[getOrdersToProcess] Found order by database ID: ${potentialId}`);
          return foundOrders; // Return immediately if found
        }
        logger.debug(`[getOrdersToProcess] No order found with database ID: ${potentialId}.`);
      }
    } else {
      logger.debug(
        `[getOrdersToProcess] Identifier '${orderIdentifier}' is not purely numeric. Skipping database ID search.`
      );
    }

    // 2. If not found by ID (or if identifier wasn't numeric), try by ShipStation Order Number
    logger.debug(
      `[getOrdersToProcess] Attempting to find order by ShipStation Order Number: ${orderIdentifier}`
    );
    foundOrders = (await db.order.findMany({
      where: { shipstation_order_number: orderIdentifier },
      include: includeClause,
      orderBy: orderByClause,
    })) as OrderWithItemsAndProducts[];
    if (foundOrders.length > 0) {
      logger.info(
        `[getOrdersToProcess] Found order by ShipStation Order Number: ${orderIdentifier}`
      );
      return foundOrders; // Return immediately if found
    }
    logger.debug(
      `[getOrdersToProcess] No order found with ShipStation Order Number: ${orderIdentifier}.`
    );

    // 3. If still not found, try by ShipStation Order ID
    logger.debug(
      `[getOrdersToProcess] Attempting to find order by ShipStation Order ID: ${orderIdentifier}`
    );
    foundOrders = (await db.order.findMany({
      where: { shipstation_order_id: orderIdentifier }, // Search by shipstation_order_id
      include: includeClause,
      orderBy: orderByClause,
    })) as OrderWithItemsAndProducts[];
    if (foundOrders.length > 0) {
      logger.info(`[getOrdersToProcess] Found order by ShipStation Order ID: ${orderIdentifier}`);
    } else {
      // Log final failure after trying all applicable identifiers
      logger.warn(
        `No order found matching Database ID (if applicable), ShipStation Order Number, or ShipStation Order ID: ${orderIdentifier}`
      );
    }
    return foundOrders; // Return the result (which might be empty)
    // --- END MODIFIED LOGIC ---
  } else {
    // Default filtering when no specific ID/Number is provided
    logger.debug(
      `[getOrdersToProcess] No specific order identifier provided. Applying default filters.`
    );
    const where: Prisma.OrderWhereInput = {
      order_status: 'awaiting_shipment',
    };

    if (!forceRecreate) {
      logger.debug(
        `[getOrdersToProcess] forceRecreate is false. Filtering out items with existing tasks.`
      );
      where.items = {
        some: {
          printTasks: {
            none: {},
          },
        },
      };
    } else {
      logger.debug(
        `[getOrdersToProcess] forceRecreate is true. Not filtering based on existing tasks.`
      );
    }

    const findManyArgs: Prisma.OrderFindManyArgs = {
      where,
      include: includeClause,
      orderBy: orderByClause,
    };

    if (limit !== undefined && limit > 0) {
      findManyArgs.take = limit;
    }
    // Explicitly cast the result here
    return db.order.findMany(findManyArgs) as Promise<OrderWithItemsAndProducts[]>;
  }
}
