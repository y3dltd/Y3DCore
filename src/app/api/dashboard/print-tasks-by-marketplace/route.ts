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

  // fetch tasks with order relation and group by marketplace in code
  const tasks = await prisma.printOrderTask.findMany({
    where: { created_at: { gte: start, lt: end } },
    select: { order: { select: { marketplace: true } } },
  });

  const countsMap: Record<string, number> = {};
  tasks.forEach(task => {
    const mp = task.order.marketplace ?? 'Unknown';
    countsMap[mp] = (countsMap[mp] || 0) + 1;
  });

  const data = Object.entries(countsMap).map(([marketplace, count]) => ({ marketplace, count }));
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return NextResponse.json({ data, total });
}
