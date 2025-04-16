import { PrismaClient, Prisma } from '@prisma/client'

// Define the type for an Order including its items and the product details for each item
const orderWithItemsAndProductsInclude = Prisma.validator<Prisma.OrderDefaultArgs>()({
  include: {
    items: {
      include: {
        product: true, // Include the full Product object related to the OrderItem
      },
    },
  },
})

export type OrderWithItemsAndProducts = Prisma.OrderGetPayload<typeof orderWithItemsAndProductsInclude>

/**
 * Fetches orders from the database, optionally filtered by ID or limited.
 * Includes related items and product details for each item.
 *
 * By default, only returns orders that:
 * 1. Have status 'awaiting_shipment' (excluding 'on_hold' orders)
 * 2. Have at least one item without an existing print task (unless forceRecreate is true)
 *
 * If a specific orderId is provided, these filters are bypassed.
 *
 * @param db - The PrismaClient instance.
 * @param orderId - Optional specific order ID (database ID) to fetch.
 * @param limit - Optional limit on the number of orders to fetch if orderId is not provided.
 * @param forceRecreate - Optional flag to bypass the check for existing print tasks.
 * @returns A promise resolving to an array of orders with their items and products.
 */
export async function getOrdersToProcess(
  db: PrismaClient,
  orderId?: string,
  limit?: number,
  forceRecreate?: boolean, // Add forceRecreate flag
): Promise<OrderWithItemsAndProducts[]> {
  const where: Prisma.OrderWhereInput = {}

  if (orderId) {
    // Convert orderId string to number for database query
    const id = parseInt(orderId, 10)
    if (!isNaN(id)) {
      where.id = id
    } else {
      console.warn(`Invalid Order ID provided: ${orderId}. Not applying ID filter.`)
      // Potentially return empty array or fetch based on limit if ID is invalid?
      // For now, let it potentially fetch based on limit or other criteria if added later.
    }
  } else {
    // Default criteria if no specific orderId is given
    // Only fetch orders that are awaiting shipment (exclude on_hold orders)
    where.order_status = 'awaiting_shipment'

    // Exclude orders that already have print tasks, UNLESS forceRecreate is true
    if (!forceRecreate) {
      where.items = {
        some: {
          // At least one item without a print task
          printTasks: {
            none: {}
          }
        }
      }
    }
  }

  const findManyArgs: Prisma.OrderFindManyArgs = {
    where,
    include: orderWithItemsAndProductsInclude.include,
    orderBy: {
      order_date: 'desc', // Process MOST RECENT orders first
    },
  }

  if (!orderId && limit !== undefined && limit > 0) {
    findManyArgs.take = limit
  }

  // Explicitly cast the result to the expected type
  return db.order.findMany(findManyArgs) as Promise<OrderWithItemsAndProducts[]>
}
