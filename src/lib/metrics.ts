/**
 * Metrics Module for Eligibility Engine
 * Phase TD-2 Implementation (Blake)
 *
 * Provides Prometheus metrics for monitoring the eligibility evaluation service.
 * Uses @railrepay/metrics-pusher for consistent metrics across RailRepay services.
 *
 * TD-ELIGIBILITY-004: No @railrepay/metrics-pusher Integration
 *
 * Metrics defined:
 * - eligibility_evaluations_total: Total number of eligibility evaluations performed
 * - eligibility_eligible_total: Total evaluations that resulted in eligible
 * - eligibility_ineligible_total: Total evaluations that resulted in ineligible
 * - eligibility_evaluation_duration_seconds: Histogram of evaluation latency
 */

import { Counter, Histogram, getRegistry, createMetricsRouter } from '@railrepay/metrics-pusher';
import { Router } from 'express';
import { getLogger } from './logger.js';

/**
 * Service name for metric labels
 */
const SERVICE_NAME = 'eligibility-engine';

/**
 * Get the shared Prometheus registry
 */
const registry = getRegistry();

/**
 * Total number of eligibility evaluations performed
 * Incremented on every POST /eligibility/evaluate request
 */
export const eligibilityEvaluationsTotal = new Counter({
  name: 'eligibility_evaluations_total',
  help: 'Total number of eligibility evaluations performed',
  labelNames: ['toc_code', 'scheme'],
  registers: [registry],
});

/**
 * Total evaluations that resulted in eligible
 */
export const eligibilityEligibleTotal = new Counter({
  name: 'eligibility_eligible_total',
  help: 'Total number of evaluations that resulted in eligible',
  labelNames: ['toc_code', 'scheme'],
  registers: [registry],
});

/**
 * Total evaluations that resulted in ineligible
 */
export const eligibilityIneligibleTotal = new Counter({
  name: 'eligibility_ineligible_total',
  help: 'Total number of evaluations that resulted in ineligible',
  labelNames: ['toc_code', 'scheme', 'reason'],
  registers: [registry],
});

/**
 * Histogram of evaluation latency in seconds
 * Uses standard buckets for HTTP request durations
 */
export const eligibilityEvaluationDuration = new Histogram({
  name: 'eligibility_evaluation_duration_seconds',
  help: 'Duration of eligibility evaluation in seconds',
  labelNames: ['toc_code', 'eligible'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * HTTP request counter for all endpoints
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Initialize metrics
 *
 * Sets up default metrics collection and registers custom metrics.
 * Should be called once at application startup.
 */
export function initMetrics(): void {
  const logger = getLogger();
  logger.info('Initializing metrics', { component: 'metrics' });

  // Register default metrics (process stats, etc.)
  // Note: We skip this for now as prom-client default metrics can conflict
  // with multiple services running in the same process during tests

  logger.info('Metrics initialized successfully', {
    component: 'metrics',
    service: SERVICE_NAME,
    metricsRegistered: [
      'eligibility_evaluations_total',
      'eligibility_eligible_total',
      'eligibility_ineligible_total',
      'eligibility_evaluation_duration_seconds',
      'http_requests_total',
      'http_request_duration_seconds',
    ],
  });
}

/**
 * Get Express middleware for the /metrics endpoint
 *
 * Returns an Express Router that exposes Prometheus metrics at /metrics
 *
 * @returns Express Router with metrics endpoint
 */
export function getMetricsMiddleware(): Router {
  const logger = getLogger();
  return createMetricsRouter(logger);
}

/**
 * Record an eligibility evaluation
 *
 * Helper function to record all metrics for a single evaluation.
 *
 * @param params - Evaluation parameters
 */
export function recordEvaluation(params: {
  tocCode: string;
  scheme: string;
  eligible: boolean;
  durationSeconds: number;
  ineligibleReason?: string;
}): void {
  const { tocCode, scheme, eligible, durationSeconds, ineligibleReason } = params;

  // Increment total evaluations
  eligibilityEvaluationsTotal.inc({ toc_code: tocCode, scheme });

  // Increment eligible or ineligible counter
  if (eligible) {
    eligibilityEligibleTotal.inc({ toc_code: tocCode, scheme });
  } else {
    eligibilityIneligibleTotal.inc({
      toc_code: tocCode,
      scheme,
      reason: ineligibleReason || 'unknown',
    });
  }

  // Record duration
  eligibilityEvaluationDuration.observe(
    { toc_code: tocCode, eligible: eligible.toString() },
    durationSeconds
  );
}
