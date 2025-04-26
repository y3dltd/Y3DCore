"use strict";
// src/lib/order-processing-v2/debugLogger.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendToDebugLog = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const util_1 = __importDefault(require("util"));
const logger_1 = require("./logger");
/**
 * Appends detailed debug information for an order to a specified log file.
 * If the file path is not provided or is undefined, the function does nothing.
 * @param filePath - The path to the debug log file.
 * @param data - The OrderDebugInfoV2 object containing the debug data.
 */
async function appendToDebugLog(filePath, data) {
    if (!filePath) {
        return; // Do nothing if no debug file path is specified
    }
    const logger = (0, logger_1.getLogger)(); // Get the initialized logger
    try {
        // Use util.inspect for deep object logging without circular references
        // Ensure colors are off for file logging
        const logEntry = `\n--- Entry: ${new Date().toISOString()} ---\n${util_1.default.inspect(data, { depth: null, colors: false })}\n`;
        await promises_1.default.appendFile(filePath, logEntry);
        logger.trace(`[DebugLogger] Appended debug info for Order ${data.orderId} to ${filePath}`);
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown debug log write error';
        // Log the error using the main logger, but don't throw, as debug logging failure shouldn't stop processing
        logger.error(`[DebugLogger] Failed to write to debug log file ${filePath}: ${errorMsg}`);
    }
}
exports.appendToDebugLog = appendToDebugLog;
