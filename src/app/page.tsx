import {
  DollarSign,
  Package,
  Clock, // For pending tasks
  AlertCircle, // For tasks needing review
  AlertTriangle,
  ShoppingBag,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';

import { StatsCard } from '@/components/dashboard/stats-card';
import { Badge } from '@/components/ui/badge'; // Import Badge
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Import Card components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'; // Import Table components
import { CURRENCY_SYMBOL } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import dynamic from 'next/dynamic';
const OrdersByMarketplaceChart = dynamic(() => import('@/components/dashboard/charts/OrdersByMarketplaceChart'), { ssr: false });
const RevenueByMarketplaceChart = dynamic(() => import('@/components/dashboard/charts/RevenueByMarketplaceChart'), { ssr: false });
const PrintTasksByMarketplaceChart = dynamic(() => import('@/components/dashboard/charts/PrintTasksByMarketplaceChart'), { ssr: false });
const OrdersOverTimeChart = dynamic(() => import('@/components/dashboard/charts/OrdersOverTimeChart'), { ssr: false });
const RevenueOverTimeChart = dynamic(() => import('@/components/dashboard/charts/RevenueOverTimeChart'), { ssr: false });
const PrintTasksOverTimeChart = dynamic(() => import('@/components/dashboard/charts/PrintTasksOverTimeChart'), { ssr: false });

// --- Data Fetching ---

// Combined function to fetch all dashboard data
async function getDashboardData() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  const day = startOfWeek.getDay();
  const diff = day === 0 ? 6 : day - 1; // assume Monday as start of week
  startOfWeek.setDate(startOfWeek.getDate() - diff);
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  // Define same window yesterday for percentage comparisons
  const windowDuration = now.getTime() - startOfToday.getTime();
  const prevWindowEnd = new Date(startOfYesterday.getTime() + windowDuration);

  const [
    ordersTodayCount,
    ordersYesterdayCount,
    revenueTodayAgg,
    revenueYesterdayAgg,
    itemsSoldTodayAgg,
    itemsSoldYesterdayAgg,
    revenueThisWeekAgg,
    revenueLastWeekAgg,
    tasksPendingCount,
    tasksNeedReviewCount,
    recentOrders,
  ] = await prisma.$transaction([
    prisma.order.count({ where: { order_date: { gte: startOfToday, lt: now } } }),
    prisma.order.count({ where: { order_date: { gte: startOfYesterday, lt: prevWindowEnd } } }),
    prisma.order.aggregate({ _sum: { total_price: true }, where: { order_date: { gte: startOfToday, lt: now } } }),
    prisma.order.aggregate({ _sum: { total_price: true }, where: { order_date: { gte: startOfYesterday, lt: prevWindowEnd } } }),
    prisma.orderItem.aggregate({ _sum: { quantity: true }, where: { order: { order_date: { gte: startOfToday, lt: now } } } }),
    prisma.orderItem.aggregate({ _sum: { quantity: true }, where: { order: { order_date: { gte: startOfYesterday, lt: prevWindowEnd } } } }),
    prisma.order.aggregate({ _sum: { total_price: true }, where: { order_date: { gte: startOfWeek, lt: startOfTomorrow } } }),
    prisma.order.aggregate({ _sum: { total_price: true }, where: { order_date: { gte: startOfLastWeek, lt: startOfWeek } } }),
    prisma.printOrderTask.count({ where: { status: 'pending' } }),
    prisma.printOrderTask.count({ where: { needs_review: true } }),
    prisma.order.findMany({
      orderBy: { order_date: 'desc' },
      take: 10,
      select: { id: true, shipstation_order_number: true, customer_name: true, marketplace: true, total_price: true, order_status: true },
    }),
  ]);

  // Convert Prisma Decimal values to numbers
  const revenueToday = Number((revenueTodayAgg._sum.total_price ?? 0).toString());
  const revenueYesterday = Number((revenueYesterdayAgg._sum.total_price ?? 0).toString());
  const totalItemsSoldToday = Number((itemsSoldTodayAgg._sum.quantity ?? 0).toString());
  const itemsSoldYesterday = Number((itemsSoldYesterdayAgg._sum.quantity ?? 0).toString());
  const revenueThisWeek = Number((revenueThisWeekAgg._sum.total_price ?? 0).toString());
  const revenueLastWeek = Number((revenueLastWeekAgg._sum.total_price ?? 0).toString());

  function formatChange(current: number, previous: number, label: string) {
    if (previous > 0) {
      const change = ((current - previous) / previous) * 100;
      const sign = change > 0 ? '+' : ''; // prepend + for positive change
      return `${sign}${change.toFixed(1)}% vs ${label}`;
    }
    return 'N/A';
  }

  const ordersTodayPrev = formatChange(ordersTodayCount, ordersYesterdayCount, 'yesterday');
  const revenueTodayPrev = formatChange(revenueToday, revenueYesterday, 'yesterday');
  const itemsSoldPrev = formatChange(totalItemsSoldToday, itemsSoldYesterday, 'yesterday');
  const revenueWeekPrev = formatChange(revenueThisWeek, revenueLastWeek, 'last week');
  const tasksPending = tasksPendingCount;
  const tasksNeedReview = tasksNeedReviewCount;

  return {
    recentOrders,
    ordersOnHoldCount: 0, // TODO: implement on-hold count if needed
    ordersToday: ordersTodayCount,
    revenueToday,
    totalItemsSoldToday,
    revenueThisWeek,
    ordersTodayPrev,
    revenueTodayPrev,
    itemsSoldPrev,
    revenueWeekPrev,
    tasksPending,
    tasksNeedReview,
  };
}

