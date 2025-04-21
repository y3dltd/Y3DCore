import { User } from '@prisma/client';
// Remove iron-session imports
// import type { SessionOptions } from 'iron-session';
// import { IronSession, IronSessionData, getIronSession } from 'iron-session';
// import { cookies } from 'next/headers';

import { prisma } from './prisma';

// Remove session data augmentation
// declare module 'iron-session' { ... }

// Remove session options logic
// let memoizedSessionOptions: ReturnType<typeof buildSessionOptions> | null = null;
// function buildSessionOptions() { ... }
// export function getSessionOptions() { ... }
// export const sessionOptions: SessionOptions = new Proxy(...);

// Remove getSession function
// export async function getSession(): Promise<IronSession<IronSessionData>> { ... }

// Mock getCurrentUser function
// Returns a hardcoded user (ID 1) from the database.
export async function getCurrentUser(): Promise<Omit<User, 'password'> | null> {
  try {
    const defaultUserId = 1;
    const user = await prisma.user.findUnique({ where: { id: defaultUserId } });
    if (!user) {
      console.error(`[Mock getCurrentUser] Default user with ID ${defaultUserId} not found.`);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    console.log('[Mock getCurrentUser] Returning default user:', userWithoutPassword.email);
    return userWithoutPassword;

  } catch (err: unknown) {
    console.error(
      '[Mock getCurrentUser] Error retrieving default user:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// Password hashing functions are still needed for user management
// See: src/lib/server-only/auth-password.ts
