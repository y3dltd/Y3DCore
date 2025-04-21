import { getSession } from '@/lib/auth';
import { PrintTaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

// Helper function to check if a string is a valid PrintTaskStatus
function isValidPrintTaskStatus(status: unknown): status is PrintTaskStatus {
  return (
    typeof status === 'string' && Object.values(PrintTaskStatus).includes(status as PrintTaskStatus)
  );
}

export async function PATCH(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const session = await getSession();
    const userId = session.userId;
    if (!userId) {
      console.error(`Unauthorized session for task ${params.taskId}`);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    console.log(`Authorized userId ${userId} for task ${params.taskId}`);

    const { taskId } = params;
    const taskIdInt = parseInt(taskId, 10);
    if (isNaN(taskIdInt)) {
      return NextResponse.json({ error: 'Invalid Task ID format' }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error(`Invalid JSON body for task ${taskId}:`, error);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { status } = body;
    if (!status || !isValidPrintTaskStatus(status)) {
      return NextResponse.json({
        error: `Invalid or missing status. Must be one of: ${Object.values(PrintTaskStatus).join(', ')}`,
      }, { status: 400 });
    }

    try {
      const updatedTask = await prisma.printOrderTask.update({
        where: { id: taskIdInt },
        data: { status, updated_at: new Date() },
      });
      return NextResponse.json(updatedTask);
    } catch (error) {
      console.error(`Error updating task ${taskIdInt}:`, error);
      return handleApiError(error);
    }
  } catch (error) {
    console.error(`Session error for task ${params.taskId}:`, error);
    return NextResponse.json({ message: 'Session error' }, { status: 500 });
  }
}

// Optional: Add OPTIONS method for CORS preflight requests if needed,
// although typically not required for same-origin requests in Next.js App Router.
// export async function OPTIONS() {
//   return new NextResponse(null, {
//     status: 204,
//     headers: {
//       'Access-Control-Allow-Origin': '*', // Adjust as needed
//       'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
//       'Access-Control-Allow-Headers': 'Content-Type, Authorization',
//     },
//   });
// }
