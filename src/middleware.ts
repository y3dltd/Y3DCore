import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Removed iron-session and sessionOptions imports

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  const userId = 1; // Mock user ID

  console.log(`Mock Middleware processing request for: ${pathname}, MockUserID: ${userId}`);

  // Old redirection logic removed

  // Always allow the request to proceed
  return response;
}

export const config = {
  // Update matcher to exclude static assets, API routes (except auth), and specific files
  matcher: [
    // Exclude specific files and directories
    '/((?!_next/static|_next/image|favicon\.ico|manifest\.json|logo\.png|fav/).*)',
    // Exclude common image/asset file extensions - adjust if needed
    '/((?!.*\.(?:png|svg|jpg|jpeg|gif|webp)$).*)',
  ],
};
