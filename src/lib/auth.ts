import { IronSession, IronSessionData, getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { User } from '@prisma/client';

// Augment IronSessionData to include user information
declare module 'iron-session' {
  interface IronSessionData {
    userId?: number;
  }
}

// Define session options
export const sessionOptions = {
  cookieName: 'y3dhub_session',
  password: process.env.SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
};

if (!sessionOptions.password || sessionOptions.password.length < 32) {
  console.error('CRITICAL SECURITY WARNING: SESSION_PASSWORD environment variable is not set or is too short (must be at least 32 characters)!');
}

// Function to get the current session
export async function getSession(): Promise<IronSession<IronSessionData>> {
  const session = await getIronSession<IronSessionData>(cookies(), sessionOptions);
  return session;
}

// Function to get the currently logged-in user
export async function getCurrentUser(): Promise<Omit<User, 'password'> | null> {
  const session = await getSession();
  if (!session.userId) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) {
    session.destroy();
    return null;
  }
  // Exclude password before returning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Password hashing and verification functions have been moved to src/lib/server-only/auth-password.ts
// To hash or verify passwords, import from that file in your Node.js API routes or server actions only.
