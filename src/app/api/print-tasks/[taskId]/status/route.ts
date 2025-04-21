import { PrintTaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

// Revert back to using getCurrentUser
import { getCurrentUser } from '@/lib/auth';
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
    // --- Authentication Check using getCurrentUser --- 
    const user = await getCurrentUser();
    if (!user) {
      console.error(`Unauthorized access attempt for task ${params.taskId} (via getCurrentUser)`);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    console.log(`Authorized access for user ${user.email} (ID: ${user.id}) to task ${params.taskId}`);
    // --- End Authentication Check ---

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
      return NextResponse.json(
        {
          error: `Invalid or missing status. Must be one of: ${Object.values(PrintTaskStatus).join(
            ', '
          )}`,
        },
        { status: 400 }
      );
    }

    // --- Database Update Logic --- 
    try {
      const updatedTask = await prisma.printOrderTask.update({
        where: { id: taskIdInt },
        data: {
          status: status,
          updated_at: new Date(),
        },
      });

      console.log(`Successfully updated task ${taskId} status to ${status}`);
      // Return standard JSON response
      return NextResponse.json(updatedTask);

    } catch (error) {
      console.error(`Error updating task ${taskIdInt} status:`, error);
      return handleApiError(error);
    }
  } catch (authError) {
    // Catch potential errors from getCurrentUser itself
    console.error(`Authentication check error for task ${params.taskId}:`, authError);
    return NextResponse.json({ message: 'Authentication check failed' }, { status: 500 });
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
