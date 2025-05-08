import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }): Promise<NextResponse> {
  const { runId } = params;
  if (!runId) {
    return NextResponse.json({ error: 'runId missing' }, { status: 400 });
  }
  try {
    const run = await prisma.aiReportRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
