/**
 * hephaestus Logger
 * Structured logging with Winston
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get log file path from environment or use default
const logFile = process.env.LOG_FILE || 'hephaestus.log';
const logLevel = process.env.LOG_LEVEL || 'info';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(__dirname, '..', 'error.log'),
      level: 'error'
    }),
    // General log file
    new winston.transports.File({
      filename: path.join(__dirname, '..', logFile),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ]
});

// Create a child logger for specific components
export const createComponentLogger = (component: string) => {
  return logger.child({ component });
};

export default logger;
