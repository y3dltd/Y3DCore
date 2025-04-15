/**
 * src/lib/formatting.ts
 * Utility functions for formatting data for display.
 */

// Simple map for known carrier codes
const carrierCodeMap: Record<string, string> = {
    royal_mail: 'Royal Mail',
    // Add other carriers as needed, e.g.:
    // fedex: 'FedEx',
    // usps: 'USPS',
}

export function formatCarrierCode(code: string | null | undefined): string {
    if (!code) return 'N/A'
    return carrierCodeMap[code.toLowerCase()] || code // Return original code if not found
}

// Simple map for known service codes
const serviceCodeMap: Record<string, string> = {
    rm_1st_class: 'Royal Mail 1st Class',
    rm_2nd_class: 'Royal Mail 2nd Class',
    uk_royalmailsecondclassstandard: 'Royal Mail 2nd Class Standard', // Handle longer codes
    // Add others
}

export function formatServiceCode(code: string | null | undefined): string {
    if (!code) return 'N/A'
    const lowerCode = code.toLowerCase().replace(/_/g, '') // Normalize by lowercasing and removing underscores

    // Find a matching key (case-insensitive, underscore-insensitive)
    const mapKey = Object.keys(serviceCodeMap).find(key => key.replace(/_/g, '') === lowerCode)
    return mapKey ? serviceCodeMap[mapKey] : code // Return original if no match
}

// Simple map for known package codes
const packageCodeMap: Record<string, string> = {
    package: 'Package',
    large_envelope_or_flat: 'Large Envelope/Flat',
    letter: 'Letter',
    large_letter: 'Large Letter',
    thick_envelope: 'Thick Envelope',
    // Add others
}

export function formatPackageCode(code: string | null | undefined): string {
    if (!code) return 'N/A'
    return packageCodeMap[code.toLowerCase()] || code
}

// Simple map for confirmation types
const confirmationMap: Record<string, string> = {
    none: 'Not Required',
    delivery: 'Delivery Confirmation',
    signature: 'Signature Confirmation',
    adult_signature: 'Adult Signature Required',
    // Add others
}

export function formatConfirmation(code: string | null | undefined): string {
    if (!code) return 'N/A'
    return confirmationMap[code.toLowerCase()] || code
}

// Format boolean as Yes/No/N/A
export function formatBooleanYN(value: boolean | null | undefined): string {
    if (value === null || typeof value === 'undefined') return 'N/A'
    return value ? 'Yes' : 'No'
}

// --- Warehouse Formatting ---
const warehouseMap: Record<string, string> = {
    '251153': 'Warehouse 1',
    // Add other warehouse IDs and names as needed
}

export function formatWarehouseId(id: string | number | null | undefined): string {
    if (id === null || typeof id === 'undefined') return 'N/A'
    const idStr = String(id)
    return warehouseMap[idStr] || `ID: ${idStr}` // Show original ID if not mapped
}

// --- Country Code Formatting ---
// (Add more common codes as needed)
const countryCodeMap: Record<string, string> = {
    GB: 'United Kingdom',
    US: 'United States',
    CA: 'Canada',
    AU: 'Australia',
    DE: 'Germany',
    FR: 'France',
    // ... add more mappings
}

export function formatCountryCode(code: string | null | undefined): string {
    if (!code) return 'N/A'
    const upperCode = code.toUpperCase()
    return countryCodeMap[upperCode] || upperCode // Return original code if not mapped
} 
