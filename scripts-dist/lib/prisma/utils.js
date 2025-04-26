/**
 * Prisma utility functions and type helpers
 *
 * Provides utilities for working with Prisma types and operations
 */
/**
 * Extracts the string value from a Prisma string field, which could be
 * either a raw string or a Prisma field update operation
 *
 * @param value - The value to extract from (string or update operation)
 * @param defaultValue - Optional default value if the input is null/undefined
 * @returns The extracted string value
 */
export function extractStringValue(value, defaultValue = null) {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    if (typeof value === 'string') {
        return value;
    }
    // Handle Prisma update operations
    if (typeof value === 'object') {
        if ('set' in value) {
            return value.set === undefined ? defaultValue : value.set;
        }
    }
    return defaultValue;
}
/**
 * Type guard to check if a value is a Prisma string update operation
 */
export function isPrismaStringUpdate(value) {
    return value !== null &&
        typeof value === 'object' &&
        ('set' in value || 'unset' in value);
}
/**
 * Ensures a value is a string, handling Prisma update operations
 *
 * @param value - Value to convert
 * @param fallback - Fallback value if conversion fails
 * @returns A string value
 */
export function ensureString(value, fallback = '') {
    const extracted = extractStringValue(value);
    return extracted !== null ? extracted : fallback;
}
/**
 * Extracts the number value from a Prisma number field, which could be
 * either a raw number or a Prisma field update operation
 *
 * @param value - The value to extract from (number or update operation)
 * @param defaultValue - Optional default value if the input is null/undefined
 * @returns The extracted number value
 */
export function extractNumberValue(value, defaultValue = null) {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    if (typeof value === 'number') {
        return value;
    }
    // Handle Prisma update operations
    if (typeof value === 'object') {
        if ('set' in value) {
            return typeof value.set === 'number' ? value.set : defaultValue;
        }
        if ('increment' in value && 'increment' in value) {
            return typeof value.increment === 'number' ? value.increment : defaultValue;
        }
    }
    return defaultValue;
}
/**
 * Convert a value to a proper string, handling various input types
 *
 * @param value - The value to convert
 * @returns A string representation of the value
 */
export function convertToString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number') {
        return value.toString();
    }
    if (typeof value === 'object' && value !== null) {
        // Use the specific type guard
        const potentialSet = value;
        if ('set' in potentialSet && potentialSet.set !== undefined) {
            return convertToString(potentialSet.set);
        }
    }
    return String(value);
}
