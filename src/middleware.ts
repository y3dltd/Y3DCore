import { getIronSession, IronSessionData } from 'iron-session';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { sessionOptions } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

  // Handle OPTIONS requests for specific paths early (e.g., manifest)
  if (method === 'OPTIONS' && pathname === '/manifest.json') {
    console.log(`Middleware: Handling OPTIONS for ${pathname}`);
    return NextResponse.json({}, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  // Immediately allow specific public assets and paths without session check
  const publicPaths = [
    '/login',
    '/manifest.json',
  ];
  const publicPrefixes = [
    '/_next',       // Next.js internals
    '/fav',         // Favicon directory
    // No /api/auth here, should be handled by session check
  ];
  const publicSuffixes = [
    '.png', '.jpg', '.svg', '.webp', '.ico' // Common image/icon types
  ];

  if (
    publicPaths.includes(pathname) ||
    publicPrefixes.some(prefix => pathname.startsWith(prefix)) ||
    publicSuffixes.some(suffix => pathname.endsWith(suffix)) ||
    pathname === '/favicon.ico' // Explicit root favicon check
  ) {
    // Specifically exclude /api/auth from this public check
    if (!pathname.startsWith('/api/auth')) {
      console.log(`Middleware: Allowing public path ${pathname}`);
      return NextResponse.next(); // Allow request without session check
    }
  }

  // --- Session check required beyond this point ---
  const response = NextResponse.next();
  console.log(`Middleware: Processing potentially protected path ${pathname}`);

  try {
    const session = await getIronSession<IronSessionData>(request, response, sessionOptions);
    const { userId } = session;

    console.log(`Middleware: UserID: ${userId || 'None'} for path ${pathname}`);

    if (!userId) {
      // Only redirect to login for HTML pages, not for API routes
      if (!pathname.startsWith('/api/')) {
        console.log(`Middleware: Redirecting unauthenticated user from ${pathname} to /login`);
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      } else {
        // For API routes, return 401 instead of redirecting
        console.log(`Middleware: Returning 401 for unauthenticated API request to ${pathname}`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
    }

    // If user is logged in but tries to access /login, redirect to home
    if (userId && pathname.startsWith('/login')) {
      console.log('Middleware: Redirecting logged-in user from /login to /');
      return NextResponse.redirect(new URL('/', request.url));
    }

    // If authenticated and accessing a protected route, allow the request and attach session cookie to response
    return response;
  } catch (error) {
    console.error(`Middleware error for ${pathname}:`, error);

    // If there's an error with session handling, redirect to login for safety
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  // Matcher should cover all paths except those explicitly excluded above
  // We rely on the initial `if` block to handle exclusions.
  matcher: [
    '/((?!_next/static|_next/image).*)', // Match everything except static assets
  ],
};
