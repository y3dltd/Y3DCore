import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

export async function POST(/* request: NextRequest */) {
  try {
    const session = await getSession();
    session.destroy(); // Clear the session data
    
    // No need to explicitly save after destroy
    // The Set-Cookie header with expiry in the past is handled by iron-session
    
    return NextResponse.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('[API Auth Logout] Error:', error);
    return handleApiError(error);
  }
} 
