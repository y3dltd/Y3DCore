import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';
import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { verifyPassword } from '@/lib/server-only/auth-password'; // We'll reuse the verify function

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
    // Cast the adapter type for compatibility
    adapter: PrismaAdapter(prisma) as any, // Use 'any' temporarily if types clash, refine later if needed
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
                // Return user object (excluding password) required by NextAuth
                // Ensure the returned object matches NextAuth's expected user shape (id, email, name, image)
                return {
                    id: user.id.toString(), // ID must be a string for NextAuth User type
                    email: user.email,
                    name: user.name, // Assuming you have a name field
                    // image: user.image, // Add if you have an image field
                };
            }
        })
    ],
    session: {
        // Using JWT for session strategy for simplicity initially
        // Database strategy is also an option via the adapter
        strategy: 'jwt',
    },
    // Define callbacks if needed (e.g., to add more data to JWT or session)
    // callbacks: {
    //   async jwt({ token, user }) {
    //     // Add custom claims to token
    //     if (user) {
    //       token.id = user.id;
    //       // token.role = user.role; // Example
    //     }
    //     return token;
    //   },
    //   async session({ session, token }) {
    //     // Add custom claims to session object from token
    //     if (token?.id && session.user) {
    //        // NextAuth User type might not have id directly, depends on version/types
    //        (session.user as any).id = token.id;
    //       // (session.user as any).role = token.role; // Example
    //     }
    //     return session;
    //   },
    // },
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

