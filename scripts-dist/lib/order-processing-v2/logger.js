"use strict";
// src/lib/order-processing-v2/logger.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeLogStream = exports.getLogger = exports.initializeLogger = void 0;
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const pino_1 = __importDefault(require("pino"));
let logStream = null;
let loggerInstance = null;
/**
 * Initializes the Pino logger with file and console streams.
 * Ensures it's only initialized once.
 * @param options - Processing options containing log level and script name.
 * @param scriptName - The name of the script for the log file.
 * @returns The initialized Pino logger instance.
 */
async function initializeLogger(options, scriptName) {
    if (loggerInstance) {
        return loggerInstance;
    }
    const level = options.verbose ? 'debug' : options.logLevel || 'info';
    try {
        const logDir = path_1.default.join(process.cwd(), 'logs');
        const logFilePath = path_1.default.join(logDir, `${scriptName}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
        await promises_1.default.mkdir(logDir, { recursive: true });
        logStream = fs_1.default.createWriteStream(logFilePath, { flags: 'a' });
        loggerInstance = (0, pino_1.default)({ level }, pino_1.default.multistream([
            { stream: logStream },
            { stream: process.stdout },
        ]));
        loggerInstance.info(`Logging initialized. Level: ${level}. File: ${logFilePath}`);
    }
    catch (error) {
        // Fallback to console-only logger if file setup fails
        console.error(`Failed to initialize file logging for ${scriptName}:`, error);
        loggerInstance = (0, pino_1.default)({ level });
        loggerInstance.warn('File logging failed, falling back to console only.');
    }
    return loggerInstance;
}
exports.initializeLogger = initializeLogger;
/**
 * Returns the initialized logger instance.
 * Throws an error if the logger hasn't been initialized.
 * @returns The Pino logger instance.
 */
function getLogger() {
    if (!loggerInstance) {
        // Initialize a basic console logger as a fallback if not explicitly initialized
        console.warn('Logger accessed before explicit initialization. Initializing basic console logger.');
        loggerInstance = (0, pino_1.default)({ level: 'info' });
        // throw new Error('Logger has not been initialized. Call initializeLogger first.');
    }
    return loggerInstance;
}
exports.getLogger = getLogger;
/**
 * Closes the log file stream if it's open.
 * Should be called at the end of the script execution.
 */
function closeLogStream() {
    if (logStream) {
        logStream.end();
        logStream = null;
        loggerInstance = null; // Reset logger instance when stream closes
        console.log('Log stream closed.');
    }
}
exports.closeLogStream = closeLogStream;
