/**
 * Marketplace order number patterns for validation and detection
 */
export const MARKETPLACE_PATTERNS = {
  // Amazon order numbers (e.g., 202-3558314-1389920, D01-1234567-1234567)
  amazon: /^\\d{3}-\\d{7}-\\d{7}$|^[A-Z]\\d{2}-\\d{7}-\\d{7}$/,

  // eBay order numbers (e.g., 27-11068-77489, 03-09876-54321)
  ebay: /^\\d{2}-\\d{5}-\\d{5}$/,

  // Etsy order numbers (e.g., 2345678901)
  etsy: /^\\d{10}$/,

  // Shopify order numbers (e.g., #1001, 1002)
  shopify: /^#?\\d{4,}$/,
};

/**
 * Detects if a string is likely a marketplace order number based on format patterns
 * @param input - The string to check
 * @returns Object with isMarketplaceNumber flag and marketplace type if detected
 */
export function detectMarketplaceOrderNumber(input: string): {
  isMarketplaceNumber: boolean;
  marketplace?: string;
  pattern?: RegExp;
} {
  // Check each marketplace pattern
  for (const [marketplace, pattern] of Object.entries(MARKETPLACE_PATTERNS)) {
    if (pattern.test(input)) {
      return {
        isMarketplaceNumber: true,
        marketplace,
        pattern,
      };
    }
  }

  // Generic hyphenated format check as fallback
  if (input.includes('-') && /^[\\w\\d]+-[\\w\\d]+-?[\\w\\d]*$/.test(input)) {
    return {
      isMarketplaceNumber: true,
      marketplace: 'unknown',
    };
  }

  return { isMarketplaceNumber: false };
}
