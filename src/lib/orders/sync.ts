import { Prisma, Customer, Product } from '@prisma/client';
import axios from 'axios';

import {
  mapAddressToCustomerFields,
  mapSsItemToProductData,
  mapSsItemToOrderItemData,
  mapOrderToPrisma,
} from './mappers';
import { prisma } from '../shared/database'; // Use relative path
import { logger } from '../shared/logging'; // Import logger
// --- Imports ---
import { recordMetric } from '../shared/metrics'; // Import the recordMetric helper
import {
  shipstationApi, // Ensure this is exported from shared
  listTags, // Ensure this is exported from shared
  type ShipStationOrder,
  type ShipStationOrderItem,
  type ShipStationTag, // Ensure this is exported from shared
  type ShipStationApiParams, // Ensure this is exported from shared
  type ShipStationOrdersResponse, // Ensure this is exported from shared
} from '../shared/shipstation'; // Use relative path
// import type { MetricsCollector } from "../shared/metrics"; // Import MetricsCollector type - removed unused import
import {
  createSyncProgress,
  updateSyncProgress,
  markSyncCompleted,
  incrementProcessedOrders,
  incrementFailedOrders,
  // updateLastProcessedOrder, // removed unused import
} from '../shipstation/sync-progress'; // Import progress functions

// Removed unused import: format from 'date-fns-tz'

// --- Constants ---
const PAGE_SIZE = 100; // Orders per API call (adjust as needed, max 500)
const DELAY_MS = 1500; // Delay between API calls (adjust based on rate limits)
const MAX_RETRIES = 3; // Max retries for API calls
// Removed unused constant: SHIPSTATION_TIMEZONE

// --- Options Interface ---
export interface SyncOptions {
  dryRun?: boolean;
  // Add other potential options here if needed later
}

// --- Database Interaction Functions ---

/**
 * Gets the timestamp of the most recently updated order in the database.
 * Used as a checkpoint for subsequent syncs.
 */
export async function getLastSyncTimestamp(): Promise<Date | null> {
  const lastOrder = await prisma.order.findFirst({
    orderBy: { updated_at: 'desc' },
    select: { updated_at: true },
  });
  return lastOrder?.updated_at ?? null;
}

/**
 * Upserts a customer based primarily on email address.
 * Uses shipping address from the order as the source for address fields.
 */
export const upsertCustomerFromOrder = async (
  ssOrder: ShipStationOrder,
  options?: SyncOptions // Added options parameter
): Promise<Customer | null> => {
  const shipTo = ssOrder.shipTo;
  const email = ssOrder.customerEmail?.trim();
  const shipstationCustomerIdStr = ssOrder.customerId?.toString();

  if (!shipTo) {
    logger.warn(
      `[Sync][Order ${ssOrder.orderNumber}] No shipTo address found. Cannot effectively upsert customer address details.`
    );
  }

  if (!email) {
    logger.warn(
      `[Sync][Order ${ssOrder.orderNumber}] Customer email is missing. Cannot reliably upsert customer based on email.`
    );
    return null;
  }

  try {
    const existingCustomer = await prisma.customer.findUnique({
      where: { email: email },
    });

    let customer: Customer | null = null; // Initialize as null
    const customerDataBase = shipTo ? mapAddressToCustomerFields(shipTo) : {};
    const customerName = shipTo?.name ?? ssOrder.customerUsername ?? 'Unknown Customer';

    if (existingCustomer) {
      logger.info(
        `[Sync][Order ${ssOrder.orderNumber}] Found existing customer by email (${email}). Updating...`
      );
      const customerUpdateData: Prisma.CustomerUpdateInput = {};

      if (shipTo) {
        if (customerDataBase.company !== undefined)
          customerUpdateData.company = customerDataBase.company;
        if (customerDataBase.street1 !== undefined)
          customerUpdateData.street1 = customerDataBase.street1;
        if (customerDataBase.street2 !== undefined)
          customerUpdateData.street2 = customerDataBase.street2;
        if (customerDataBase.street3 !== undefined)
          customerUpdateData.street3 = customerDataBase.street3;
        if (customerDataBase.city !== undefined) customerUpdateData.city = customerDataBase.city;
        if (customerDataBase.state !== undefined) customerUpdateData.state = customerDataBase.state;
        if (customerDataBase.postal_code !== undefined)
          customerUpdateData.postal_code = customerDataBase.postal_code;
        if (customerDataBase.country_code !== undefined)
          customerUpdateData.country_code = customerDataBase.country_code;
        if (customerDataBase.phone !== undefined) customerUpdateData.phone = customerDataBase.phone;
        if (customerDataBase.is_residential !== undefined)
          customerUpdateData.is_residential = customerDataBase.is_residential;
        if (customerDataBase.address_verified_status !== undefined)
          customerUpdateData.address_verified_status = customerDataBase.address_verified_status;
      }

      customerUpdateData.name = customerName;

      if (shipstationCustomerIdStr !== undefined) {
        customerUpdateData.shipstation_customer_id = shipstationCustomerIdStr;
      }

      customerUpdateData.updated_at = new Date();

      if (options?.dryRun) {
        logger.info(
          `[DRY RUN][Customer] Would update customer ${existingCustomer.id} (Email: ${email})`
        );
        customer = existingCustomer; // Return existing customer in dry run
      } else {
        customer = await prisma.customer.update({
          where: { email: email },
          data: customerUpdateData,
        });
        logger.info(`[Sync] Updated customer ${customer.name} (ID: ${customer.id})`);
      }
    } else {
      logger.info(
        `[Sync][Order ${ssOrder.orderNumber}] No existing customer found by email (${email}). Creating...`
      );
      const customerCreateData: Prisma.CustomerCreateInput = {
        name: customerName,
        email: email,
        shipstation_customer_id: shipstationCustomerIdStr,
      };
      if (shipTo) {
        if (customerDataBase.company !== undefined)
          customerCreateData.company = customerDataBase.company;
        if (customerDataBase.street1 !== undefined)
          customerCreateData.street1 = customerDataBase.street1;
        if (customerDataBase.street2 !== undefined)
          customerCreateData.street2 = customerDataBase.street2;
        if (customerDataBase.street3 !== undefined)
          customerCreateData.street3 = customerDataBase.street3;
        if (customerDataBase.city !== undefined) customerCreateData.city = customerDataBase.city;
        if (customerDataBase.state !== undefined) customerCreateData.state = customerDataBase.state;
        if (customerDataBase.postal_code !== undefined)
          customerCreateData.postal_code = customerDataBase.postal_code;
        if (customerDataBase.country_code !== undefined)
          customerCreateData.country_code = customerDataBase.country_code;
        if (customerDataBase.phone !== undefined) customerCreateData.phone = customerDataBase.phone;
        if (customerDataBase.is_residential !== undefined)
          customerCreateData.is_residential = customerDataBase.is_residential;
        if (customerDataBase.address_verified_status !== undefined)
          customerCreateData.address_verified_status = customerDataBase.address_verified_status;
      }

      if (options?.dryRun) {
        logger.info(
          `[DRY RUN][Customer] Would create customer (Email: ${email}, SS_ID: ${shipstationCustomerIdStr})`
        );
        // In dry run, we can't return a real new customer, so return null
        customer = null;
      } else {
        customer = await prisma.customer.create({ data: customerCreateData });
        logger.info(
          `[Sync] Created customer ${customer.name} (ID: ${customer.id}, Email: ${customer.email}, SS_ID: ${customer.shipstation_customer_id})`
        );
        // Use recordMetric helper
        recordMetric({ name: 'customer_upserted', value: 1 });
      }
    }

    return customer;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.error(
        `[Sync][Order ${ssOrder.orderNumber}] Failed to upsert customer due to unique constraint. Email: ${email}, SS_ID: ${shipstationCustomerIdStr}. Fields: ${error.meta?.target}`,
        { error }
      );
    } else {
      logger.error(
        `[Sync][Order ${ssOrder.orderNumber}] Error upserting customer. Email: ${email}, SS_ID: ${shipstationCustomerIdStr}:`,
        { error }
      );
    }
    return null;
  }
};

