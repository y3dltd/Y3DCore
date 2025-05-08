// src/lib/order-processing-v2/amazonExtractor.ts

import { OrderItem, Prisma, Product } from '@prisma/client';

import { fetchAndProcessAmazonCustomization } from '../orders/amazon/customization'; // Assuming this path is correct

import { getLogger } from './logger';

import type { AmazonExtractionResult } from './types';

// Helper function to find the CustomizedURL (adapted from original script)
function extractCustomizationUrl(item: OrderItem): string | null {
    const printSettings = item.print_settings;
    if (!printSettings) return null;

    const isUrlSetting = (setting: Prisma.JsonValue): setting is { name: string; value: string } =>
        setting !== null &&
        typeof setting === 'object' &&
        !Array.isArray(setting) &&
        'name' in setting &&
        typeof setting.name === 'string' &&
        setting.name.toLowerCase() === 'customizedurl' &&
        'value' in setting &&
        typeof setting.value === 'string';

    if (Array.isArray(printSettings)) {
        const urlSetting = printSettings.find(isUrlSetting);
        return urlSetting ? urlSetting.value : null;
    } else if (typeof printSettings === 'object' && printSettings !== null) {
        const record = printSettings as Record<string, unknown>;
        const key = Object.keys(record).find(k => k.toLowerCase() === 'customizedurl');
        if (key && typeof record[key] === 'string') {
            return record[key] as string;
        }
        if (isUrlSetting(printSettings)) {
            return printSettings.value;
        }
    }
    return null;
}


/**
 * Attempts to extract personalization data from an Amazon CustomizedURL associated with an order item.
 * @param orderId - The database ID of the order (for logging).
 * @param item - The OrderItem object.
 * @param product - The associated Product object (for REGKEY check).
 * @returns A promise resolving to an AmazonExtractionResult object.
 */
export async function extractAmazonCustomizationData(
    orderId: number,
    item: OrderItem,
    product: Product | null
): Promise<AmazonExtractionResult> {
    const logger = getLogger();
    const amazonUrl = extractCustomizationUrl(item);
    logger.debug(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] Extracted amazonUrl='${amazonUrl}'`);

    if (!amazonUrl) {
        return {
            success: false,
            dataSource: null,
            customText: null,
            color1: null,
            color2: null,
            annotation: 'No CustomizedURL found in print_settings.',
        };
    }

    logger.info(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] Found Amazon CustomizedURL. Attempting to fetch...`);
    try {
        const amazonData = await fetchAndProcessAmazonCustomization(amazonUrl);
        logger.debug(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] fetchAndProcessAmazonCustomization returned: ${JSON.stringify(amazonData)}`);

        if (amazonData) {
            logger.info(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] Successfully processed Amazon URL.`);

            // REGKEY SKU rule: force uppercase registration text
            let processedCustomText = amazonData.customText;
            if (product?.sku?.toUpperCase().includes('REGKEY') && processedCustomText) {
                processedCustomText = processedCustomText.toUpperCase();
                logger.info(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] REGKEY SKU detected, upper-casing custom text to '${processedCustomText}'.`);
            }

            return {
                success: true,
                dataSource: 'AmazonURL',
                customText: processedCustomText,
                color1: amazonData.color1,
                color2: amazonData.color2,
                annotation: 'Data successfully extracted from Amazon CustomizedURL.',
            };
        } else {
            logger.warn(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] Failed to process Amazon URL (fetch function returned null/undefined).`);
            return {
                success: false,
                dataSource: null,
                customText: null,
                color1: null,
                color2: null,
                annotation: 'fetchAndProcessAmazonCustomization returned no data.',
                error: 'fetchAndProcessAmazonCustomization returned null or undefined',
            };
        }
    } catch (amazonError: unknown) {
        const errorMsg = amazonError instanceof Error ? amazonError.message : String(amazonError);
        logger.error(`[AmazonExtractor][Order ${orderId}][Item ${item.id}] Error during fetchAndProcessAmazonCustomization: ${errorMsg}`, amazonError);
        return {
            success: false,
            dataSource: null,
            customText: null,
            color1: null,
            color2: null,
            annotation: `Error processing Amazon URL: ${errorMsg}`.substring(0, 1000),
            error: errorMsg,
        };
    }
}
