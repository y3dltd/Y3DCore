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
export async function getCurrentUser(): Promise<Omit<User, 'password'> | null> {
  try {
    // Return a hardcoded mock user or a user from DB without session check
    // Option 1: Hardcoded mock user
    // const mockUser = {
    //   id: 1,
    //   email: 'mock@example.com',
    //   name: 'Mock User',
    //   // ... other necessary fields
    // };
    // return mockUser;

    // Option 2: Fetch a default user (e.g., admin user ID 1) from DB
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

// Password hashing functions are still needed for user management (PATCH /api/users/[userId])
// Keep them in src/lib/server-only/auth-password.ts
