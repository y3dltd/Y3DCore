import { PrintTaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
// Import iron-session necessities
import { IronSessionData, getIronSession } from 'iron-session';

import { sessionOptions } from '@/lib/auth'; // Assuming sessionOptions is here
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

// Helper function to check if a string is a valid PrintTaskStatus
function isValidPrintTaskStatus(status: unknown): status is PrintTaskStatus {
  return (
    typeof status === 'string' && Object.values(PrintTaskStatus).includes(status as PrintTaskStatus)
  );
}

export async function PATCH(request: NextRequest, { params }: { params: { taskId: string } }) {
  // Response object needed for iron-session
  const response = NextResponse.next();

  try {
    // --- Get session using iron-session --- 
    const session = await getIronSession<IronSessionData>(request, response, sessionOptions);
    const userId = session.userId;

    if (!userId) {
      console.error(`Unauthorized: No userId in session for task ${params.taskId}`);
      // Return a standard JSON response for unauthorized access
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    // Log successful authentication from session
    console.log(`Authorized access for user ID: ${userId} to task ${params.taskId}`);
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

    try {
      const updatedTask = await prisma.printOrderTask.update({
        where: { id: taskIdInt },
        data: {
          status: status,
          updated_at: new Date(), // Explicitly set updated_at
        },
      });

      console.log(`Successfully updated task ${taskId} status to ${status}`);
      // IMPORTANT: Return the updated task in the body of a *new* NextResponse,
      // but use the headers from the `response` object that iron-session modified 
      // to ensure the session cookie is properly handled/updated if needed.
      return new NextResponse(JSON.stringify(updatedTask), {
        status: 200,
        headers: response.headers, // Use headers from the session-aware response
      });

    } catch (error) {
      console.error(`Error updating task ${taskIdInt} status:`, error);
      // Even on error, use the session-aware headers
      const errorResponse = handleApiError(error);
      // Create a new response for the error, preserving headers
      const body = await errorResponse.json();
      return new NextResponse(JSON.stringify(body), {
        status: errorResponse.status,
        headers: response.headers,
      });
    }
  } catch (sessionError) {
    console.error(`Session error for task ${params.taskId}:`, sessionError);
    // Use status 500 for session errors, return standard JSON response
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
