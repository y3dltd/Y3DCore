/**
 * Session configuration for iron-session
 * 
 * Provides centralized configuration for authentication sessions
 */

import { SessionOptions } from 'iron-session';

// Define User type for session
export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

// Augment the iron-session types to include our User
declare module 'iron-session' {
  interface IronSessionData {
    user?: User;
  }
}

/**
 * Session configuration options
 * 
 * @remarks Requires SESSION_PASSWORD to be at least 32 characters
 */
export const sessionOptions: SessionOptions = {
  cookieName: 'y3dhub_session',
  password: process.env.SESSION_PASSWORD as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Validates that the session password meets security requirements
 * 
 * @throws Error if running in production with an invalid password
 */
export function validateSessionPassword(): void {
  if (!sessionOptions.password || typeof sessionOptions.password === 'string' && sessionOptions.password.length < 32) {
    console.error(
      'CRITICAL SECURITY ERROR: SESSION_PASSWORD environment variable is not set or is too short (must be at least 32 characters)!'
    );
    // Fail hard instead of just logging
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid SESSION_PASSWORD. Server startup aborted for security reasons.');
    }
  }
}

// Validate password on module load
validateSessionPassword();
