// Re-export from the original location
import type {
  ShipStationAddress,
  ShipStationOrderItem,
  ShipStationOrder,
  ShipStationTag,
  ShipStationApiParams,
  ShipStationOrdersResponse,
} from "../shipstation/types"; // Import types

// Import from the correct location
import { shipstationApi } from "../shipstation/client"; // Import from client.ts
import { getShipstationOrders, listTags, updateOrderItemOptions } from "../shipstation/api"; // Import from api.ts

// Import sync functions
import {
  syncAllPaginatedOrders,
  syncRecentOrders,
  syncSingleOrder,
  syncShipStationTags,
} from "../orders/sync"; // Import from orders/sync
import type { SyncOptions } from "../orders/sync"; // Import as type

// Export functions normally
export {
  shipstationApi,
  getShipstationOrders,
  listTags,
  updateOrderItemOptions, // Export the new function
  // Removed export for addInternalOrderNote
  // Re-export sync functions
  syncAllPaginatedOrders,
  syncRecentOrders,
  syncSingleOrder,
  syncShipStationTags,
};

// Export types using 'export type' due to isolatedModules
export type {
  ShipStationAddress,
  ShipStationOrderItem,
  ShipStationOrder,
  ShipStationTag,
  ShipStationApiParams,
  ShipStationOrdersResponse,
  SyncOptions,
};

// Add any additional shipstation utilities here
