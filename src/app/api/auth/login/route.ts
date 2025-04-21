import { NextRequest, NextResponse } from 'next/server';

// Remove all auth-related imports
// import { sessionOptions } from '@/lib/auth';
// import { getIronSession, IronSessionData } from 'iron-session';
// import { prisma } from '@/lib/prisma';
// import { verifyPassword } from '@/lib/server-only/auth-password';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  // Define a mock user
  const mockUser = {
    id: 1,
    email: 'mock@example.com',
    name: 'Mock User',
    // Add other user fields if needed by the frontend
  };

  try {
    // Ignore the request body (email, password)
    // const { email, password } = await request.json();

    console.log(`Mock login successful for user ${mockUser.email}`);

    // Just return the mock user, no session creation
    return NextResponse.json(mockUser, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('[API Auth Login Mock] Error:', error);
    return NextResponse.json(
      { message: 'Internal server error during mock login' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': origin || '*',
          // ... other CORS headers if needed
        },
      }
    );
  }
}

// OPTIONS handler remains mostly the same for CORS
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    },
  });
}
