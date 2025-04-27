import { PrintTaskStatus, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

/**
 * API endpoint to fetch print tasks for planner optimization
 * GET /api/print-tasks?status=pending
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') as PrintTaskStatus | null;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    // Build the query args in a type-safe way
    const findArgs: Prisma.PrintOrderTaskFindManyArgs = {
      include: {
        product: true,
        order: true,
        orderItem: true,
      },
      orderBy: {
        ship_by_date: 'asc',
      },
    };

    if (status) {
      findArgs.where = { status };
    }

    if (limit) {
      findArgs.take = limit;
    }

    // Fetch print tasks with related data.  By specifying the include shape in the generic
    // we ensure the resulting type reflects the related records (product, order, orderItem)
    type PrintTaskWithRelations = Prisma.PrintOrderTaskGetPayload<{
      include: {
        product: true;
        order: true;
        orderItem: true;
      };
    }>;

    const printTasks = (await prisma.printOrderTask.findMany(findArgs)) as PrintTaskWithRelations[];

    // Transform into the format needed for the planner
    const transformedTasks = printTasks.map(task => ({
      id: task.id.toString(),
      taskIndex: task.taskIndex,
      orderId: task.orderId.toString(),
      orderNumber: task.marketplace_order_number || `Order-${task.orderId}`,
      customText: task.custom_text,
      quantity: task.quantity,
      color1: task.color_1,
      color2: task.color_2,
      status: task.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productName: task.shorthandProductName || (task as any).product?.name || 'Unknown Product',
      shipByDate: task.ship_by_date,
      needsReview: task.needs_review,
      marketplace: task.order?.marketplace || 'Unknown',
    }));

    return NextResponse.json({
      success: true,
      tasks: transformedTasks,
      count: transformedTasks.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching print tasks:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
