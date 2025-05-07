import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Middleware for Y3DHub that handles authentication in a safe way
 * This approach avoids the URL parsing issues encountered with withAuth
 */
export async function middleware(req: NextRequest) {
  // Get pathname safely without URL constructor errors
  const pathname = req.nextUrl?.pathname || '/';
  
  // Public paths - always accessible
  if (
    pathname === '/login' || 
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    /\.(png|jpg|jpeg|gif|svg|xml|json)$/.test(pathname)
  ) {
    return NextResponse.next();
  }
  
  // Try to get token safely without throwing errors
  try {
    const token = await getToken({ req });
    
    // Authorized - proceed with the request
    if (token) {
      return NextResponse.next();
    }
    
    // Not authorized - redirect to login
    // Use clone() to avoid URL constructor issues
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    // On any error, log but allow the request rather than breaking the site
    console.error('Authentication middleware error:', error);
    return NextResponse.next();
  }
}

// Configure which routes are protected by the middleware
export const config = {
  // Match all routes except for certain static/public paths
  matcher: [
    '/((?!_next/static|_next/image|favicon\.ico).*)',
  ],
};
