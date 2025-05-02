import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days') ?? '7';
  const end = new Date();
  let start: Date;
  let groupByHour = false;

  if (daysParam === 'today') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
    groupByHour = true;
  } else {
    const days = parseInt(daysParam, 10);
    start = new Date(end);
    start.setDate(end.getDate() - days);
  }

  const orders = await prisma.order.findMany({
    where: { order_date: { gte: start, lt: end } },
    select: { order_date: true, total_price: true },
  });

  const countsMap: Record<string, number> = {};
  orders.forEach(order => {
    if (!order.order_date) {
      console.warn(`Order found with null order_date, skipping in revenue chart.`);
      return;
    }
    const dt = order.order_date;
    const key = groupByHour
      ? dt.getHours().toString().padStart(2, '0') + ':00'
      : dt.toISOString().slice(0, 10);
    countsMap[key] = (countsMap[key] || 0) + Number(order.total_price.toString());
  });

  const sortedKeys = Object.keys(countsMap).sort((a, b) =>
    groupByHour ? parseInt(a) - parseInt(b) : new Date(a).getTime() - new Date(b).getTime()
  );

  const data = sortedKeys.map(time => ({ time, revenue: countsMap[time] }));
  const total = data.reduce((sum, item) => sum + item.revenue, 0);

  return NextResponse.json({ data, total });
}