/**
 * Upserts a product based on ShipStation item data within a transaction.
 */
export const upsertProductFromItem = async (
  tx: Prisma.TransactionClient,
  ssItem: ShipStationOrderItem,
  options?: SyncOptions // Added options parameter
): Promise<Product | null> => {
  const trimmedSku = ssItem.sku?.trim();
  const shipstationProductId = ssItem.productId;

  if (!trimmedSku && !shipstationProductId) {
    logger.warn(
      `Product upsert skipped: Item missing SKU and SS Product ID. Name: ${ssItem.name || '(No Name)'}, LineItemKey: ${ssItem.lineItemKey}`
    );
    return null;
  }

  const productData = mapSsItemToProductData(ssItem);
  let isNewProduct = false;

  try {
    if (trimmedSku) {
      const existingBySku = await tx.product.findUnique({
        where: { sku: trimmedSku },
      });

      if (existingBySku) {
        logger.info(
          `[Product Sync] Found existing product by SKU: ${trimmedSku} (ID: ${existingBySku.id}). Updating...`
        );

        if (
          shipstationProductId !== undefined &&
          existingBySku.shipstation_product_id !== undefined &&
          existingBySku.shipstation_product_id !== shipstationProductId
        ) {
          logger.warn(
            `[Product Sync Conflict] SKU '${trimmedSku}' exists (DB ID: ${existingBySku.id}) but with different ShipStation Product ID. ` +
              `DB SS_ID: ${existingBySku.shipstation_product_id}, Incoming SS_ID: ${shipstationProductId}. ` +
              `Attempting to update with incoming ID.`
          );
        }

        try {
          if (options?.dryRun) {
            logger.info(
              `[DRY RUN][Product] Would update product by SKU: ${trimmedSku} (ID: ${existingBySku.id})`
            );
            return existingBySku; // Return existing in dry run
          } else {
            const updatedProduct = await tx.product.update({
              where: { id: existingBySku.id },
              data: {
                ...productData,
                shipstation_product_id: shipstationProductId,
                updatedAt: new Date(),
              },
            });
            logger.info(
              `[Product Sync] Updated product by SKU: ${updatedProduct.name} (ID: ${updatedProduct.id})`
            );
            return updatedProduct;
          }
        } catch (updateError) {
          if (
            updateError instanceof Prisma.PrismaClientKnownRequestError &&
            updateError.code === 'P2002' &&
            updateError.meta?.target === 'Product_shipstation_product_id_key'
          ) {
            logger.warn(
              `[Product Sync Conflict] Update failed for SKU '${trimmedSku}' (ID: ${existingBySku.id}). ` +
                `The incoming ShipStation Product ID '${shipstationProductId}' likely already exists on another product. ` +
                `Keeping existing product record without updating SS_ID.`
            );
            return existingBySku; // Return existing even on conflict during update attempt
          } else {
            logger.error(
              `[Product Sync] Unexpected error updating product by SKU '${trimmedSku}' (ID: ${existingBySku.id}):`,
              { error: updateError }
            );
            throw updateError;
          }
        }
      }
      logger.info(`[Product Sync] SKU ${trimmedSku} not found. Proceeding with upsert logic...`);
    }

    if (shipstationProductId) {
      logger.info(
        `[Product Sync] Upserting by SS Product ID: ${shipstationProductId} (SKU: ${trimmedSku || 'N/A'})...`
      );
      if (options?.dryRun) {
        logger.info(
          `[DRY RUN][Product] Would upsert product by SS Product ID: ${shipstationProductId} (SKU: ${trimmedSku || 'N/A'})`
        );
        // Try to find existing to return something plausible in dry run
        const existingById = await tx.product.findUnique({
          where: { shipstation_product_id: shipstationProductId },
        });
        return existingById; // Might be null if it doesn't exist
      } else {
        const product = await tx.product.upsert({
          where: { shipstation_product_id: shipstationProductId },
          create: {
            ...(productData as Prisma.ProductCreateInput),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            ...(productData as Prisma.ProductUpdateInput),
            updatedAt: new Date(),
          },
        });
        logger.info(
          `[Product Sync] Upserted by SS Product ID: ${product.name} (ID: ${product.id})`
        );
        // Check if it was created
        if (product.createdAt.getTime() === product.updatedAt.getTime()) {
          isNewProduct = true;
        }
        // Use recordMetric helper
        if (isNewProduct)
          recordMetric({
            name: 'product_upserted',
            value: 1,
            tags: { type: 'ss_id' },
          });
        return product;
      }
    } else if (trimmedSku) {
      logger.warn(
        `[Product Sync] Attempting CREATE by SKU only: ${trimmedSku} (SS Product ID missing)...`
      );
      if (options?.dryRun) {
        logger.info(`[DRY RUN][Product] Would create product by SKU only: ${trimmedSku}`);
        return null; // Cannot return a real product in dry run create
      } else {
        const product = await tx.product.create({
          data: {
            ...(productData as Prisma.ProductCreateInput),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        logger.info(
          `[Product Sync] Created product by SKU only: ${product.name} (ID: ${product.id})`
        );
        // Use recordMetric helper
        recordMetric({
          name: 'product_upserted',
          value: 1,
          tags: { type: 'sku_only' },
        });
        return product;
      }
    } else {
      logger.error(
        '[Product Sync] Logical error: No identifier (SKU or SS Product ID) for upsert.'
      );
      return null;
    }
  } catch (error) {
    logger.error(
      `[Product Sync] Error during product sync for SKU: ${trimmedSku}, SS_ID: ${shipstationProductId}. Error:`,
      { error }
    );
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(` -> Prisma Error Code: ${error.code}`, {
        meta: error.meta,
      });
    }
    throw error; // Re-throw error within transaction
  }
};

// Define the return type for upsertOrderWithItems
interface UpsertResult {
  success: boolean;
  itemsProcessed: number;
  itemsFailed: number;
  // Use string | null for itemSku to match Prisma schema potential nulls
  errors: { itemSku?: string | null; error: string }[];
}

/**
 * Upserts a single order and its items, handling potential errors.
 * This function now takes the global prisma client instead of a transaction client.
 */
async function upsertOrderWithItems(
  orderData: ShipStationOrder, // Type from ShipStation API response
  progressId: string,
  options?: SyncOptions // Pass sync options
): Promise<UpsertResult> {
  // Return the defined interface type
  let success = true;
  let itemsProcessed = 0;
  let itemsFailed = 0;
  // Use string | null for itemSku
  const errors: { itemSku?: string | null; error: string }[] = [];

  if (!orderData.orderId) {
    const errorMsg = 'Order is missing ShipStation Order ID. Cannot process.';
    logger.warn(`[Sync] ${errorMsg}`);
    return {
      success: false,
      itemsProcessed: 0,
      itemsFailed: 0,
      errors: [{ error: errorMsg }],
    };
  }

  // Define dbOrderId here, before the transaction block
  let dbOrderId: number | undefined;

  try {
    logger.info(`[Sync] Processing order ${orderData.orderNumber}...`);
    // Use recordMetric helper
    recordMetric({
      name: 'order_processing_start',
      value: 1,
      tags: { orderNumber: orderData.orderNumber.toString() },
    });

    // Upsert Customer first
    const dbCustomer = await upsertCustomerFromOrder(orderData, options);
    if (!dbCustomer) {
      const errorMsg = `Failed to upsert customer for order ${orderData.orderNumber}.`;
      logger.error(`[Sync] ${errorMsg}`);
      // Consider if this should fail the whole order or just log
      // For now, let's allow the order upsert to proceed but log the error
      errors.push({ error: errorMsg });
      // Do not return here, attempt to process the order itself
    }

    if (options?.dryRun) {
      logger.info(`[Dry Run] Would upsert order ${orderData.orderNumber} and its items.`);
      // Simulate item processing for dry run metrics
      itemsProcessed = orderData.items?.length || 0;
      itemsFailed = 0;
      success = true;
      // Update progress even in dry run
      try {
        // Pass progressId as string
        await incrementProcessedOrders(progressId); // Correct function name
        // Pass progressId as string
        await updateSyncProgress(progressId, {
          lastProcessedOrderId: orderData.orderId.toString(),
          // Ensure orderDate is valid before creating Date
          lastProcessedTimestamp: orderData.orderDate ? new Date(orderData.orderDate) : new Date(),
        });
      } catch (_progressError: unknown) {
        logger.warn(`[Dry Run] Failed to update progress for order ${orderData.orderNumber}`, {
          error: _progressError,
        });
        /* ignore progress update errors */
      }
    } else {
      // Use Prisma transaction with explicit type for tx
      const transactionResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Ensure the Order exists first within the transaction
        // Use shipstation_order_id as the unique identifier
        const ssOrderIdValue = orderData.orderId?.toString(); // Use the correct field 'orderId' from ShipStationOrder

        if (!ssOrderIdValue) {
          // Cannot reliably upsert without the shipstation_order_id value
          logger.error(
            `[Sync][Order ${orderData.orderNumber}] Missing orderId from ShipStation data. Cannot process order.`
          );
          throw new Error(`Order ${orderData.orderNumber} is missing orderId`);
        }

        const orderWhereUniqueInput: Prisma.OrderWhereUniqueInput = {
          shipstation_order_id: ssOrderIdValue, // Use the value for the where clause
        };

        const orderPayload: Prisma.OrderCreateInput | Prisma.OrderUpdateInput = {
          ...mapOrderToPrisma(orderData, dbCustomer?.id), // Use mapped data
          // Ensure updatedAt is set on update
          updated_at: new Date(),
        };

        // Perform the Order upsert
        const upsertedOrder = await tx.order.upsert({
          where: orderWhereUniqueInput,
          create: {
            ...(orderPayload as Prisma.OrderCreateInput),
            // Explicitly set required fields for create if not in mapOrderToPrisma
            // e.g., order_status: orderPayload.order_status || 'awaiting_shipment',
            // e.g., total_price: orderPayload.total_price || 0,
            // e.g., created_at: new Date(),
            updated_at: new Date(), // Ensure updated_at is set on create too
          },
          update: orderPayload as Prisma.OrderUpdateInput,
        });
        dbOrderId = upsertedOrder.id; // Assign the ID from the upserted order

        let currentItemsProcessed = 0;
        let currentItemsFailed = 0;

        for (const ssItem of orderData.items) {
          const lineItemKey = ssItem.lineItemKey || '';

          try {
            // Pass options directly
            const dbProduct = await upsertProductFromItem(tx, ssItem, options);
            if (!dbProduct) {
              const errorMsg = `Product could not be upserted. SKU: ${ssItem.sku}, Name: ${ssItem.name}`;
              logger.warn(
                `[Sync][Order ${orderData.orderNumber}][Item ${lineItemKey}] ${errorMsg}`
              );
              // Use ssItem.sku (which can be null)
              errors.push({ itemSku: ssItem.sku, error: errorMsg });
              currentItemsFailed++;
              continue;
            }

            // Prepare Item Data
            const orderItemMappedData = mapSsItemToOrderItemData(ssItem, dbProduct.id);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { productId: _ignoredProductId, ...dataForUpsert } = orderItemMappedData;

            // Get the key from ShipStation item
            const ssLineItemKey = ssItem.lineItemKey;

            if (ssLineItemKey) {
              // Key exists, proceed with upsert using the key
              await tx.orderItem.upsert({
                where: { shipstationLineItemKey: ssLineItemKey },
                create: {
                  ...dataForUpsert,
                  shipstationLineItemKey: ssLineItemKey, // Use the actual key
                  order: { connect: { id: dbOrderId } }, // Use dbOrderId here
                  product: { connect: { id: dbProduct.id } },
                  created_at: new Date(),
                  updated_at: new Date(),
                },
                update: {
                  ...dataForUpsert, // Update data
                  // Do not try to update connect fields like orderId/productId in update block
                  updated_at: new Date(),
                },
              });
            } else {
              // Key is missing, cannot upsert based on it. We MUST create.
              // This assumes the item doesn't exist yet. If the sync runs again on the
              // same order where items are missing keys, this could create duplicates.
              // A more robust solution might involve composite keys if needed later.
              logger.warn(
                `[Sync][Order ${orderData.orderNumber}][Item SKU ${ssItem.sku || 'N/A'}] Missing shipstationLineItemKey. Creating new OrderItem. Potential duplicate if re-syncing.`
              );
              await tx.orderItem.create({
                data: {
                  ...dataForUpsert,
                  shipstationLineItemKey: null, // Explicitly set to null
                  order: { connect: { id: dbOrderId } }, // Use dbOrderId here
                  product: { connect: { id: dbProduct.id } },
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              });
            }

            currentItemsProcessed++;
          } catch (itemError: unknown) {
            // Changed any to unknown
            currentItemsFailed++;
            const itemErrorMsg =
              itemError instanceof Error ? itemError.message : 'Unknown item error';
            logger.error(
              `[Sync][Order ${orderData.orderNumber}][Item ${lineItemKey}] Error upserting item: ${itemErrorMsg}`,
              { error: itemError }
            );
            // Decide if item error should fail the whole order transaction
            // For now, let's continue processing other items but log the failure
            // throw itemError; // Uncomment to rollback transaction on item failure
          }
        } // End item loop

        logger.info(
          `[Sync][Order ${orderData.orderNumber}] Item Upsert Complete: ${currentItemsProcessed} items processed, ${currentItemsFailed} items failed.`
        );

        // Fetch and Return Final Order State
        const finalOrder = await tx.order.findUniqueOrThrow({
          where: { id: dbOrderId },
          include: { items: { include: { product: true } } },
        });

        return {
          order: finalOrder,
          itemsProcessed: currentItemsProcessed,
          itemsFailed: currentItemsFailed,
        };
      }); // End transaction

      // Assign results after transaction
      itemsProcessed = transactionResult.itemsProcessed;
      itemsFailed = transactionResult.itemsFailed;

      // Update progress after successful transaction
      try {
        // Pass progressId as string
        await incrementProcessedOrders(progressId); // Correct function name
        // Pass progressId as string
        await updateSyncProgress(progressId, {
          lastProcessedOrderId: orderData.orderId.toString(),
          lastProcessedTimestamp: new Date(orderData.orderDate),
        });
      } catch {
        /* ignore progress update errors */
      }

      // Record metrics
      recordMetric({
        name: 'order_processed',
        value: 1,
        tags: {
          orderNumber: orderData.orderNumber.toString(),
          success: 'true',
          itemsProcessed: itemsProcessed.toString(),
          itemsFailed: itemsFailed.toString(),
        },
      });
    }

    return { success, itemsProcessed, itemsFailed, errors };
  } catch (error: unknown) {
    // Changed any to unknown
    logger.error(`[Sync] Error processing order ${orderData.orderNumber}:`, {
      error: error instanceof Error ? error.message : error,
    });
    success = false;
    errors.push({
      error: error instanceof Error ? error.message : 'Unknown order error',
    });
    // Ensure itemsFailed reflects total failure if order fails
    itemsFailed = orderData.items?.length || 0;
    itemsProcessed = 0;

    // Attempt to update progress on failure
    try {
      // Pass progressId as string
      await incrementFailedOrders(progressId); // Increment failed count
      // Pass progressId as string
      await updateSyncProgress(progressId, {
        lastProcessedOrderId: orderData.orderId.toString(), // Still record which order failed
        // Optionally add an error message field to SyncProgress model
      });
    } catch {
      /* ignore progress update errors */
    }

    // Record metrics on failure
    recordMetric({
      name: 'order_processed',
      value: 1,
      tags: {
        orderNumber: orderData.orderNumber.toString(),
        success: 'false',
        itemsProcessed: itemsProcessed.toString(),
        itemsFailed: itemsFailed.toString(),
      },
    });

    return { success, itemsProcessed, itemsFailed, errors };
  }
}

/**
 * Fetches orders from ShipStation API with retry logic.
 */
async function getShipstationOrders(
  params: ShipStationApiParams,
  retries = MAX_RETRIES
): Promise<ShipStationOrdersResponse> {
  recordMetric({
    name: 'shipstation_api_call',
    value: 1,
    tags: { endpoint: '/orders' },
  }); // Use recordMetric
  try {
    logger.info(`[API Call] Fetching orders with params: ${JSON.stringify(params)}`); // Changed to info level
    const response = await shipstationApi.get('/orders', { params });
    return {
      orders: response.data.orders,
      total: response.data.total,
      page: response.data.page,
      pages: response.data.pages,
    };
  } catch (error: unknown) {
    // Changed any to unknown
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const headers = error.response?.headers;
      const rateLimitRemaining = headers ? parseInt(headers['x-rate-limit-remaining'], 10) : NaN;
      const rateLimitReset = headers ? parseInt(headers['x-rate-limit-reset'], 10) * 1000 : NaN; // Convert to ms

      logger.warn(
        `[API Call] Failed to fetch orders (Status: ${status}). Retries left: ${retries}. Rate Limit Remaining: ${rateLimitRemaining ?? 'N/A'}`
      );

      if (status === 429 && retries > 0) {
        const waitTime = !isNaN(rateLimitReset)
          ? Math.max(rateLimitReset - Date.now(), 1000)
          : DELAY_MS * (MAX_RETRIES - retries + 1);
        logger.warn(`[API Call] Rate limit hit. Waiting ${waitTime / 1000}s before retrying...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return getShipstationOrders(params, retries - 1);
      } else if (status && status >= 500 && retries > 0) {
        logger.warn(
          `[API Call] Server error (${status}). Waiting ${DELAY_MS / 1000}s before retrying...`
        );
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        return getShipstationOrders(params, retries - 1);
      }
    }
    logger.error(
      '[API Call] Error fetching ShipStation orders after retries or for non-retriable error:',
      { error: error instanceof Error ? error.message : error, params }
    );
    throw error; // Re-throw after logging if retries exhausted or error is not retriable
  }
}

/**
 * Syncs all orders using pagination.
 * @param options Sync options, including optional overrideStartDate.
 * @param overrideStartDate Optional start date to force sync from.
 */
export async function syncAllPaginatedOrders(
  options?: SyncOptions & {
    overrideStartDate?: string;
    defaultStartDate?: string;
  },
  overrideStartDate?: string // Allow passing start date directly for recent sync
): Promise<{
  success: boolean;
  ordersProcessed: number;
  ordersFailed: number;
}> {
  // progressId is string
  const progressId = await createSyncProgress('full');
  // Metrics tracking
  let ordersProcessed = 0;
  let ordersFailed = 0;

  let page = 1;
  let totalPages = 1;
  let dateStartFilter: string;
  let overallSuccess = true;

  try {
    // Determine start date: overrideStartDate > options.overrideStartDate > lastSync > options.defaultStartDate
    const forcedStartDate = overrideStartDate || options?.overrideStartDate;
    if (forcedStartDate) {
      dateStartFilter = forcedStartDate;
      logger.info(`[Full Sync] Starting sync using forced start date: ${dateStartFilter}`);
    } else {
      const lastSync = await getLastSyncTimestamp();
      dateStartFilter = lastSync
        ? new Date(lastSync.getTime() + 1).toISOString() // +1ms buffer
        : options?.defaultStartDate || '2022-01-01T00:00:00.000Z'; // Default fallback
      logger.info(`[Full Sync] Starting sync using checkpoint/default: ${dateStartFilter}`);
    }

    await updateSyncProgress(progressId, {
      status: 'running',
      lastProcessedTimestamp: new Date(dateStartFilter), // Use correct field name
    });

    while (true) {
      try {
        logger.info(`[Full Sync] Fetching page ${page}... (Reported total pages: ${totalPages})`);

        const response = await getShipstationOrders({
          pageSize: PAGE_SIZE,
          page: page,
          modifyDateStart: dateStartFilter,
          sortBy: 'modifyDate',
          sortDir: 'ASC', // Changed from DESC - fetch oldest first
        });

        const { orders, pages, total } = response;
        totalPages = pages; // Update total pages based on API response

        if (page === 1 && total) {
          await updateSyncProgress(progressId, { totalOrders: total }); // Use correct field name
        }

        if (orders && orders.length > 0) {
          logger.info(`[Full Sync] Processing ${orders.length} orders from page ${page}...`);

          for (const orderData of orders) {
            const result = await upsertOrderWithItems(
              orderData,
              progressId, // Pass progressId (string)
              options // Pass options
            );

            // Accumulate results
            if (result.success) {
              ordersProcessed++;
            } else {
              ordersFailed++;
              overallSuccess = false; // Mark overall sync as failed if any order fails
            }
          } // End order loop

          // Move page increment and loop break logic outside the order loop
          page++;

          // Check if we've processed all pages reported by the API
          if (page > totalPages) {
            logger.info(`[Full Sync] Reached the last reported page (${totalPages}). Ending sync.`);
            break; // Exit while loop
          }

          // Delay before next page fetch (moved here)
          logger.info(`[Full Sync] Waiting ${DELAY_MS / 1000}s before fetching page ${page}...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        } else {
          logger.info(`[Full Sync] No orders returned on page ${page}. Ending sync for this run.`);
          break; // Exit the while loop
        }
      } catch (pageError: unknown) {
        // Changed any to unknown
        overallSuccess = false;
        const errorMsg = pageError instanceof Error ? pageError.message : String(pageError);
        logger.error(`[Full Sync] Error fetching or processing page ${page}: ${errorMsg}`, {
          error: pageError,
        });
        // Mark progress outside the loop in the finally block or after loop
        break; // Exit the while loop on error
      }
    } // End while loop

    if (overallSuccess) {
      logger.info(
        `[Full Sync] ShipStation full order sync completed successfully. Orders processed: ${ordersProcessed}, Orders failed: ${ordersFailed}`
      );
    } else {
      logger.warn(
        `[Full Sync] ShipStation full order sync completed with errors. Orders processed: ${ordersProcessed}, Orders failed: ${ordersFailed}`
      );
    }

    // Mark completion status after the loop finishes or breaks
    await markSyncCompleted(
      progressId,
      overallSuccess,
      overallSuccess ? undefined : 'Sync completed with errors'
    );

    // Return final counts
    return {
      success: overallSuccess,
      ordersProcessed,
      ordersFailed,
    };
  } catch (error: unknown) {
    // Changed any to unknown
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Full Sync] Unexpected error in sync setup or loop: ${errorMsg}`, { error });

    try {
      // Ensure progressId exists before marking completion
      if (progressId) {
        await markSyncCompleted(progressId, false, errorMsg);
      }
    } catch (_progressError: unknown) {
      /* ignore progress mark error */
      logger.warn('[Full Sync] Failed to mark progress during error handling', {
        error: _progressError,
      });
    }

    // Return final counts even on error
    return {
      success: false,
      ordersProcessed,
      ordersFailed,
    };
  }
}

/**
 * Syncs recent orders from ShipStation (orders modified within the specified lookback period).
 * Fetches all relevant orders, sorts them in memory (newest first), then processes.
 * @param lookbackDays Number of days to look back (can be fractional).
 * @param options Sync options.
 */
export async function syncRecentOrders(
  lookbackDays: number = 2,
  options?: SyncOptions
): Promise<{
  success: boolean;
  ordersProcessed: number;
  ordersFailed: number;
}> {
  const progressId = await createSyncProgress('recent'); // Create specific progress record
  let ordersProcessed = 0;
  let ordersFailed = 0;
  let overallSuccess = true;
  const allRecentOrders: ShipStationOrder[] = []; // Array to hold all fetched orders

  try {
    const now = new Date();
    const bufferMilliseconds = 15 * 60 * 1000; // 15 minutes buffer
    const startDate = new Date(
      now.getTime() - lookbackDays * 24 * 60 * 60 * 1000 - bufferMilliseconds
    );
    // Format start date as ISO 8601 UTC string for the API
    const dateStartFilter = startDate.toISOString(); // e.g., 2025-04-14T23:23:21.123Z

    const lookbackPeriod =
      lookbackDays >= 1 ? `${lookbackDays} days` : `${Math.round(lookbackDays * 24)} hours`;
    logger.info(
      `[Recent Sync] Starting sync for orders modified in the last ${lookbackPeriod} (since ${dateStartFilter} UTC)${options?.dryRun ? ' (DRY RUN)' : ''}`
    );

    await updateSyncProgress(progressId, {
      status: 'running',
      lastProcessedTimestamp: startDate,
    });

    // --- Fetch all relevant orders ---
    let page = 1;
    let totalPages = 1;
    logger.info('[Recent Sync] Fetching all relevant orders from ShipStation...');
    while (true) {
      try {
        logger.info(`[Recent Sync] Fetching page ${page}... (Reported total pages: ${totalPages})`);
        const response = await getShipstationOrders({
          pageSize: PAGE_SIZE,
          page: page,
          modifyDateStart: dateStartFilter,
          sortBy: 'modifyDate', // Keep sorting for potential API optimization
          sortDir: 'ASC', // Fetch oldest first during pagination
        });

        const { orders, pages } = response;
        totalPages = pages; // Update total pages

        if (orders && orders.length > 0) {
          allRecentOrders.push(...orders);
          logger.info(
            `[Recent Sync] Fetched ${orders.length} orders from page ${page}. Total fetched: ${allRecentOrders.length}`
          );

          if (page >= totalPages) {
            logger.info(
              `[Recent Sync] Reached the last reported page (${totalPages}). Finished fetching.`
            );
            break; // Exit fetch loop
          }
          page++;
          logger.info(`[Recent Sync] Waiting ${DELAY_MS / 1000}s before fetching page ${page}...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        } else {
          logger.info(`[Recent Sync] No more orders returned on page ${page}. Finished fetching.`);
          break; // Exit fetch loop
        }
      } catch (fetchError: unknown) {
        overallSuccess = false;
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        logger.error(`[Recent Sync] Error fetching page ${page}: ${errorMsg}`, {
          error: fetchError,
        });
        throw new Error(`Failed during order fetch: ${errorMsg}`); // Throw to exit sync
      }
    } // End fetch loop

    logger.info(`[Recent Sync] Total orders fetched: ${allRecentOrders.length}.`);
    await updateSyncProgress(progressId, { totalOrders: allRecentOrders.length });

    // --- Sort orders in memory (newest first based on modifyDate) ---
    logger.info('[Recent Sync] Sorting fetched orders by modification date (newest first)...');
    allRecentOrders.sort((a, b) => {
      const dateA = a.modifyDate ? new Date(a.modifyDate).getTime() : 0;
      const dateB = b.modifyDate ? new Date(b.modifyDate).getTime() : 0;
      return dateB - dateA; // Descending order
    });

    // --- Process sorted orders ---
    logger.info(`[Recent Sync] Processing ${allRecentOrders.length} sorted orders...`);
    for (const orderData of allRecentOrders) {
      const result = await upsertOrderWithItems(
        orderData,
        progressId, // Pass the specific progressId for recent sync
        options
      );

      if (result.success) {
        ordersProcessed++;
      } else {
        ordersFailed++;
        overallSuccess = false; // Mark overall as failed if any order fails
        // Log specific errors from result.errors if needed
        logger.warn(
          `[Recent Sync] Failed to process order ${orderData.orderNumber}. Errors: ${JSON.stringify(result.errors)}`
        );
      }
      // Progress update (lastProcessedOrderId, timestamp) happens within upsertOrderWithItems
    } // End processing loop

    if (overallSuccess) {
      logger.info(
        `[Recent Sync] Completed successfully. Orders processed: ${ordersProcessed}, Orders failed: ${ordersFailed}${options?.dryRun ? ' (DRY RUN)' : ''}`
      );
    } else {
      logger.warn(
        `[Recent Sync] Completed with errors. Orders processed: ${ordersProcessed}, Orders failed: ${ordersFailed}${options?.dryRun ? ' (DRY RUN)' : ''}`
      );
    }

    await markSyncCompleted(
      progressId,
      overallSuccess,
      overallSuccess ? undefined : 'Recent sync completed with errors'
    );

    return { success: overallSuccess, ordersProcessed, ordersFailed };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Recent Sync] Fatal error during sync process: ${errorMsg}`, { error });
    try {
      await markSyncCompleted(progressId, false, `Fatal error: ${errorMsg}`);
    } catch (markError) {
      logger.warn('[Recent Sync] Failed to mark progress during error handling', {
        error: markError,
      });
    }
    return { success: false, ordersProcessed, ordersFailed }; // Return failure state
  }
}

/**
 * Syncs a single order from ShipStation by its ID
 */
export async function syncSingleOrder(
  orderId: number, // Keep as number, convert inside
  options?: SyncOptions // Added options
): Promise<{ success: boolean; error?: string }> {
  const progressId = await createSyncProgress('single');
  let overallSuccess = false;
  let errorMsg: string | undefined;

  try {
    logger.info(
      `[Single Order Sync] Fetching order ${orderId} from ShipStation...${options?.dryRun ? ' (DRY RUN)' : ''}`
    );
    // Initialize progress tracking
    await updateSyncProgress(progressId, { status: 'running', totalOrders: 1 }); // Use correct field name
    recordMetric({
      name: 'shipstation_api_call',
      value: 1,
      tags: { endpoint: `/orders/${orderId}` },
    });

    // Use getShipstationOrders with orderId filter for consistency and retry logic
    // Pass orderId as number directly to the params object
    const response = await getShipstationOrders({ orderId: orderId });

    if (!response.orders || response.orders.length === 0 || !response.orders[0].orderId) {
      errorMsg = `Order ${orderId} not found or invalid response from ShipStation`;
      logger.error(`[Single Order Sync] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const orderData = response.orders[0]; // Get the single order from the response array
    // Metric for start already recorded within upsertOrderWithItems
    logger.info(`[Single Order Sync] Processing order ${orderId} (${orderData.orderNumber})...`);

    // Pass options down
    const result = await upsertOrderWithItems(
      orderData,
      progressId, // Pass progressId
      options
    );

    // Record metrics
    recordMetric({
      name: 'order_processed',
      value: 1,
      tags: {
        orderNumber: orderData.orderNumber.toString(),
        success: result.success ? 'true' : 'false',
        itemsProcessed: result.itemsProcessed.toString(),
        itemsFailed: result.itemsFailed.toString(),
      },
    });

    if (result.success) {
      logger.info(
        `[Single Order Sync] Successfully synced order ${orderId}${options?.dryRun ? ' (DRY RUN)' : ''}`
      );
      await incrementProcessedOrders(progressId); // Correct function name
      await updateSyncProgress(progressId, {
        lastProcessedOrderId: orderId.toString(),
        lastProcessedTimestamp: new Date(),
      });
      overallSuccess = true;
    } else {
      errorMsg =
        result.errors.map(e => `SKU: ${e.itemSku || 'N/A'} - ${e.error}`).join('; ') ||
        'Unknown processing error';
      logger.error(`[Single Order Sync] Failed to sync order ${orderId}: ${errorMsg}`);
      await incrementFailedOrders(progressId); // Correct function name
      throw new Error(errorMsg);
    }

    await markSyncCompleted(progressId, overallSuccess, errorMsg);
    return { success: overallSuccess, error: errorMsg };
  } catch (error: unknown) {
    // Changed any to unknown
    logger.error(`[Single Order Sync] Error syncing order ${orderId}:`, {
      error: error instanceof Error ? error.message : error,
    });
    errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (progressId) {
      try {
        await markSyncCompleted(progressId, false, errorMsg);
      } catch {
        /* ignore progress update errors */
      }
    }
    return { success: overallSuccess, error: errorMsg };
  }
}

