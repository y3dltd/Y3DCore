// import { Order } from '@prisma/client'; // Unused import
import { Prisma } from '@prisma/client'; // Import Prisma types for where clause
import {
  DollarSign, // Example icon for revenue
  Package, // Example icon for orders/items
  TrendingUp, // Example icon for weekly revenue
  Copy, // For copy to clipboard functionality
  // Users    // Example icon (replace if needed)
} from 'lucide-react'; // Import icons
import Link from 'next/link'; // Import Link
import { toast } from 'sonner'; // Import toast for copy feedback

import { StatsCard } from '@/components/dashboard/stats-card'; // Import StatsCard
import { LimitSelector } from '@/components/limit-selector'; // Import LimitSelector
import { OrdersPagination } from '@/components/orders-pagination';
import { OrdersSearchForm } from '@/components/orders-search-form'; // Import the client component wrapper
import { Badge } from '@/components/ui/badge'; // Import Badge
import { Button } from '@/components/ui/button'; // Re-add Button import
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CURRENCY_SYMBOL } from '@/lib/constants'; // Import the constant
import { detectMarketplaceOrderNumber } from '@/lib/order-utils';
import { prisma } from '@/lib/prisma';
import { formatDateForTable } from '@/lib/shared/date-utils'; // Import date utility functions
import { cn } from '@/lib/utils'; // Import cn utility for className concatenation
import { PackingSlipBatchControls } from '@/components/orders/packing-slip-batch-controls';
import { RowPrintPackingSlipButton } from '@/components/orders/row-print-packing-slip-button';

// Force dynamic rendering to ensure searchParams are handled correctly
export const dynamic = 'force-dynamic';

// Define the currency symbol
// const CURRENCY_SYMBOL = '£' // Remove this line

// --- Date Helper Functions (UTC) ---
function getStartOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function getStartOfYesterdayUTC(): Date {
  const today = getStartOfTodayUTC();
  return new Date(today.getTime() - 24 * 60 * 60 * 1000);
}

// Gets the start of the week (Monday 00:00 UTC)
function getStartOfWeekUTC(date: Date = new Date()): Date {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = date.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust Sunday to previous week
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff, 0, 0, 0, 0));
}

function getStartOfLastWeekUTC(): Date {
  const startOfThisWeek = getStartOfWeekUTC();
  return new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
}

