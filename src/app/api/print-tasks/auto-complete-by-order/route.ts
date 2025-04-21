import { PrintTaskStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Old auth imports removed
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

// Zod schema for request body validation
const autoCompleteSchema = z.object({
  orderId: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  // Authentication Check removed

  try {
    const body = await request.json();
    const { orderId } = autoCompleteSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, order_status: true },
    });

    if (!order) {
      return NextResponse.json({ error: `Order with ID ${orderId} not found.` }, { status: 404 });
    }

    if (order.order_status !== 'shipped' && order.order_status !== 'cancelled') {
      return NextResponse.json(
        {
          error: `Order status must be 'shipped' or 'cancelled' to auto-complete print tasks. Current status: ${order.order_status}`,
        },
        { status: 400 }
      );
    }

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
