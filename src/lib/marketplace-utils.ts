import { cn } from './utils';

// Marketplace types with both display name and color information
export type MarketplaceInfo = {
  displayName: string;
  badgeColor: string;
  textColor: string;
  bgColor: string;
};

// Marketplace map with standardized formatting
export const MARKETPLACE_DISPLAY: Record<string, MarketplaceInfo> = {
  amazon: {
    displayName: 'Amazon',
    badgeColor: 'bg-blue-500',
    textColor: 'text-white',
    bgColor: 'bg-blue-100'
  },
  ebay: {
    displayName: 'eBay',
    badgeColor: 'bg-yellow-500',
    textColor: 'text-white',
    bgColor: 'bg-yellow-100'
  },
  ebay_v2: {
    displayName: 'eBay',
    badgeColor: 'bg-yellow-500',
    textColor: 'text-white',
    bgColor: 'bg-yellow-100'
  },
  etsy: {
    displayName: 'Etsy',
    badgeColor: 'bg-orange-400',
    textColor: 'text-white',
    bgColor: 'bg-orange-100'
  },
  web: {
    displayName: 'Shopify',
    badgeColor: 'bg-green-600',
    textColor: 'text-white',
    bgColor: 'bg-green-100'
  },
  tiktok: {
    displayName: 'TikTok',
    badgeColor: 'bg-violet-600',
    textColor: 'text-white',
    bgColor: 'bg-violet-100'
  },
  unknown: {
    displayName: 'Manual',
    badgeColor: 'bg-gray-500',
    textColor: 'text-white',
    bgColor: 'bg-gray-100'
  }
};

/**
 * Formats a marketplace name for display, converting from API format to user-friendly format
 * 
 * @param marketplace - The marketplace identifier from the API (e.g., 'amazon', 'ebay_v2')
 * @param includePrefix - Whether to include "via" prefix (e.g., "via Amazon")
 * @returns The formatted marketplace name (e.g., 'Amazon', 'eBay', 'Shopify')
 */
export function formatMarketplaceName(marketplace: string | null | undefined, includePrefix = false): string {
  if (!marketplace) return 'Unknown';
  
  const info = MARKETPLACE_DISPLAY[marketplace.toLowerCase()] || MARKETPLACE_DISPLAY.unknown;
  return includePrefix ? `via ${info.displayName}` : info.displayName;
}
