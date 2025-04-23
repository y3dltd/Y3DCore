import { Prisma, Tag } from '@prisma/client';
import {
  AlertCircle,
  ArrowLeft,
  MapPin,
  Package as PackageIcon,
  ShoppingCart,
  StickyNote,
  Truck,
  User,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MoreDetailsCard } from '@/components/orders/more-details-card';
import { PrintPackagingSlipButton } from '@/components/orders/print-packaging-slip-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CURRENCY_SYMBOL } from '@/lib/constants';
import {
  formatBooleanYN,
  formatCarrierCode,
  formatConfirmation,
  formatCountryCode,
  formatPackageCode,
  formatServiceCode,
  formatWarehouseId,
} from '@/lib/formatting';
import { prisma } from '@/lib/prisma';
import { formatDateTime, formatRelativeTime } from '@/lib/shared/date-utils';
import { cn } from '@/lib/utils';
import type {
  SerializableOrderDetailsData,
  SerializableOrderItemForDetails,
} from '@/types/order-details';

// Base type from Prisma payload
type OrderDataFromPrisma = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    items: {
      include: {
        product: true;
        printTasks: true;
      };
    };
  };
}>;

// --- Explicit Serialization Helper ---
function serializeOrderDetails(order: OrderDataFromPrisma): SerializableOrderDetailsData {
  return {
    ...order,
    shipping_price: order.shipping_price?.toString() ?? null,
    tax_amount: order.tax_amount?.toString() ?? null,
    discount_amount: order.discount_amount?.toString() ?? null,
    shipping_amount_paid: order.shipping_amount_paid?.toString() ?? null,
    shipping_tax: order.shipping_tax?.toString() ?? null,
    total_price: order.total_price.toString(),
    amount_paid: order.amount_paid?.toString() ?? null,
    order_weight_value: order.order_weight_value?.toString() ?? null,
    dimensions_height: order.dimensions_height?.toString() ?? null,
    dimensions_length: order.dimensions_length?.toString() ?? null,
    dimensions_width: order.dimensions_width?.toString() ?? null,
    insurance_insured_value: order.insurance_insured_value?.toString() ?? null,
    order_date: order.order_date?.toISOString() ?? null,
    created_at: order.created_at.toISOString(),
    updated_at: order.updated_at?.toISOString() ?? null,
    payment_date: order.payment_date?.toISOString() ?? null,
    ship_by_date: order.ship_by_date?.toISOString() ?? null,
    shipped_date: order.shipped_date?.toISOString() ?? null,
    last_sync_date: order.last_sync_date?.toISOString() ?? null,
    void_date: order.void_date?.toISOString() ?? null,
    items: order.items.map(item => ({
      ...item,
      unit_price: item.unit_price.toString(),
      created_at: item.created_at.toISOString(),
      updated_at: item.updated_at?.toISOString() ?? null,
      product: item.product
        ? {
            ...item.product,
            weight: item.product.weight?.toString() ?? null,
            item_weight_value: item.product.item_weight_value?.toString() ?? null,
            createdAt: item.product.createdAt.toISOString(),
            updatedAt: item.product.updatedAt.toISOString(),
          }
        : null,
      printTasks: item.printTasks.map(task => ({
        ...task,
        ship_by_date: task.ship_by_date?.toISOString() ?? null,
        created_at: task.created_at.toISOString(),
        updated_at: task.updated_at?.toISOString() ?? null,
      })),
    })),
    customer: order.customer
      ? {
          ...order.customer,
          created_at: order.customer.created_at.toISOString(),
          updated_at: order.customer.updated_at?.toISOString() ?? null,
        }
      : null,
    tag_ids: order.tag_ids,
  };
}
// --- End Serialization Helper ---

