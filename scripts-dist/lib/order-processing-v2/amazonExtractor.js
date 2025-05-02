"use strict";
// src/lib/order-processing-v2/amazonExtractor.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAmazonCustomizationData = void 0;
const customization_1 = require("../orders/amazon/customization"); // Assuming this path is correct
const logger_1 = require("./logger");
// Helper function to find the CustomizedURL (adapted from original script)
function extractCustomizationUrl(item) {
    const printSettings = item.print_settings;
    if (!printSettings)
        return null;
    const isUrlSetting = (setting) => setting !== null &&
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
    }
    else if (typeof printSettings === 'object' && printSettings !== null) {
        const record = printSettings;
        const key = Object.keys(record).find(k => k.toLowerCase() === 'customizedurl');
        if (key && typeof record[key] === 'string') {
            return record[key];
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
async function extractAmazonCustomizationData(orderId, item, product) {
    const logger = (0, logger_1.getLogger)();
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
        const amazonData = await (0, customization_1.fetchAndProcessAmazonCustomization)(amazonUrl);
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
        }
        else {
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
    }
    catch (amazonError) {
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
exports.extractAmazonCustomizationData = extractAmazonCustomizationData;
