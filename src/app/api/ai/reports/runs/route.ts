import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
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
      outputJson: true,
    },
  });

  const runsWithReportType = runs.map(run => {
    let reportType = undefined;
    if (run.outputJson) {
      try {
        const parsedOutput = typeof run.outputJson === 'string'
          ? JSON.parse(run.outputJson)
          : run.outputJson;

        reportType = parsedOutput.metadata?.reportType;
      } catch (error) {
        console.error("Error parsing outputJson for run", run.id, error);
      }
    }

    const { outputJson, ...restRun } = run;
    return {
      ...restRun,
      reportType,
    };
  });

  return NextResponse.json({ runs: runsWithReportType });
}
