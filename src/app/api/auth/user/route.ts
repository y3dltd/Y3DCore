import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';

// Route handler to get the currently authenticated user
export async function GET() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(null); // Return null if no user is logged in
    }
    
    return NextResponse.json(user);
    
  } catch (error) {
    console.error('[API Auth User] Error:', error);
    return handleApiError(error);
  }
} 
