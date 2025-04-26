// filepath: /workspaces/Y3DHub/src/lib/shared/logging.ts
const createLogger = (component) => {
    const log = (level, message, context) => {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            component,
            message,
            ...(context && { context }),
        };
        // Output to console based on level
        switch (level) {
            case 'info':
                console.log(JSON.stringify(logEntry));
                break;
            case 'warn':
                console.warn(JSON.stringify(logEntry));
                break;
            case 'error':
                console.error(JSON.stringify(logEntry));
                break;
            case 'debug':
                // Only log debug messages if DEBUG env var is set (example)
                if (process.env.DEBUG) {
                    console.debug(JSON.stringify(logEntry));
                }
                break;
        }
    };
    return {
        info: (message, context) => log('info', message, context),
        warn: (message, context) => log('warn', message, context),
        error: (message, context) => log('error', message, context),
        debug: (message, context) => log('debug', message, context),
    };
};
// Default logger instance (can be used directly or create specific ones)
export const logger = createLogger('default');
// Function to get a logger instance with a specific component name
export const getLogger = (component) => {
    return createLogger(component);
};
