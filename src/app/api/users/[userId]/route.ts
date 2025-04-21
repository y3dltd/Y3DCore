import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Remove auth imports
// import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/server-only/auth-password';

// Admin User ID (kept for logic, but auth check removed)
const ADMIN_USER_ID = 1;

// Zod schema for password update
const updatePasswordSchema = z.object({
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
});

// --- PATCH Handler (Update Password) ---
export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    // Remove Authorization Check
    // const currentUser = await getCurrentUser();
    // if (!currentUser || currentUser.id !== ADMIN_USER_ID) {
    //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    // }

    const userId = parseInt(params.userId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid User ID format' }, { status: 400 });
    }

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
    const hashedPassword = await hashPassword(password);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: `User with ID ${params.userId} not found.` },
        { status: 404 }
      );
    }
    console.error(`[API Users PATCH /${params.userId} Mock] Error:`, error);
    return handleApiError(error);
  }
}

// --- DELETE Handler ---
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Remove Authorization Check
    // const currentUser = await getCurrentUser();
    // if (!currentUser || currentUser.id !== ADMIN_USER_ID) {
    //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    // }

    const userId = parseInt(params.userId, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid User ID format' }, { status: 400 });
    }

    // Keep logic preventing deletion of admin ID 1
    if (userId === ADMIN_USER_ID) {
      return NextResponse.json(
        { error: 'Cannot delete the primary admin user (ID 1).' },
        { status: 403 }
      );
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ message: `User ${userId} deleted successfully.` }, { status: 200 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        { error: `User with ID ${params.userId} not found.` },
        { status: 404 }
      );
    }
    console.error(`[API Users DELETE /${params.userId} Mock] Error:`, error);
    return handleApiError(error);
  }
}
