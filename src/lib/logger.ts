/**
 * Logger Module for Eligibility Engine
 * Phase TD-2 Implementation (Blake)
 *
 * Wraps @railrepay/winston-logger to provide a consistent logging interface
 * with support for correlation IDs and child loggers.
 *
 * TD-ELIGIBILITY-003: Replace console statements with @railrepay/winston-logger
 */

import { createLogger, Logger } from '@railrepay/winston-logger';

/**
 * Singleton logger instance
 */
let loggerInstance: Logger | null = null;

/**
 * Service name for this application
 */
const SERVICE_NAME = 'eligibility-engine';

/**
 * Get the logger instance
 *
 * Creates a singleton logger on first call, returns same instance thereafter.
 * The logger is pre-configured for the eligibility-engine service.
 *
 * @returns Winston Logger instance
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger({
      serviceName: SERVICE_NAME,
      level: process.env.LOG_LEVEL || 'info',
      lokiEnabled: process.env.LOKI_ENABLED === 'true',
      lokiHost: process.env.LOKI_HOST,
      lokiBasicAuth: process.env.LOKI_BASIC_AUTH,
      environment: process.env.ENVIRONMENT || process.env.NODE_ENV || 'development',
    });
  }
  return loggerInstance;
}

/**
 * Reset the logger instance (for testing)
 *
 * This allows tests to create fresh logger instances without
 * state leaking between tests.
 */
export function resetLogger(): void {
  loggerInstance = null;
}

/**
 * Create a child logger with correlation ID
 *
 * Used to add request-specific context to log messages.
 *
 * @param correlationId - The correlation ID from the request
 * @returns Child logger with correlation ID in default metadata
 */
export function createChildLogger(correlationId: string): Logger {
  const logger = getLogger();
  return logger.child({ correlationId });
}

// Export the Logger type for consumers
export type { Logger };
