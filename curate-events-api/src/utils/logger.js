/**
 * logger.js
 * 
 * Structured logging utility for the event collection API
 */

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Create base logger configuration
const loggerConfig = {
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
};

// Add file logging in production
if (nodeEnv === 'production') {
  loggerConfig.transports.push(
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  );
}

// Create the main logger instance
const mainLogger = winston.createLogger(loggerConfig);

/**
 * Create a child logger with a specific component name
 * @param {string} component - Component name for context
 * @returns {winston.Logger} Child logger instance
 */
export function createLogger(component) {
  return mainLogger.child({ component });
}

/**
 * Log API request details
 * @param {winston.Logger} logger - Logger instance
 * @param {object} req - Express request object
 * @param {string} action - Action being performed
 */
export function logRequest(logger, req, action) {
  logger.info(`${action} request`, {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    body: req.method === 'POST' ? req.body : undefined
  });
}

/**
 * Log API response details
 * @param {winston.Logger} logger - Logger instance
 * @param {object} res - Express response object
 * @param {string} action - Action that was performed
 * @param {number} duration - Request duration in ms
 */
export function logResponse(logger, res, action, duration) {
  logger.info(`${action} response`, {
    statusCode: res.statusCode,
    duration: `${duration}ms`
  });
}

/**
 * Log error with context
 * @param {winston.Logger} logger - Logger instance
 * @param {Error} error - Error object
 * @param {object} context - Additional context
 */
export function logError(logger, error, context = {}) {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context
  });
}

export default mainLogger;