import { Prisma } from "@prisma/client";
import type {
  ShipStationAddress,
  ShipStationOrderItem,
  ShipStationOrder,
} from "../shared/shipstation"; // Use relative path
import { toDate } from "date-fns-tz";
import { logger } from "../shared/logging"; // Use relative path

// Define a simpler interface for the mappable fields
interface MappableCustomerFields {
  name?: string | null;
  company?: string | null;
  street1?: string | null;
  street2?: string | null;
  street3?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  phone?: string | null;
  is_residential?: boolean | null;
  address_verified_status?: string | null;
}

// --- Mapping Functions ---

export const mapAddressToCustomerFields = (
  addr: ShipStationAddress
): MappableCustomerFields => ({
  name: addr.name || null,
  company: addr.company || null,
  street1: addr.street1 || null,
  street2: addr.street2 || null,
  street3: addr.street3 || null,
  city: addr.city || null,
  state: addr.state || null,
  postal_code: addr.postalCode || null,
  country_code: addr.country || null,
  phone: addr.phone || null,
  is_residential: addr.residential ?? null,
  address_verified_status: addr.addressVerified ?? null,
});

export const mapSsItemToProductData = (
  ssItem: ShipStationOrderItem
): Prisma.ProductCreateInput | Prisma.ProductUpdateInput => ({
  // Trim SKU before mapping
  sku: ssItem.sku?.trim(),
  name: ssItem.name || "Product Needs Name",
  imageUrl: ssItem.imageUrl,
  shipstation_product_id: ssItem.productId,
  item_weight_value: ssItem.weight?.value,
  item_weight_units: ssItem.weight?.units,
  warehouse_location: ssItem.warehouseLocation,
  fulfillment_sku: ssItem.fulfillmentSku,
  upc: ssItem.upc,
});

export const mapSsItemToOrderItemData = (
  ssItem: ShipStationOrderItem,
  productId: number
): Omit<
  Prisma.OrderItemUncheckedCreateInput,
  "orderId" | "id" | "createdAt" | "updatedAt"
> => ({
  shipstationLineItemKey: ssItem.lineItemKey,
  productId: productId,
  quantity: ssItem.quantity,
  unit_price: ssItem.unitPrice ?? 0,
  // Ensure options are stored as valid JSON
  print_settings:
    ssItem.options && ssItem.options.length > 0
      ? JSON.parse(JSON.stringify(ssItem.options)) // Simple clone for plain options array
      : Prisma.JsonNull,
});

/**
 * Converts a ShipStation timestamp string to a Date object with proper timezone handling.
 * ShipStation uses PST/PDT (Pacific Time) for timestamps.
 *
 * This function uses date-fns-tz to correctly handle timezone conversion including
 * daylight saving time adjustments.
 *
 * @param dateString The ShipStation timestamp string
 * @returns A Date object in UTC
 */
function convertShipStationDateToUTC(
  dateString: string | null | undefined
): Date | null {
  if (!dateString) return null;

  // ShipStation uses Pacific Time (America/Los_Angeles) for timestamps
  // This timezone is PST (UTC-8) during standard time and PDT (UTC-7) during daylight saving time
  const SHIPSTATION_TIMEZONE = "America/Los_Angeles";

  try {
    // Parse the date string as if it were in Pacific Time
    // toDate handles daylight saving time correctly
    return toDate(dateString, { timeZone: SHIPSTATION_TIMEZONE });
  } catch (error) {
    logger.error(
      `Error converting date ${dateString} from Pacific Time to UTC:`,
      { error }
    );
    // Fallback to the old method if there's an error (less accurate)
    try {
      const date = new Date(dateString);
      // Check if the date is valid before attempting offset
      if (isNaN(date.getTime())) {
        logger.warn(
          `Invalid date string encountered during fallback conversion: ${dateString}`
        );
        return null;
      }
      // This fallback is less accurate as it doesn't account for DST
      const pstOffsetHours = 8; // Approximate PST offset
      return new Date(date.getTime() + pstOffsetHours * 60 * 60 * 1000);
    } catch (fallbackError) {
      logger.error(`Fallback date conversion also failed for ${dateString}:`, {
        fallbackError,
      });
      return null;
    }
  }
}

export const mapOrderToPrisma = (
  ssOrder: ShipStationOrder,
  dbCustomerId?: number
): Prisma.OrderCreateInput | Prisma.OrderUpdateInput => ({
  shipstation_order_id: ssOrder.orderId.toString(),
  shipstation_order_number: ssOrder.orderNumber,
  order_key: ssOrder.orderKey,
  order_date: convertShipStationDateToUTC(ssOrder.orderDate),
  payment_date: convertShipStationDateToUTC(ssOrder.paymentDate),
  ship_by_date: convertShipStationDateToUTC(ssOrder.shipByDate),
  order_status: ssOrder.orderStatus,
  marketplace: ssOrder.advancedOptions?.source,
  customer_name:
    ssOrder.shipTo?.name ||
    ssOrder.billTo?.name ||
    ssOrder.customerUsername ||
    "Unknown Customer",
  total_price: ssOrder.orderTotal,
  shipping_price: ssOrder.shippingCost ?? null,
  shipping_amount_paid: ssOrder.shippingAmount,
  shipping_tax: ssOrder.shippingTaxAmount ?? null,
  tax_amount: ssOrder.taxAmount,
  discount_amount: ssOrder.discountAmount ?? null,
  customer_notes: ssOrder.customerNotes,
  internal_notes: ssOrder.internalNotes,
  gift: ssOrder.gift,
  gift_message: ssOrder.giftMessage,
  gift_email: ssOrder.giftEmail ?? null,
  requested_shipping_service: ssOrder.requestedShippingService,
  carrier_code: ssOrder.carrierCode,
  service_code: ssOrder.serviceCode,
  package_code: ssOrder.packageCode,
  confirmation: ssOrder.confirmation,
  shipped_date: convertShipStationDateToUTC(ssOrder.shipDate),
  tracking_number: ssOrder.trackingNumber,
  warehouse_id: ssOrder.advancedOptions?.warehouseId?.toString(),
  last_sync_date: new Date(), // Always update sync date on update/create
  shipstation_store_id: ssOrder.advancedOptions?.storeId,
  payment_method: ssOrder.paymentMethod,
  amount_paid: ssOrder.amountPaid,
  order_weight_value: ssOrder.weight?.value,
  order_weight_units: ssOrder.weight?.units,
  // Dimensions
  dimensions_units: ssOrder.dimensions?.units,
  dimensions_length: ssOrder.dimensions?.length,
  dimensions_width: ssOrder.dimensions?.width,
  dimensions_height: ssOrder.dimensions?.height,
  // Insurance
  insurance_provider: ssOrder.insuranceOptions?.provider,
  insurance_insure_shipment: ssOrder.insuranceOptions?.insureShipment,
  insurance_insured_value: ssOrder.insuranceOptions?.insuredValue,
  // Ensure tags are stored as valid JSON
  tag_ids:
    ssOrder.tagIds && ssOrder.tagIds.length > 0
      ? JSON.parse(JSON.stringify(ssOrder.tagIds))
      : Prisma.JsonNull,
  ...(dbCustomerId && { customer: { connect: { id: dbCustomerId } } }),
});
