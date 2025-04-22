import { authOptions } from '@/lib/auth';
import { PrintTaskStatus, Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
// Old auth imports removed
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

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
