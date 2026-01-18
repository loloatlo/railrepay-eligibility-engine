/**
 * TD-ELIGIBILITY-004: Metrics Pusher Integration Tests (Unit)
 * Phase TD-1 - Test Specification (Jessie)
 *
 * These tests verify that @railrepay/metrics-pusher is installed and
 * the metrics module exports the required functions and counters.
 * All tests MUST FAIL initially before Blake implements the fixes.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('TD-ELIGIBILITY-004: Metrics Pusher Integration (Unit)', () => {
  const projectRoot = resolve(__dirname, '../..');

  describe('AC-1: @railrepay/metrics-pusher@1.1.0 is installed as dependency', () => {
    it('should have @railrepay/metrics-pusher in dependencies', () => {
      const pkgPath = resolve(projectRoot, 'package.json');
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      expect(pkg.dependencies['@railrepay/metrics-pusher']).toBeDefined();
    });

    it('should use version 1.x of @railrepay/metrics-pusher', () => {
      const pkgPath = resolve(projectRoot, 'package.json');
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const version = pkg.dependencies['@railrepay/metrics-pusher'];
      expect(version).toMatch(/^[\^~]?1\./);
    });
  });

  describe('AC-2: src/lib/metrics.ts exports metric counters and initialization function', () => {
    it('should have src/lib/metrics.ts file', () => {
      const metricsPath = resolve(projectRoot, 'src/lib/metrics.ts');
      expect(existsSync(metricsPath)).toBe(true);
    });

    it('should export initMetrics function', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      expect(typeof metricsModule.initMetrics).toBe('function');
    });

    it('should export getMetricsMiddleware function', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      expect(typeof metricsModule.getMetricsMiddleware).toBe('function');
    });

    it('should export eligibilityEvaluationsTotal counter', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      expect(metricsModule.eligibilityEvaluationsTotal).toBeDefined();
    });

    it('should export eligibilityEligibleTotal counter', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      expect(metricsModule.eligibilityEligibleTotal).toBeDefined();
    });

    it('should export eligibilityIneligibleTotal counter', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      expect(metricsModule.eligibilityIneligibleTotal).toBeDefined();
    });

    it('should export eligibilityEvaluationDuration histogram', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      expect(metricsModule.eligibilityEvaluationDuration).toBeDefined();
    });
  });

  describe('AC-2: Metric counters have correct types', () => {
    it('should have Counter type for eligibilityEvaluationsTotal', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      const counter = metricsModule.eligibilityEvaluationsTotal;

      // Prometheus counters have an inc() method
      expect(typeof counter.inc).toBe('function');
    });

    it('should have Counter type for eligibilityEligibleTotal', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      const counter = metricsModule.eligibilityEligibleTotal;

      expect(typeof counter.inc).toBe('function');
    });

    it('should have Counter type for eligibilityIneligibleTotal', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      const counter = metricsModule.eligibilityIneligibleTotal;

      expect(typeof counter.inc).toBe('function');
    });

    it('should have Histogram type for eligibilityEvaluationDuration', async () => {
      const metricsModule = await import('../../src/lib/metrics.js');
      const histogram = metricsModule.eligibilityEvaluationDuration;

      // Prometheus histograms have an observe() method
      expect(typeof histogram.observe).toBe('function');
    });
  });
});
