// src/lib/order-processing-v2/prompts.ts

import fs from 'fs/promises';
import path from 'path';

import { getLogger } from './logger';

const SYSTEM_PROMPT_PATH = 'src/lib/ai/prompts/prompt-system-optimized.txt';
const USER_PROMPT_TEMPLATE_PATH = 'src/lib/ai/prompts/prompt-user-template-optimized.txt';

/**
 * Loads the AI system prompt and user prompt template from their respective files.
 * @returns A promise that resolves to an object containing the system prompt and user template.
 * @throws If either prompt file cannot be read.
 */
export async function loadPrompts(): Promise<{ systemPrompt: string; userPromptTemplate: string }> {
    const logger = getLogger();
    logger.info('Loading AI prompts...');

    try {
        const systemPromptPath = path.join(process.cwd(), SYSTEM_PROMPT_PATH);
        const userPromptTemplatePath = path.join(process.cwd(), USER_PROMPT_TEMPLATE_PATH);

        logger.debug(`Reading system prompt from: ${systemPromptPath}`);
        const systemPrompt = await fs.readFile(systemPromptPath, 'utf-8');

        logger.debug(`Reading user prompt template from: ${userPromptTemplatePath}`);
        const userPromptTemplate = await fs.readFile(userPromptTemplatePath, 'utf-8');

        logger.info('AI prompts loaded successfully.');
        // Note: The userPromptTemplate will need to be modified later by the aiProcessor
        // to instruct the AI on how to handle the pre-processed data fields.
        return { systemPrompt, userPromptTemplate };
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown file load error';
        logger.error(`Failed to load prompt files: ${errorMsg}`, error);
        throw new Error(`Could not load required prompt files. Error: ${errorMsg}`);
    }
}