// --- Percentage Change Helper ---
function calculatePercentageChange(current: number, previous: number): string {
  if (previous === 0) {
    // Avoid division by zero
    return current > 0 ? '+∞%' : '+0%'; // Indicate infinite increase or no change from zero
  }
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`; // One decimal place
}

// Replace mock data with actual database queries
async function getDashboardStats() {
  const startOfToday = getStartOfTodayUTC();
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfYesterday = getStartOfYesterdayUTC();

  const startOfWeek = getStartOfWeekUTC();
  const startOfNextWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfLastWeek = getStartOfLastWeekUTC();

  // Fetch stats concurrently
  const [
    todayOrderStats,
    yesterdayOrderStats,
    thisWeekRevenueStats,
    lastWeekRevenueStats,
    todayItemStats,
    yesterdayItemStats,
  ] = await Promise.all([
    // Orders & Revenue: Today
    prisma.order.aggregate({
      _count: { id: true },
      _sum: { total_price: true },
      where: { created_at: { gte: startOfToday, lt: startOfTomorrow } },
    }),
    // Orders & Revenue: Yesterday
    prisma.order.aggregate({
      _count: { id: true },
      _sum: { total_price: true },
      where: { created_at: { gte: startOfYesterday, lt: startOfToday } },
    }),
    // Revenue: This Week
    prisma.order.aggregate({
      _sum: { total_price: true },
      where: { created_at: { gte: startOfWeek, lt: startOfNextWeek } },
    }),
    // Revenue: Last Week
    prisma.order.aggregate({
      _sum: { total_price: true },
      where: { created_at: { gte: startOfLastWeek, lt: startOfWeek } },
    }),
    // Items: Today (Summing OrderItem quantity)
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { created_at: { gte: startOfToday, lt: startOfTomorrow } } },
    }),
    // Items: Yesterday
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: { created_at: { gte: startOfYesterday, lt: startOfToday } } },
    }),
  ]);

  // Extract values (handle potential null sums)
  const ordersToday = todayOrderStats._count.id;
  const revenueToday = todayOrderStats._sum.total_price?.toNumber() ?? 0;
  const ordersYesterday = yesterdayOrderStats._count.id;
  const revenueYesterday = yesterdayOrderStats._sum.total_price?.toNumber() ?? 0;
  const revenueThisWeek = thisWeekRevenueStats._sum.total_price?.toNumber() ?? 0;
  const revenueLastWeek = lastWeekRevenueStats._sum.total_price?.toNumber() ?? 0;
  const totalItemsToday = todayItemStats._sum.quantity ?? 0;
  const totalItemsYesterday = yesterdayItemStats._sum.quantity ?? 0;

  // Calculate percentage changes
  const ordersTodayPrev = `${calculatePercentageChange(ordersToday, ordersYesterday)} vs yesterday`;
  const revenueTodayPrev = `${calculatePercentageChange(revenueToday, revenueYesterday)} vs yesterday`;
  const totalItemsPrev = `${calculatePercentageChange(totalItemsToday, totalItemsYesterday)} vs yesterday`;
  const revenueWeekPrev = `${calculatePercentageChange(revenueThisWeek, revenueLastWeek)} vs last week`;

  return {
    ordersToday,
    revenueToday,
    totalItems: totalItemsToday, // Use today's item count
    revenueThisWeek,
    ordersTodayPrev,
    revenueTodayPrev,
    totalItemsPrev,
    revenueWeekPrev,
  };
}

// Updated getOrders to accept and apply filters
async function getOrders(
  page = 1,
  limit = 20,
  searchQuery?: string,
  statusFilter?: string,
  marketplaceFilter?: string,
  orderDateStart?: string,
  orderDateEnd?: string
): Promise<{
  orders: Prisma.OrderGetPayload<{ select: (typeof orderSelectClause)['select'] }>[];
  total: number;
}> {
  // Define the select clause here to reuse it and for the return type
  const orderSelectClause = {
    select: {
      id: true,
      shipstation_order_number: true,
      customer_name: true,
      marketplace: true,
      order_status: true,
      tag_ids: true,
      total_price: true,
      order_date: true,
      shipped_date: true,
      ship_by_date: true, // Add ship_by_date
      tracking_number: true,
      _count: {
        select: { items: true },
      },
    },
  };

  const skip = Math.max(0, (page - 1) * limit);

  // Build the where clause dynamically
  const where: Prisma.OrderWhereInput = {};

  if (searchQuery) {
    // Trim spaces from search query
    const trimmedSearchQuery = searchQuery.trim();

    if (trimmedSearchQuery) {
      // Check if the search query looks like a marketplace order number
      const detection = detectMarketplaceOrderNumber(trimmedSearchQuery);

      if (detection.isMarketplaceNumber) {
        // If it's a marketplace order number, do an exact match instead of contains
        where.OR = [
          { shipstation_order_number: trimmedSearchQuery },
          // Fallback to contains search if exact match doesn't work
          { shipstation_order_number: { contains: trimmedSearchQuery } },
          { customer_name: { contains: trimmedSearchQuery } },
        ];

        // If it's an Etsy order number (which is just a number), also check if it matches an internal ID
        if (detection.marketplace === 'etsy') {
          const parsedId = parseInt(trimmedSearchQuery, 10);
          if (!isNaN(parsedId)) {
            // Add ID search to OR conditions
            where.OR.push({ id: parsedId });
          }
        }
      } else {
        // Regular search
        where.OR = [
          { shipstation_order_number: { contains: trimmedSearchQuery } },
          { customer_name: { contains: trimmedSearchQuery } },
        ];

        // If the query is numeric, also search by ID
        const parsedId = parseInt(trimmedSearchQuery, 10);
        if (!isNaN(parsedId)) {
          where.OR.push({ id: parsedId });
        }
      }
    }
  }

  if (statusFilter && statusFilter !== 'all') {
    where.order_status = statusFilter;
  }

  if (marketplaceFilter && marketplaceFilter !== 'all') {
    where.marketplace = marketplaceFilter;
  }

  if (orderDateStart && orderDateEnd) {
    where.created_at = {
      gte: new Date(orderDateStart),
      lt: new Date(orderDateEnd),
    };
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: where,
      skip: skip,
      take: limit,
      orderBy: {
        created_at: 'desc',
      },
      select: orderSelectClause.select, // Use the defined select clause
    }),
    prisma.order.count({ where: where }),
  ]);
  return { orders, total };
}

// Fetch distinct filter options
async function getFilterOptions(): Promise<{ statuses: string[]; marketplaces: string[] }> {
  // Add explicit types for Prisma results
  const [statusesResult, marketplacesResult]: [
    { order_status: string | null }[],
    { marketplace: string | null }[],
  ] = await Promise.all([
    prisma.order.findMany({
      select: { order_status: true },
      distinct: ['order_status'],
      // where: { order_status: { not: null } }, // Remove where clause here
    }),
    prisma.order.findMany({
      select: { marketplace: true },
      distinct: ['marketplace'],
      // where: { marketplace: { not: null } }, // Remove where clause here
    }),
  ]);

  // Filter out null/empty strings and map to array of strings (This filter remains)
  const statuses = statusesResult.map(s => s.order_status).filter((s): s is string => !!s);
  const marketplaces = marketplacesResult.map(m => m.marketplace).filter((m): m is string => !!m);

  return { statuses, marketplaces };
}

// Define the type for the selected order data based on the select clause
// This helps ensure type safety in the component
type SelectedOrderData = Prisma.OrderGetPayload<{
  select: {
    id: true;
    shipstation_order_number: true;
    customer_name: true;
    marketplace: true;
    order_status: true;
    tag_ids: true;
    total_price: true;
    order_date: true;
    shipped_date: true;
    ship_by_date: true; // Add ship_by_date
    tracking_number: true;
    _count: { select: { items: true } };
  };
}>;

// Marketplace styling similar to print-queue with high contrast for dark mode
const marketplaceStyles: Record<string, { bg: string; text: string }> = {
  eBay: { bg: 'bg-blue-500', text: 'text-white' },
  Amazon: { bg: 'bg-orange-500', text: 'text-white' },
  Etsy: { bg: 'bg-orange-600', text: 'text-white' },
  Shopify: { bg: 'bg-green-500', text: 'text-white' },
  'N/A': { bg: 'bg-gray-500', text: 'text-white' },
};

// Helper function to get marketplace display name
function getMarketplaceAlias(marketplace: string | null | undefined): string {
  if (!marketplace) return 'N/A';
  return marketplace;
}

// Helper component for Tracking Number cell
function TrackingNumberCell({ trackingNumber }: { trackingNumber: string | null }) {
  if (!trackingNumber) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent link navigation if wrapped
    navigator.clipboard
      .writeText(trackingNumber)
      .then(() => toast.success('Tracking # copied!'))
      .catch(() => toast.error('Failed to copy tracking #'));
  };

  // Basic check for common carrier URLs - replace with actual logic if needed
  const trackingUrl =
    trackingNumber.length > 10
      ? `https://www.google.com/search?q=${encodeURIComponent(trackingNumber)}`
      : null;

  const content = (
    <div className="flex items-center gap-1 max-w-xs group">
      <span className="truncate font-mono text-xs flex-grow">{trackingNumber}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={handleCopy}
        aria-label="Copy tracking number"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );

  if (trackingUrl) {
    return (
      <a
        href={trackingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground/90 hover:text-foreground hover:underline"
        title="Track package (opens in new tab)"
      >
        {content}
      </a>
    );
  }

  return content;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: {
    page?: string | string[];
    limit?: string | string[];
    search?: string | string[];
    status?: string | string[];
    marketplace?: string | string[];
    orderDateStart?: string | string[]; // Add date params
    orderDateEnd?: string | string[]; // Add date params
  };
}) {
  // Await searchParams before accessing properties
  const awaitedSearchParams = await searchParams;

  // Destructure all parameters after awaiting, applying defaults
  const {
    page: pageParam = '1',
    limit: limitParam = '50',
    search: searchParam,
    status: statusParam,
    marketplace: marketplaceParam,
    orderDateStart: orderDateStartParam, // Destructure date params
    orderDateEnd: orderDateEndParam, // Destructure date params
  } = awaitedSearchParams || {};

  // Parse pagination params
  const page = parseInt(Array.isArray(pageParam) ? pageParam[0] : pageParam, 10);
  const limit = parseInt(Array.isArray(limitParam) ? limitParam[0] : limitParam, 10);
  const validatedPage = isNaN(page) || page < 1 ? 1 : page;
  const validatedLimit = isNaN(limit) || limit < 1 ? 50 : limit;

  // Parse filter params
  const currentSearch = Array.isArray(searchParam) ? searchParam[0] : searchParam;
  const currentStatus = Array.isArray(statusParam) ? statusParam[0] : statusParam;
  const currentMarketplace = Array.isArray(marketplaceParam)
    ? marketplaceParam[0]
    : marketplaceParam;
  const currentOrderDateStart = Array.isArray(orderDateStartParam)
    ? orderDateStartParam[0]
    : orderDateStartParam;
  const currentOrderDateEnd = Array.isArray(orderDateEndParam)
    ? orderDateEndParam[0]
    : orderDateEndParam;

  // Fetch data and filter options concurrently
  const [{ orders, total }, stats, { statuses, marketplaces }, allTags] = await Promise.all([
    // Pass date filters to getOrders
    getOrders(
      validatedPage,
      validatedLimit,
      currentSearch,
      currentStatus,
      currentMarketplace,
      currentOrderDateStart, // Pass start date
      currentOrderDateEnd // Pass end date
    ),
    getDashboardStats(),
    getFilterOptions(),
    prisma.tag.findMany(),
  ]);
  const totalPages = Math.ceil(total / validatedLimit);

  return (
    <div className="space-y-6">
      {' '}
      {/* Add spacing for page elements */}
      {/* Stats Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Orders Today"
          value={stats.ordersToday}
          icon={Package}
          description={stats.ordersTodayPrev}
        />
        <StatsCard
          title="Revenue Today"
          value={`${CURRENCY_SYMBOL}${stats.revenueToday.toFixed(2)}`}
          icon={DollarSign}
          description={stats.revenueTodayPrev}
        />
        <StatsCard
          title="Total Items" // Title from screenshot
          value={stats.totalItems} // Using total orders count as placeholder
          icon={Package} // Reusing icon, consider changing
          description={stats.totalItemsPrev}
        />
        <StatsCard
          title="Revenue This Week"
          value={`${CURRENCY_SYMBOL}${stats.revenueThisWeek.toFixed(2)}`}
          icon={TrendingUp}
          description={stats.revenueWeekPrev}
        />
      </div>
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-2">Welcome to the Y3DLabs Internal Dashboard</h2>
        <p className="text-sm opacity-90">
          The search function allows you to quickly locate orders by order number or customer name.
          You can also filter results by order status or marketplace, making it easier to monitor
          and manage tasks.
        </p>
      </div>
      {/* Orders Table Section */}
      <div className="bg-card text-card-foreground rounded-lg border p-6 space-y-4">
        {/* Search and Filter Controls Form - Using Client Component */}
        <OrdersSearchForm
          currentSearch={currentSearch}
          currentStatus={currentStatus}
          currentMarketplace={currentMarketplace}
          currentOrderDateStart={currentOrderDateStart}
          currentOrderDateEnd={currentOrderDateEnd}
          statuses={statuses}
          marketplaces={marketplaces}
        />
        {/* Batch controls */}
        <div className="flex justify-between items-center mb-4">
          <PackingSlipBatchControls />
        </div>
        {/* Orders Table (Existing) */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">ID</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Marketplace</TableHead>
              <TableHead>Status</TableHead>
              {/* <TableHead>Tags</TableHead> */}
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Ship By</TableHead>
              <TableHead>Shipped Date</TableHead>
              <TableHead>Tracking #</TableHead>
              <TableHead className="w-[140px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order: SelectedOrderData) => {
              // Check for Prime/Premium tags
              const isPrime = (order.tag_ids as number[])?.some(tagId => {
                const tag = allTags.find(t => t.shipstation_tag_id === tagId);
                return tag?.name === 'Amazon Prime Order';
              });

              const isPremium = (order.tag_ids as number[])?.some(tagId => {
                const tag = allTags.find(t => t.shipstation_tag_id === tagId);
                return tag?.name === '*** PREMIUM DELIVERY ***';
              });

              // Check if order is a priority based on ship_by_date (within 2 days)
              const isPriority =
                order.ship_by_date &&
                new Date(order.ship_by_date).getTime() <
                  new Date().getTime() + 2 * 24 * 60 * 60 * 1000;

              return (
                <TableRow
                  key={order.id}
                  className={cn(
                    'hover:bg-muted/50',
                    isPrime && 'bg-blue-50 dark:bg-blue-900/20',
                    isPremium && 'bg-purple-50 dark:bg-purple-900/20',
                    isPriority && !isPrime && !isPremium && 'bg-amber-50 dark:bg-amber-900/20',
                    !isPrime &&
                      !isPremium &&
                      !isPriority &&
                      orders.indexOf(order) % 2 !== 0 &&
                      'bg-muted/25'
                  )}
                >
                  <TableCell className="font-medium text-muted-foreground">{order.id}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-foreground/90 hover:text-foreground hover:underline"
                      >
                        {order.shipstation_order_number || 'N/A'}
                      </Link>
                      {isPrime && (
                        <Badge className="bg-blue-500 text-white hover:bg-blue-600">Prime</Badge>
                      )}
                      {isPremium && (
                        <Badge className="bg-purple-500 text-white hover:bg-purple-600">
                          Premium
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-xs">{order.customer_name || 'N/A'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-center">
                      {(() => {
                        const marketplaceAlias = getMarketplaceAlias(order.marketplace);
                        const style =
                          marketplaceStyles[marketplaceAlias] || marketplaceStyles['N/A'];
                        return (
                          <Badge
                            variant="default"
                            className={cn(
                              'px-2 py-1 text-xs font-medium rounded-md border border-white/10 shadow-sm',
                              style.bg,
                              style.text
                            )}
                          >
                            {marketplaceAlias}
                          </Badge>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="default"
                      className={cn(
                        'font-medium text-xs px-2 py-1',
                        order.order_status === 'shipped' &&
                          'bg-green-600 dark:bg-green-700 text-white',
                        order.order_status === 'awaiting_shipment' &&
                          'bg-blue-600 dark:bg-blue-700 text-white',
                        order.order_status === 'on_hold' &&
                          'bg-yellow-600 dark:bg-yellow-700 text-white',
                        order.order_status === 'cancelled' &&
                          'bg-red-600 dark:bg-red-700 text-white'
                      )}
                    >
                      {order.order_status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  {/* Tags column commented out
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(order.tag_ids as number[])?.length > 0 && allTags.length > 0 ? (
                        (order.tag_ids as number[]).map(tagId => {
                          const tag = allTags.find(t => t.shipstation_tag_id === tagId);
                          if (tag) {
                            return (
                              <Badge
                                key={tag.id}
                                style={{
                                  backgroundColor: tag.color_hex || '#cccccc',
                                  color: tag.color_hex && parseInt(tag.color_hex.substring(1), 16) > 0xffffff / 2 ? '#000' : '#fff'
                                }}
                                className="text-xs border border-black/10 px-1.5 py-0.5"
                              >
                                {tag.name}
                              </Badge>
                            );
                          }
                          return null;
                        })
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-xs px-2 py-1 font-medium',
                          order._count.items > 1
                            ? 'bg-blue-500 hover:bg-blue-600 text-white'
                            : 'bg-gray-500 hover:bg-gray-600 text-white'
                        )}
                      >
                        {order._count.items}
                      </Badge>
                      <Badge
                        variant="default"
                        className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium border border-white/10 shadow-sm"
                      >
                        {CURRENCY_SYMBOL}
                        {order.total_price.toFixed(2)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-xs px-2 py-1 border-slate-300 dark:border-slate-700"
                    >
                      {formatDateForTable(order.order_date)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {order.ship_by_date ? (
                      <Badge
                        variant="default"
                        className="bg-amber-500 dark:bg-amber-600 text-white font-medium text-xs px-2 py-1"
                      >
                        {formatDateForTable(order.ship_by_date)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.shipped_date ? (
                      <Badge
                        variant="default"
                        className="bg-green-500 dark:bg-green-600 text-white font-medium text-xs px-2 py-1"
                      >
                        {formatDateForTable(order.shipped_date)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TrackingNumberCell trackingNumber={order.tracking_number} />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <RowPrintPackingSlipButton
                        orderId={order.id}
                        orderNumber={order.shipstation_order_number}
                      />
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableCaption>
            A list of recent orders. Page {validatedPage} of {totalPages}. Total Orders: {total}
          </TableCaption>
        </Table>
        {/* Pagination Controls (Existing) */}
        <div className="flex justify-between items-center mt-4">
          {/* Pass current searchParams to LimitSelector and OrdersPagination - REMOVED for now to fix lint error */}
          <LimitSelector currentLimit={validatedLimit} /* searchParams={awaitedSearchParams} */ />
          <OrdersPagination
            currentPage={validatedPage}
            totalPages={totalPages}
            limit={validatedLimit} /* searchParams={awaitedSearchParams} */
          />
        </div>
        {orders.length === 0 && (
          <p className="text-center mt-4">No orders found for the current filters.</p>
        )}{' '}
        {/* Update empty message */}
      </div>{' '}
      {/* Close card div */}
    </div>
  );
}

// Optional: Add revalidation if data changes frequently
// export const revalidate = 60; // Revalidate every 60 seconds
