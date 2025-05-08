// filepath: /workspaces/Y3DHub/src/lib/shared/logging.ts

// Basic console logger implementation
// TODO: Consider using a more robust library like pino or winston if needed

export interface Logger {
  info: (
    message: string, 
    context?: Record<string, unknown>
  ) => void;
  warn: (
    message: string, 
    context?: Record<string, unknown>
  ) => void;
  error: (
    message: string, 
    context?: Record<string, unknown>
  ) => void;
  debug: (
    message: string, 
    context?: Record<string, unknown>
  ) => void;
}

const createLogger = (component: string): Logger => {
  const log = (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>
  ): void => {
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
    info: (message, context): void => log('info', message, context),
    warn: (message, context): void => log('warn', message, context),
    error: (message, context): void => log('error', message, context),
    debug: (message, context): void => log('debug', message, context),
  };
};

// Default logger instance (can be used directly or create specific ones)
export const logger = createLogger('default');

// Function to get a logger instance with a specific component name
export const getLogger = (component: string): Logger => {
  return createLogger(component);
};
