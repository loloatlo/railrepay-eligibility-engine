/**
 * TD-ELIGIBILITY-004: Metrics Endpoint Integration Tests
 * Phase TD-1 - Test Specification (Jessie)
 *
 * These tests verify that the /metrics endpoint exists and returns
 * Prometheus-formatted metrics with the required counters and histograms.
 * All tests MUST FAIL initially before Blake implements the fixes.
 *
 * Note: These tests require the application to be running.
 * They use the existing test infrastructure from api-endpoints.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Client } from 'pg';
import { createApp, stopServer } from '../../src/app.js';

describe('TD-ELIGIBILITY-004: Metrics Endpoint Integration', () => {
  let container: StartedTestContainer;
  let dbClient: Client;
  const baseUrl = 'http://localhost:3000';

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'railrepay_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);

    // Connect to database
    dbClient = new Client({
      host,
      port,
      database: 'railrepay_test',
      user: 'test',
      password: 'test',
    });
    await dbClient.connect();

    // Create schema and tables needed for the app
    await dbClient.query('CREATE SCHEMA IF NOT EXISTS eligibility_engine');
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS eligibility_engine.toc_rulepacks (
        toc_code VARCHAR(5) PRIMARY KEY,
        scheme VARCHAR(10) NOT NULL,
        active BOOLEAN DEFAULT true
      )
    `);
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS eligibility_engine.compensation_bands (
        id SERIAL PRIMARY KEY,
        scheme_type VARCHAR(10) NOT NULL,
        delay_threshold_minutes INT NOT NULL,
        compensation_percentage DECIMAL(5,2) NOT NULL
      )
    `);
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS eligibility_engine.eligibility_evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journey_id UUID NOT NULL UNIQUE,
        toc_code VARCHAR(5) NOT NULL,
        scheme VARCHAR(10) NOT NULL,
        delay_minutes INT NOT NULL,
        ticket_fare_pence INT NOT NULL,
        eligible BOOLEAN NOT NULL,
        compensation_percentage DECIMAL(5,2) NOT NULL,
        compensation_pence INT NOT NULL,
        reasons JSONB NOT NULL,
        applied_rules JSONB NOT NULL,
        fare_breakdown JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Insert test data
    await dbClient.query(`
      INSERT INTO eligibility_engine.toc_rulepacks (toc_code, scheme, active)
      VALUES ('GWR', 'DR30', true)
      ON CONFLICT (toc_code) DO NOTHING
    `);
    await dbClient.query(`
      INSERT INTO eligibility_engine.compensation_bands (scheme_type, delay_threshold_minutes, compensation_percentage)
      VALUES ('DR30', 30, 50.00), ('DR30', 60, 100.00)
      ON CONFLICT DO NOTHING
    `);

    // Create the app with test database config
    createApp({
      database: {
        host,
        port,
        database: 'railrepay_test',
        user: 'test',
        password: 'test',
      },
    });

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }, 120000);

  afterAll(async () => {
    await stopServer();
    if (dbClient) {
      await dbClient.end();
    }
    if (container) {
      await container.stop();
    }
  });

  describe('AC-3: /metrics endpoint returns Prometheus-formatted metrics', () => {
    it('should have /metrics endpoint that returns 200', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      expect(response.status).toBe(200);
    });

    it('should return text/plain content type', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('text/plain');
    });

    it('should return Prometheus-formatted output with HELP comments', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();
      expect(body).toContain('# HELP');
    });

    it('should return Prometheus-formatted output with TYPE comments', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();
      expect(body).toContain('# TYPE');
    });
  });

  describe('AC-4: eligibility_evaluations_total increments on each POST /eligibility/evaluate', () => {
    it('should have eligibility_evaluations_total metric defined', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();
      expect(body).toContain('eligibility_evaluations_total');
    });

    it('should increment eligibility_evaluations_total counter on evaluation', async () => {
      // Get initial metric value
      const initialResponse = await fetch(`${baseUrl}/metrics`);
      const initialBody = await initialResponse.text();
      const initialMatch = initialBody.match(/eligibility_evaluations_total\s+(\d+)/);
      const initialCount = initialMatch ? parseInt(initialMatch[1], 10) : 0;

      // Make an evaluation request
      const journeyId = crypto.randomUUID();
      await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey_id: journeyId,
          toc_code: 'GWR',
          delay_minutes: 45,
          ticket_fare_pence: 5000,
        }),
      });

      // Check metric incremented
      const finalResponse = await fetch(`${baseUrl}/metrics`);
      const finalBody = await finalResponse.text();
      const finalMatch = finalBody.match(/eligibility_evaluations_total\s+(\d+)/);
      const finalCount = finalMatch ? parseInt(finalMatch[1], 10) : 0;

      expect(finalCount).toBeGreaterThan(initialCount);
    });
  });

  describe('AC-5: eligibility_eligible_total increments when evaluation is eligible', () => {
    it('should have eligibility_eligible_total metric defined', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();
      expect(body).toContain('eligibility_eligible_total');
    });
  });

  describe('AC-6: eligibility_ineligible_total increments when evaluation is ineligible', () => {
    it('should have eligibility_ineligible_total metric defined', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();
      expect(body).toContain('eligibility_ineligible_total');
    });
  });

  describe('AC-7: eligibility_evaluation_duration_seconds records evaluation latency', () => {
    it('should have eligibility_evaluation_duration_seconds metric defined', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();
      expect(body).toContain('eligibility_evaluation_duration_seconds');
    });

    it('should be a histogram type', async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();

      // Prometheus histograms have _bucket, _sum, and _count suffixes
      expect(body).toContain('eligibility_evaluation_duration_seconds_bucket');
    });
  });
});
