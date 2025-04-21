import { PrintTaskStatus, Prisma } from '@prisma/client';
// Remove auth imports
// import { IronSessionData, getIronSession } from 'iron-session';
// import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// import { sessionOptions } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

// Define valid status values using Prisma enum
const validStatuses = Object.values(PrintTaskStatus);

// Zod schema for request body validation
const bulkUpdateStatusSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1), // Must have at least one positive integer ID
  status: z.enum([validStatuses[0], ...validStatuses.slice(1)]),
});

export async function PATCH(request: NextRequest) {
  try {
    // Remove session check
    // const session = await getIronSession<IronSessionData>(cookies(), sessionOptions);
    // const userId = session.userId;
    // if (!userId) {
    //   console.error('Unauthorized: No userId in session for bulk status update.');
    //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    // }
    // console.log(`Authorized access for bulk status update by user ID: ${userId}`);

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

    // Perform the bulk update within a transaction
    // Explicitly type the transaction client 'tx'
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updateResult = await tx.printOrderTask.updateMany({
        where: {
          id: { in: taskIds },
          // Optional: Add condition to prevent updating tasks in certain statuses?
          // e.g., status: { notIn: [PrintTaskStatus.completed, PrintTaskStatus.cancelled] }
        },
        data: {
          status: status,
          updated_at: new Date(), // Manually update timestamp if needed
        },
      });
      return updateResult;
    });

    console.log(
      `Mock Bulk updated status to ${status} for ${result.count} tasks (requested: ${taskIds.length}).`
    );

    // Return standard JSON response
    return NextResponse.json({
      message: `Successfully updated status for ${result.count} tasks.`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error during bulk task status update:', error);
    // Return standard error response (handleApiError likely returns a NextResponse)
    return handleApiError(error);
  }
}
