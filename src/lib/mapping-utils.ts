import { format , isToday, isTomorrow, isYesterday } from 'date-fns';

/**
 * Helper function to format dates in a relative way
 */
export function formatRelativeDate(date: Date | null): string {
  if (!date) return 'N/A';
  date = new Date(date);
  if (isToday(date)) return `Today ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
  if (isTomorrow(date)) return `Tomorrow ${format(date, 'HH:mm')}`;
  return format(date, 'dd MMM');
}

// --- Shipping Name Mapping ---
const shippingMapping: Record<string, string> = {
  // Next Day and Special Delivery
  'NextDay UK Next': 'Special Delivery',
  'Next Day': 'Special Delivery',
  NextDay: 'Special Delivery',
  'Next Day UK': 'Special Delivery',

  // International
  UK_RoyalMailAirmailInternational: 'International',
  'International Tracked – 3-5 Working Days Delivery': 'International Tracked',

  // Standard
  UK_RoyalMailSecondClassStandard: 'Standard',
  UK_RoyalMail48: 'Standard',
  'Standard Std UK Dom_1': 'Standard',
  'Standard Std UK Dom_2': 'Standard',
  'Standard Std UK Dom_3': 'Standard',

  // Tracked
  'SecondDay UK Second': 'Tracked24',
  '2-Day Shipping – 1-2 Working Days Delivery': 'Tracked24',
  'Tracked 24': 'Tracked24',
  UK_RoyalMail1stClassLetterLargeLetter: '1st Class',
};

/**
 * Helper function to get a standardized shipping alias
 */
export function getShippingAlias(originalName?: string | null): string {
  if (!originalName) {
    return 'N/A'; // Handle null or undefined
  }
  return shippingMapping[originalName] || originalName; // Return alias or original if no match
}

// --- Marketplace Name Mapping ---
const marketplaceMapping: Record<string, string> = {
  ebay_v2: 'eBay', // Keep keys lowercase
  amazon: 'Amazon',
  etsy: 'Etsy',
  web: 'Shopify',
};

/**
 * Helper function to get a standardized marketplace alias
 */
export function getMarketplaceAlias(originalName?: string | null): string {
  if (!originalName) {
    return 'N/A'; // Handle null or undefined
  }
  // Convert input to lowercase AND trim whitespace
  const lowerCaseName = originalName.toLowerCase().trim();
  // Lookup using lowercase key, return display alias or original name if no match
  return marketplaceMapping[lowerCaseName] || originalName;
}

// Marketplace Styles (Keys should match the *output* of getMarketplaceAlias, e.g., "eBay")
export const marketplaceStyles: Record<string, { bg: string; text: string }> = {
  Shopify: { bg: 'bg-green-600', text: 'text-white' },
  Amazon: { bg: 'bg-yellow-600', text: 'text-white' },
  eBay: { bg: 'bg-red-600', text: 'text-white' },
  Etsy: { bg: 'bg-orange-600', text: 'text-white' },
  'N/A': { bg: 'bg-gray-500', text: 'text-white' }, // Default/Unknown
};

// Color mapping 
export const colorMapInternal: { [key: string]: { bg: string; textColor: string } } = {
  black: { bg: 'bg-black', textColor: 'text-white' },
  grey: { bg: 'bg-gray-400', textColor: 'text-white' },
  gray: { bg: 'bg-gray-400', textColor: 'text-white' },
  'light blue': { bg: 'bg-blue-400', textColor: 'text-white' }, // Lighter blue
  blue: { bg: 'bg-blue-500', textColor: 'text-white' },
  'dark blue': { bg: 'bg-blue-900', textColor: 'text-white' }, // Darker blue
  brown: { bg: 'bg-yellow-800', textColor: 'text-white' },
  orange: { bg: 'bg-orange-500', textColor: 'text-white' },
  'matt orange': { bg: 'bg-orange-600', textColor: 'text-white' },
  'orange-red': { bg: 'bg-orange-700', textColor: 'text-white' },
  red: { bg: 'bg-red-600', textColor: 'text-white' },
  'matt red': { bg: 'bg-red-700', textColor: 'text-white' },
  magenta: { bg: 'bg-fuchsia-700', textColor: 'text-white' },
  white: { bg: 'bg-white', textColor: 'text-black' },
  'cold white': {
    bg: 'bg-slate-50 border border-gray-300',
    textColor: 'text-black',
  },
  yellow: { bg: 'bg-yellow-400', textColor: 'text-black' },
  silver: { bg: 'bg-gray-300', textColor: 'text-black' },
  'silk silver': { bg: 'bg-gray-200', textColor: 'text-black' },
  purple: { bg: 'bg-purple-500', textColor: 'text-white' },
  pink: { bg: 'bg-pink-400', textColor: 'text-white' },
  'matt pink': { bg: 'bg-pink-500', textColor: 'text-white' },
  'silk pink': { bg: 'bg-pink-300', textColor: 'text-black' },
  gold: { bg: 'bg-yellow-500', textColor: 'text-black' },
  skin: { bg: 'bg-orange-200', textColor: 'text-black' },
  'peak green': { bg: 'bg-green-400', textColor: 'text-white' }, // Lighter green
  green: { bg: 'bg-green-500', textColor: 'text-white' },
  'olive green': { bg: 'bg-green-700', textColor: 'text-white' },
  'pine green': { bg: 'bg-green-800', textColor: 'text-white' },
  'glow in the dark': { bg: 'bg-lime-300', textColor: 'text-black' },
  bronze: { bg: 'bg-amber-700', textColor: 'text-white' },
  beige: { bg: 'bg-amber-100', textColor: 'text-black' },
  turquoise: { bg: 'bg-teal-400', textColor: 'text-black' },
};

/**
 * Helper to get Tailwind classes for color
 */
export function getColorInfo(
  colorName: string | null | undefined
): { bgClass: string; textClass: string } {
  if (!colorName) {
    return {
      bgClass: 'bg-gray-200',
      textClass: 'text-gray-700',
    };
  }

  const colorKey = colorName.toLowerCase();
  const colorInfo = colorMapInternal[colorKey];

  if (colorInfo) {
    return {
      bgClass: colorInfo.bg,
      textClass: colorInfo.textColor,
    };
  }

  // Default values for colors not in the map
  return {
    bgClass: 'bg-gray-200',
    textClass: 'text-gray-700',
  };
}
