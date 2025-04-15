import { prisma } from "@/lib/prisma";
// Use correct enum name PrintTaskStatus
import {
  Prisma,
  Customer,
  Product,
  Order,
  OrderItem,
  PrintTaskStatus,
} from "@prisma/client";
import type {
  ShipStationOrder,
  ShipStationOrderItem,
  ShipStationTag,
} from "./types";
import logger from "../logger";
import {
  mapAddressToCustomerFields,
  mapSsItemToProductData,
  mapSsItemToOrderItemData,
  mapOrderToPrisma,
} from "./mappers";
import { listTags } from "./api";
import type { SyncOptions } from "./index"; // Import SyncOptions

// Define the type based on Prisma schema and usage
type OrderWithItemsAndProduct = Order & {
  items: (OrderItem & { product: Product | null })[];
};

// --- Database Interaction Functions ---

/**
 * Gets the timestamp of the most recently updated order in the database.
 * Used as a checkpoint for subsequent syncs.
 */
export async function getLastSyncTimestamp(): Promise<Date | null> {
  const lastOrder = await prisma.order.findFirst({
    orderBy: { updated_at: "desc" },
    select: { updated_at: true },
  });
  return lastOrder?.updated_at ?? null;
}

/**
 * Upserts a customer based primarily on email address.
 * Uses shipping address from the order as the source for address fields.
 * Includes dry run logic.
 */
