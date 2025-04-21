import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// import { getIronSession, IronSessionData } from 'iron-session';
// import { sessionOptions } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  // const session = await getIronSession<IronSessionData>(request, response, sessionOptions);

  // const { userId } = session;
  const { pathname } = request.nextUrl;
  const userId = 1; // Mock user ID

  console.log(`Mock Middleware processing request for: ${pathname}, MockUserID: ${userId}`);

  // Remove all redirection logic based on auth
  // if (
  //   pathname.startsWith('/_next') ||
  //   pathname.startsWith('/favicon.ico') ||
  //   pathname.startsWith('/login') ||
  //   pathname.startsWith('/api/auth')
  // ) {
  //   if (userId && pathname.startsWith('/login')) {
  //     console.log('Middleware: Redirecting logged-in user from /login to /');
  //     return NextResponse.redirect(new URL('/', request.url));
  //   }
  //   return response;
  // }

  // if (!userId) {
  //   console.log(`Middleware: Redirecting unauthenticated user from ${pathname} to /login`);
  //   const loginUrl = new URL('/login', request.url);
  //   return NextResponse.redirect(loginUrl);
  // }

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