/**
 * Fetches tags from ShipStation and upserts them into the local database.
 */
export async function syncShipStationTags(options?: SyncOptions): Promise<void> {
  logger.info('[Sync Tags] Starting ShipStation tag synchronization...');
  const progressId = await createSyncProgress('full'); // Use 'full' as SyncType for tags for now
  let success = true;
  let errorMsg: string | undefined;

  try {
    const ssTags: ShipStationTag[] = await listTags();
    // Initialize progress tracking
    await updateSyncProgress(progressId, {
      status: 'running',
      totalOrders: ssTags.length,
    }); // Use correct field name

    let processedCount = 0;
    for (const ssTag of ssTags) {
      if (options?.dryRun) {
        logger.info(`[DRY RUN][Tag] Would upsert tag ${ssTag.name} (ID: ${ssTag.tagId})`);
      } else {
        await prisma.tag.upsert({
          where: { shipstation_tag_id: ssTag.tagId },
          update: {
            name: ssTag.name,
            color_hex: ssTag.color,
            last_synced: new Date(),
          },
          create: {
            shipstation_tag_id: ssTag.tagId,
            name: ssTag.name,
            color_hex: ssTag.color,
            last_synced: new Date(),
          },
        });
      }
      processedCount++;
      // Still increment progress in dry run to simulate
      await incrementProcessedOrders(progressId); // Correct function name
    }

    logger.info(
      `[Sync Tags] Finished. Processed ${processedCount} tags from ShipStation.${options?.dryRun ? ' (DRY RUN)' : ''}`
    );
  } catch (error: unknown) {
    // Changed any to unknown
    success = false;
    errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('[Sync Tags] Error synchronizing ShipStation tags:', {
      error,
    });
    // Only increment if progressId is valid
    if (progressId) {
      try {
        await incrementFailedOrders(progressId, 1); // Correct function name
      } catch (incError: unknown) {
        logger.warn('[Sync Tags] Failed to increment failed items count during error handling', {
          error: incError,
        });
      }
    }
    // Do not re-throw, just mark progress as failed
  } finally {
    if (progressId) {
      try {
        await markSyncCompleted(progressId, success, errorMsg);
      } catch (markError: unknown) {
        logger.warn('[Sync Tags] Failed to mark progress as completed during finally block', {
          error: markError,
        });
      }
    }
  }
}
