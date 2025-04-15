import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PrintTaskStatus } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

// Helper function to check if a string is a valid PrintTaskStatus
function isValidPrintTaskStatus(status: unknown): status is PrintTaskStatus {
  return typeof status === 'string' && Object.values(PrintTaskStatus).includes(status as PrintTaskStatus);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  // --- Authentication Check ---
  const user = await getCurrentUser();
  if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  // --- End Authentication Check ---

  const { taskId } = params;
  const taskIdInt = parseInt(taskId, 10);

  if (isNaN(taskIdInt)) {
    return NextResponse.json({ error: 'Invalid Task ID format' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch /* istanbul ignore next */ {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { status } = body;

  if (!status || !isValidPrintTaskStatus(status)) {
    return NextResponse.json(
      {
        error: `Invalid or missing status. Must be one of: ${Object.values(
          PrintTaskStatus
        ).join(', ')}`,
      },
      { status: 400 }
    );
  }

  try {
    const updatedTask = await prisma.printOrderTask.update({
      where: { id: taskIdInt },
      data: {
        status: status,
        updated_at: new Date(), // Explicitly set updated_at
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error(`Error updating task ${taskIdInt} status:`, error);
    return handleApiError(error);
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