export const upsertCustomerFromOrder = async (
  ssOrder: ShipStationOrder,
  options?: SyncOptions // Add options parameter
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
      select: { id: true, name: true }, // Select only needed fields
    });

    let customer: Customer | null = null; // Initialize as null
    const customerDataBase = shipTo ? mapAddressToCustomerFields(shipTo) : {};
    const customerName =
      shipTo?.name ?? ssOrder.customerUsername ?? "Unknown Customer";

    if (existingCustomer) {
      logger.info(
        `[Sync][Order ${ssOrder.orderNumber}] Found existing customer by email (${email}). Updating...`
      );
      const customerUpdateData: Prisma.CustomerUpdateInput = {};

      // Populate update data (same as before)
      if (shipTo) {
        if (customerDataBase.company !== undefined)
          customerUpdateData.company = customerDataBase.company;
        if (customerDataBase.street1 !== undefined)
          customerUpdateData.street1 = customerDataBase.street1;
        if (customerDataBase.street2 !== undefined)
          customerUpdateData.street2 = customerDataBase.street2;
        if (customerDataBase.street3 !== undefined)
          customerUpdateData.street3 = customerDataBase.street3;
        if (customerDataBase.city !== undefined)
          customerUpdateData.city = customerDataBase.city;
        if (customerDataBase.state !== undefined)
          customerUpdateData.state = customerDataBase.state;
        if (customerDataBase.postal_code !== undefined)
          customerUpdateData.postal_code = customerDataBase.postal_code;
        if (customerDataBase.country_code !== undefined)
          customerUpdateData.country_code = customerDataBase.country_code;
        if (customerDataBase.phone !== undefined)
          customerUpdateData.phone = customerDataBase.phone;
        if (customerDataBase.is_residential !== undefined)
          customerUpdateData.is_residential = customerDataBase.is_residential;
        if (customerDataBase.address_verified_status !== undefined)
          customerUpdateData.address_verified_status =
            customerDataBase.address_verified_status;
      }
      customerUpdateData.name = customerName;
      if (shipstationCustomerIdStr !== undefined) {
        customerUpdateData.shipstation_customer_id = shipstationCustomerIdStr;
      }
      customerUpdateData.updated_at = new Date();

      if (options?.dryRun) {
        logger.info(
          `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Would update customer ${existingCustomer.name} (ID: ${existingCustomer.id}) with data:`,
          customerUpdateData
        );
        // Return a mock customer object in dry run to allow order sync to proceed
        // Ensure mock object matches Customer schema exactly, adding potentially expected null fields
        customer = {
          id: existingCustomer.id, // Use existing ID if found
          email: email,
          name: customerName,
          shipstation_customer_id: shipstationCustomerIdStr ?? null,
          company: customerUpdateData.company as string | null,
          street1: customerUpdateData.street1 as string | null,
          street2: customerUpdateData.street2 as string | null,
          street3: customerUpdateData.street3 as string | null,
          city: customerUpdateData.city as string | null,
          state: customerUpdateData.state as string | null,
          postal_code: customerUpdateData.postal_code as string | null,
          country_code: customerUpdateData.country_code as string | null,
          phone: customerUpdateData.phone as string | null,
          is_residential: customerUpdateData.is_residential as boolean | null,
          address_verified_status:
            customerUpdateData.address_verified_status as string | null,
          created_at: new Date(), // Mock creation date
          updated_at: new Date(), // Mock update date
          customer_notes: null, // Required field
          address: null, // Add potentially expected field as null
          country: null, // Add potentially expected field as null
        };
      } else {
        customer = await prisma.customer.update({
          where: { email: email },
          data: customerUpdateData,
        });
        logger.info(
          `[Sync] Updated customer ${customer.name} (ID: ${customer.id})`
        );
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
      // Populate create data (same as before)
      if (shipTo) {
        if (customerDataBase.company !== undefined)
          customerCreateData.company = customerDataBase.company;
        if (customerDataBase.street1 !== undefined)
          customerCreateData.street1 = customerDataBase.street1;
        if (customerDataBase.street2 !== undefined)
          customerCreateData.street2 = customerDataBase.street2;
        if (customerDataBase.street3 !== undefined)
          customerCreateData.street3 = customerDataBase.street3;
        if (customerDataBase.city !== undefined)
          customerCreateData.city = customerDataBase.city;
        if (customerDataBase.state !== undefined)
          customerCreateData.state = customerDataBase.state;
        if (customerDataBase.postal_code !== undefined)
          customerCreateData.postal_code = customerDataBase.postal_code;
        if (customerDataBase.country_code !== undefined)
          customerCreateData.country_code = customerDataBase.country_code;
        if (customerDataBase.phone !== undefined)
          customerCreateData.phone = customerDataBase.phone;
        if (customerDataBase.is_residential !== undefined)
          customerCreateData.is_residential = customerDataBase.is_residential;
        if (customerDataBase.address_verified_status !== undefined)
          customerCreateData.address_verified_status =
            customerDataBase.address_verified_status;
      }

      if (options?.dryRun) {
        logger.info(
          `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Would create customer with data:`,
          customerCreateData
        );
        // Return a mock customer object in dry run
        // Use a negative number for mock ID
        const mockId = -Math.floor(Math.random() * 1000000);
        // Ensure mock object matches Customer schema exactly, adding potentially expected null fields
        customer = {
          id: mockId, // Use numeric mock ID
          email: email,
          name: customerName,
          shipstation_customer_id: shipstationCustomerIdStr ?? null,
          company: customerCreateData.company ?? null,
          street1: customerCreateData.street1 ?? null,
          street2: customerCreateData.street2 ?? null,
          street3: customerCreateData.street3 ?? null,
          city: customerCreateData.city ?? null,
          state: customerCreateData.state ?? null,
          postal_code: customerCreateData.postal_code ?? null,
          country_code: customerCreateData.country_code ?? null,
          phone: customerCreateData.phone ?? null,
          is_residential: customerCreateData.is_residential ?? null,
          address_verified_status:
            customerCreateData.address_verified_status ?? null,
          created_at: new Date(),
          updated_at: new Date(),
          customer_notes: null, // Required field
          address: null, // Add potentially expected field as null
          country: null, // Add potentially expected field as null
        };
      } else {
        customer = await prisma.customer.create({ data: customerCreateData });
        logger.info(
          `[Sync] Created customer ${customer.name} (ID: ${customer.id}, Email: ${customer.email}, SS_ID: ${customer.shipstation_customer_id})`
        );
      }
    }

    return customer;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
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
 * Includes dry run logic.
 */
export const upsertProductFromItem = async (
  tx: Prisma.TransactionClient, // Expecting Prisma Transaction Client
  ssItem: ShipStationOrderItem,
  options?: SyncOptions // Add options parameter
): Promise<Product | null> => {
  const trimmedSku = ssItem.sku?.trim();
  const shipstationProductId = ssItem.productId;

  if (!trimmedSku && !shipstationProductId) {
    logger.warn(
      `Product upsert skipped: Item missing SKU and SS Product ID. Name: ${ssItem.name || "(No Name)"}, LineItemKey: ${ssItem.lineItemKey}`
    );
    return null;
  }

  const productData = mapSsItemToProductData(ssItem);

  try {
    if (trimmedSku) {
      const existingBySku = await tx.product.findUnique({
        where: { sku: trimmedSku },
        // Select all fields needed for mock return (removed shorthand_name)
        select: {
          id: true,
          name: true,
          sku: true,
          shipstation_product_id: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (existingBySku) {
        logger.info(
          `[Product Sync] Found existing product by SKU: ${trimmedSku} (ID: ${existingBySku.id}). Updating...`
        );

        // ... existing conflict warning logic ...
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

        const updateData = {
          ...productData,
          shipstation_product_id: shipstationProductId,
          updatedAt: new Date(),
        };

        if (options?.dryRun) {
          logger.info(
            `[Product Sync][Dry Run] Would update product by SKU ${trimmedSku} (ID: ${existingBySku.id}) with data:`,
            updateData
          );
          // Return mock updated product, merging existing data with update data
          // Ensure mock object matches Product schema exactly
          return {
            id: existingBySku.id, // Use existing ID (number)
            // Use simple string/null types from updateData
            name: typeof updateData.name === 'string' ? updateData.name : existingBySku.name,
            sku: typeof updateData.sku === 'string' || updateData.sku === null ? updateData.sku : existingBySku.sku,
            shipstation_product_id:
              typeof updateData.shipstation_product_id === 'string' ? updateData.shipstation_product_id :
                existingBySku.shipstation_product_id,
            imageUrl: typeof updateData.imageUrl === 'string' || updateData.imageUrl === null ?
              updateData.imageUrl : existingBySku.imageUrl,
            createdAt: existingBySku.createdAt, // Keep original creation date
            updatedAt: updateData.updatedAt,
            // Add required fields with null or default values
            notes: null,
            weight: null,
            fulfillment_sku: null,
            item_weight_units: null,
            warehouse_location: null,
            upc: null,
            item_weight_value: null,
          };
        } else {
          try {
            const updatedProduct = await tx.product.update({
              where: { id: existingBySku.id },
              data: updateData,
            });
            logger.info(
              `[Product Sync] Updated product by SKU: ${updatedProduct.name} (ID: ${updatedProduct.id})`
            );
            return updatedProduct;
          } catch (updateError) {
            // ... existing update error handling (P2002 conflict) ...
            if (
              updateError instanceof Prisma.PrismaClientKnownRequestError &&
              updateError.code === "P2002" &&
              updateError.meta?.target === "Product_shipstation_product_id_key"
            ) {
              logger.warn(
                `[Product Sync Conflict] Update failed for SKU '${trimmedSku}' (ID: ${existingBySku.id}). ` +
                `The incoming ShipStation Product ID '${shipstationProductId}' likely already exists on another product. ` +
                `Keeping existing product record without updating SS_ID.`
              );
              return existingBySku as Product; // Return the original existing product
            } else {
              logger.error(
                `[Product Sync] Unexpected error updating product by SKU '${trimmedSku}' (ID: ${existingBySku.id}):`,
                { error: updateError }
              );
              throw updateError;
            }
          }
        }
      }
      logger.info(
        `[Product Sync] SKU ${trimmedSku} not found. Proceeding with upsert logic...`
      );
    }

    // Upsert/Create logic
    const createInput = productData as Prisma.ProductCreateInput;
    const updateInput = productData as Prisma.ProductUpdateInput;

    if (shipstationProductId) {
      logger.info(
        `[Product Sync] Upserting by SS Product ID: ${shipstationProductId} (SKU: ${trimmedSku || "N/A"})...`
      );
      if (options?.dryRun) {
        logger.info(
          `[Product Sync][Dry Run] Would upsert product by SS_ID ${shipstationProductId}. Create data:`,
          createInput,
          "Update data:",
          updateInput
        );
        const existingProductById = await tx.product.findUnique({
          where: { shipstation_product_id: shipstationProductId },
          select: { id: true, createdAt: true },
        });
        // Use a negative number for mock ID
        const mockId =
          existingProductById?.id ?? -Math.floor(Math.random() * 1000000);
        // Ensure mock object matches Product schema exactly
        return {
          id: mockId, // Use mock number ID
          // Use simple string/null types from createInput/updateInput and ensure we extract actual values
          name:
            typeof createInput.name === "string"
              ? createInput.name
              : typeof updateInput.name === "string"
                ? updateInput.name
                : "Unknown Product",
          sku:
            typeof createInput.sku === "string" || createInput.sku === null
              ? createInput.sku
              : typeof updateInput.sku === "string" || updateInput.sku === null
                ? updateInput.sku
                : null,
          shipstation_product_id: shipstationProductId,
          imageUrl: typeof createInput.imageUrl === 'string' || createInput.imageUrl === null ? createInput.imageUrl :
            typeof updateInput.imageUrl === 'string' || updateInput.imageUrl === null ? updateInput.imageUrl : null,
          createdAt: existingProductById?.createdAt ?? new Date(), // Use existing or new date
          updatedAt: new Date(),
          // Add required fields with null or default values
          notes: null,
          weight: null,
          fulfillment_sku: null,
          item_weight_units: null,
          warehouse_location: null,
          upc: null,
          item_weight_value: null,
        };
      } else {
        const product = await tx.product.upsert({
          where: { shipstation_product_id: shipstationProductId },
          create: createInput,
          update: updateInput,
        });
        logger.info(
          `[Product Sync] Upserted by SS Product ID: ${product.name} (ID: ${product.id})`
        );
        return product;
      }
    } else if (trimmedSku) {
      logger.warn(
        `[Product Sync] Attempting CREATE by SKU only: ${trimmedSku} (SS Product ID missing)...`
      );
      if (options?.dryRun) {
        logger.info(
          `[Product Sync][Dry Run] Would create product by SKU only ${trimmedSku}. Data:`,
          createInput
        );
        // Use a negative number for mock ID
        const mockId = -Math.floor(Math.random() * 1000000); // Use numeric mock ID
        // Return a mock product object
        return {
          id: mockId, // Use numeric mock ID
          // Use simple string/null types from createInput
          name: createInput.name ?? "Unknown Product",
          sku: trimmedSku,
          shipstation_product_id: null, // Explicitly null as it's missing
          imageUrl: createInput.imageUrl ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          // Add required fields with null or default values
          notes: null,
          weight: null,
          fulfillment_sku: null,
          item_weight_units: null,
          warehouse_location: null,
          upc: null,
          item_weight_value: null,
        };
      } else {
        const product = await tx.product.create({
          data: createInput,
        });
        logger.info(
          `[Product Sync] Created product by SKU only: ${product.name} (ID: ${product.id})`
        );
        return product;
      }
    } else {
      logger.error(
        "[Product Sync] Logical error: No identifier (SKU or SS Product ID) for upsert."
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
    throw error; // Re-throw error to potentially fail transaction if not handled above
  }
};

/**
 * Upserts an order and its items based on ShipStation data.
 * Includes customer and product upsert logic.
 * Includes dry run logic.
 */
export const upsertOrderWithItems = async (
  ssOrder: ShipStationOrder,
  options?: SyncOptions // Add options parameter
): Promise<{
  order: OrderWithItemsAndProduct | null;
  success: boolean;
  itemsProcessed: number;
  itemsFailed: number;
  errors: { itemId: string; error: string }[];
}> => {
  const shipstationOrderIdStr = ssOrder.orderId.toString();
  logger.info(
    `[Sync] Starting upsert process for Order SS_ID: ${shipstationOrderIdStr} (Number: ${ssOrder.orderNumber})`
  );
  if (options?.dryRun) {
    logger.info(
      `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Running in dry run mode.`
    );
  }
  const errors: { itemId: string; error: string }[] = [];
  let previousOrderStatus: string | undefined; // To track status changes

  try {
    // Fetch previous status *before* the transaction (read-only, safe for dry run)
    const existingOrder = await prisma.order.findUnique({
      where: { shipstation_order_id: shipstationOrderIdStr },
      select: { order_status: true, id: true }, // Select ID for mock return in dry run
    });
    previousOrderStatus = existingOrder?.order_status;

    // 1. Upsert Customer (pass options)
    const customer = await upsertCustomerFromOrder(ssOrder, options);
    if (!customer) {
      // Decide if this is critical - currently logs error and continues
      logger.error(
        `[Sync][Order ${ssOrder.orderNumber}] Failed to upsert customer, continuing order sync...`
      );
      // errors.push({ itemId: 'customer', error: 'Failed to upsert customer' });
      // Consider if you want to fail the whole order sync here
    }

    // Map Order Data
    const customerIdForMap = customer?.id; // Use potentially mock ID in dry run
    const orderInputData = mapOrderToPrisma(ssOrder, customerIdForMap);

    // Dry Run Simulation for Transaction
    if (options?.dryRun) {
      logger.info(
        `[Sync][Dry Run][Order ${ssOrder.orderNumber}] --- Start Transaction Simulation ---`
      );

      // Simulate Order Upsert
      const mockOrderId =
        existingOrder?.id ?? `dry-run-order-${shipstationOrderIdStr}`;
      if (existingOrder) {
        logger.info(
          `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Would update order (ID: ${mockOrderId}) with data:`,
          orderInputData
        );
      } else {
        logger.info(
          `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Would create order with data:`,
          orderInputData
        );
      }

      // Simulate Item Processing
      const incomingSsItems = ssOrder.items.filter((item) => !item.adjustment);
      logger.info(
        `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Simulating processing ${incomingSsItems.length} items...`
      );
      let itemsProcessed = 0;
      let itemsFailed = 0;

      for (const ssItem of incomingSsItems) {
        if (!ssItem.lineItemKey) {
          const errorMsg = `Skipping incoming item due to missing lineItemKey. SKU: ${ssItem.sku}, Name: ${ssItem.name}`;
          logger.warn(
            `[Sync][Dry Run][Order ${ssOrder.orderNumber}] ${errorMsg}`
          );
          errors.push({
            itemId: ssItem.orderItemId?.toString() || "unknown",
            error: errorMsg,
          });
          itemsFailed++;
          continue;
        }
        const lineItemKey = ssItem.lineItemKey;

        try {
          // Simulate Product Upsert (pass options) - uses a mock transaction client (prisma)
          // Note: This simulation won't perfectly replicate transaction behavior but gives an idea.
          // We pass prisma directly, as tx doesn't exist in dry run.
          const dbProduct = await upsertProductFromItem(
            prisma as unknown as Prisma.TransactionClient,
            ssItem,
            options
          );
          if (!dbProduct) {
            const errorMsg = `Product could not be upserted. SKU: ${ssItem.sku}, Name: ${ssItem.name}`;
            logger.warn(
              `[Sync][Dry Run][Order ${ssOrder.orderNumber}][Item ${lineItemKey}] ${errorMsg}`
            );
            errors.push({ itemId: lineItemKey, error: errorMsg });
            itemsFailed++;
            continue;
          }

          // Simulate OrderItem Upsert
          const orderItemMappedData = mapSsItemToOrderItemData(
            ssItem,
            dbProduct.id
          ); // Use mock product ID
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { productId: _ignoredProductId, ...dataForUpsert } =
            orderItemMappedData;
          const createData = {
            ...dataForUpsert,
            shipstationLineItemKey: lineItemKey,
            orderId: mockOrderId, // Use mock order ID
            productId: dbProduct.id, // Use mock product ID
          };
          const updateData = {
            ...dataForUpsert,
            orderId: mockOrderId,
            productId: dbProduct.id,
            updated_at: new Date(),
          };

          // Check if item likely exists (read-only, safe)
          const existingItem = await prisma.orderItem.findUnique({
            where: { shipstationLineItemKey: lineItemKey },
            select: { id: true },
          });
          if (existingItem) {
            logger.info(
              `[Sync][Dry Run][Order ${ssOrder.orderNumber}][Item ${lineItemKey}] Would update OrderItem (ID: ${existingItem.id}) with data:`,
              updateData
            );
          } else {
            logger.info(
              `[Sync][Dry Run][Order ${ssOrder.orderNumber}][Item ${lineItemKey}] Would create OrderItem with data:`,
              createData
            );
          }
          itemsProcessed++;
        } catch (itemError) {
          const errorMsg =
            itemError instanceof Error ? itemError.message : String(itemError);
          logger.error(
            `[Sync][Dry Run][Order ${ssOrder.orderNumber}][Item ${lineItemKey}] Failed to simulate item processing: ${errorMsg}`,
            { error: itemError }
          );
          errors.push({ itemId: lineItemKey, error: errorMsg });
          itemsFailed++;
        }
      } // End item loop simulation

      logger.info(
        `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Item Upsert Simulation Complete: ${itemsProcessed} processed, ${itemsFailed} failed.`
      );

      // Simulate Auto-complete print tasks
      if (
        ssOrder.orderStatus === "shipped" ||
        ssOrder.orderStatus === "cancelled"
      ) {
        // Only update tasks if the status actually changed
        if (
          previousOrderStatus &&
          previousOrderStatus !== ssOrder.orderStatus
        ) {
          // Check if previous status was one we should auto-complete from
          const validPreviousStatuses = [
            "awaiting_shipment",
            "awaiting_shipping",
            "on_hold",
          ];
          const shouldAutoComplete =
            validPreviousStatuses.includes(previousOrderStatus);

          if (shouldAutoComplete) {
            logger.info(
              `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Would check for pending/in-progress tasks for order ID ${mockOrderId} to auto-complete.`
            );
            // Simulate finding tasks (read-only, safe)
            // Use mockOrderId if existingOrder is null
            const orderIdToCheck = existingOrder?.id ?? mockOrderId;

            // Only query if the order ID is a real number
            if (typeof orderIdToCheck === "number") {
              const pendingTasks = await prisma.printOrderTask.findMany({
                // Use correct enum PrintTaskStatus
                where: {
                  orderId: orderIdToCheck,
                  status: {
                    in: [PrintTaskStatus.pending, PrintTaskStatus.in_progress],
                  },
                },
                select: { id: true },
              });
              if (pendingTasks.length > 0) {
                logger.info(
                  `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Would auto-complete ${pendingTasks.length} print tasks.`
                );
              } else {
                logger.info(
                  `[Sync][Dry Run][Order ${ssOrder.orderNumber}] No pending/in-progress print tasks found to auto-complete.`
                );
              }
            } else {
              logger.info(
                `[Sync][Dry Run][Order ${ssOrder.orderNumber}] Skipping print task check because Order ID is a mock value (${orderIdToCheck}).`
              );
            }
          }
        }
      }

      logger.info(
        `[Sync][Dry Run][Order ${ssOrder.orderNumber}] --- End Transaction Simulation ---`
      );

      // Return success with simulated counts
      return {
        // Cannot return a real order object in dry run without creating it
        order: null, // Or potentially a mock object if needed downstream
        success: true, // Indicate simulation was successful
        itemsProcessed,
        itemsFailed,
        errors,
      };
    }

    // --- Actual Transaction ---
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Upsert Order
        logger.info(
          `[Sync][Order ${ssOrder.orderNumber}] Upserting order record...`
        );
        const dbOrder = await tx.order.upsert({
          where: { shipstation_order_id: shipstationOrderIdStr },
          update: orderInputData as Prisma.OrderUpdateInput,
          create: orderInputData as Prisma.OrderCreateInput,
          select: { id: true },
        });
        const dbOrderId = dbOrder.id;

        // Process Incoming Items using Upsert
        const incomingSsItems = ssOrder.items.filter(
          (item) => !item.adjustment
        );
        logger.info(
          `[Sync][Order ${ssOrder.orderNumber}] Processing ${incomingSsItems.length} incoming items using upsert...`
        );
        let itemsProcessed = 0;
        let itemsFailed = 0;

        for (const ssItem of incomingSsItems) {
          if (!ssItem.lineItemKey) {
            const errorMsg = `Skipping incoming item due to missing lineItemKey. SKU: ${ssItem.sku}, Name: ${ssItem.name}`;
            logger.warn(`[Sync][Order ${ssOrder.orderNumber}] ${errorMsg}`);
            errors.push({
              itemId: ssItem.orderItemId?.toString() || "unknown",
              error: errorMsg,
            });
            itemsFailed++;
            continue;
          }
          const lineItemKey = ssItem.lineItemKey;

          try {
            // Upsert Product first (pass tx and options)
            const dbProduct = await upsertProductFromItem(tx, ssItem, options);
            if (!dbProduct) {
              const errorMsg = `Product could not be upserted. SKU: ${ssItem.sku}, Name: ${ssItem.name}`;
              logger.warn(
                `[Sync][Order ${ssOrder.orderNumber}][Item ${lineItemKey}] ${errorMsg}`
              );
              errors.push({ itemId: lineItemKey, error: errorMsg });
              itemsFailed++;
              continue;
            }

            // Prepare Item Data
            const orderItemMappedData = mapSsItemToOrderItemData(
              ssItem,
              dbProduct.id
            );
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { productId: _ignoredProductId, ...dataForUpsert } =
              orderItemMappedData;

            // Use Upsert for the OrderItem
            await tx.orderItem.upsert({
              where: { shipstationLineItemKey: lineItemKey },
              create: {
                ...dataForUpsert,
                shipstationLineItemKey: lineItemKey,
                order: { connect: { id: dbOrderId } },
                product: { connect: { id: dbProduct.id } },
              },
              update: {
                ...dataForUpsert,
                orderId: dbOrderId,
                productId: dbProduct.id,
                updated_at: new Date(),
              },
            });
            itemsProcessed++;
          } catch (itemError) {
            const errorMsg =
              itemError instanceof Error
                ? itemError.message
                : String(itemError);
            logger.error(
              `[Sync][Order ${ssOrder.orderNumber}][Item ${lineItemKey}] Failed to process item: ${errorMsg}`,
              { error: itemError }
            );
            errors.push({ itemId: lineItemKey, error: errorMsg });
            itemsFailed++;
            // Continue with next item instead of failing the entire transaction
          }
        } // End item loop

        logger.info(
          `[Sync][Order ${ssOrder.orderNumber}] Item Upsert Complete: ${itemsProcessed} processed, ${itemsFailed} failed.`
        );

        // Auto-complete print tasks if order status changed to shipped or cancelled
        if (
          ssOrder.orderStatus === "shipped" ||
          ssOrder.orderStatus === "cancelled"
        ) {
          // Only update tasks if the status actually changed
          if (
            previousOrderStatus &&
            previousOrderStatus !== ssOrder.orderStatus
          ) {
            // Check if previous status was one we should auto-complete from
            const validPreviousStatuses = [
              "awaiting_shipment",
              "awaiting_shipping",
              "on_hold",
            ];
            const shouldAutoComplete =
              validPreviousStatuses.includes(previousOrderStatus);

            if (shouldAutoComplete) {
              logger.info(
                `[Sync][Order ${ssOrder.orderNumber}] Order status changed from ${previousOrderStatus} to ${ssOrder.orderStatus}. Auto-completing print tasks...`
              );

              // Find all pending or in-progress print tasks for this order
              const pendingTasks = await tx.printOrderTask.findMany({
                where: {
                  orderId: dbOrderId,
                  status: { in: ["pending", "in_progress"] },
                },
                select: { id: true },
              });

              if (pendingTasks.length > 0) {
                // Update all tasks to completed
                const taskIds = pendingTasks.map((task) => task.id);
                await tx.printOrderTask.updateMany({
                  where: { id: { in: taskIds } },
                  data: {
                    status: "completed",
                    updated_at: new Date(),
                  },
                });

                logger.info(
                  `[Sync][Order ${ssOrder.orderNumber}] Auto-completed ${pendingTasks.length} print tasks.`
                );
              } else {
                logger.info(
                  `[Sync][Order ${ssOrder.orderNumber}] No pending or in-progress print tasks found to auto-complete.`
                );
              }
            } else {
              logger.info(
                `[Sync][Order ${ssOrder.orderNumber}] Order status changed from ${previousOrderStatus} to ${ssOrder.orderStatus}, but previous status is not one that triggers auto-completion.`
              );
            }
          } else {
            logger.info(
              `[Sync][Order ${ssOrder.orderNumber}] Order status is ${ssOrder.orderStatus} but no status change detected.`
            );
          }
        }

        // Fetch and Return Final Order State
        return {
          order: await tx.order.findUniqueOrThrow({
            where: { id: dbOrderId },
            include: { items: { include: { product: true } } },
          }),
          itemsProcessed,
          itemsFailed,
        };
      },
      { timeout: 60000 }
    ); // Increased timeout

    logger.info(
      `[Sync] Successfully processed Order ${result.order.shipstation_order_number}. Items: ${result.itemsProcessed} processed, ${result.itemsFailed} failed.`
    );
    return {
      order: result.order,
      success: true,
      itemsProcessed: result.itemsProcessed,
      itemsFailed: result.itemsFailed,
      errors,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      `[Sync] Failed to process order SS_ID ${shipstationOrderIdStr}: ${errorMsg}`,
      { error }
    );
    return {
      order: null,
      success: false,
      itemsProcessed: 0, // Assume 0 if transaction failed before item processing completed
      itemsFailed: ssOrder.items?.length || 0, // Assume all items failed if order processing failed
      errors: [...errors, { itemId: "order", error: errorMsg }],
    };
  }
};

/**
 * Fetches tags from ShipStation and upserts them into the local database.
 * Includes dry run logic.
 */
export async function syncShipStationTags(
  options?: SyncOptions
): Promise<void> {
  // Add options parameter
  logger.info("[Sync Tags] Starting ShipStation tag synchronization...");
  if (options?.dryRun) {
    logger.info("[Sync Tags][Dry Run] Dry run mode enabled.");
  }
  try {
    const ssTags: ShipStationTag[] = await listTags();
    let processedCount = 0;

    for (const ssTag of ssTags) {
      const updateData = {
        name: ssTag.name,
        color_hex: ssTag.color,
        last_synced: new Date(),
      };
      const createData = {
        shipstation_tag_id: ssTag.tagId,
        name: ssTag.name,
        color_hex: ssTag.color,
        last_synced: new Date(),
      };

      if (options?.dryRun) {
        // Check if tag likely exists (read-only, safe)
        const existingTag = await prisma.tag.findUnique({
          where: { shipstation_tag_id: ssTag.tagId },
          select: { id: true },
        });
        if (existingTag) {
          logger.info(
            `[Sync Tags][Dry Run] Would update tag ${ssTag.name} (SS_ID: ${ssTag.tagId}) with data:`,
            updateData
          );
        } else {
          logger.info(
            `[Sync Tags][Dry Run] Would create tag ${ssTag.name} (SS_ID: ${ssTag.tagId}) with data:`,
            createData
          );
        }
        processedCount++;
      } else {
        await prisma.tag.upsert({
          where: { shipstation_tag_id: ssTag.tagId },
          update: updateData,
          create: createData,
        });
        processedCount++;
      }
    }

    logger.info(
      `[Sync Tags] Finished. ${options?.dryRun ? "Would have processed" : "Processed"} ${processedCount} tags from ShipStation.`
    );
  } catch (error) {
    logger.error("[Sync Tags] Error synchronizing ShipStation tags:", {
      error,
    });
    // Decide if error should be re-thrown based on context
    // throw error;
  }
}
