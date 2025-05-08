import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth'; // Import from lib

import { nextAuthConfig } from '../../../../../next-auth.config';

// Use NextAuth with combined options and configuration that disables middleware
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
