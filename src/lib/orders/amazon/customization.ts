import JSZip from 'jszip';
import { logger } from '@/lib/shared/logging'; // Updated logger import path

// --- Interfaces for Amazon Customization JSON Structure ---
interface AmazonCustomizationArea {
    customizationType?: string;
    label?: string;
    name?: string; // Add name property
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

// Additional interfaces for nested structure in customizationData
interface AmazonNestedCustomization {
    type?: string;
    name?: string;
    label?: string;
    text?: string;
    inputValue?: string;
    displayValue?: string;
    optionValue?: string;
    optionSelection?: {
        name?: string;
        label?: string;
        additionalCost?: {
            amount?: number;
        };
    };
    children?: AmazonNestedCustomization[];
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

        // --- Start: Specific parsing for customizationInfo v3.0 structure ---
        let customText: string | null = null;
        let color1: string | null = null;
        let color2: string | null = null;

        try {
            // Use defined interfaces for type safety
            const info = jsonData?.customizationInfo as AmazonCustomizationInfo | undefined;
            const surfaces = info?.['version3.0']?.surfaces;

            if (Array.isArray(surfaces) && surfaces.length > 0) {
                const firstSurface = surfaces[0];
                const areas = firstSurface?.areas;

                if (Array.isArray(areas)) {
                    logger.debug(`[Amazon Processor] Found ${areas.length} customization areas`);

                    // Log all areas to help with debugging
                    areas.forEach((area, index) => {
                        logger.debug(`[Amazon Processor] Area ${index}: type=${area?.customizationType}, label=${area?.label}, name=${area?.name}, optionValue=${area?.optionValue}, text=${area?.text}`);
                    });

                    // Find text areas - usually "TextPrinting" or has "Text" in label
                    const textAreas = areas.filter(area =>
                        area?.customizationType === 'TextPrinting' ||
                        (area?.label && area.label.toLowerCase().includes('text')) ||
                        (area?.name && area.name.toLowerCase().includes('text'))
                    );

                    // Find color areas - multiple strategies
                    const colorAreas = areas.filter(area =>
                        area?.customizationType === 'Options' && (
                            // Look for "Colour" or "Color" in label or name
                            (area?.label && (
                                area.label.toLowerCase().includes('colour') ||
                                area.label.toLowerCase().includes('color')
                            )) ||
                            (area?.name && (
                                area.name.toLowerCase().includes('colour') ||
                                area.name.toLowerCase().includes('color')
                            ))
                        )
                    );

                    // Extract text - use first text area found
                    if (textAreas.length > 0) {
                        const firstTextArea = textAreas[0];
                        customText = firstTextArea.text || null;
                    }

                    // Sort color areas by priority:
                    // 1. First check for explicitly numbered colors (Color 1, Color 2)
                    // 2. Then assign remaining colors in order found

                    // Temporary storage for color data
                    const colorValues: string[] = [];

                    // First pass: look for numbered colors
                    let color1Found = false;
                    let color2Found = false;

                    colorAreas.forEach(area => {
                        const areaText = [area?.label || '', area?.name || ''].join(' ').toLowerCase();

                        // Check for Color/Colour 1
                        if (!color1Found && (
                            areaText.includes('colour 1') ||
                            areaText.includes('color 1') ||
                            areaText.includes('colour1') ||
                            areaText.includes('color1') ||
                            areaText.includes('base colour') ||
                            areaText.includes('base color') ||
                            areaText.includes('background')
                        )) {
                            color1 = area.optionValue || null;
                            color1Found = true;
                        }
                        // Check for Color/Colour 2
                        else if (!color2Found && (
                            areaText.includes('colour 2') ||
                            areaText.includes('color 2') ||
                            areaText.includes('colour2') ||
                            areaText.includes('color2') ||
                            areaText.includes('text colour') ||
                            areaText.includes('text color')
                        )) {
                            color2 = area.optionValue || null;
                            color2Found = true;
                        }
                        // Store other color values we find
                        else if (area.optionValue) {
                            colorValues.push(area.optionValue);
                        }
                    });

                    // Second pass: assign any remaining colors in order
                    if (!color1Found && colorValues.length > 0) {
                        color1 = colorValues.shift() || null;
                    }

                    if (!color2Found && colorValues.length > 0) {
                        color2 = colorValues.shift() || null;
                    }

                    // Special case: if there's a single color area with just "Colour" or "Color"
                    if (!color1Found && !color2Found && colorAreas.length === 1) {
                        const singleColor = colorAreas[0].optionValue || null;
                        color1 = singleColor; // Assign to color1 by default
                    }

                    logger.debug(`[Amazon Processor] Found text areas: ${textAreas.length}, color areas: ${colorAreas.length}`);
                    logger.debug(`[Amazon Processor] Extracted data: customText=${customText}, color1=${color1}, color2=${color2}`);
                }
            }
        } catch (parseError) {
            logger.warn(`[Amazon Processor] Error parsing customizationInfo structure in ${url}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
            // Fallback to other structure formats if needed
        }

        // --- Fallback: Look in customizationData structure if needed ---
        if (!customText || (!color1 && !color2)) {
            try {
                logger.debug(`[Amazon Processor] Attempting fallback parser with customizationData structure`);

                const customizationData = jsonData?.customizationData as Record<string, unknown> | undefined;
                if (customizationData && typeof customizationData === 'object') {
                    // Try to find text and color information in the customizationData structure
                    const children = Array.isArray(customizationData?.children) ? customizationData.children : [];

                    // Recursively search for text and color customizations in the nested structure
                    const findCustomizations = (items: AmazonNestedCustomization[]): void => {
                        for (const item of items) {
                            if (!item) continue;

                            // Check if this is a text customization
                            if (item.type === 'TextCustomization' && !customText) {
                                customText = item.inputValue || null;
                            }

                            // Check if this is an option customization for color
                            if (item.type === 'OptionCustomization') {
                                const itemLabel = (item.label || item.name || '').toLowerCase();
                                if (itemLabel.includes('colour') || itemLabel.includes('color')) {
                                    const displayValue = item.displayValue ||
                                        (item.optionSelection?.name) ||
                                        null;

                                    if (displayValue) {
                                        if ((!color1 && !color2) ||
                                            (itemLabel.includes('1') ||
                                                itemLabel.includes('base') ||
                                                itemLabel.includes('background'))) {
                                            color1 = displayValue;
                                        } else if (!color2) {
                                            color2 = displayValue;
                                        }
                                    }
                                }
                            }

                            // Continue recursively if this item has children
                            if (Array.isArray(item.children)) {
                                findCustomizations(item.children);
                            }
                        }
                    };

                    // Type assertion for the customizationData.children
                    const customizationChildren = children as unknown as AmazonNestedCustomization[];
                    findCustomizations(customizationChildren);

                    logger.debug(`[Amazon Processor] Fallback parser found: customText=${customText}, color1=${color1}, color2=${color2}`);
                }
            } catch (fallbackError) {
                logger.warn(`[Amazon Processor] Error in fallback parser: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            }
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
