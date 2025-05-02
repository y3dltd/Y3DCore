import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth'; // Import from lib

// Remove local definition and unused imports
// import { PrismaAdapter } from '@auth/prisma-adapter';
// import { PrismaClient } from '@prisma/client';
// import CredentialsProvider from 'next-auth/providers/credentials';
// import { verifyPassword } from '@/lib/server-only/auth-password';

// Remove local prisma client instance if not used elsewhere in this file
// const prisma = new PrismaClient();

// Remove local authOptions definition
// export const authOptions: NextAuthOptions = { ... };

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

