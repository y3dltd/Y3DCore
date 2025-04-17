/**
 * Authentication middleware for API routes
 * 
 * Provides consistent authentication handling across API routes
 * to avoid duplicate auth checks and improve security.
 */

import { getIronSession } from 'iron-session';
import { NextApiRequest, NextApiResponse } from 'next';

// Import types directly from the file path to fix module resolution
import { sessionOptions, User } from '../auth/session';

/**
 * Type for Next.js API handlers
 */
export type ApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  user: User
) => Promise<void>;

/**
 * Wraps an API handler with authentication checks
 * 
 * @param handler - The API route handler to protect
 * @returns A wrapped handler that validates authentication before executing
 */
export function withAuth(handler: ApiHandler) {
  return async function(req: NextApiRequest, res: NextApiResponse) {
    const session = await getIronSession(req, res, sessionOptions);
    
    // Check if user is authenticated
    // TypeScript needs the type assertion to recognize our session augmentation
    if (!('user' in session) || !session.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Call the handler with the authenticated user
    try {
      // Type assertion because we've already checked session.user exists
      await handler(req, res, session.user as User);
    } catch (error) {
      console.error('[Auth Middleware]', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}

/**
 * Middleware that only checks if a valid session exists
 * but doesn't require full authentication
 * 
 * @param handler - The API route handler
 * @returns A wrapped handler with session validation
 */
/**
 * Type for handlers that accept a nullable user
 */
export type SessionApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  user: User | null
) => Promise<void>;

/**
 * Middleware that only checks if a valid session exists
 * but doesn't require full authentication
 * 
 * @param handler - The API route handler
 * @returns A wrapped handler with session validation
 */
export function withSession(handler: SessionApiHandler) {
  return async function(req: NextApiRequest, res: NextApiResponse) {
    const session = await getIronSession(req, res, sessionOptions);
    
    try {
      // Type-safe access to session.user with proper null fallback
      await handler(req, res, 'user' in session && session.user ? session.user as User : null);
    } catch (error) {
      console.error('[Session Middleware]', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}
