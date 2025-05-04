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

        // Extract reportType from outputJson metadata
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

        return NextResponse.json({
            success: true,
            run: {
                id: run.id,
                status: run.status,
                errorMsg: run.errorMsg,
                finishedAt: run.finishedAt,
                reportType, // Include the extracted reportType
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
