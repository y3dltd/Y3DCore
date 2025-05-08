// This file can be used for shared authentication utilities or constants if needed.
// For now, it's minimal after removing mock auth.

// Password hashing functions are imported directly where needed or from:
// src/lib/server-only/auth-password.ts

// Example: Exporting authOptions if needed elsewhere (though often imported directly)
// export { authOptions } from '@/app/api/auth/[...nextauth]/route';

import { PrismaAdapter } from '@auth/prisma-adapter';
import { NextAuthOptions } from 'next-auth';
import { default as CredentialsProvider } from 'next-auth/providers/credentials';

import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/server-only/auth-password';

import type { RequestInternal } from 'next-auth';

// Ensure we're using the validated prisma instance from lib/prisma

// Define Auth.js options centrally
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "jsmith@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials: Record<"email" | "password", string> | undefined, 
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
        _req: Pick<RequestInternal, "query" | "body" | "headers" | "method">): Promise<{ id: string; email: string | null } | null> {
        if (!credentials?.email || !credentials.password) {
          console.log('Auth: Missing credentials');
          return null;
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) {
          console.log(`Auth: No user found for email ${credentials.email}`);
          return null;
        }
        const isValid = await verifyPassword(credentials.password, user.password);
        if (!isValid) {
          console.log(`Auth: Invalid password for email ${credentials.email}`);
          return null;
        }
        console.log(`Auth: User ${user.email} authorized successfully`);
        return {
          id: user.id.toString(),
          email: user.email,
        };
      }
    })
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }): Promise<any> {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }): Promise<any> {
      if (token?.id && session.user) {
        (session.user as { id: string } & typeof session.user).id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
};

// Other potential shared auth utilities could go here
