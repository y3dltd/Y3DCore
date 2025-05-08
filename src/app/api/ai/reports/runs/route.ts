import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reportId = req.nextUrl.searchParams.get('reportId');
  if (!reportId) return NextResponse.json({ error: 'reportId missing' }, { status: 400 });
  const runs = await prisma.aiReportRun.findMany({
    where: { reportId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      finishedAt: true,
      errorMsg: true,
    },
  });
  return NextResponse.json({ runs });
}
