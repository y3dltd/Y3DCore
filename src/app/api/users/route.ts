import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// import { getCurrentUser } from '@/lib/auth'; // Keep this commented out as it's truly unused now
import { handleApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/server-only/auth-password';

// Admin User ID (no longer checked)
// const ADMIN_USER_ID = 1;

// Zod schema for input validation
const createUserSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
});

export async function POST(request: NextRequest) {
  try {
    // Authorization Check removed
    // const currentUser = await getCurrentUser();
    // if (!currentUser || currentUser.id !== ADMIN_USER_ID) {
    //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    // }

    let validatedData: z.infer<typeof createUserSchema>;
    try {
      const body = await request.json();
      validatedData = createUserSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid input', details: error.errors },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, password } = validatedData;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return NextResponse.json(
        { message: `User with email ${email} already exists.` },
        { status: 409 }
      );
    }

    // NOTE: Hashing kept for DB compatibility, but auth is disabled.
    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('[API Users POST Mock] Error:', error);
    return handleApiError(error);
  }
}
