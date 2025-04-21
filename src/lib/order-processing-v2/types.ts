// src/lib/order-processing-v2/types.ts

import { Order, OrderItem, Prisma, Product } from '@prisma/client';
import { z } from 'zod';

// --- Zod Schemas (Copied and adapted from original script for consistency) ---
export const PersonalizationDetailSchema = z.object({
    customText: z.string().nullable(),
    color1: z.string().nullable(),
    color2: z.string().nullable().optional(),
    quantity: z.number().int().positive(),
    needsReview: z.boolean().optional().default(false),
    reviewReason: z.string().nullable(),
    annotation: z.string().nullable().optional(),
});

export const ItemPersonalizationResultSchema = z.object({
    personalizations: z.array(PersonalizationDetailSchema),
    overallNeedsReview: z.boolean(),
    overallReviewReason: z.string().nullable(),
});

export const AiOrderResponseSchema = z.object({
    itemPersonalizations: z.record(z.string(), ItemPersonalizationResultSchema), // Key is OrderItem ID as string
});

export type AiOrderResponse = z.infer<typeof AiOrderResponseSchema>;
export type ItemPersonalizationResult = z.infer<typeof ItemPersonalizationResultSchema>;
export type PersonalizationDetail = z.infer<typeof PersonalizationDetailSchema>;


// --- Processing Options ---
// Define options needed throughout the v2 processing modules
export interface ProcessingOptionsV2 {
    orderId?: string; // DB ID, ShipStation Order Number, or ShipStation Order ID
    limit?: number;
    openaiApiKey: string; // Made non-null assuming required
    openaiModel: string;
    systemPrompt: string;
    userPromptTemplate: string; // Template will need modification
    debug: boolean;
    verbose: boolean;
    logLevel: string;
    debugFile?: string; // Path for detailed debug log file
    forceRecreate?: boolean; // Delete existing tasks first
    createPlaceholder: boolean; // Create placeholder on AI fail
    confirm?: boolean; // Skip confirmation prompts
    clearAll?: boolean; // Delete ALL tasks first (requires confirm)
    dryRun?: boolean; // Simulate without DB changes
    preserveText?: boolean; // Keep existing custom text/names when recreating tasks
    shipstationSyncOnly?: boolean; // Only sync existing DB tasks to ShipStation
}

// --- Data Structures ---

// Type for the result of the Amazon URL extraction attempt
export interface AmazonExtractionResult {
    success: boolean;
    dataSource: 'AmazonURL' | null; // 'AmazonURL' if successful, null otherwise
    customText: string | null;
    color1: string | null;
    color2: string | null;
    annotation: string; // Reason for success/failure/status
    error?: string; // Optional error message on failure
}

// Type combining Order with related items and products (from original script)
export type OrderWithItemsAndProducts = Prisma.OrderGetPayload<{
    include: {
        items: {
            include: {
                product: true;
            };
        };
        customer: true; // Include customer for potential use
    };
}>;

// Type for the pre-processed data structure passed to the AI
// Includes original item details plus any successfully extracted Amazon data
export interface PreProcessedItemForAI extends OrderItem {
    product?: Product | null; // Include product info if available
    // Fields populated ONLY if Amazon URL extraction was successful
    preProcessedCustomText?: string | null;
    preProcessedColor1?: string | null;
    preProcessedColor2?: string | null;
    preProcessedDataSource?: 'AmazonURL';
}

export interface PreProcessedOrderForAI extends Order {
    items: PreProcessedItemForAI[];
    // eslint-disable-next-line
    customer?: Prisma.CustomerGetPayload<{}> | null;
}


// Type for the data needed by the ShipStation batch update function
export interface ShipstationUpdatePayload {
    [lineItemKey: string]: Array<{ name: string; value: string | null }>;
}

// Type for Debugging Info (similar to original)
export interface OrderDebugInfoV2 {
    orderId: number;
    orderNumber: string;
    marketplace: string | null;
    overallStatus: string;
    amazonExtractionAttempts: Array<{
        itemId: number;
        status: string; // e.g., 'Success', 'Failed', 'NotAttempted'
        result?: AmazonExtractionResult;
    }>;
    aiProcessingStatus: string;
    aiModelUsed: string | null;
    aiPromptSent: string | null; // Consider truncating
    aiRawResponseReceived: string | null; // Consider truncating
    aiParsedResponse: AiOrderResponse | null;
    aiValidationError: string | null;
    dbTransactionStatus: string;
    dbTasksCreatedCount: number;
    dbItemsNeedReviewCount: number;
    shipstationSyncStatus: string;
    shipstationItemsToUpdateCount: number;
    shipstationUpdateResult?: boolean; // Result of the batch update call
    processingError: string | null; // General processing error
    items: Array<{ // Detailed status per item during DB phase
        itemId: number;
        status: string; // e.g., 'Success (AI)', 'Placeholder Created', 'Failed'
        error?: string;
        createdTaskIds?: number[];
        shipstationUpdatePrepared: boolean;
        shipstationUpdateDataSource: 'AmazonURL' | 'AI' | 'Placeholder' | 'None';
    }>;
}
