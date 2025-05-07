import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { safeGetUrlFromRequest } from '@/lib/utils';

export async function GET(request: Request) {
  const url = safeGetUrlFromRequest(request);
  if (!url) {
    return NextResponse.json({ error: 'Invalid request URL' }, { status: 400 });
  }
  const daysParam = url.searchParams.get('days') ?? '7';
  const end = new Date();
  let start: Date;
  if (daysParam === 'today') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  } else {
    const days = parseInt(daysParam, 10);
    start = new Date(end);
    start.setDate(end.getDate() - days);
  }

  const groups = await prisma.order.groupBy({
    by: ['marketplace'],
    where: { order_date: { gte: start, lt: end } },
    _sum: { total_price: true },
  });

  const data = groups.map(g => ({ marketplace: g.marketplace || 'Unknown', revenue: Number(g._sum.total_price?.toString() ?? '0') }));
  const total = data.reduce((sum, { revenue }) => sum + revenue, 0);

  return NextResponse.json({ data, total });
}
