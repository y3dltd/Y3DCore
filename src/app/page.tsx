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
import { SyncButton } from '@/components/sync-button'; // Keep SyncButton
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

// --- Data Fetching ---

// Combined function to fetch all dashboard data
async function getDashboardData() {
  // Mock data for Orders (similar to orders page)
  const ordersToday = 15;
  const revenueToday = 345.67;
  const totalItemsSoldToday = 28; // Example
  const revenueThisWeek = 1234.56;

  // Mock percentage changes
  const ordersTodayPrev = '+10% vs yesterday';
  const revenueTodayPrev = '+5.2% vs yesterday';
  const itemsSoldPrev = '+8% vs yesterday';
  const revenueWeekPrev = '+15% vs last week';

  // Mock data for Print Tasks
  // TODO: Replace with actual Prisma counts
  const tasksPending = await prisma.printOrderTask.count({ where: { status: 'pending' } }); // Example using Prisma
  const tasksNeedReview = await prisma.printOrderTask.count({ where: { needs_review: true } }); // Example using Prisma

  // Fetch recent orders
  const recentOrders = await prisma.order.findMany({
    take: 5, // Fetch latest 5 orders
    orderBy: {
      order_date: 'desc', // Order by date descending
    },
    select: {
      // Select only necessary fields
      id: true,
      shipstation_order_number: true,
      customer_name: true,
      marketplace: true,
      total_price: true,
      order_status: true,
    },
  });

  // Fetch counts for Needs Attention
  const ordersOnHoldCount = await prisma.order.count({ where: { order_status: 'on_hold' } });

  return {
    ordersToday,
    revenueToday,
    totalItemsSoldToday,
    revenueThisWeek,
    ordersTodayPrev,
    revenueTodayPrev,
    itemsSoldPrev,
    revenueWeekPrev,
    tasksPending,
    tasksNeedReview,
    recentOrders,
    ordersOnHoldCount,
  };
}

// --- Page Component ---

export default async function DashboardPage() {
  const { recentOrders, ordersOnHoldCount, ...stats } = await getDashboardData();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Gradient Welcome Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-primary-foreground p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-1">Welcome to the Y3DLabs Internal Dashboard</h1>
        <p className="text-sm opacity-90 max-w-3xl">
          Use search and filtering options to easily locate orders by number or customer name, also
          view your metrics by other criteria or marketplaces, view metrics and manage metrics and
          manage tasks.
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

      {/* Quick Actions / Sync Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <div className="md:col-span-1 bg-card text-card-foreground rounded-lg border p-4 flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold mb-2">Sync Orders</h3>
          <p className="text-sm text-muted-foreground mb-3 text-center">
            Pull latest orders from ShipStation.
          </p>
          <SyncButton />
        </div>
        <div className="md:col-span-2 bg-card text-card-foreground rounded-lg border p-4 flex flex-col items-center justify-center space-y-3">
          <h3 className="text-lg font-semibold">Quick Navigation</h3>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/orders">
              <Button variant="outline">View All Orders</Button>
            </Link>
            <Link href="/print-queue">
              <Button variant="outline">View Print Queue</Button>
            </Link>
            {/* Add other common actions here */}
          </div>
        </div>
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
