import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/errors';
import { safeGetUrlFromRequest } from '@/lib/utils';

/**
 * GET /api/print-tasks/bulk-details?ids=1,2,3
 * Fetches basic product details (name, sku) for a list of PrintOrderTask IDs.
 */
export async function GET(request: NextRequest) {
    const url = safeGetUrlFromRequest(request);
    if (!url) {
        return NextResponse.json({ success: false, error: 'Invalid request URL' }, { status: 400 });
    }
    
    const idsParam = url.searchParams.get('ids');

    if (!idsParam) {
        return NextResponse.json({ success: false, error: 'Missing task IDs' }, { status: 400 });
    }

    // Parse and validate IDs
    const taskIdsStr = idsParam.split(',');
    const taskIdsNum = taskIdsStr.map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));

    if (taskIdsNum.length === 0) {
        return NextResponse.json({
            success: false,
            error: 'No valid numeric task IDs provided',
        }, { status: 400 });
    }

    try {
        const tasksWithDetails = await prisma.printOrderTask.findMany({
            where: {
                id: {
                    in: taskIdsNum,
                },
            },
            select: {
                id: true,
                product: {
                    select: {
                        name: true,
                        sku: true,
                    },
                },
            },
        });

        // Transform into the desired map format: Record<string, { productName, sku }>
        const detailsMap: Record<string, { productName: string | null; sku: string | null }> = {};
        tasksWithDetails.forEach(task => {
            detailsMap[String(task.id)] = {
                productName: task.product?.name ?? null,
                sku: task.product?.sku ?? null,
            };
        });

        return NextResponse.json({ success: true, details: detailsMap });
    } catch (error) {
        console.error('[API bulk-details] Error fetching task details:', error);
        return handleApiError(error); // Use centralized error handler
    }
}

// Ensure the route is revalidated on every request
export const dynamic = 'force-dynamic';  
