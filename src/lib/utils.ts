import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { NextResponse } from 'next/server';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely creates a URL object from a request URL string.
 * Handles potential URL validation errors that can occur in Vercel deployments.
 */
export function safeGetUrlFromRequest(request: Request): URL | null {
  try {
    if (!request.url) {
      console.error('Request URL is undefined or empty');
      return null;
    }
    
    return new URL(request.url);
  } catch (error) {
    console.error('Error creating URL from request:', error);
    return null;
  }
}

/**
 * Gets search params from a request, handling potential URL validation errors.
 * Returns null if the URL cannot be created.
 */
export function getSearchParamsFromRequest(request: Request): URLSearchParams | null {
  const url = safeGetUrlFromRequest(request);
  return url ? url.searchParams : null;
}
