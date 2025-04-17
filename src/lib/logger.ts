import * as path from 'path';

import * as winston from 'winston';

// In Next.js, we can use __dirname directly
// If this doesn't work in certain contexts, we can use process.cwd() as a fallback

// Determine log file path using process.cwd()
const logDirectory = path.resolve(process.cwd(), 'logs'); // Place logs in project_root/logs
const logFileName = 'sync-errors.log';
const logFilePath = path.join(logDirectory, logFileName);

// Ensure the logs directory exists (optional, depends on winston/system setup)
// import fs from 'fs';
// if (!fs.existsSync(logDirectory)) {
//   fs.mkdirSync(logDirectory);
// }

const logger = winston.createLogger({
  level: 'info', // Log info level and above (info, warn, error)
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Log stack traces
    winston.format.splat(),
    winston.format.json() // Log in JSON format
  ),
  // Default metadata can be added here if needed
  // defaultMeta: { service: 'shipstation-sync' },
  transports: [
    // Transport 1: Log errors to a file
    new winston.transports.File({
      filename: logFilePath,
      level: 'error', // Only log errors and above to this file
      maxsize: 5242880, // 5MB max file size
      maxFiles: 5, // Keep up to 5 rotated log files
      tailable: true,
    }),
    // Transport 2: Log everything (info and above) to the console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Add colors to console output
        winston.format.printf(({ timestamp, level, message, stack }) => {
          let log = `${timestamp} ${level}: ${message}`;
          if (stack) {
            // Include stack trace for errors
            log += `\n${stack}`;
          }
          return log;
        })
      ),
    }),
  ],
  exceptionHandlers: [
    // Optional: Log unhandled exceptions to a separate file
    new winston.transports.File({ filename: path.join(logDirectory, 'sync-exceptions.log') }),
  ],
  rejectionHandlers: [
    // Optional: Log unhandled promise rejections
    new winston.transports.File({ filename: path.join(logDirectory, 'sync-rejections.log') }),
  ],
  exitOnError: false, // Do not exit on handled errors
});

export default logger;
