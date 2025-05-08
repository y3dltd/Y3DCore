import type {
  PrintTaskStatus,
  Customer as PrismaCustomer,
  Order as PrismaOrder,
  PrintOrderTask as PrismaPrintOrderTask,
  Product as PrismaProduct,
} from '@prisma/client';

// --- Client-Safe Serializable Types --- START ---

// Define a product type FULLY suitable for client components (Decimals and Dates as strings)
export interface ClientSerializableProduct
  extends Omit<
    PrismaProduct,
    'weight' | 'item_weight_value' | 'createdAt' | 'updatedAt'
  > {
  weight: string | null;
  item_weight_value: string | null;
  createdAt: string; // Dates as strings
  updatedAt: string | null; // Dates as strings
}

// Define a task type FULLY suitable for client components (All relevant Dates as strings)
export interface ClientPrintTaskData
  extends Omit<
    PrismaPrintOrderTask,
    | 'order'
    | 'product'
    | 'created_at'
    | 'updated_at'
    | 'ship_by_date'
  > {
  created_at: string; // Dates as strings
  updated_at: string | null; // Dates as strings
  ship_by_date: string | null; // Dates as strings
  product: ClientSerializableProduct; // Use fully serializable product
  orderLink?: string;
  // Define a simpler, serializable order type for the client if needed
  order?: {
    requested_shipping_service: string | null;
    marketplace?: string | null;
    // Avoid passing full customer or order objects unless explicitly serialized
  };
  // Add product_name explicitly if needed by client components that use this type
  product_name?: string;
}

// --- Client-Safe Serializable Types --- END ---

// --- Original Types (Potentially for Server-Side / Internal Use) --- START ---

// Original SerializableProduct (Decimals as strings, Dates as Date)
export interface SerializableProduct
  extends Omit<PrismaProduct, 'weight' | 'item_weight_value'> {
  weight: string | null;
  item_weight_value: string | null;
}

// Original PrintTaskData (Uses SerializableProduct, Dates as Date)
export interface PrintTaskData extends Omit<PrismaPrintOrderTask, 'order'> {
  product: SerializableProduct; // Uses original SerializableProduct
  orderLink?: string;
  // Original complex order type
  order?: PrismaOrder & {
    customer?: PrismaCustomer | null;
  };
  product_name?: string; // Keep temp field if used server-side
}

// --- Original Types (Potentially for Server-Side / Internal Use) --- END ---

// --- UI Specific Types --- START ---

// Represents a color associated with a task item or task itself
export interface ColorItem {
  color: string; // The actual color value/name used for styling
  displayName: string; // User-friendly display name for the color
}

// Represents an individual item within a print task for UI display
export interface PrintItem {
  name: string; // Represents the Item Ref ID (e.g., PrintOrderTask ID)
  quantity: number;
  sku?: string; // Added SKU
  productName?: string; // Added Product Name
  customText: string | null;
  color1: string | null;
  color2: string | null;
  status?: PrintTaskStatus; // Added status for individual items
}

// Props specifically for the PrintTaskCard UI component
export interface PrintTaskCardProps {
  taskId: string;
  orderId: string;
  status: PrintTaskStatus;
  items: PrintItem[]; // List of items included in the task (now with item-specific details)
  onStatusChange?: (_taskId: string, _newStatus: PrintTaskStatus) => void;
  // New: colours explicitly loaded for this plate (from AI optimiser)
  colorsLoaded?: string[];
}

// --- UI Specific Types --- END ---
