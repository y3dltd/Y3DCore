import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Export a completely new middleware that avoids Next-Auth's withAuth wrapper
export async function middleware(req: NextRequest) {
  // Try to get the token but don't throw if it fails
  const token = await getToken({ req }).catch(() => null);
  
  // Get the pathname from the request URL safely
  const pathname = req.nextUrl?.pathname || '/';
  
  // Login page doesn't require authentication
  if (pathname === '/login') {
    return NextResponse.next();
  }
  
  // If user is not authenticated, redirect to login page
  if (!token) {
    // Create a safe URL for the login page
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  
  // User is authenticated, proceed
  return NextResponse.next();
}

// Configure which routes are protected by the middleware
export const config = {
  // Match all routes except for:
  // - API routes (which handle their own auth)
  // - Next.js internals (_next)
  // - Static files
  // - Login page
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\.ico|.*\.(png|jpg|jpeg|gif|svg|xml|json)$).*)',
  ],
};
