import { NextRequest, NextResponse } from 'next/server';

// Remove getCurrentUser import
// import { getCurrentUser } from '@/lib/auth';

// Route handler to get the currently authenticated user (MOCKED)
export async function GET(request: NextRequest) {
  // Define a mock user
  const mockUser = {
    id: 1,
    email: 'mock@example.com',
    name: 'Mock User',
    // Add other fields from your User model if the frontend expects them
  };

  try {
    // Remove the call to getCurrentUser and the check
    // const user = await getCurrentUser();
    // if (!user) { ... }

    console.log('Returning mock user data');
    return NextResponse.json(mockUser, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('[API Auth User Mock] Error:', error);
    return NextResponse.json(
      { message: 'Error fetching mock user data' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      }
    );
  }
}

// Add OPTIONS handler for CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
