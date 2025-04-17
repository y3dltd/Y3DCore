import { PrintTaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

// Zod schema for request body validation
const autoCompleteSchema = z.object({
  orderId: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  // --- Authentication Check ---
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  // --- End Authentication Check ---

  try {
    // Parse and validate the request body
    const body = await request.json();
    const { orderId } = autoCompleteSchema.parse(body);

    // Get the order to check its status
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, order_status: true },
    });

    if (!order) {
      return NextResponse.json({ error: `Order with ID ${orderId} not found.` }, { status: 404 });
    }

    // Check if the order status is shipped or cancelled
    if (order.order_status !== 'shipped' && order.order_status !== 'cancelled') {
      return NextResponse.json(
        {
          error: `Order status must be 'shipped' or 'cancelled' to auto-complete print tasks. Current status: ${order.order_status}`,
        },
        { status: 400 }
      );
    }

    // Find all pending or in-progress print tasks for this order
    const pendingTasks = await prisma.printOrderTask.findMany({
      where: {
        orderId: orderId,
        status: { in: [PrintTaskStatus.pending, PrintTaskStatus.in_progress] },
      },
      select: { id: true },
    });

    if (pendingTasks.length === 0) {
      return NextResponse.json({
        message: `No pending or in-progress print tasks found for order ${orderId}.`,
      });
    }

    // Update all tasks to completed
    const taskIds = pendingTasks.map(task => task.id);
    const updateResult = await prisma.printOrderTask.updateMany({
      where: { id: { in: taskIds } },
      data: {
        status: PrintTaskStatus.completed,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      message: `Successfully auto-completed ${updateResult.count} print tasks for order ${orderId}.`,
      tasksCompleted: updateResult.count,
    });
  } catch (error) {
    console.error('Error auto-completing print tasks:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return handleApiError(error);
  }
}
