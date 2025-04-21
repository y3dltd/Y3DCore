import { NextRequest, NextResponse } from 'next/server';

// Import iron-session necessities directly
import { sessionOptions } from '@/lib/auth'; // Assuming sessionOptions is exported from here
import { getIronSession, IronSessionData } from 'iron-session';

import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/server-only/auth-password';

// Define standard CORS headers for reuse
const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  // Create the response object early to attach the session cookie to it
  const response = NextResponse.json({}, {
    status: 200,
    headers: corsHeaders(origin),
  });

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
      console.log(`Login failed: no user found with email ${email}`);
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 }); // Generic message
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      console.log(`Login failed: invalid password for user ${email}`);
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 }); // Generic message
    }

    // Create session using getIronSession directly with request and response
    const session = await getIronSession<IronSessionData>(request, response, sessionOptions);
    session.userId = user.id;
    await session.save();

    console.log(`User ${email} logged in successfully, session created with ID ${user.id}`);

    // Return user info (excluding password)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    // Update the response body with user info AFTER session is saved
    // Re-create response with user data and existing headers (including session cookie)
    // Use the *original* response object that iron-session modified to ensure Set-Cookie is present
    response.headers.set('Content-Type', 'application/json'); // Ensure correct content type
    const finalResponse = new NextResponse(JSON.stringify(userWithoutPassword), {
      status: 200,
      headers: response.headers, // Crucially, use the headers from the session-aware response object
    });
    return finalResponse;

  } catch (error) {
    console.error('[API Auth Login] Error:', error);
    // Ensure we return the response object even in case of error
    return NextResponse.json(
      { message: 'Internal server error' },
      {
        status: 500,
        headers: response.headers, // Use headers from the initially created response
      }
    );
  }
}

// Add OPTIONS handler for CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, {
    status: 200, // Use 200 for OPTIONS response with headers
    headers: corsHeaders(origin),
  });
}
