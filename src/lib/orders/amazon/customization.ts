import JSZip from 'jszip';
import { logger } from '@/lib/shared/logging'; // Updated logger import path

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

        // Placeholder extraction - REPLACE WITH ACTUAL LOGIC
        // Safely access properties, assuming they might be strings or null
        const customText = typeof jsonData?.customText === 'string' ? jsonData.customText : typeof jsonData?.name === 'string' ? jsonData.name : null;
        const color1 = typeof jsonData?.color1 === 'string' ? jsonData.color1 : typeof jsonData?.colour === 'string' ? jsonData.colour : null;
        const color2 = typeof jsonData?.color2 === 'string' ? jsonData.color2 : null;

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
