export const productNameMappings: Record<string, string> = {};

export function simplifyProductName(
  productName: string,
  mappings: Record<string, string>
): string {
  // Basic placeholder implementation - can be expanded later
  for (const key in mappings) {
    if (productName.includes(key)) {
      return mappings[key];
    }
  }
  return productName; // Return original name if no mapping found
}
