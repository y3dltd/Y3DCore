// Re-export from the original location
import { syncAllPaginatedOrders, syncRecentOrders, syncShipStationTags, syncSingleOrder, } from '../orders/sync'; // Import from orders/sync
import { getShipstationOrders, listTags, updateOrderItemOptions, updateOrderItemsOptionsBatch } from '../shipstation/api'; // Import from api.ts
import { shipstationApi } from '../shipstation/client'; // Import from client.ts
// Export functions normally
export { getShipstationOrders, listTags, shipstationApi, 
// Removed export for addInternalOrderNote
// Re-export sync functions
syncAllPaginatedOrders, syncRecentOrders, syncShipStationTags, syncSingleOrder, updateOrderItemOptions, // Export the new function
updateOrderItemsOptionsBatch };
// Add any additional shipstation utilities here
