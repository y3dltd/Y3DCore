// src/lib/order-processing-v2/logger.ts

import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';
import type { ProcessingOptionsV2 } from './types';

let logStream: fsSync.WriteStream | null = null;
let loggerInstance: pino.Logger | null = null;

/**
 * Initializes the Pino logger with file and console streams.
 * Ensures it's only initialized once.
 * @param options - Processing options containing log level and script name.
 * @param scriptName - The name of the script for the log file.
 * @returns The initialized Pino logger instance.
 */
export async function initializeLogger(
    options: Pick<ProcessingOptionsV2, 'logLevel' | 'verbose'>,
    scriptName: string
): Promise<pino.Logger> {
    if (loggerInstance) {
        return loggerInstance;
    }

    const level = options.verbose ? 'debug' : options.logLevel || 'info';

    try {
        const logDir = path.join(process.cwd(), 'logs');
        const logFilePath = path.join(
            logDir,
            `${scriptName}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
        );
        await fs.mkdir(logDir, { recursive: true });
        logStream = fsSync.createWriteStream(logFilePath, { flags: 'a' });

        loggerInstance = pino(
            { level },
            pino.multistream([
                { stream: logStream },
                { stream: process.stdout },
            ])
        );

        loggerInstance.info(`Logging initialized. Level: ${level}. File: ${logFilePath}`);
    } catch (error) {
        // Fallback to console-only logger if file setup fails
        console.error(`Failed to initialize file logging for ${scriptName}:`, error);
        loggerInstance = pino({ level });
        loggerInstance.warn('File logging failed, falling back to console only.');
    }

    return loggerInstance;
}

/**
 * Returns the initialized logger instance.
 * Throws an error if the logger hasn't been initialized.
 * @returns The Pino logger instance.
 */
export function getLogger(): pino.Logger {
    if (!loggerInstance) {
        // Initialize a basic console logger as a fallback if not explicitly initialized
        console.warn('Logger accessed before explicit initialization. Initializing basic console logger.');
        loggerInstance = pino({ level: 'info' });
        // throw new Error('Logger has not been initialized. Call initializeLogger first.');
    }
    return loggerInstance;
}

/**
 * Closes the log file stream if it's open.
 * Should be called at the end of the script execution.
 */
export function closeLogStream(): void {
    if (logStream) {
        logStream.end();
        logStream = null;
        loggerInstance = null; // Reset logger instance when stream closes
        console.log('Log stream closed.');
    }
}
