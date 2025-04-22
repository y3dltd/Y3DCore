import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Export the middleware with potential customizations
export default withAuth(
  // `withAuth` augments your `Request` with the `token` object.
  function middleware(_req) {
    // Example: You could potentially add checks here based on req.nextauth.token
    // if (req.nextUrl.pathname.startsWith("/admin") && req.nextauth.token?.role !== "admin")
    //   return NextResponse.rewrite(
    //     new URL("/denied", req.url)
    //   )

    // By default, just proceed if authorized
    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true if the user is authorized, otherwise redirect to login
      authorized: ({ token }) => !!token, // Checks if the JWT token exists (user is logged in)
    },
    // Customize the login page URL if different from default
    pages: {
      signIn: '/login',
    },
  }
);

// Configure which routes are protected by the middleware
export const config = {
  // Match all routes except for:
  // - API routes (handled separately or by NextAuth itself for /api/auth)
  // - _next/static (static files)
  // - _next/image (image optimization files)
  // - favicon.ico
  // - /login page (allow access for login)
  // - Specific public assets (like logo.png, manifest.json, fav/*)
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login|logo.png|manifest.json|fav/).*)',
  ],
};
