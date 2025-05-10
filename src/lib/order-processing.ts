import { Prisma, PrismaClient } from '@prisma/client';

import { getLogger } from './shared/logging';

// Initialize logger for this module
const logger = getLogger('order-processing');

// Define the type for an Order including its items, products, and print tasks
export type OrderWithItemsAndProducts = Prisma.OrderGetPayload<{
  select: { 
    id: true,
    shipstation_order_id: true,
    shipstation_order_number: true,
    customerId: true,
    customer_name: true,
    order_status: true,
    order_key: true,
    order_date: true,
    payment_date: true,
    ship_by_date: true,
    shipping_price: true,
    tax_amount: true,
    discount_amount: true,
    shipping_amount_paid: true,
    shipping_tax: true,
    total_price: true,
    gift: true,
    gift_message: true,
    gift_email: true,
    requested_shipping_service: true,
    carrier_code: true,
    service_code: true,
    package_code: true,
    confirmation: true,
    tracking_number: true,
    shipped_date: true,
    warehouse_id: true,
    customer_notes: true,
    internal_notes: true,
    last_sync_date: true,
    notes: true, 
    created_at: true, 
    updated_at: true, 
    marketplace: true,
    amount_paid: true,
    order_weight_units: true,
    order_weight_value: true,
    payment_method: true,
    shipstation_store_id: true,
    tag_ids: true,
    dimensions_height: true,
    dimensions_length: true,
    dimensions_units: true,
    dimensions_width: true,
    insurance_insure_shipment: true,
    insurance_insured_value: true,
    insurance_provider: true,
    internal_status: true,
    is_voided: true,
    marketplace_notified: true,
    void_date: true,
    lastPackingSlipAt: true,
    is_merged: true,
    merged_to_order_id: true,
    merged_from_order_ids: true
  },
  include: {
    customer: { 
      select: { 
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true, 
        shipstation_customer_id: true,
        company: true,
        street1: true,
        street2: true,
        street3: true,
        city: true,
        state: true,
        postal_code: true,
        country: true, 
        country_code: true, 
        customer_notes: true, 
        created_at: true, 
        updated_at: true, 
        address_verified_status: true,
        is_residential: true
      }
    },
    items: {
      select: { 
        id: true,
        orderId: true,
        quantity: true,
        unit_price: true,
        print_settings: true,
        created_at: true,
        updated_at: true,
        shipstationLineItemKey: true,
        productId: true
      },
      include: {
        product: true, 
        printTasks: true, 
      },
    },
  },
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
/**
 * Fixes any invalid StlRenderStatus values in the database
 * This is a workaround for the issue where empty string values are not valid enum values
 */
export async function fixInvalidStlRenderStatus(db: PrismaClient): Promise<number> {
  try {
    // Use raw SQL to update any records with empty stl_render_state values
    const result = await db.$executeRaw`
      UPDATE PrintOrderTask
      SET stl_render_state = 'pending'
      WHERE stl_render_state = '' OR stl_render_state IS NULL
    `;

    if (result > 0) {
      logger.info(`Fixed ${result} PrintOrderTask records with invalid stl_render_state values`);
    }

    return result;
  } catch (error) {
    logger.error('Error fixing invalid StlRenderStatus values:', { error });
    return 0;
  }
}

export async function getOrdersToProcess(
  db: PrismaClient,
  orderIdentifier?: string, 
  limit?: number,
  forceRecreate?: boolean 
): Promise<OrderWithItemsAndProducts[]> {
  logger.info(
    `[getOrdersToProcess] Received args: orderIdentifier='${orderIdentifier}', limit=${limit}, forceRecreate=${forceRecreate}`
  );

  // Define the common include structure here
  const includeClause = {
    items: {
      include: {
        product: true,
        printTasks: true, 
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
    const isNumeric = /^\d+$/.test(orderIdentifier); 
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
          return foundOrders; 
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
      return foundOrders; 
    }
    logger.debug(
      `[getOrdersToProcess] No order found with ShipStation Order Number: ${orderIdentifier}.`
    );

    // 3. If still not found, try by ShipStation Order ID
    logger.debug(
      `[getOrdersToProcess] Attempting to find order by ShipStation Order ID: ${orderIdentifier}`
    );
    foundOrders = (await db.order.findMany({
      where: { shipstation_order_id: orderIdentifier }, 
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
    return foundOrders; 
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
          AND: [
            // Only consider items that have a valid shipstationLineItemKey
            {
              shipstationLineItemKey: {
                not: null
              }
            },
            // And only if they have no print tasks
            {
              printTasks: {
                none: {},
              },
            }
          ]
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
