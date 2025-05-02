// --- ShipStation API Interfaces ---

export interface ShipStationWeight {
  value: number;
  units: string; // e.g. "ounces", "pounds"
}

export interface ShipStationAddress {
  name: string | null;
  company: string | null;
  street1: string | null;
  street2: string | null;
  street3: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null; // Country code (e.g., "US")
  phone: string | null;
  residential: boolean | null;
  addressVerified: string | null;
}

export interface ShipStationItemOption {
  name: string;
  value: string;
}

export interface ShipStationOrderItem {
  orderItemId: number;
  lineItemKey: string | null;
  sku: string | null;
  name: string;
  imageUrl: string | null;
  weight: ShipStationWeight | null;
  quantity: number;
  unitPrice: number | null;
  taxAmount: number | null;
  shippingAmount: number | null;
  warehouseLocation: string | null;
  options: ShipStationItemOption[];
  productId: number | null;
  fulfillmentSku: string | null;
  adjustment: boolean;
  upc: string | null;
  createDate: string;
  modifyDate: string;
}

export interface ShipStationOrder {
  orderId: number;
  orderNumber: string;
  orderKey: string | null;
  orderDate: string;
  createDate?: string;
  modifyDate?: string;
  paymentDate: string | null;
  shipByDate: string | null;
  orderStatus: string;
  customerId: number | null;
  customerUsername: string | null;
  customerEmail: string | null;
  billTo: ShipStationAddress;
  shipTo: ShipStationAddress;
  items: ShipStationOrderItem[];
  orderTotal: number;
  amountPaid?: number;
  taxAmount: number | null;
  shippingAmount: number | null;
  customerNotes: string | null;
  internalNotes: string | null;
  gift: boolean;
  giftMessage: string | null;
  paymentMethod: string | null;
  requestedShippingService: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  packageCode: string | null;
  confirmation: string | null;
  shipDate: string | null;
  holdUntilDate: string | null;
  trackingNumber: string | null;
  weight: ShipStationWeight | null;
  dimensions: {
    units: string | null;
    length: number | null;
    width: number | null;
    height: number | null;
  } | null;
  insuranceOptions: {
    provider: string | null;
    insureShipment: boolean | null;
    insuredValue: number | null;
  } | null;
  internationalOptions?: object | null;
  advancedOptions?: {
    warehouseId?: number;
    storeId?: number;
    customField1?: string | null;
    customField2?: string | null;
    customField3?: string | null;
    source?: string | null;
    mergedOrSplit?: boolean;
    mergedIds?: number[];
    parentId?: number | null;
  } | null;
  tagIds?: number[] | null;
  orderSource?: string | null;
  shippingCost?: number | null;
  discountAmount?: number | null;
  shippingTaxAmount?: number | null;
  giftEmail?: string | null;
}

// Interface for ShipStation API list endpoint query parameters
export interface ShipStationApiParams {
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  pageSize?: number;
  page?: number;
  modifyDateStart?: string;
  createDateStart?: string;
  orderDateStart?: string;
  orderStatus?: string;
  // Add other potential params if known
  [key: string]: unknown; // Use unknown instead of any
}

// Interface for the response of the ShipStation /orders endpoint
export interface ShipStationOrdersResponse {
  orders: ShipStationOrder[];
  total: number;
  page: number;
  pages: number;
}

// Interface for the sync summary report
export interface SyncSummary {
  success: boolean;
  message: string;
  ordersProcessed: number;
  ordersFailed: number;
  totalOrdersFetched: number;
  pagesSynced: number;
  totalPagesAvailable: number;
}

// Type definition for a tag returned by ShipStation API (/accounts/listtags)
export interface ShipStationTag {
  tagId: number;
  name: string;
  color: string; // Hex color code, e.g., "#FF0000"
}

// Type definition for Customer Address (used within ShipStationCustomer)
// ... existing code ...
