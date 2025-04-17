import { PrintTaskStatus, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth'; // Import user check
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

// Helper function to check if a string is a valid PrintTaskStatus
function isValidPrintTaskStatus(status: unknown): status is PrintTaskStatus {
  return (
    typeof status === 'string' && Object.values(PrintTaskStatus).includes(status as PrintTaskStatus)
  );
}

// Interface matching the form data sent from the modal
interface UpdateTaskData {
  product_name?: string;
  sku?: string;
  quantity?: number;
  color_1?: string;
  color_2?: string;
  custom_text?: string;
  status?: PrintTaskStatus;
  needs_review?: boolean;
  review_reason?: string;
}

// PATCH Handler for updating a single task
export async function PATCH(
  request: NextRequest,
  context: { params: { taskId: string } } // Revert to standard type
) {
  // --- Authentication Check ---
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  // --- End Authentication Check ---

  const { params } = context; // Destructure params from context
  const { taskId } = params;
  const taskIdInt = parseInt(taskId, 10);

  if (isNaN(taskIdInt)) {
    return NextResponse.json({ error: 'Invalid Task ID format' }, { status: 400 });
  }

  let body: UpdateTaskData;
  try {
    body = await request.json();
  } catch /* istanbul ignore next */ {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- Input Validation ---
  const updateData: Prisma.PrintOrderTaskUpdateInput = {};

  // Validate and add fields to updateData if they exist in the body
  if (body.quantity !== undefined) {
    if (typeof body.quantity !== 'number' || body.quantity < 0) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
    }
    updateData.quantity = body.quantity;
  }
  if (body.color_1 !== undefined) updateData.color_1 = body.color_1;
  if (body.color_2 !== undefined) updateData.color_2 = body.color_2;
  if (body.custom_text !== undefined) updateData.custom_text = body.custom_text;
  if (body.status !== undefined) {
    if (!isValidPrintTaskStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }
    updateData.status = body.status;
  }
  if (body.needs_review !== undefined) {
    if (typeof body.needs_review !== 'boolean') {
      return NextResponse.json({ error: 'Invalid needs_review value' }, { status: 400 });
    }
    updateData.needs_review = body.needs_review;
    // If needs_review is set to false, clear the reason
    if (!body.needs_review) {
      updateData.review_reason = null;
    }
  }
  if (body.review_reason !== undefined && updateData.needs_review !== false) {
    // Only update reason if needs_review is true or wasn't explicitly set to false
    updateData.review_reason = body.review_reason;
  }

  // Ensure we are actually updating something
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided for update' }, { status: 400 });
  }

  // Add updated_at timestamp
  updateData.updated_at = new Date();

  // --- Database Update ---
  try {
    const updatedTask = await prisma.printOrderTask.update({
      where: { id: taskIdInt },
      data: updateData, // Pass the validated and constructed data object
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error(`Error updating task ${taskIdInt}:`, error);
    return handleApiError(error);
  }
}

// Optional: Add GET handler if you want to fetch single task details via API
// export async function GET(...) { ... }

// Optional: Add DELETE handler
// export async function DELETE(...) { ... }
