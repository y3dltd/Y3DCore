import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { NextRequest } from 'next/server';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely creates a URL object from a NextRequest.
 * @param request The NextRequest object.
 * @returns A URL object if successful, otherwise null.
 */
export function safeGetUrlFromRequest(request: NextRequest): URL | null {
  try {
    if (!request.url) {
      console.error('safeGetUrlFromRequest: request.url is undefined or empty');
      return null;
    }
    return new URL(request.url);
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
  const url = safeGetUrlFromRequest(request);
  return url ? url.searchParams : null;
}
