import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

// Export the middleware with potential customizations
export default withAuth(
  // `withAuth` augments your `Request` with the `token` object.
  function middleware(/* _ */ _req) {
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
  // - API routes
  // - _next/static & _next/image
  // - /login page
  // - /favicon.ico
  // - Paths ending with common static file extensions
  matcher: [
    // Exclude API routes, Next.js internals, login page, favicon.ico, and paths with file extensions
    '/((?!api|_next/static|_next/image|login|favicon\.ico|.*\.(?:png|jpg|jpeg|gif|svg|xml|json)$).*)',
    // Note: Explicitly excluded favicon.ico and removed .ico from the general extension pattern.
  ],
};
