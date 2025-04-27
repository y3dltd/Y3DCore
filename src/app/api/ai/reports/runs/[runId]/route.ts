import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

interface RouteParams {
    params: {
        runId: string;
    };
}

/**
 * API endpoint to fetch the status and result of a specific AIReportRun.
 * GET /api/ai/reports/runs/[runId]
 */
export async function GET(_req: Request, { params }: RouteParams) {
    const { runId } = params;

    if (!runId) {
        return NextResponse.json({ error: 'Missing runId parameter' }, { status: 400 });
    }

    try {
        const run = await prisma.aiReportRun.findUnique({
            where: {
                id: runId,
            },
            select: {
                id: true,
                status: true,
                errorMsg: true,
                outputJson: true, // Include outputJson
                finishedAt: true,
            },
        });

        if (!run) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            run: {
                id: run.id,
                status: run.status,
                errorMsg: run.errorMsg,
                finishedAt: run.finishedAt,
                // Conditionally include outputJson only if status is success
                outputJson: run.status === 'success' ? run.outputJson : undefined,
            },
        });
    } catch (error) {
        console.error(`Error fetching AI report run ${runId}:`, error);
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
} 
