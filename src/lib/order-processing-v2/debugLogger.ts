// src/lib/order-processing-v2/debugLogger.ts

import fs from 'fs/promises';
import util from 'util';

import { getLogger } from './logger';
import type { OrderDebugInfoV2 } from './types';

/**
 * Appends detailed debug information for an order to a specified log file.
 * If the file path is not provided or is undefined, the function does nothing.
 * @param filePath - The path to the debug log file.
 * @param data - The OrderDebugInfoV2 object containing the debug data.
 */
export async function appendToDebugLog(filePath: string | undefined, data: OrderDebugInfoV2): Promise<void> {
    if (!filePath) {
        return; // Do nothing if no debug file path is specified
    }

    const logger = getLogger(); // Get the initialized logger

    try {
        // Use util.inspect for deep object logging without circular references
        // Ensure colors are off for file logging
        const logEntry = `\n--- Entry: ${new Date().toISOString()} ---\n${util.inspect(data, { depth: null, colors: false })}\n`;
        await fs.appendFile(filePath, logEntry);
        logger.trace(`[DebugLogger] Appended debug info for Order ${data.orderId} to ${filePath}`);
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown debug log write error';
        // Log the error using the main logger, but don't throw, as debug logging failure shouldn't stop processing
        logger.error(`[DebugLogger] Failed to write to debug log file ${filePath}: ${errorMsg}`);
    }
}
