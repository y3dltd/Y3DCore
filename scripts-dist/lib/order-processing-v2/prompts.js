"use strict";
// src/lib/order-processing-v2/prompts.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPrompts = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("./logger");
const SYSTEM_PROMPT_PATH = 'src/lib/ai/prompts/prompt-system-optimized.txt';
const USER_PROMPT_TEMPLATE_PATH = 'src/lib/ai/prompts/prompt-user-template-optimized.txt';
/**
 * Loads the AI system prompt and user prompt template from their respective files.
 * @returns A promise that resolves to an object containing the system prompt and user template.
 * @throws If either prompt file cannot be read.
 */
async function loadPrompts() {
    const logger = (0, logger_1.getLogger)();
    logger.info('Loading AI prompts...');
    try {
        const systemPromptPath = path_1.default.join(process.cwd(), SYSTEM_PROMPT_PATH);
        const userPromptTemplatePath = path_1.default.join(process.cwd(), USER_PROMPT_TEMPLATE_PATH);
        logger.debug(`Reading system prompt from: ${systemPromptPath}`);
        const systemPrompt = await promises_1.default.readFile(systemPromptPath, 'utf-8');
        logger.debug(`Reading user prompt template from: ${userPromptTemplatePath}`);
        const userPromptTemplate = await promises_1.default.readFile(userPromptTemplatePath, 'utf-8');
        logger.info('AI prompts loaded successfully.');
        // Note: The userPromptTemplate will need to be modified later by the aiProcessor
        // to instruct the AI on how to handle the pre-processed data fields.
        return { systemPrompt, userPromptTemplate };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown file load error';
        logger.error(`Failed to load prompt files: ${errorMsg}`, error);
        throw new Error(`Could not load required prompt files. Error: ${errorMsg}`);
    }
}
exports.loadPrompts = loadPrompts;
