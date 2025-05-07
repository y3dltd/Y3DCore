'use server';

import { PrintTaskStatus, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getSearchParamsFromRequest } from '@/lib/utils';

// Define valid status values using Prisma enum
const validStatuses = Object.values(PrintTaskStatus);

// Zod schema for request body validation
const bulkUpdateStatusSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1),
  status: z.enum([validStatuses[0], ...validStatuses.slice(1)]),
});

export async function PATCH(request: NextRequest) {
  // --- Get Session --- 
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    console.error('[API Bulk Status PATCH] Unauthorized: No session found.');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  // --- End Get Session ---

  try {
    let validatedData: z.infer<typeof bulkUpdateStatusSchema>;
    try {
      const body = await request.json();
      validatedData = bulkUpdateStatusSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.errors },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { taskIds, status } = validatedData;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updateResult = await tx.printOrderTask.updateMany({
        where: {
          id: { in: taskIds },
        },
        data: {
          status: status,
          updated_at: new Date(),
        },
      });
      return updateResult;
    });

    console.log(
      `Bulk status updated to ${status} for ${result.count} tasks by user ${session.user.email}.` // Log user
    );

    return NextResponse.json({
      message: `Successfully updated status for ${result.count} tasks.`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error during bulk task status update:', error);
    return handleApiError(error);
  }
}

/**
 * GET /api/print-tasks/bulk-status
 * Fetches the current status for a list of print task IDs.
 * Expects a query parameter `ids` containing comma-separated task IDs.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const searchParams = getSearchParamsFromRequest(req);
  if (!searchParams) {
    return NextResponse.json(
      { success: false, error: 'Invalid request URL' },
      { status: 400 }
    );
  }
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json(
      { success: false, error: 'Missing required query parameter: ids' },
      { status: 400 }
    );
  }

  const taskIdsStr = idsParam.split(',').map(id => id.trim()).filter(Boolean);

  if (taskIdsStr.length === 0) {
    return NextResponse.json({ success: true, statuses: {} }); // Return empty object if no valid string IDs provided
  }

  // Convert string IDs to numbers, filtering out any invalid numbers
  const taskIdsNum = taskIdsStr.map(Number).filter(n => !isNaN(n) && Number.isInteger(n) && n > 0);

  if (taskIdsNum.length === 0) {
    console.warn('[API bulk-status] No valid numeric task IDs found after parsing:', taskIdsStr);
    return NextResponse.json({ success: true, statuses: {} }); // Return empty if no valid numeric IDs
  }

  try {
    const tasks = await prisma.printOrderTask.findMany({
      where: {
        id: {
          in: taskIdsNum, // Use the numeric IDs for the query
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    const statusMap: Record<string, PrintTaskStatus> = {};
    tasks.forEach(task => {
      statusMap[String(task.id)] = task.status; // Use string ID as key in the response map
    });

    // Add default status for any requested IDs not found (might have been deleted?)
    // Use the original string IDs for checking completeness against the request
    taskIdsStr.forEach(reqId => {
      if (!(reqId in statusMap)) {
        // Decide how to handle missing IDs. Maybe skip or set a specific status.
        // For now, let's skip adding them to the map if they weren't found.
        // statusMap[reqId] = PrintTaskStatus.pending; // Example: Default to pending
      }
    });

    return NextResponse.json({ success: true, statuses: statusMap });

  } catch (error) {
    console.error('[API bulk-status] Error fetching task statuses:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch task statuses: ${errorMessage}` },
      { status: 500 }
    );
  }
}
