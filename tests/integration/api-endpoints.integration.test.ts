/**
 * Integration tests for eligibility-engine API endpoints
 * Per ADR-014: Tests written BEFORE implementation (Phase 3.1 - Jessie)
 *
 * Tests cover:
 * - AC-4: Retrieve evaluation by journey_id
 * - AC-5: Health check endpoint
 *
 * Uses Testcontainers for real PostgreSQL instance
 *
 * Test Lock Rule: Blake MUST NOT modify these tests.
 * If Blake believes a test is wrong, hand back to Jessie with explanation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Client } from 'pg';

// Import fixtures
import evaluateRequestFixtures from '../fixtures/api/evaluate-request.fixture.json';
import evaluateResponseFixtures from '../fixtures/api/evaluate-response.fixture.json';

describe('Eligibility Engine API Endpoints', () => {
  /**
   * SERVICE CONTEXT: REST API endpoints for eligibility evaluation
   * SPECIFICATION: Phase 1 Specification Section 2.1
   * ADR COMPLIANCE: ADR-014 TDD Mandatory, Testcontainers for integration tests
   */

  let postgresContainer: StartedTestContainer;
  let dbClient: Client;
  let baseUrl: string;
  let dbConfig: { host: string; port: number; database: string; user: string; password: string };

  beforeAll(async () => {
    // Start PostgreSQL Testcontainer
    postgresContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'railrepay_test',
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .start();

    const host = postgresContainer.getHost();
    const port = postgresContainer.getMappedPort(5432);

    dbConfig = {
      host,
      port,
      database: 'railrepay_test',
      user: 'test',
      password: 'test',
    };

    // Connect to database
    dbClient = new Client(dbConfig);
    await dbClient.connect();

    // Create eligibility_engine schema and seed tables
    await dbClient.query(`
      CREATE SCHEMA IF NOT EXISTS eligibility_engine;

      CREATE TABLE eligibility_engine.toc_rulepacks (
        toc_code VARCHAR(5) PRIMARY KEY,
        toc_name VARCHAR(100) NOT NULL,
        scheme VARCHAR(10) NOT NULL CHECK (scheme IN ('DR15', 'DR30')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        effective_from DATE NOT NULL,
        effective_to DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE eligibility_engine.compensation_bands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scheme VARCHAR(10) NOT NULL,
        delay_minutes_min INTEGER NOT NULL,
        delay_minutes_max INTEGER,
        compensation_percentage DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE eligibility_engine.eligibility_evaluations (
        evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journey_id UUID NOT NULL,
        toc_code VARCHAR(5) NOT NULL,
        scheme VARCHAR(10) NOT NULL,
        delay_minutes INTEGER NOT NULL,
        ticket_fare_pence INTEGER NOT NULL,
        eligible BOOLEAN NOT NULL,
        compensation_percentage DECIMAL(5,2),
        compensation_pence INTEGER,
        reasons TEXT[],
        applied_rules TEXT[],
        evaluation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (journey_id)
      );

      -- Seed DR15 and DR30 TOCs
      INSERT INTO eligibility_engine.toc_rulepacks (toc_code, toc_name, scheme, is_active, effective_from) VALUES
        ('GR', 'LNER', 'DR15', true, '2020-01-01'),
        ('VT', 'Avanti West Coast', 'DR15', true, '2020-01-01'),
        ('SW', 'South Western Railway', 'DR30', true, '2020-01-01'),
        ('SR', 'ScotRail', 'DR30', true, '2020-01-01');

      -- Seed compensation bands
      INSERT INTO eligibility_engine.compensation_bands (scheme, delay_minutes_min, delay_minutes_max, compensation_percentage) VALUES
        ('DR15', 15, 29, 25.00),
        ('DR15', 30, 59, 50.00),
        ('DR15', 60, 119, 50.00),
        ('DR15', 120, NULL, 100.00),
        ('DR30', 30, 59, 50.00),
        ('DR30', 60, 119, 50.00),
        ('DR30', 120, NULL, 100.00);
    `);

    // The app will be started by Blake's implementation
    // For now, we'll use a placeholder baseUrl
    baseUrl = 'http://localhost:3000';
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    await dbClient?.end();
    await postgresContainer?.stop();
  });

  // ============================================
  // AC-5: Health Check Endpoint
  // ============================================

  describe('AC-5: Health Check Endpoint', () => {
    /**
     * AC-5: GET /health returns 200 with status "healthy"
     * when database connection is available
     */

    it('should return 200 with healthy status when database is connected', async () => {
      // This test will fail until the API is implemented
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act - use supertest or similar
      const response = await fetch(`${baseUrl}/health`);

      // Assert
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('eligibility-engine');
      expect(body.database).toBe('connected');
      expect(body.timestamp).toBeDefined();
    });

    it('should return 503 with unhealthy status when database is unavailable', async () => {
      // Arrange - create app with invalid database config
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          host: 'invalid-host',
          port: 5432,
          database: 'nonexistent',
          user: 'invalid',
          password: 'invalid',
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/health`);

      // Assert
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.status).toBe('unhealthy');
      expect(body.database).toBe('disconnected');
    });

    it('should include version information in health response', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();

      expect(body.version).toBeDefined();
    });
  });

  // ============================================
  // AC-4: Retrieve Evaluation by journey_id
  // ============================================

  describe('AC-4: GET /eligibility/:journey_id', () => {
    /**
     * AC-4: Given a completed evaluation exists
     * When GET /eligibility/:journey_id is called
     * Then the stored evaluation result is returned
     */

    const existingJourneyId = '550e8400-e29b-41d4-a716-446655440010';

    beforeEach(async () => {
      // Clear existing evaluations
      await dbClient.query('DELETE FROM eligibility_engine.eligibility_evaluations');

      // Insert a test evaluation
      await dbClient.query(`
        INSERT INTO eligibility_engine.eligibility_evaluations (
          evaluation_id, journey_id, toc_code, scheme, delay_minutes,
          ticket_fare_pence, eligible, compensation_percentage, compensation_pence,
          reasons, applied_rules, evaluation_timestamp
        ) VALUES (
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440010',
          'GR', 'DR15', 20, 2500, true, 25.00, 625,
          ARRAY['Delay of 20 minutes qualifies for 25% refund under DR15 scheme'],
          ARRAY['DR15_15MIN_25PCT'],
          '2026-01-15T12:26:00Z'
        )
      `);
    });

    it('should return 200 with evaluation when journey_id exists', async () => {
      // This test will fail until the API is implemented
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/${existingJourneyId}`);

      // Assert
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.journey_id).toBe(existingJourneyId);
      expect(body.eligible).toBe(true);
      expect(body.scheme).toBe('DR15');
      expect(body.delay_minutes).toBe(20);
      expect(body.compensation_percentage).toBe(25);
      expect(body.compensation_pence).toBe(625);
      expect(body.reasons).toContain('Delay of 20 minutes qualifies for 25% refund under DR15 scheme');
    });

    it('should return 404 when journey_id does not exist', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const response = await fetch(`${baseUrl}/eligibility/${nonExistentId}`);

      // Assert
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe('Evaluation not found');
      expect(body.journey_id).toBe(nonExistentId);
    });

    it('should return 400 for invalid journey_id format', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const invalidId = 'not-a-uuid';
      const response = await fetch(`${baseUrl}/eligibility/${invalidId}`);

      // Assert
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('Invalid journey_id format');
    });

    it('should include correlation_id in response headers', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/${existingJourneyId}`, {
        headers: {
          'X-Correlation-ID': 'test-correlation-123',
        },
      });

      // Assert
      expect(response.headers.get('X-Correlation-ID')).toBe('test-correlation-123');
    });
  });

  // ============================================
  // POST /eligibility/evaluate
  // ============================================

  describe('POST /eligibility/evaluate', () => {
    /**
     * AC-1, AC-2, AC-3 tested via API endpoint
     */

    it('should return 200 with eligible=true for DR15 TOC with 20min delay', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(evaluateRequestFixtures.dr15EligibleRequest),
      });

      // Assert
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.eligible).toBe(true);
      expect(body.scheme).toBe('DR15');
      expect(body.compensation_percentage).toBe(25);
    });

    it('should return 200 with eligible=false for DR30 TOC with 20min delay', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(evaluateRequestFixtures.dr30IneligibleRequest),
      });

      // Assert
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.eligible).toBe(false);
      expect(body.scheme).toBe('DR30');
      expect(body.reasons).toContain('Delay of 20 minutes does not meet DR30 30-minute threshold');
    });

    it('should return 400 for missing required fields', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act - missing delay_minutes
      const response = await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          journey_id: '550e8400-e29b-41d4-a716-446655440010',
          toc_code: 'GR',
          // missing delay_minutes
          ticket_fare_pence: 2500,
        }),
      });

      // Assert
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('Validation error');
      expect(body.details).toContain('delay_minutes');
    });

    it('should return 400 for invalid toc_code', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          journey_id: '550e8400-e29b-41d4-a716-446655440010',
          toc_code: 'INVALID_TOC_CODE_TOO_LONG',
          delay_minutes: 20,
          ticket_fare_pence: 2500,
        }),
      });

      // Assert
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('Validation error');
    });

    it('should return 409 for duplicate journey_id (idempotency)', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      const request = {
        journey_id: '550e8400-e29b-41d4-a716-446655440099',
        toc_code: 'GR',
        delay_minutes: 20,
        ticket_fare_pence: 2500,
      };

      // First request should succeed
      const response1 = await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      expect(response1.status).toBe(200);

      // Second request with same journey_id should return 409 or cached result
      const response2 = await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      // Either 409 Conflict or 200 with cached result is acceptable
      expect([200, 409]).toContain(response2.status);
    });

    it('should persist evaluation to database', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      const journeyId = '550e8400-e29b-41d4-a716-446655440088';

      // Act
      await fetch(`${baseUrl}/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey_id: journeyId,
          toc_code: 'GR',
          delay_minutes: 35,
          ticket_fare_pence: 3000,
        }),
      });

      // Assert - verify persisted in database
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [journeyId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].eligible).toBe(true);
      expect(result.rows[0].compensation_percentage).toBe('50.00');
      expect(result.rows[0].compensation_pence).toBe(1500);
    });
  });

  // ============================================
  // POST /eligibility/restriction/validate
  // ============================================

  describe('POST /eligibility/restriction/validate', () => {
    /**
     * AC-6 tested via API endpoint
     */

    it('should return valid=true for weekend ticket on Saturday', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/restriction/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restriction_codes: ['WE'],
          journey_date: '2026-01-18', // Saturday
          departure_time: '10:00',
        }),
      });

      // Assert
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.valid).toBe(true);
    });

    it('should return valid=false for off-peak ticket during peak hours', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/restriction/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restriction_codes: ['OP'],
          journey_date: '2026-01-15', // Wednesday
          departure_time: '07:30', // Peak hour
        }),
      });

      // Assert
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.valid).toBe(false);
      expect(body.blocking_restriction).toBe('OP');
    });

    it('should return 400 for invalid date format', async () => {
      const { createApp } = await import('../../src/app.js');
      const app = createApp({
        database: {
          ...dbConfig,
        },
      });

      // Act
      const response = await fetch(`${baseUrl}/eligibility/restriction/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restriction_codes: ['OP'],
          journey_date: '2026-13-45', // Invalid date
          departure_time: '10:00',
        }),
      });

      // Assert
      expect(response.status).toBe(400);
    });
  });
});
