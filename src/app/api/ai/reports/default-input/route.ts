import { PrintTaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

/**
 * GET /api/ai/reports/default-input?reportId=<id>
 * Returns a default JSON payload to pre-fill the report input textarea.
 * Specialised for the 'sequential-task-planner' report.
 */
export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get('reportId');
  if (!reportId) {
    return NextResponse.json({ error: 'reportId missing' }, { status: 400 });
  }

  const def = await prisma.aiReportDefinition.findUnique({ where: { id: reportId } });
  if (!def) {
    return NextResponse.json({ error: 'Report definition not found' }, { status: 404 });
  }

  let input: Record<string, unknown> = {};

  if (def.slug === 'sequential-task-planner') {
    const tasks = await prisma.printOrderTask.findMany({
      where: { status: PrintTaskStatus.pending },
      select: {
        id: true,
        orderId: true,
        shorthandProductName: true,
        quantity: true,
        color_1: true,
        color_2: true,
        custom_text: true,
      },
      orderBy: { created_at: 'asc' },
      take: 100,
    });

    input = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalJobs: tasks.length,
      },
      pendingJobs: tasks.map(t => ({
        id: t.id,
        orderId: t.orderId,
        productName: t.shorthandProductName ?? 'Unknown',
        quantity: t.quantity,
        colors: [t.color_1, t.color_2].filter(c => c != null && c !== ''), // Ensure null/empty colors are filtered
        customText: t.custom_text ?? undefined,
      })),
    };
  }

  return NextResponse.json(input);
}