// Use the explicit SerializableOrderDetailsData type for the return value
async function getOrderDetails(
  id: number
): Promise<{ order: SerializableOrderDetailsData; allTags: Tag[] }> {
  const [orderData, allTags] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        shipstation_order_id: true,
        shipstation_order_number: true,
        order_key: true,
        order_date: true,
        created_at: true,
        updated_at: true,
        payment_date: true,
        ship_by_date: true,
        order_status: true,
        internal_status: true,
        customer_notes: true,
        internal_notes: true,
        gift: true,
        gift_message: true,
        payment_method: true,
        requested_shipping_service: true,
        carrier_code: true,
        service_code: true,
        package_code: true,
        tracking_number: true,
        shipped_date: true,
        shipstation_store_id: true,
        customer_name: true,
        amount_paid: true,
        tax_amount: true,
        shipping_amount_paid: true,
        discount_amount: true,
        total_price: true,
        order_weight_value: true,
        order_weight_units: true,
        dimensions_units: true,
        dimensions_length: true,
        dimensions_width: true,
        dimensions_height: true,
        insurance_provider: true,
        insurance_insure_shipment: true,
        insurance_insured_value: true,
        tag_ids: true,
        last_sync_date: true,
        marketplace: true,
        shipping_price: true,
        confirmation: true,
        warehouse_id: true,
        is_voided: true,
        void_date: true,
        gift_email: true,
        notes: true,
        shipping_tax: true,
        customerId: true,
        marketplace_notified: true,
        customer: true,
        items: {
          orderBy: { id: 'asc' },
          include: {
            product: true,
            printTasks: {
              orderBy: { taskIndex: 'asc' },
            },
          },
        },
      },
    }),
    prisma.tag.findMany(),
  ]);

  if (!orderData) {
    notFound();
  }

  const serializedOrder = serializeOrderDetails(orderData);
  return { order: serializedOrder, allTags };
}

// +++ Add Color Map and Helper +++
const colorMapInternal: { [key: string]: { bg: string; textColor: string } } = {
  black: { bg: 'bg-black', textColor: 'text-white' },
  grey: { bg: 'bg-gray-400', textColor: 'text-white' },
  gray: { bg: 'bg-gray-400', textColor: 'text-white' },
  'light blue': { bg: 'bg-blue-400', textColor: 'text-white' },
  blue: { bg: 'bg-blue-500', textColor: 'text-white' },
  'dark blue': { bg: 'bg-blue-900', textColor: 'text-white' },
  brown: { bg: 'bg-yellow-800', textColor: 'text-white' },
  orange: { bg: 'bg-orange-500', textColor: 'text-white' },
  'matt orange': { bg: 'bg-orange-600', textColor: 'text-white' },
  'silk orange': { bg: 'bg-orange-400', textColor: 'text-black' },
  red: { bg: 'bg-red-600', textColor: 'text-white' },
  'fire engine red': { bg: 'bg-red-700', textColor: 'text-white' },
  'rose gold': { bg: 'bg-pink-300', textColor: 'text-black' },
  magenta: { bg: 'bg-fuchsia-700', textColor: 'text-white' },
  white: { bg: 'bg-white', textColor: 'text-black' },
  'cold white': { bg: 'bg-slate-50 border border-gray-300', textColor: 'text-black' },
  yellow: { bg: 'bg-yellow-400', textColor: 'text-black' },
  silver: { bg: 'bg-gray-300', textColor: 'text-black' },
  'silk silver': { bg: 'bg-gray-200', textColor: 'text-black' },
  purple: { bg: 'bg-purple-500', textColor: 'text-white' },
  pink: { bg: 'bg-pink-400', textColor: 'text-white' },
  'matt pink': { bg: 'bg-pink-500', textColor: 'text-white' },
  'silk pink': { bg: 'bg-pink-300', textColor: 'text-black' },
  gold: { bg: 'bg-yellow-500', textColor: 'text-black' },
  skin: { bg: 'bg-orange-200', textColor: 'text-black' },
  'peak green': { bg: 'bg-green-400', textColor: 'text-white' },
  green: { bg: 'bg-green-500', textColor: 'text-white' },
  'olive green': { bg: 'bg-green-700', textColor: 'text-white' },
  'pine green': { bg: 'bg-green-800', textColor: 'text-white' },
  'glow in the dark': { bg: 'bg-lime-300', textColor: 'text-black' },
  bronze: { bg: 'bg-amber-700', textColor: 'text-white' },
  beige: { bg: 'bg-amber-100', textColor: 'text-black' },
  turquoise: { bg: 'bg-teal-400', textColor: 'text-black' },
};

