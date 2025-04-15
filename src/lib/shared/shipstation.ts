// Re-export from the original location
import type {
  ShipStationAddress,
  ShipStationOrderItem,
  ShipStationOrder,
  ShipStationTag, // Add missing type
  ShipStationApiParams, // Add missing type
  ShipStationOrdersResponse, // Add missing type
} from "../shipstation/types"; // Import types
import {
  createShipStationClient,
  getOrder,
  getOrdersByDate,
  getShipstationOrders,
  getTags,
  updateOrder,
  shipstationApi, // Add missing export
  listTags, // Add missing export
} from "../shipstation"; // Use relative path for ShipStation functions
// Prisma types (OrderCreateInput, OrderUpdateInput) should be imported directly from @/lib/shared/database where needed

// Export functions normally
export {
  createShipStationClient,
  getOrder,
  getOrdersByDate,
  getShipstationOrders,
  getTags,
  updateOrder,
  shipstationApi, // Add missing export
  listTags, // Add missing export
};

// Export types using 'export type' due to isolatedModules
export type {
  ShipStationAddress,
  ShipStationOrderItem,
  ShipStationOrder,
  ShipStationTag, // Add missing type
  ShipStationApiParams, // Add missing type
  ShipStationOrdersResponse, // Add missing type
};

// Add any additional shipstation utilities here