// --- Page Component ---

export default async function DashboardPage() {
  const { recentOrders, ordersOnHoldCount, ...stats } = await getDashboardData();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Gradient Welcome Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-primary-foreground p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-1">Welcome to Y3DHub: Your 3D Printing Command Center.</h1>
        <p className="text-sm opacity-90 max-w-3xl">
          Monitor orders, manage print tasks, and gain real-time insights into your production workflow.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatsCard
          title="Orders Today"
          value={stats.ordersToday}
          icon={Package}
          description={stats.ordersTodayPrev}
          color="indigo"
        />
        <StatsCard
          title="Revenue Today"
          value={`${CURRENCY_SYMBOL}${stats.revenueToday.toFixed(2)}`}
          icon={DollarSign}
          description={stats.revenueTodayPrev}
          color="pink"
        />
        <StatsCard
          title="Items Sold Today"
          value={stats.totalItemsSoldToday}
          icon={ShoppingBag}
          description={stats.itemsSoldPrev}
          color="blue"
        />
        <StatsCard
          title="Revenue This Week"
          value={`${CURRENCY_SYMBOL}${stats.revenueThisWeek.toFixed(2)}`}
          icon={ArrowUpRight}
          description={stats.revenueWeekPrev}
          color="green"
        />
        <StatsCard title="Tasks Pending" value={stats.tasksPending} icon={Clock} color="yellow" />
        <StatsCard
          title="Needs Review"
          value={stats.tasksNeedReview}
          icon={AlertCircle}
          color="red"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <OrdersByMarketplaceChart defaultDays="7" />
        <RevenueByMarketplaceChart defaultDays="7" />
        <PrintTasksByMarketplaceChart defaultDays="7" />
      </div>

      {/* Over Time Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <OrdersOverTimeChart defaultDays="7" />
        <RevenueOverTimeChart defaultDays="7" />
        <PrintTasksOverTimeChart defaultDays="7" />
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        {' '}
        {/* Grid for widgets */}
        {/* Recent Orders Snippet */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length > 0 ? (
                  recentOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        <Link href={`/orders/${order.id}`} className="hover:underline">
                          {order.shipstation_order_number || order.id}
                        </Link>
                      </TableCell>
                      <TableCell className="truncate max-w-[150px]">
                        {order.customer_name || 'N/A'}
                      </TableCell>
                      <TableCell>{order.marketplace || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        {CURRENCY_SYMBOL}
                        {Number(order.total_price).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.order_status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/orders/${order.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No recent orders found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {/* Needs Attention Widget */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link
              href="/orders?status=on_hold"
              className="block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Orders On Hold</span>
                <Badge variant={ordersOnHoldCount > 0 ? 'destructive' : 'secondary'}>
                  {ordersOnHoldCount}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Review orders marked as &apos;on_hold&apos;.
              </p>
            </Link>
            <Link
              href="/print-queue?review=true"
              className="block p-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Tasks Needing Review</span>
                <Badge variant={stats.tasksNeedReview > 0 ? 'destructive' : 'secondary'}>
                  {stats.tasksNeedReview}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Review print tasks flagged by the system.
              </p>
            </Link>
          </CardContent>
        </Card>
        {/* TODO: Add Charts */}
      </div>
    </div>
  );
}
