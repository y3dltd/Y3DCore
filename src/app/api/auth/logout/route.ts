import { NextResponse } from 'next/server';

// Old auth imports removed

export async function POST(/* request: NextRequest */) {
  try {
    // No session logic needed for mock logout
    console.log('Mock logout successful');
    return NextResponse.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('[API Auth Logout Mock] Error:', error);
    return NextResponse.json({ message: 'Internal server error during mock logout' }, { status: 500 });
  }
}
