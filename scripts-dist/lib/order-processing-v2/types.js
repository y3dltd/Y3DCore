"use strict";
// src/lib/order-processing-v2/types.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiOrderResponseSchema = exports.ItemPersonalizationResultSchema = exports.PersonalizationDetailSchema = void 0;
const zod_1 = require("zod");
// --- Zod Schemas (Copied and adapted from original script for consistency) ---
exports.PersonalizationDetailSchema = zod_1.z.object({
    customText: zod_1.z.string().nullable(),
    color1: zod_1.z.string().nullable(),
    color2: zod_1.z.string().nullable().optional(),
    quantity: zod_1.z.number().int().positive(),
    needsReview: zod_1.z.boolean().optional().default(false),
    reviewReason: zod_1.z.string().nullable(),
    annotation: zod_1.z.string().nullable().optional(),
});
exports.ItemPersonalizationResultSchema = zod_1.z.object({
    personalizations: zod_1.z.array(exports.PersonalizationDetailSchema),
    overallNeedsReview: zod_1.z.boolean(),
    overallReviewReason: zod_1.z.string().nullable(),
});
exports.AiOrderResponseSchema = zod_1.z.object({
    itemPersonalizations: zod_1.z.record(zod_1.z.string(), exports.ItemPersonalizationResultSchema), // Key is OrderItem ID as string
});
