import { getIronSession, IronSessionData } from 'iron-session';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { sessionOptions } from '@/lib/auth';

// Define paths that bypass the session check entirely
const BYPASS_SESSION_CHECK_PATHS = [
  '/login',
  '/manifest.json',
  '/favicon.ico',
  '/api/auth/login', // Auth endpoints
  '/api/auth/logout',
  '/api/auth/user',
];

const BYPASS_SESSION_CHECK_PREFIXES = [
  '/_next',    // Next.js internals
  '/fav',      // Favicon directory
];

const BYPASS_SESSION_CHECK_SUFFIXES = [
  '.png', '.jpg', '.svg', '.webp', '.ico' // Common assets
];

// Define headers for CORS OPTIONS responses
const corsOptionsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specify origins
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

  // --- 1. Handle CORS OPTIONS Preflight Requests Early ---
  // Especially for auth paths that need credentials
  if (method === 'OPTIONS' && pathname.startsWith('/api/auth/')) {
    console.log(`Middleware: Handling OPTIONS for auth path ${pathname}`);
    return NextResponse.json({}, { status: 200, headers: corsOptionsHeaders });
  }
  if (method === 'OPTIONS' && pathname === '/manifest.json') {
    console.log(`Middleware: Handling OPTIONS for ${pathname}`);
    return NextResponse.json({}, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }


  // --- 2. Check if path bypasses session validation ---
  const shouldBypass =
    BYPASS_SESSION_CHECK_PATHS.includes(pathname) ||
    BYPASS_SESSION_CHECK_PREFIXES.some(prefix => pathname.startsWith(prefix)) ||
    BYPASS_SESSION_CHECK_SUFFIXES.some(suffix => pathname.endsWith(suffix));

  if (shouldBypass) {
    console.log(`Middleware: Allowing path ${pathname} (bypassing session check)`);
    return NextResponse.next(); // Allow request without session check
  }

  // --- 3. Session check required beyond this point ---
  const response = NextResponse.next(); // Prepare response for potential session attachment
  console.log(`Middleware: Processing protected path ${pathname}`);

  try {
    const session = await getIronSession<IronSessionData>(request, response, sessionOptions);
    const { userId } = session;

    console.log(`Middleware: UserID: ${userId || 'None'} for path ${pathname}`);

    // --- 4. Handle unauthenticated users ---
    if (!userId) {
      // API routes (that aren't the bypassed auth routes) get 401
      if (pathname.startsWith('/api/')) {
        console.log(`Middleware: Returning 401 for unauthenticated API request to ${pathname}`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      // Other pages get redirected to login
      console.log(`Middleware: Redirecting unauthenticated user from ${pathname} to /login`);
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // --- 5. Handle authenticated users trying to access /login ---
    if (pathname === '/login') { // Check exact path
      console.log('Middleware: Redirecting logged-in user from /login to /');
      return NextResponse.redirect(new URL('/', request.url));
    }

    // --- 6. Allow authenticated users to access protected paths ---
    // Session cookie is automatically attached to 'response' by getIronSession
    console.log(`Middleware: Allowing authenticated user to access ${pathname}`);
    return response;

  } catch (error) {
    console.error(`Middleware session error for ${pathname}:`, error);
    // If session check fails critically, redirect to login for safety
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'session_error'); // Optional: add error query param
    return NextResponse.redirect(loginUrl);
  }
}

export const matcher = ['/((?!_next/static|_next/image|.*\\.\\w+$).*)'];
