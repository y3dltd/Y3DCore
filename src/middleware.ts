import { getIronSession, IronSessionData } from 'iron-session';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { sessionOptions } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Skip authentication for public assets and auth-related routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('manifest.json') ||
    pathname.startsWith('/fav/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico')
  ) {
    return response;
  }

  try {
    const session = await getIronSession<IronSessionData>(request, response, sessionOptions);
    const { userId } = session;

    console.log(`Middleware processing request for: ${pathname}, UserID: ${userId || 'None'}`);

    if (!userId) {
      // Only redirect to login for HTML pages, not for API routes
      if (!pathname.startsWith('/api/')) {
        console.log(`Middleware: Redirecting unauthenticated user from ${pathname} to /login`);
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      } else {
        // For API routes, return 401 instead of redirecting
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
    }

    if (userId && pathname.startsWith('/login')) {
      console.log('Middleware: Redirecting logged-in user from /login to /');
      return NextResponse.redirect(new URL('/', request.url));
    }

    return response;
  } catch (error) {
    console.error(`Middleware error for ${pathname}:`, error);

    // If there's an error with session handling, allow the request to continue
    // for API endpoints but redirect to login for UI pages
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ message: 'Session error' }, { status: 401 });
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
}

export const config = {
  // Update matcher to exclude static assets, API routes (except auth), and specific files
  matcher: [
    // Exclude specific files and directories
    '/((?!_next/static|_next/image|favicon\.ico|fav/favicon\.ico|manifest\.json|logo\.png|fav/).*)',
    // Exclude common image/asset file extensions - adjust if needed
    '/((?!.*\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
