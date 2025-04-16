import JSZip from 'jszip';
import { logger } from '@/lib/shared/logging'; // Updated logger import path

// --- Interfaces for Amazon Customization JSON Structure ---
interface AmazonCustomizationArea {
  customizationType?: string;
  label?: string;
  text?: string; // For TextPrinting
  optionValue?: string; // For Options
}

interface AmazonCustomizationSurface {
  areas?: AmazonCustomizationArea[];
}

interface AmazonCustomizationVersionInfo {
  surfaces?: AmazonCustomizationSurface[];
}

interface AmazonCustomizationInfo {
  'version3.0'?: AmazonCustomizationVersionInfo;
}
// --- End Interfaces ---
export interface AmazonCustomizationResult {
    success: boolean;
    orderItemId: number;
    customizationData?: AmazonCustomizationData;
    error?: string;
}

export interface AmazonCustomizationData {
    customText: string | null;
    color1: string | null;
    color2: string | null;
    allFields: Record<string, string | null>;
    // Replace 'any' with 'unknown' or a more specific type if the structure is known
    rawJsonData?: Record<string, unknown>; // Optionally include the full parsed JSON
}

/**
 * Fetches an Amazon customization zip file, extracts and parses the JSON data.
 * @param url The Amazon CustomizedURL.
 * @returns Extracted personalization data or null if processing fails.
 */
export async function fetchAndProcessAmazonCustomization(url: string): Promise<AmazonCustomizationData | null> {
    logger.info(`[Amazon Processor] Fetching customization data from URL: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }
        if (!response.body) {
            throw new Error('Response body is null');
        }

        const zipBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);

        // Find the JSON file within the zip (assuming only one JSON file)
        const jsonFiles = zip.file(/\.json$/i); // Case-insensitive regex for .json extension
        if (jsonFiles.length === 0) {
            throw new Error('No JSON file found in the zip archive.');
        }
        if (jsonFiles.length > 1) {
            logger.warn(`[Amazon Processor] Multiple JSON files found in zip from ${url}. Using the first one: ${jsonFiles[0].name}`);
        }

        const jsonFile = jsonFiles[0];
        const jsonContent = await jsonFile.async('string');
        const jsonData = JSON.parse(jsonContent) as Record<string, unknown>; // Parse as Record<string, unknown>

        logger.debug(`[Amazon Processor] Raw JSON data from ${jsonFile.name}:\n${JSON.stringify(jsonData, null, 2)}`);

        // --- !!! IMPORTANT: JSON Parsing Logic Needed Here !!! ---
        // This part is highly dependent on the actual structure of the JSON file.
        // You need to inspect the JSON content and write code to extract the
        // correct fields for customText, color1, and color2.
        // Example (assuming a hypothetical structure):
        /*
        const personalization = jsonData?.surfaces?.[0]?.personalization;
        const customText = personalization?.textValue ?? null;
        const color1 = personalization?.colorValue ?? null; // Adjust field names as needed
        const color2 = null; // Determine if secondary color exists
        */

        // --- Start: Specific parsing for customizationInfo v3.0 structure ---
        let customText: string | null = null;
        let color1: string | null = null;
        const color2: string | null = null; // Keep as null for this structure

        try {
            // Use defined interfaces for type safety
            const info = jsonData?.customizationInfo as AmazonCustomizationInfo | undefined; // Cast to our interface
            const surfaces = info?.['version3.0']?.surfaces;

            if (Array.isArray(surfaces) && surfaces.length > 0) {
                const firstSurface = surfaces[0];
                const areas = firstSurface?.areas; // Access areas using optional chaining

                if (Array.isArray(areas)) {
                    // Find areas using the defined types
                    const textArea = areas.find(area => area?.customizationType === 'TextPrinting');
                    const colorArea = areas.find(area => area?.customizationType === 'Options' && area?.label === 'Colour');

                    // Extract text and color using optional chaining
                    if (textArea?.text) {
                        customText = textArea.text;
                    }
                    if (colorArea?.optionValue) {
                        color1 = colorArea.optionValue;
                    }
                }
            }
        } catch (parseError) {
            logger.warn(`[Amazon Processor] Error parsing customizationInfo structure in ${url}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            // Fallback or error handling if structure is different than expected
        }
        // --- End: Specific parsing ---

        // --- Create allFields --- 
        // Iterate over jsonData and convert values to string or null
        const allFields: Record<string, string | null> = {};
        for (const key in jsonData) {
            if (Object.prototype.hasOwnProperty.call(jsonData, key)) {
                const value = jsonData[key];
                allFields[key] = typeof value === 'string' ? value : value === null ? null : String(value);
            }
        }

        if (!customText && !color1) {
            logger.warn(`[Amazon Processor] Could not extract meaningful data from JSON in ${url}. JSON: ${JSON.stringify(jsonData)}`);
            // Decide if this should be an error or just return null/empty data
            // return null; // Or return extracted data even if partial
        }
        // --- End of Placeholder Logic ---

        const extractedData: AmazonCustomizationData = {
            customText,
            color1,
            color2,
            allFields, // Added missing allFields property
            rawJsonData: jsonData, // Include the raw JSON
        };

        logger.info(`[Amazon Processor] Successfully extracted data for ${url}: ${JSON.stringify({ customText, color1, color2 })}`); // Log only extracted fields
        return extractedData;

    } catch (error: unknown) { // Changed any to unknown
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Amazon Processor] Error processing URL ${url}: ${errorMsg}`, { error });
        return null; // Indicate failure
    }
}
