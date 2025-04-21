import { NextRequest, NextResponse } from 'next/server';

// Old auth-related imports removed

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  const mockUser = {
    id: 1,
    email: 'mock@example.com',
    name: 'Mock User',
  };

  try {
    // Request body is ignored for mock login
    console.log(`Mock login successful for user ${mockUser.email}`);

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