const getColorInfo = (
  colorName: string | null | undefined
): { bgClass: string; textClass: string } => {
  const defaultColor = { bgClass: 'bg-gray-200', textClass: 'text-black' };
  if (!colorName) return { bgClass: 'bg-transparent', textClass: 'text-foreground' };
  const lowerColorName = colorName.toLowerCase();
  if (lowerColorName.includes('peak green'))
    return {
      bgClass: colorMapInternal['peak green'].bg,
      textClass: colorMapInternal['peak green'].textColor,
    };
  if (lowerColorName.includes('light blue'))
    return {
      bgClass: colorMapInternal['light blue'].bg,
      textClass: colorMapInternal['light blue'].textColor,
    };
  if (lowerColorName.includes('dark grey') || lowerColorName.includes('dark gray'))
    return { bgClass: 'bg-gray-600', textClass: 'text-white' };
  if (lowerColorName.includes('magenta'))
    return { bgClass: colorMapInternal.magenta.bg, textClass: colorMapInternal.magenta.textColor };
  if (lowerColorName.includes('white'))
    return { bgClass: colorMapInternal.white.bg, textClass: colorMapInternal.white.textColor };
  const exactMatch = colorMapInternal[lowerColorName];
  if (exactMatch) return { bgClass: exactMatch.bg, textClass: exactMatch.textColor };
  const entries = Object.entries(colorMapInternal).sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    if (lowerColorName.includes(key)) return { bgClass: value.bg, textClass: value.textColor };
  }
  return defaultColor;
};
// +++ End Color Map and Helper +++

interface OrderDetailPageProps {
  params: { id: string };
}

// --- Status Color Mappings ---
const orderStatusColors: Record<string, string> = {
  awaiting_shipment: 'bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100',
  shipped: 'bg-green-600 text-white dark:bg-green-700 dark:text-green-100',
  on_hold: 'bg-yellow-500 text-white dark:bg-yellow-600 dark:text-yellow-100',
  cancelled: 'bg-red-600 text-white dark:bg-red-700 dark:text-red-100',
  default: 'bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100',
};

const internalStatusColors: Record<string, string> = {
  new: 'bg-sky-500 text-white dark:bg-sky-600 dark:text-sky-100',
  processing: 'bg-purple-500 text-white dark:bg-purple-600 dark:text-purple-100',
  printing: 'bg-pink-500 text-white dark:bg-pink-600 dark:text-pink-100',
  completed: 'bg-emerald-500 text-white dark:bg-emerald-600 dark:text-emerald-100',
  cancelled: 'bg-rose-500 text-white dark:bg-rose-600 dark:text-rose-100',
  default: 'bg-stone-500 text-white dark:bg-stone-600 dark:text-stone-100',
};

function getStatusClass(status: string | null | undefined, type: 'order' | 'internal'): string {
  const map = type === 'order' ? orderStatusColors : internalStatusColors;
  const key = status?.toLowerCase() ?? 'default';
  return map[key] || map.default;
}

