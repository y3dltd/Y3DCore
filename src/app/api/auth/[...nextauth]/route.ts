import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { verifyPassword } from '@/lib/server-only/auth-password'; // We'll reuse the verify function

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
    // Remove adapter type cast
    adapter: PrismaAdapter(prisma),
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: "Email", type: "email", placeholder: "jsmith@example.com" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) {
                    console.log('Auth: Missing credentials');
                    return null; // Indicate failure
                }

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email },
                    // select: { id: true, email: true, password: true, name: true, image: true } // Revert select
                });

                if (!user) {
                    console.log(`Auth: No user found for email ${credentials.email}`);
                    return null; // User not found
                }

                // Verify password using the existing function
                const isValid = await verifyPassword(credentials.password, user.password);

                if (!isValid) {
                    console.log(`Auth: Invalid password for email ${credentials.email}`);
                    return null; // Password invalid
                }

                console.log(`Auth: User ${user.email} authorized successfully`);
                // Return only core fields guaranteed to exist
                return {
                    id: user.id.toString(),
                    email: user.email,
                };
            }
        })
    ],
    session: {
        // Using JWT for session strategy for simplicity initially
        // Database strategy is also an option via the adapter
        strategy: 'jwt',
    },
    // Define callbacks to add user ID to session and token
    callbacks: {
        async jwt({ token, user }) {
            // Add user ID to token on sign-in
            if (user) {
                token.id = user.id; // user.id is available during sign-in
            }
            return token;
        },
        async session({ session, token }) {
            // Add user ID to session object from token
            if (token?.id && session.user) {
                // Add id to the session user object
                (session.user as { id: string } & typeof session.user).id = token.id as string;
            }
            return session;
        },
    },
    // Add secret for JWT signing
    secret: process.env.NEXTAUTH_SECRET,

    // Add pages configuration if using custom login page
    pages: {
        signIn: '/login',
        // error: '/auth/error', // Optional custom error page
    },

    // Enable debug messages in development
    debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

