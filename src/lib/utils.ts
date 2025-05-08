import { clsx, type ClassValue } from 'clsx';
import { NextRequest } from 'next/server';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Safely creates a URL object from a NextRequest.
 * @param request The NextRequest object.
 * @returns A URL object if successful, otherwise null.
 */
export function safeGetUrlFromRequest(request: NextRequest): URL | null {
  try {
    // If nextUrl is available (Next.js provides an absolute URL), prefer it
    if (request.nextUrl) {
      return request.nextUrl; // NextURL extends URL
    }

    const rawUrl = request.url;
    if (!rawUrl) {
      console.error('safeGetUrlFromRequest: request.url is undefined or empty');
      return null;
    }

    // Handle relative URLs (e.g. "/") by providing a base
    if (rawUrl.startsWith('/')) {
      const envBase =
        process.env.NEXTAUTH_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
        'http://localhost';
      return new URL(rawUrl, envBase);
    }

    // Fallback for absolute URLs
    return new URL(rawUrl);
  } catch (error) {
    console.error('safeGetUrlFromRequest: Error creating URL from request:', request.url, error);
    return null;
  }
}

/**
 * Safely extracts URLSearchParams from a NextRequest.
 * @param request The NextRequest object.
 * @returns URLSearchParams if successful, otherwise null.
 */
export function getSearchParamsFromRequest(request: NextRequest): URLSearchParams | null {
  // Use nextUrl.searchParams if available for efficiency
  if (request.nextUrl) {
    return request.nextUrl.searchParams;
  }
  const url = safeGetUrlFromRequest(request);
  return url ? url.searchParams : null;
}
