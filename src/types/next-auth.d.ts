import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
    /**
     * Returned by `useSession`, `getServerSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        user: {
            /** The user's id. */
            id: string;
        } & DefaultSession['user']; // Combine with default fields like name, email, image
    }

    // If you also added custom fields to the User object returned by the adapter/authorize, declare them here.
    // interface User {
    //   role?: string | null;
    // }
}

// If you added custom fields to the JWT token in the jwt callback, declare them here
declare module 'next-auth/jwt' {
    interface JWT {
        /** OpenID ID Token */
        id?: string;
        // role?: string | null;
    }
} 
