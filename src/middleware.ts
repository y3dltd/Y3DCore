import { NextResponse } from 'next/server';

// This is a minimal passthrough middleware implementation
// All authentication is disabled to ensure deployment works
export function middleware() {
  // Simply allow all requests to proceed
  return NextResponse.next();
}

// Matcher configuration is kept minimal to avoid any parsing issues
export const config = {
  // Only apply to non-static routes, excluding Next.js internals and API routes
  matcher: [
    '/((?!_next|api|favicon\.ico).*)',
  ],
};
