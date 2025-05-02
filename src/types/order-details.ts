import { PrintOrderTask, Prisma } from '@prisma/client';

// Interface for the serialized Product
export interface SerializableProductForDetails
    extends Omit<Prisma.ProductGetPayload<{}>, 'weight' | 'item_weight_value' | 'createdAt' | 'updatedAt'> {
    weight: string | null;
    item_weight_value: string | null;
    createdAt: string;
    updatedAt: string;
}

// Interface for the serialized OrderItem
export interface SerializableOrderItemForDetails
    extends Omit<Prisma.OrderItemGetPayload<{}>, 'unit_price' | 'created_at' | 'updated_at' | 'product' | 'printTasks'> {
    unit_price: string;
    created_at: string;
    updated_at: string | null;
    product: SerializableProductForDetails | null; // Product can be null
    printTasks: Array<
        Omit<PrintOrderTask, 'created_at' | 'updated_at' | 'ship_by_date'> & {
            created_at: string;
            updated_at: string | null;
            ship_by_date: string | null;
        }
    >;
}

// Interface for the serialized Customer
export interface SerializableCustomerForDetails extends Omit<Prisma.CustomerGetPayload<{}>, 'created_at' | 'updated_at'> {
    created_at: string;
    updated_at: string | null;
}

// Explicitly define the serializable version of the main Order data
export interface SerializableOrderDetailsData
    extends Omit<
        Prisma.OrderGetPayload<{
            include: {
                customer: true;
                items: {
                    include: {
                        product: true;
                        printTasks: true;
                    };
                };
            };
        }>,
        | 'shipping_price'
        | 'tax_amount'
        | 'discount_amount'
        | 'shipping_amount_paid'
        | 'shipping_tax'
        | 'total_price'
        | 'amount_paid'
        | 'order_weight_value'
        | 'dimensions_height'
        | 'dimensions_length'
        | 'dimensions_width'
        | 'insurance_insured_value'
        | 'order_date'
        | 'created_at'
        | 'updated_at'
        | 'payment_date'
        | 'ship_by_date'
        | 'shipped_date'
        | 'last_sync_date'
        | 'lastPackingSlipAt'
        | 'void_date'
        | 'items'
        | 'customer' // Omit relations that will be replaced
    > {
    // Re-define Decimal fields as string | null
    shipping_price: string | null;
    tax_amount: string | null;
    discount_amount: string | null;
    shipping_amount_paid: string | null;
    shipping_tax: string | null;
    total_price: string; // Not nullable in schema, ensure it's string
    amount_paid: string | null;
    order_weight_value: string | null;
    dimensions_height: string | null;
    dimensions_length: string | null;
    dimensions_width: string | null;
    insurance_insured_value: string | null;
    // Re-define Date fields as string | null
    order_date: string | null;
    created_at: string; // Not nullable
    updated_at: string | null;
    payment_date: string | null;
    ship_by_date: string | null;
    shipped_date: string | null;
    last_sync_date: string | null;
    lastPackingSlipAt: string | null;
    void_date: string | null;
    // Re-define relations with their serializable types
    items: SerializableOrderItemForDetails[];
    customer: SerializableCustomerForDetails | null; // Customer can be null
    tag_ids: Prisma.JsonValue;
} 
