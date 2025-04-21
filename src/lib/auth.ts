import { User } from '@prisma/client';
import type { SessionOptions } from 'iron-session';
import { IronSession, IronSessionData, getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

import { prisma } from './prisma';

// Augment IronSessionData to include user information
declare module 'iron-session' {
  interface IronSessionData {
    userId?: number;
  }
}

// Lazily create and validate session options only when first needed.
let memoizedSessionOptions: ReturnType<typeof buildSessionOptions> | null = null;

function buildSessionOptions() {
  const password = process.env.SESSION_PASSWORD;

  if (!password || password.length < 32) {
    console.error(
      'CRITICAL SECURITY ERROR: SESSION_PASSWORD environment variable is not set or is too short (must be at least 32 characters)!'
    );
    if (process.env.NODE_ENV === 'production')
      throw new Error('Invalid SESSION_PASSWORD. Server startup aborted for security reasons.');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  // Determine cookie domain: Use env var if set, otherwise null (browser default)
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  return {
    cookieName: 'y3dhub_session',
    password: password ?? 'development_fallback_password_change_me_please',
    cookieOptions: {
      secure: isProduction, // Secure should be true in production/preview
      maxAge: 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      // Use 'none' only for production with a custom domain specified
      // Use 'lax' for development and Vercel previews (where domain is usually undefined)
      sameSite: (isProduction && cookieDomain) ? 'none' as const : 'lax' as const,
      path: '/',
      domain: cookieDomain,
    },
  } as const;
}

export function getSessionOptions() {
  if (!memoizedSessionOptions) memoizedSessionOptions = buildSessionOptions();
  return memoizedSessionOptions;
}

// Legacy lazy proxy: evaluates only on first property access, preventing build‑time execution
export const sessionOptions: SessionOptions = new Proxy({} as SessionOptions, {
  get(_target, prop) {
    return (getSessionOptions() as unknown as Record<PropertyKey, unknown>)[
      prop as PropertyKey
    ];
  },
  set(_target, prop, value) {
    // Allow consumers to mutate options if they really want to
    (getSessionOptions() as unknown as Record<PropertyKey, unknown>)[
      prop as PropertyKey
    ] = value;
    return true;
  },
});

// Function to get the current session
export async function getSession(): Promise<IronSession<IronSessionData>> {
  const session = await getIronSession<IronSessionData>(cookies(), getSessionOptions());
  return session;
}

// Function to get the currently logged-in user
export async function getCurrentUser(): Promise<Omit<User, 'password'> | null> {
  try {
    const session = await getSession();
    const userId = session.userId;
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    // Exclude password before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (err: unknown) {
    console.error(
      '[getCurrentUser] Error retrieving user session:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// Password hashing and verification functions have been moved to src/lib/server-only/auth-password.ts
// To hash or verify passwords, import from that file in your Node.js API routes or server actions only.
