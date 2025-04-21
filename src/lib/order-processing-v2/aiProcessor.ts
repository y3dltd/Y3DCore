// src/lib/order-processing-v2/aiProcessor.ts

import { PrismaClient } from '@prisma/client';
import { getLogger } from './logger';
import type {
    AiOrderResponse,
    PreProcessedOrderForAI,
    ProcessingOptionsV2,
} from './types';
import { AiOrderResponseSchema } from './types'; // Import Zod schema for validation

// Assume prisma client is initialized elsewhere and passed or imported
// For simplicity, let's assume it's passed in or we get an instance
// import prisma from '../prisma'; // Example if prisma client is centralized

// Define the structure expected by the OpenAI API call
interface ApiMessage {
    role: 'system' | 'user';
    content: string;
}
interface ResponseFormat {
    type: 'json_object';
}
interface ApiPayload {
    model: string;
    messages: ApiMessage[];
    temperature: number;
    max_tokens: number;
    response_format: ResponseFormat;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
}

// Define the structure for the result of this module
export interface AiExtractionResult {
    success: boolean;
    data?: AiOrderResponse;
    error?: string;
    promptUsed: string | null;
    rawResponse: string | null;
    modelUsed: string | null;
}

/**
 * Extracts personalization data for an order using an AI model (OpenAI).
 * Adapts the user prompt to include pre-processed data from Amazon extraction.
 * @param order - The pre-processed order data, potentially containing extracted Amazon details.
 * @param options - Processing options including API key, model, and prompts.
 * @param prisma - The Prisma client instance for logging.
 * @returns A promise resolving to an AiExtractionResult object.
 */
