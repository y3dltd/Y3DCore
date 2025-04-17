/**
 * Centralized style utilities for consistent UI styling
 * 
 * This file collects all style helper functions to avoid duplication
 * across the codebase and maintain consistency.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple class values with Tailwind-specific merging
 * 
 * @param inputs - CSS class values to be combined
 * @returns A string with all classes merged, with Tailwind conflicts resolved
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Creates a type-safe variant configuration for UI components
 * 
 * @param config - Component variant configuration
 * @returns A function to apply variants with proper TypeScript types
 */
export function cva<V extends Record<string, string>>(
  base?: ClassValue,
  variants?: Record<string, Record<string, ClassValue>>
) {
  return function(props?: { variants?: V, className?: string }) {
    const variantClasses = Object.entries(variants || {})
      .flatMap(([variantName, variantOptions]) => {
        const variantValue = props?.variants?.[variantName as keyof V];
        if (variantValue === undefined) return [];
        return variantOptions[variantValue as string] || [];
      });
    
    return cn(base, ...variantClasses, props?.className || '');
  };
}
