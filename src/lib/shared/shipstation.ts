// Re-export from the original location

// Import from the correct location

// Import sync functions
import type { SyncOptions } from '../orders/sync'; // Import as type
import {
  syncAllPaginatedOrders,
  syncRecentOrders,
  syncShipStationTags,
  syncSingleOrder,
} from '../orders/sync'; // Import from orders/sync
import { getShipstationOrders, listTags, updateOrderItemOptions, updateOrderItemsOptionsBatch } from '../shipstation/api'; // Import from api.ts
import { shipstationApi } from '../shipstation/client'; // Import from client.ts
import type {
  ShipStationAddress,
  ShipStationApiParams,
  ShipStationOrder,
  ShipStationOrderItem,
  ShipStationOrdersResponse,
  ShipStationTag,
} from '../shipstation/types'; // Import types

// Export functions normally
export {
  getShipstationOrders,
  listTags, shipstationApi,
  // Removed export for addInternalOrderNote
  // Re-export sync functions
  syncAllPaginatedOrders,
  syncRecentOrders, syncShipStationTags, syncSingleOrder, updateOrderItemOptions, // Export the new function
  updateOrderItemsOptionsBatch
};

// Export types using 'export type' due to isolatedModules
export type {
  ShipStationAddress, ShipStationApiParams, ShipStationOrder, ShipStationOrderItem, ShipStationOrdersResponse, ShipStationTag, SyncOptions
};

// Add any additional shipstation utilities here
