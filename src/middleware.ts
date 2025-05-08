import { NextRequest, NextResponse } from 'next/server';

/**
 * Simplified Y3DHub middleware that avoids NextAuth.js completely
 * This approach prevents URL parsing errors on Vercel
 */
export function middleware(req: NextRequest): NextResponse {
  // Simply use the request path information instead of URL constructor
  const pathname = req.nextUrl.pathname;
  
  // If this is the login page, check if user is already logged in
  if (pathname === '/login') {
    // Check for session cookie
    const hasSession = req.cookies.has('next-auth.session-token') || 
                       req.cookies.has('__Secure-next-auth.session-token');
    
    // If already authenticated and on login page, redirect to home
    if (hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    
    // Not authenticated, allow access to login page
    return NextResponse.next();
  }
  
  // If accessing static resources or API routes, allow access
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|xml|json)$/)
  ) {
    return NextResponse.next();
  }
  
  // Check for session cookie directly (this avoids NextAuth's getToken which uses URL constructor)
  const hasSession = req.cookies.has('next-auth.session-token') || 
                     req.cookies.has('__Secure-next-auth.session-token');
  
  // If authenticated, proceed with the request
  if (hasSession) {
    return NextResponse.next();
  }
  
  // Not authenticated, redirect to login using pathname property manipulation
  // instead of URL constructor
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?callbackUrl=${encodeURIComponent(req.nextUrl.pathname)}`;
  
  return NextResponse.redirect(url);
}

// Configure which routes are protected by the middleware
export const config = {
  matcher: [
    // Match all routes except for static resources
    // eslint-disable-next-line no-useless-escape
    '/((?!_next/static|_next/image|favicon\.ico).*)',
  ],
};
