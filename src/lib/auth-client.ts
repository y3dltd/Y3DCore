/**
 * Client-side authentication utilities
 * 
 * This file contains authentication-related functions that can be used in client components.
 * Do not import server-only code here.
 */

// Session cookie name - must match the one in auth.ts
const SESSION_COOKIE_NAME = 'y3dhub_session';

/**
 * Basic user interface for client-side usage
 */
export interface UserData {
    id: number;
    email: string;
    name?: string;
    role?: string;
    [key: string]: unknown; // Allow for additional properties
}

/**
 * Client-side function to detect if user is likely logged in
 * This is a simple check and doesn't validate the session, just checks if the session cookie exists
 * 
 * @returns boolean indicating if the session cookie is present
 */
export function hasSessionCookie(): boolean {
    if (typeof window === 'undefined') return false;

    const cookies = document.cookie.split(';');

    // Look for our session cookie
    return cookies.some(cookie => cookie.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}

/**
 * Check if user is authenticated by making a request to the auth API
 * More reliable than hasSessionCookie but requires a network request
 * 
 * @returns Promise resolving to authenticated status and user data if available
 */
export async function checkAuthStatus(): Promise<{ isAuthenticated: boolean; userData?: UserData }> {
    try {
        const response = await fetch('/api/auth/user', {
            credentials: 'include',
        });

        if (response.ok) {
            const userData = await response.json() as UserData;
            return { isAuthenticated: true, userData };
        }

        return { isAuthenticated: false };
    } catch (error) {
        console.error('Error checking authentication status:', error);
        return { isAuthenticated: false };
    }
} 
