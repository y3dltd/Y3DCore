import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const url = new URL(request.url);
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
    _count: { id: true },
  });
  const data = groups.map(g => ({ marketplace: g.marketplace || 'Unknown', count: g._count.id }));
  const total = data.reduce((sum, { count }) => sum + count, 0);

  return NextResponse.json({ data, total });
}
