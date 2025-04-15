import { IronSession, IronSessionData, getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { compare, hash } from 'bcryptjs';
import { prisma } from './prisma'; // Assuming prisma client is exported from here
import { User } from '@prisma/client';

// Augment IronSessionData to include user information
declare module 'iron-session' {
  interface IronSessionData {
    userId?: number;
  }
}

// Define session options
export const sessionOptions = {
  cookieName: 'y3dhub_session', // Choose a suitable name
  password: process.env.SESSION_PASSWORD as string, // MUST be set in .env, at least 32 characters long
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 60 * 60 * 24 * 7, // Session TTL: 7 days in seconds
  },
};

// Ensure SESSION_PASSWORD is set
if (!sessionOptions.password || sessionOptions.password.length < 32) {
  console.error('CRITICAL SECURITY WARNING: SESSION_PASSWORD environment variable is not set or is too short (must be at least 32 characters)!');
  // In a real app, you might throw an error here to prevent startup
  // throw new Error('SESSION_PASSWORD environment variable is missing or too short.');
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
    // User ID in session but not found in DB (maybe deleted?), clear session
    session.destroy();
    return null;
  }

  // Exclude password before returning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// Function to hash a password
export async function hashPassword(password: string): Promise<string> {
  const hashedPassword = await hash(password, 10); // 10 salt rounds
  return hashedPassword;
}

// Function to verify a password
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const isValid = await compare(password, hashedPassword);
  return isValid;
} 
