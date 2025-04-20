import { NextRequest, NextResponse } from 'next/server';

// Import iron-session necessities directly
import { getIronSession, IronSessionData } from 'iron-session';
import { sessionOptions } from '@/lib/auth'; // Assuming sessionOptions is exported from here

import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/server-only/auth-password';

export async function POST(request: NextRequest) {
  // Create the response object early to attach the session cookie to it
  const response = NextResponse.json({}); // Start with an empty JSON response

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 }); // Generic message
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 }); // Generic message
    }

    // Create session using getIronSession directly with request and response
    const session = await getIronSession<IronSessionData>(request, response, sessionOptions);
    session.userId = user.id;
    await session.save();

    // Return user info (excluding password)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    // Update the response body with user info AFTER session is saved
    // Re-create response with user data and existing headers (including session cookie)
    return NextResponse.json(userWithoutPassword, { headers: response.headers });
  } catch (error) {
    console.error('[API Auth Login] Error:', error);
    // Ensure we return the response object even in case of error, 
    // potentially updating its status/body via handleApiError if it modifies the response.
    // For now, just return a generic error on the initial response object.
    // Adjust based on how handleApiError works.
    return NextResponse.json({ message: 'Internal server error' }, { status: 500, headers: response.headers });
  }
}