export async function extractPersonalizationWithAI(
    order: PreProcessedOrderForAI,
    options: Pick<
        ProcessingOptionsV2,
        'openaiApiKey' | 'openaiModel' | 'systemPrompt' | 'userPromptTemplate'
    >,
    prisma: PrismaClient // Pass prisma instance for logging
): Promise<AiExtractionResult> {
    const logger = getLogger();
    const startTime = Date.now();
    const modelUsed = options.openaiModel;
    let rawResponse: string | null = null;
    let fullPromptForDebug: string | null = null;

    try {
        if (!options.openaiApiKey) {
            throw new Error('OpenAI API key missing');
        }

        logger.info(`[AIProcessor][Order ${order.id}] Preparing AI extraction...`);

        // --- Prepare Input Data for AI ---
        // Create a simplified structure for the AI, prioritizing pre-processed fields
        const simplifiedItemsForAI = order.items.map(item => {
            // Base item details
            const baseDetails: Record<string, unknown> = {
                itemId: item.id,
                quantityOrdered: item.quantity,
                productSku: item.product?.sku,
                productName: item.product?.name,
                // Include original print settings for context if needed, or omit if too large/complex
                // printSettings: item.print_settings,
            };

            // Add pre-processed data if available (from successful Amazon extraction)
            if (item.preProcessedDataSource === 'AmazonURL') {
                baseDetails.extractedCustomText = item.preProcessedCustomText;
                baseDetails.extractedColor1 = item.preProcessedColor1;
                baseDetails.extractedColor2 = item.preProcessedColor2;
                baseDetails.dataSourceNote = `Data pre-extracted from Amazon URL. Prioritize this.`;
            } else {
                // If no pre-processed data, include original print_settings and notes
                // so the AI can attempt extraction from those sources.
                baseDetails.printSettings = item.print_settings;
                baseDetails.dataSourceNote = `No pre-extracted data available. Analyze printSettings and customer notes.`;
            }
            return baseDetails;
        });

        const inputData = {
            orderId: order.id,
            orderNumber: order.shipstation_order_number,
            marketplace: order.marketplace,
            customerNotes: order.customer_notes, // Include customer notes
            items: simplifiedItemsForAI,
        };

        const inputDataJson = JSON.stringify(inputData, null, 2);

        // --- Modify User Prompt ---
        // Add instructions for the AI to prioritize pre-extracted fields
        const userPromptInstructions = `
IMPORTANT: For each item in the 'items' array, check if 'extractedCustomText', 'extractedColor1', or 'extractedColor2' fields exist.
If they do, USE THAT DATA as the primary source for personalization for that item. The 'dataSourceNote' will confirm this.
If those fields are NOT present, THEN analyze the 'printSettings' and 'customerNotes' to determine the personalization details as usual.
Always return the response in the specified JSON format.
--- Original User Prompt Template Below ---
`;
        const modifiedUserPromptTemplate = userPromptInstructions + options.userPromptTemplate;
        const userPromptContent = modifiedUserPromptTemplate.replace('{INPUT_DATA_JSON}', inputDataJson);
        const systemPromptContent = options.systemPrompt;
        fullPromptForDebug = `System:\n${systemPromptContent}\n\nUser:\n${userPromptContent}`;

        logger.debug(`[AIProcessor][Order ${order.id}] Input data prepared for AI.`);
        logger.trace(`[AIProcessor][Order ${order.id}] Input Data JSON for AI:\n${inputDataJson}`);
        // Avoid logging full prompts unless absolutely necessary for debugging
        // logger.debug(`[AIProcessor][Order ${order.id}] Full prompt for AI:\n${fullPromptForDebug}`);

        // --- Call OpenAI API ---
        const apiUrl = 'https://api.openai.com/v1/chat/completions';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.openaiApiKey}`,
        };

        const apiPayload: ApiPayload = {
            model: modelUsed,
            messages: [
                { role: 'system', content: systemPromptContent },
                { role: 'user', content: userPromptContent },
            ],
            temperature: 0.0, // Low temperature for deterministic results
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            max_tokens: 4096, // Adjust as needed
            response_format: { type: 'json_object' },
        };

        logger.info(`[AIProcessor][Order ${order.id}] Calling OpenAI (${modelUsed})...`);
        logger.trace(`[AIProcessor][Order ${order.id}] Payload: ${JSON.stringify(apiPayload)}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(apiPayload),
        });

        const duration = Date.now() - startTime;
        logger.info(
            `[AIProcessor][Order ${order.id}] OpenAI call response status: ${response.status} (${duration}ms).`
        );

        if (!response.ok) {
            const errorBody = await response.text();
            logger.error(
                { status: response.status, body: errorBody },
                `[AIProcessor][Order ${order.id}] OpenAI API error`
            );
            throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        logger.debug({ response: result }, `[AIProcessor][Order ${order.id}] OpenAI Raw Response Object`);

        rawResponse = result.choices?.[0]?.message?.content?.trim() ?? null;

        if (!rawResponse) {
            logger.warn({ result }, `[AIProcessor][Order ${order.id}] OpenAI returned empty response content.`);
            throw new Error('OpenAI returned empty response content.');
        }
        logger.debug(`[AIProcessor][Order ${order.id}] RAW RESPONSE Content:\n${rawResponse}`);

        // --- Parse and Validate Response ---
        let responseJson: unknown;
        try {
            // Basic cleaning, add more robust fixing if needed
            const cleanedContent = rawResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            responseJson = JSON.parse(cleanedContent);
            logger.debug(`[AIProcessor][Order ${order.id}] Parsed JSON response.`);
        } catch (e) {
            logger.error({ err: e, rawResponse }, `[AIProcessor][Order ${order.id}] Failed to parse AI JSON response`);
            throw new Error(`Failed to parse AI JSON: ${(e as Error).message}.`);
        }

        const validationResult = AiOrderResponseSchema.safeParse(responseJson);
        if (!validationResult.success) {
            const errorString = JSON.stringify(validationResult.error.format(), null, 2);
            logger.error(`[AIProcessor][Order ${order.id}] Zod validation failed: ${errorString}`);
            throw new Error(`AI response validation failed: ${errorString}`);
        }

        logger.info(`[AIProcessor][Order ${order.id}] AI response validated successfully.`);
        const validatedData = validationResult.data;

        // --- Log Successful AI Call ---
        try {
            const tasksGenerated = Object.values(validatedData.itemPersonalizations).reduce(
                (sum, item) => sum + item.personalizations.length,
                0
            );
            const needsReviewCount = Object.values(validatedData.itemPersonalizations).reduce(
                (sum, item) => sum + (item.overallNeedsReview ? 1 : 0),
                0
            );
            await prisma.aiCallLog.create({
                data: {
                    scriptName: 'populate-print-queue-v2', // Use new script name
                    orderId: order.id,
                    orderNumber: order.shipstation_order_number || null,
                    marketplace: order.marketplace || null,
                    aiProvider: 'openai',
                    modelUsed: modelUsed || 'unknown',
                    promptSent: fullPromptForDebug ?? '', // Provide fallback for null
                    rawResponse: rawResponse, // Consider truncating
                    processingTimeMs: Date.now() - startTime,
                    success: true,
                    tasksGenerated,
                    needsReviewCount,
                },
            });
            logger.debug(`[AIProcessor][Order ${order.id}] AI call logged to database`);
        } catch (logError) {
            logger.error(
                `[AIProcessor][Order ${order.id}] Failed to log successful AI call to database: ${logError instanceof Error ? logError.message : String(logError)}`
            );
            // Continue even if logging fails
        }

        return {
            success: true,
            data: validatedData,
            promptUsed: fullPromptForDebug,
            rawResponse,
            modelUsed,
        };

    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown AI extraction error';
        logger.error(`[AIProcessor][Order ${order.id}] AI Extraction failed: ${errorMsg}`, error);

        // --- Log Failed AI Call ---
        try {
            await prisma.aiCallLog.create({
                data: {
                    scriptName: 'populate-print-queue-v2', // Use new script name
                    orderId: order.id,
                    orderNumber: order.shipstation_order_number || null,
                    marketplace: order.marketplace || null,
                    aiProvider: 'openai',
                    modelUsed: modelUsed || 'unknown',
                    promptSent: fullPromptForDebug ?? '', // Provide fallback for null
                    rawResponse: rawResponse || '', // Consider truncating
                    processingTimeMs: Date.now() - startTime,
                    success: false,
                    errorMessage: errorMsg,
                    tasksGenerated: 0,
                    needsReviewCount: 0,
                },
            });
            logger.debug(`[AIProcessor][Order ${order.id}] Failed AI call logged to database`);
        } catch (logError) {
            logger.error(
                `[AIProcessor][Order ${order.id}] Failed to log AI error to database: ${logError instanceof Error ? logError.message : String(logError)}`
            );
        }

        return {
            success: false,
            error: errorMsg,
            promptUsed: fullPromptForDebug,
            rawResponse,
            modelUsed,
        };
    }
}
