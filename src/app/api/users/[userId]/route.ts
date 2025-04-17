import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/server-only/auth-password';

// Admin User ID
const ADMIN_USER_ID = 1;

// Zod schema for password update
const updatePasswordSchema = z.object({
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
});

// --- PATCH Handler (Update Password) ---
export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    // --- Authorization Check ---
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== ADMIN_USER_ID) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    // --- End Authorization Check ---

    const userId = parseInt(params.userId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid User ID format' }, { status: 400 });
    }

    // Validate request body for password
    let validatedData: z.infer<typeof updatePasswordSchema>;
    try {
      const body = await request.json();
      validatedData = updatePasswordSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.errors },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { password } = validatedData;

    // Hash the new password
    const hashedPassword = await hashPassword(password);

    // Update the user's password
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
      select: {
        // Exclude password from the returned object
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    // Handle potential Prisma error if user not found (P2025)
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: `User with ID ${params.userId} not found.` },
        { status: 404 }
      );
    }
    console.error(`[API Users PATCH /${params.userId}] Error:`, error);
    return handleApiError(error);
  }
}

// --- DELETE Handler ---
export async function DELETE(
  request: NextRequest, // Keep request for potential future use
  { params }: { params: { userId: string } }
) {
  try {
    // --- Authorization Check ---
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== ADMIN_USER_ID) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    // --- End Authorization Check ---

    const userId = parseInt(params.userId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid User ID format' }, { status: 400 });
    }

    // Prevent deleting the primary admin user
    if (userId === ADMIN_USER_ID) {
      return NextResponse.json(
        { error: 'Cannot delete the primary admin user (ID 1).' },
        { status: 403 }
      ); // Forbidden
    }

    // Delete the user
    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ message: `User ${userId} deleted successfully.` }, { status: 200 });
  } catch (error) {
    // Handle potential Prisma error if user not found (P2025)
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: `User with ID ${params.userId} not found.` },
        { status: 404 }
      );
    }
    console.error(`[API Users DELETE /${params.userId}] Error:`, error);
    return handleApiError(error);
  }
}