// Add type for PrintTask relation within the serialized data
interface SerializedPrintTask {
  id: number;
  orderId: number;
  marketplace_order_number: string | null;
  customerId: number | null;
  custom_text: string | null;
  quantity: number;
  color_1: string | null;
  color_2: string | null;
  ship_by_date: string | null;
  status: string; // Assuming PrintTaskStatus enum is string
  needs_review: boolean;
  review_reason: string | null;
  created_at: string;
  updated_at: string | null;
  orderItemId: number;
  taskIndex: number;
  productId: number;
  shorthandProductName: string | null;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    notFound();
  }

  const { order, allTags } = await getOrderDetails(id);
  const tagIds = (Array.isArray(order.tag_ids) ? order.tag_ids : []) as number[];
  const tagMap = new Map(allTags.map(tag => [tag.shipstation_tag_id, tag]));

  // Use explicit type for item in reduce
  const totalItems = order.items.reduce(
    (sum: number, item: SerializableOrderItemForDetails) => sum + item.quantity,
    0
  );

  return (
    <div>
      {/* Header Section */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-primary-foreground p-6 rounded-lg shadow-lg relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">
              Order #{order.shipstation_order_number || order.id}
            </h1>
            <div className="flex items-center gap-2 text-sm opacity-90">
              <span>
                Placed {order.order_date ? formatRelativeTime(new Date(order.order_date)) : 'N/A'}
              </span>
              {order.marketplace && (
                <>
                  <span>&bull;</span>
                  {/* Just display name for now */}
                  <span>Source: {order.marketplace}</span>
                </>
              )}
            </div>
            {/* Display Order Tags */}
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="flex flex-wrap gap-1 pt-1">
                <strong>Tags:</strong>
                {tagIds.length > 0 ? (
                  tagIds.map(tagId => {
                    const tag = tagMap.get(tagId);
                    if (tag) {
                      return (
                        <Badge
                          key={tag.id}
                          style={{
                            backgroundColor: tag.color_hex || '#cccccc',
                            // Basic contrast check - might need refinement
                            color:
                              tag.color_hex &&
                              parseInt(tag.color_hex.substring(1), 16) > 0xffffff / 2
                                ? '#000'
                                : '#fff',
                          }}
                          className="text-xs border border-black/10"
                        >
                          {tag.name}
                        </Badge>
                      );
                    }
                    return (
                      <Badge key={tagId} variant="secondary">
                        ID: {tagId}
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-muted-foreground ml-1">-</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Use dynamic status badge */}
            <Badge
              className={cn(
                'text-sm font-semibold px-3 py-1',
                getStatusClass(order.order_status, 'order')
              )}
            >
              {order.order_status
                ?.replace(/_/g, ' ')
                .replace(/\b\w/g, (l: string) => l.toUpperCase()) ?? 'N/A'}
            </Badge>
            <div className="flex gap-2">
              <PrintPackagingSlipButton order={order} />
              <Link href="/orders">
                <Button
                  variant="outline"
                  className="bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Orders
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Grid for content cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Left Column: Order Info, Customer, Shipping */}
        <div className="lg:col-span-1 space-y-6">
          {/* Order Information Card */}
          <Card className="border-l-4 border-blue-500">
            <CardHeader className="flex flex-row items-center space-y-0 bg-gradient-to-r from-blue-500/30 via-sky-500/30 to-cyan-500/30 dark:from-blue-700/50 dark:via-sky-700/50 dark:to-cyan-700/50 rounded-t-lg px-4 py-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                {/* Restore Lucide Icon */}
                <PackageIcon className="h-5 w-5 text-muted-foreground" />
                Order Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3 pt-4">
              <p>
                <strong>Order #:</strong>{' '}
                <span className="font-semibold text-base bg-muted/50 px-1.5 py-0.5 rounded">
                  {order.shipstation_order_number ?? 'N/A'}
                </span>
              </p>
              <p>
                <strong>Internal ID:</strong> {order.id}
              </p>
              <p>
                <strong>Marketplace:</strong> {order.marketplace ?? 'N/A'}
              </p>
              <p>
                <strong>Status (Ext):</strong>
                <Badge className={cn('ml-2 text-xs', getStatusClass(order.order_status, 'order'))}>
                  {order.order_status?.replace(/_/g, ' ') ?? 'N/A'}
                </Badge>
              </p>
              <p>
                <strong>Status (Int):</strong>
                <Badge
                  className={cn('ml-2 text-xs', getStatusClass(order.internal_status, 'internal'))}
                >
                  {order.internal_status?.replace(/_/g, ' ') ?? 'N/A'}
                </Badge>
              </p>
              <p>
                <strong>Total Items:</strong> {totalItems}
              </p>
              <p>
                <strong>Order Date:</strong>{' '}
                {order.order_date ? formatDateTime(new Date(order.order_date)) : 'N/A'}
              </p>
              <p>
                <strong>Ship By Date:</strong>{' '}
                {order.ship_by_date ? formatDateTime(new Date(order.ship_by_date)) : 'N/A'}
              </p>
            </CardContent>
            <CardFooter className="text-sm">
              <div className="flex flex-col space-y-1 w-full">
                <div className="flex flex-wrap gap-1 items-center">
                  <strong className="mr-1">Tags:</strong>
                  {tagIds.length > 0 ? (
                    tagIds.map(tagId => {
                      const tag = tagMap.get(tagId);
                      if (tag) {
                        return (
                          <Badge
                            key={tag.id}
                            style={{
                              backgroundColor: tag.color_hex || '#cccccc',
                              color:
                                tag.color_hex &&
                                parseInt(tag.color_hex.substring(1), 16) > 0xffffff / 2
                                  ? '#000'
                                  : '#fff',
                            }}
                            className="text-xs border border-black/10"
                          >
                            {tag.name}
                          </Badge>
                        );
                      }
                      return (
                        <Badge key={tagId} variant="secondary">
                          ID: {tagId}
                        </Badge>
                      );
                    })
                  ) : (
                    <span className="text-muted-foreground ml-1">-</span>
                  )}
                </div>
                <div className="font-bold text-lg pt-1">
                  Total: {CURRENCY_SYMBOL}
                  {order.total_price ?? '0.00'}
                </div>
              </div>
            </CardFooter>
          </Card>

          {/* Customer Information Card */}
          {order.customer && (
            <Card className="border-l-4 border-purple-500">
              <CardHeader className="flex flex-row items-center space-y-0 bg-gradient-to-r from-purple-500/30 via-fuchsia-500/30 to-pink-500/30 dark:from-purple-700/50 dark:via-fuchsia-700/50 dark:to-pink-700/50 rounded-t-lg px-4 py-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  {/* Restore Lucide Icon */}
                  <User className="h-5 w-5 text-muted-foreground" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm pt-4">
                <p className="font-medium">
                  {order.customer?.name || order.customer_name || 'N/A'}
                </p>
                <div className="text-muted-foreground">
                  <p>Customer ID: {order.customer?.shipstation_customer_id || 'N/A'}</p>
                  <p>Email: {order.customer?.email || 'N/A'}</p>
                  <p>Phone: {order.customer?.phone || 'N/A'}</p>
                </div>
                <div className="flex items-start pt-2">
                  {/* Make icon lighter/colored */}
                  <MapPin className="mr-2 mt-1 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
                  <div className="text-muted-foreground">
                    <p className="font-medium text-foreground">Shipping Address</p>
                    {order.customer?.street1 || order.customer?.city ? (
                      <address className="not-italic bg-muted/40 p-2 rounded text-foreground/90 text-sm">
                        {order.customer?.company && (
                          <span>
                            {order.customer.company}
                            <br />
                          </span>
                        )}
                        {order.customer?.street1 && (
                          <span>
                            {order.customer.street1}
                            <br />
                          </span>
                        )}
                        {order.customer?.street2 && (
                          <span>
                            {order.customer.street2}
                            <br />
                          </span>
                        )}
                        {order.customer?.city}, {order.customer?.state}{' '}
                        {order.customer?.postal_code}
                        <br />
                        {formatCountryCode(order.customer?.country_code)}
                      </address>
                    ) : (
                      <p>No address provided</p>
                    )}
                  </div>
                </div>
                {/* Display Order Tags Here */}
                <div className="pt-3 border-t border-dashed flex flex-wrap gap-2">
                  <span className="text-xs font-medium text-muted-foreground mr-2">Tags:</span>
                  {(order.tag_ids as number[])?.length > 0 && allTags.length > 0 ? (
                    (order.tag_ids as number[]).map(tagId => {
                      const tag = allTags.find(t => t.shipstation_tag_id === tagId);
                      if (tag) {
                        return (
                          <Badge
                            key={tag.id}
                            style={{
                              backgroundColor: tag.color_hex || '#cccccc',
                              color:
                                tag.color_hex &&
                                parseInt(tag.color_hex.substring(1), 16) > 0xffffff / 2
                                  ? '#000'
                                  : '#fff',
                            }}
                            className="text-xs border border-black/10"
                          >
                            {tag.name}
                          </Badge>
                        );
                      }
                      return null;
                    })
                  ) : (
                    <span className="text-xs opacity-70 italic">None</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shipment Information Card */}
          <Card className="border-l-4 border-teal-500">
            <CardHeader className="flex flex-row items-center space-y-0 bg-gradient-to-r from-teal-500/30 via-emerald-500/30 to-green-500/30 dark:from-teal-700/50 dark:via-emerald-700/50 dark:to-green-700/50 rounded-t-lg px-4 py-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                {/* Restore Lucide Icon */}
                <Truck className="h-5 w-5 text-muted-foreground" />
                Shipment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 pt-4">
              {/* Use grid layout for key-value pairs - Reduced gap */}
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5">
                <div className="md:col-span-2">
                  <dt className="font-medium">Requested Service:</dt>
                  {/* Note: Service Code might be more reliable, requested can be generic */}
                  <dd>{formatServiceCode(order.requested_shipping_service) ?? 'N/A'}</dd>
                </div>
                <div>
                  <dt className="font-medium">Carrier:</dt>
                  <dd>{formatCarrierCode(order.carrier_code)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Service:</dt>
                  <dd>{formatServiceCode(order.service_code)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Package:</dt>
                  <dd>{formatPackageCode(order.package_code)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Confirmation:</dt>
                  <dd>
                    <Badge variant="secondary" className="text-xs">
                      {formatConfirmation(order.confirmation)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Warehouse ID:</dt>
                  <dd>{formatWarehouseId(order.warehouse_id)}</dd>
                </div>
                <div>
                  <dt className="font-medium">Shipped Date:</dt>
                  <dd>
                    {order.shipped_date ? formatDateTime(new Date(order.shipped_date)) : 'N/A'}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="font-medium">Tracking #:</dt>
                  <dd>
                    {order.tracking_number ? (
                      <span className="font-semibold text-base bg-muted/50 px-1.5 py-0.5 rounded font-mono">
                        {order.tracking_number}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Voided:</dt>
                  <dd>
                    <Badge
                      variant={order.is_voided ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {formatBooleanYN(order.is_voided)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Void Date:</dt>
                  <dd>{order.void_date ? formatDateTime(new Date(order.void_date)) : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="font-medium">Marketplace Notified:</dt>
                  <dd>
                    <Badge
                      variant={order.marketplace_notified ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {formatBooleanYN(order.marketplace_notified)}
                    </Badge>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Order Items, Customer Notes, More Details */}
        <div className="lg:col-span-1 space-y-6">
          {/* Order Items Section */}
          <Card className="border-l-4 border-orange-500">
            <CardHeader className="flex flex-row items-center space-y-0 bg-gradient-to-r from-orange-500/30 via-amber-500/30 to-yellow-500/30 dark:from-orange-700/50 dark:via-amber-700/50 dark:to-yellow-700/50 rounded-t-lg px-4 py-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                {/* Restore Lucide Icon */}
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {order.items.length > 0 ? (
                // Use explicit type for item in map
                order.items.map((item: SerializableOrderItemForDetails) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border rounded-md bg-muted/30"
                  >
                    {/* Item Image */}
                    <div className="flex-shrink-0 w-20 h-20 bg-muted rounded-md overflow-hidden relative border">
                      {item.product?.imageUrl ? (
                        <Image
                          src={item.product.imageUrl}
                          alt={item.product.name || 'Product image'}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                          No Image
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-grow space-y-1 text-sm">
                      <p className="font-semibold text-base">
                        {item.product?.name || 'Product Name Missing'}
                      </p>
                      <p className="text-muted-foreground">SKU: {item.product?.sku || 'N/A'}</p>
                      <p className="text-muted-foreground">
                        Price per unit: {CURRENCY_SYMBOL}
                        {Number(item.unit_price).toFixed(2)}
                      </p>
                      <p className="text-muted-foreground">
                        Weight: {item.product?.weight ? `${item.product.weight} units` : 'N/A'}
                      </p>
                    </div>

                    {/* Print Task Personalization Details */}
                    <div className="flex-grow space-y-2 mt-2 sm:mt-0 border-t sm:border-t-0 sm:border-l pt-2 sm:pt-0 sm:pl-4 border-dashed border-muted/50">
                      <p className="text-xs font-medium text-muted-foreground">
                        Personalization Details:
                      </p>
                      {item.printTasks && item.printTasks.length > 0 ? (
                        <Table className="mt-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-8 text-xs px-2">Task</TableHead>
                              <TableHead className="h-8 text-xs px-2">Status</TableHead>
                              <TableHead className="h-8 text-xs px-2">Review?</TableHead>
                              <TableHead className="h-8 text-xs px-2">Text</TableHead>
                              <TableHead className="h-8 text-xs px-2">Color1</TableHead>
                              <TableHead className="h-8 text-xs px-2">Color2</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Use explicit type for task in map */}
                            {item.printTasks.map((task: SerializedPrintTask) => (
                              <TableRow key={task.id} className="text-xs">
                                <TableCell className="px-2 py-1">{task.id}</TableCell>
                                <TableCell className="px-2 py-1">
                                  <Badge variant="secondary" className="text-xs px-1 py-0">
                                    {task.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="px-2 py-1">
                                  {task.needs_review ? (
                                    <Badge
                                      variant="destructive"
                                      title={task.review_reason ?? ''}
                                      className="cursor-help text-xs px-1 py-0"
                                    >
                                      <AlertCircle className="h-3 w-3 mr-1" /> Yes
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">No</span>
                                  )}
                                </TableCell>
                                <TableCell
                                  className="font-mono max-w-[15ch] truncate px-2 py-1"
                                  title={task.custom_text ?? ''}
                                >
                                  {task.custom_text ?? '-'}
                                </TableCell>
                                <TableCell className="px-2 py-1">
                                  {task.color_1 ? (
                                    (() => {
                                      const { bgClass, textClass } = getColorInfo(task.color_1);
                                      return (
                                        <div className="flex items-center gap-1">
                                          <span
                                            className={cn(
                                              'px-2 py-1 rounded-md text-xs font-medium inline-block min-w-[80px] text-center',
                                              bgClass,
                                              textClass,
                                              task.color_1.toLowerCase() === 'white'
                                                ? 'border-2 border-gray-400'
                                                : 'border border-gray-700'
                                            )}
                                            title={task.color_1}
                                          >
                                            {task.color_1}
                                          </span>
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="px-2 py-1">
                                  {task.color_2 ? (
                                    (() => {
                                      const { bgClass, textClass } = getColorInfo(task.color_2);
                                      return (
                                        <div className="flex items-center gap-1">
                                          <span
                                            className={cn(
                                              'px-2 py-1 rounded-md text-xs font-medium inline-block min-w-[80px] text-center',
                                              bgClass,
                                              textClass,
                                              task.color_2.toLowerCase() === 'white'
                                                ? 'border-2 border-gray-400'
                                                : 'border border-gray-700'
                                            )}
                                            title={task.color_2}
                                          >
                                            {task.color_2}
                                          </span>
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No personalization tasks found.
                        </p>
                      )}
                    </div>

                    {/* Quantity & Total Price */}
                    <div className="flex flex-col items-end text-right space-y-1 ml-auto sm:ml-4">
                      <Badge variant="secondary" className="px-3 py-1 text-lg font-semibold">
                        {item.quantity}
                      </Badge>
                      <p className="text-base font-semibold">
                        {CURRENCY_SYMBOL}
                        {(item.quantity * Number(item.unit_price)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No items found for this order.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Customer Notes Section */}
          {order.customer_notes && (
            <Card className="border-l-4 border-rose-500">
              <CardHeader className="flex flex-row items-center space-y-0 bg-gradient-to-r from-rose-500/30 via-red-500/30 to-pink-500/30 dark:from-rose-700/50 dark:via-red-700/50 dark:to-pink-700/50 rounded-t-lg px-4 py-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  {/* Restore Lucide Icon */}
                  <StickyNote className="h-5 w-5 text-muted-foreground" />
                  Customer Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {order.customer_notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* More Details Card */}
          <MoreDetailsCard
            className="border-l-4 border-gray-500"
            orderData={{
              payment_date: order.payment_date,
              order_key: order.order_key,
              shipstation_store_id: order.shipstation_store_id,
              payment_method: order.payment_method,
              amount_paid: order.amount_paid,
              shipping_price: order.shipping_price,
              tax_amount: order.tax_amount,
              discount_amount: order.discount_amount,
              shipping_amount_paid: order.shipping_amount_paid,
              shipping_tax: order.shipping_tax,
              gift: order.gift,
              gift_message: order.gift_message,
              internal_notes: order.internal_notes,
              last_sync_date: order.last_sync_date,
              order_weight_value: order.order_weight_value,
              order_weight_units: order.order_weight_units,
              dimensions_units: order.dimensions_units,
              dimensions_length: order.dimensions_length,
              dimensions_width: order.dimensions_width,
              dimensions_height: order.dimensions_height,
              insurance_provider: order.insurance_provider,
              insurance_insure_shipment: order.insurance_insure_shipment,
              insurance_insured_value: order.insurance_insured_value,
              gift_email: order.gift_email,
              notes: order.notes,
            }}
          />
        </div>
      </div>
    </div>
  );
}
