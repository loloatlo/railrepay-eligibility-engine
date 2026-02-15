/**
 * Integration tests for Kafka event handling
 * Per ADR-014: Tests written BEFORE implementation (Phase 3.1 - Jessie)
 *
 * Tests cover:
 * - AC-9: Event Consumption (JourneyDelayConfirmed)
 * - AC-10: Event Production (EligibilityEvaluated)
 *
 * Uses Testcontainers for real PostgreSQL and transactional outbox pattern
 *
 * Test Lock Rule: Blake MUST NOT modify these tests.
 * If Blake believes a test is wrong, hand back to Jessie with explanation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Client } from 'pg';

// Import fixtures
import journeyDelayConfirmedFixtures from '../fixtures/messages/journey-delay-confirmed.fixture.json';
import eligibilityEvaluatedFixtures from '../fixtures/messages/eligibility-evaluated.fixture.json';

describe('Kafka Event Handling', () => {
  /**
   * SERVICE CONTEXT: Async event processing for eligibility evaluation
   * SPECIFICATION: Phase 1 Specification Section 3.1 (Event Consumption/Production)
   * ADR COMPLIANCE: ADR-014 TDD Mandatory, Transactional Outbox Pattern
   */

  let postgresContainer: StartedTestContainer;
  let dbClient: Client;
  let dbConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };

  beforeAll(async () => {
    // Start PostgreSQL Testcontainer using GenericContainer pattern
    postgresContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'railrepay_test',
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .start();

    // Build database config
    dbConfig = {
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      database: 'railrepay_test',
      user: 'test',
      password: 'test',
    };

    // Connect to database
    dbClient = new Client(dbConfig);
    await dbClient.connect();

    // Create eligibility_engine schema and required tables
    await dbClient.query(`
      CREATE SCHEMA IF NOT EXISTS eligibility_engine;

      CREATE TABLE eligibility_engine.toc_rulepacks (
        toc_code VARCHAR(5) PRIMARY KEY,
        toc_name VARCHAR(100) NOT NULL,
        scheme VARCHAR(10) NOT NULL CHECK (scheme IN ('DR15', 'DR30')),
        active BOOLEAN NOT NULL DEFAULT true,
        effective_from DATE NOT NULL,
        effective_to DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE eligibility_engine.compensation_bands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scheme_type VARCHAR(10) NOT NULL,
        delay_threshold_minutes INTEGER NOT NULL,
        compensation_percentage DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE eligibility_engine.eligibility_evaluations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journey_id UUID NOT NULL,
        toc_code VARCHAR(5) NOT NULL,
        scheme VARCHAR(10) NOT NULL,
        delay_minutes INTEGER NOT NULL,
        ticket_fare_pence INTEGER NOT NULL,
        eligible BOOLEAN NOT NULL,
        compensation_percentage DECIMAL(5,2),
        compensation_pence INTEGER,
        reasons JSONB,
        applied_rules JSONB,
        fare_breakdown JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (journey_id)
      );

      -- Transactional outbox table for reliable event publishing
      CREATE TABLE eligibility_engine.outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_type VARCHAR(100) NOT NULL,
        aggregate_id UUID NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );

      -- Seed TOC rulepacks
      INSERT INTO eligibility_engine.toc_rulepacks (toc_code, toc_name, scheme, active, effective_from) VALUES
        ('GR', 'LNER', 'DR15', true, '2020-01-01'),
        ('SW', 'South Western Railway', 'DR30', true, '2020-01-01'),
        ('CS', 'Caledonian Sleeper', 'DR15', true, '2020-01-01');

      -- Seed compensation bands
      INSERT INTO eligibility_engine.compensation_bands (scheme_type, delay_threshold_minutes, compensation_percentage) VALUES
        ('DR15', 15, 25.00),
        ('DR15', 30, 50.00),
        ('DR15', 60, 50.00),
        ('DR15', 120, 100.00),
        ('DR30', 30, 50.00),
        ('DR30', 60, 50.00),
        ('DR30', 120, 100.00);
    `);
  }, 60000);

  afterAll(async () => {
    await dbClient?.end();
    await postgresContainer?.stop();
  });

  beforeEach(async () => {
    // Clear tables before each test
    await dbClient.query('DELETE FROM eligibility_engine.outbox');
    await dbClient.query('DELETE FROM eligibility_engine.eligibility_evaluations');
  });

  // ============================================
  // AC-9: Event Consumption (JourneyDelayConfirmed)
  // ============================================

  describe('AC-9: JourneyDelayConfirmed Event Consumption', () => {
    /**
     * AC-9: Given a JourneyDelayConfirmed event is received
     * When the event handler processes it
     * Then an eligibility evaluation is performed and stored
     */

    it('should process JourneyDelayConfirmed event and create evaluation', async () => {
      // This test will fail until the event handler is implemented
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange
      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - evaluation should be created
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].toc_code).toBe('GR');
      expect(result.rows[0].scheme).toBe('DR15');
      expect(result.rows[0].delay_minutes).toBe(20);
      expect(result.rows[0].eligible).toBe(true);
      expect(result.rows[0].compensation_percentage).toBe('25.00');
    });

    it('should handle DR30 journey event correctly', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange - DR30 with 45 min delay (should be eligible)
      const event = journeyDelayConfirmedFixtures.dr30JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].toc_code).toBe('SW');
      expect(result.rows[0].scheme).toBe('DR30');
      expect(result.rows[0].eligible).toBe(true);
      expect(result.rows[0].compensation_percentage).toBe('50.00');
    });

    it('should handle sleeper journey event with fare capping', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange - Sleeper journey
      const event = journeyDelayConfirmedFixtures.sleeperJourneyEvent;

      // Act
      await handler.handle(event);

      // Assert
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].toc_code).toBe('CS');
      expect(result.rows[0].eligible).toBe(true);
      // Sleeper fare capping should apply
    });

    it('should be idempotent for duplicate events', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act - process same event twice
      await handler.handle(event);
      await handler.handle(event);

      // Assert - should only create one evaluation
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      expect(result.rows).toHaveLength(1);
    });

    it('should propagate correlation_id from incoming event', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - outbox entry should have correlation_id
      const outboxResult = await dbClient.query(
        'SELECT * FROM eligibility_engine.outbox WHERE aggregate_id = $1',
        [event.payload.journey_id]
      );

      expect(outboxResult.rows).toHaveLength(1);
      expect(outboxResult.rows[0].payload.correlation_id).toBe(event.correlation_id);
    });

    it('should handle multi-TOC journey segments', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange - multi-TOC journey
      const event = {
        ...journeyDelayConfirmedFixtures.dr15JourneyEvent,
        payload: {
          ...journeyDelayConfirmedFixtures.dr15JourneyEvent.payload,
          journey_id: '550e8400-e29b-41d4-a716-446655440099',
          journey_segments: [
            { toc_code: 'GR', fare_portion_pence: 1500 },
            { toc_code: 'SW', fare_portion_pence: 1000 },
          ],
        },
      };

      // Act
      await handler.handle(event);

      // Assert
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      expect(result.rows).toHaveLength(1);
      // Should have apportioned compensation
    });
  });

  // ============================================
  // AC-10: Event Production (EligibilityEvaluated)
  // ============================================

  describe('AC-10: EligibilityEvaluated Event Production', () => {
    /**
     * AC-10: Given an eligibility evaluation is completed
     * When the evaluation is stored
     * Then an EligibilityEvaluated event is written to the outbox
     */

    it('should write EligibilityEvaluated event to outbox after evaluation', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - outbox should contain the event
      const outboxResult = await dbClient.query(
        'SELECT * FROM eligibility_engine.outbox WHERE event_type = $1',
        ['EligibilityEvaluated']
      );

      expect(outboxResult.rows).toHaveLength(1);
      expect(outboxResult.rows[0].aggregate_type).toBe('eligibility_evaluation');
      expect(outboxResult.rows[0].published_at).toBeNull(); // Not yet published
    });

    it('should include all required fields in EligibilityEvaluated event payload', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - verify payload structure
      const outboxResult = await dbClient.query(
        'SELECT payload FROM eligibility_engine.outbox WHERE event_type = $1',
        ['EligibilityEvaluated']
      );

      const payload = outboxResult.rows[0].payload;

      // Required fields per specification
      expect(payload.evaluation_id).toBeDefined();
      expect(payload.journey_id).toBe(event.payload.journey_id);
      expect(payload.eligible).toBe(true);
      expect(payload.scheme).toBe('DR15');
      expect(payload.delay_minutes).toBe(20);
      expect(payload.compensation_percentage).toBe(25);
      expect(payload.compensation_pence).toBe(625); // 2500 * 0.25
      expect(payload.ticket_fare_pence).toBe(2500);
      expect(payload.toc_code).toBe('GR');
      expect(payload.reasons).toBeDefined();
      expect(payload.applied_rules).toBeDefined();
      expect(payload.evaluation_timestamp).toBeDefined();
    });

    it('should write ineligible evaluation event to outbox', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange - DR30 with only 20 min delay (ineligible)
      const event = {
        ...journeyDelayConfirmedFixtures.dr30JourneyEvent,
        payload: {
          ...journeyDelayConfirmedFixtures.dr30JourneyEvent.payload,
          journey_id: '550e8400-e29b-41d4-a716-446655440098',
          delay_minutes: 20, // Below 30 min threshold
        },
      };

      // Act
      await handler.handle(event);

      // Assert
      const outboxResult = await dbClient.query(
        'SELECT payload FROM eligibility_engine.outbox WHERE aggregate_id = $1',
        [event.payload.journey_id]
      );

      expect(outboxResult.rows).toHaveLength(1);
      expect(outboxResult.rows[0].payload.eligible).toBe(false);
      expect(outboxResult.rows[0].payload.compensation_percentage).toBe(0);
      expect(outboxResult.rows[0].payload.compensation_pence).toBe(0);
    });

    it('should use transactional consistency between evaluation and outbox', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - both tables should have entries (atomic transaction)
      const evalResult = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );
      const outboxResult = await dbClient.query(
        'SELECT * FROM eligibility_engine.outbox WHERE aggregate_id = $1',
        [event.payload.journey_id]
      );

      expect(evalResult.rows).toHaveLength(1);
      expect(outboxResult.rows).toHaveLength(1);

      // If one exists, the other must exist (transactional)
    });
  });

  // ============================================
  // Error Handling
  // ============================================

  describe('Error Handling', () => {
    it('should handle unknown TOC gracefully', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange - unknown TOC
      const event = {
        ...journeyDelayConfirmedFixtures.dr15JourneyEvent,
        payload: {
          ...journeyDelayConfirmedFixtures.dr15JourneyEvent.payload,
          journey_id: '550e8400-e29b-41d4-a716-446655440097',
          toc_code: 'XX', // Unknown TOC
        },
      };

      // Act
      await handler.handle(event);

      // Assert - should create ineligible evaluation with reason
      const result = await dbClient.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].eligible).toBe(false);
      expect(result.rows[0].reasons).toContain('Unknown TOC');
    });

    it('should handle malformed event payload', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      const handler = new JourneyDelayConfirmedHandler(dbConfig);

      // Arrange - malformed event (missing required fields)
      const event = {
        event_type: 'JourneyDelayConfirmed',
        payload: {
          journey_id: '550e8400-e29b-41d4-a716-446655440096',
          // Missing toc_code, delay_minutes, etc.
        },
      };

      // Act & Assert - should throw validation error
      await expect(handler.handle(event as any)).rejects.toThrow();
    });

    it('should handle database connection failure gracefully', async () => {
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      // Create handler with invalid database config
      const handler = new JourneyDelayConfirmedHandler({
        host: 'invalid-host',
        port: 5432,
        database: 'nonexistent',
        user: 'invalid',
        password: 'invalid',
      });

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act & Assert - should throw connection error
      await expect(handler.handle(event)).rejects.toThrow();
    });
  });

  // ============================================
  // Observability
  // ============================================

  describe('Observability', () => {
    it('should emit metrics for successful evaluations', async () => {
      // This test verifies observability instrumentation per ADR-002
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      // Mock metrics collector
      const metricsCollector = {
        incrementCounter: vi.fn(),
        recordHistogram: vi.fn(),
      };

      const handler = new JourneyDelayConfirmedHandler(
        dbConfig,
        { metrics: metricsCollector }
      );

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - metrics should be emitted
      expect(metricsCollector.incrementCounter).toHaveBeenCalledWith(
        'eligibility_evaluations_total',
        expect.objectContaining({ eligible: 'true', scheme: 'DR15' })
      );
    });

    it('should log evaluation with correlation_id', async () => {
      // This test verifies structured logging per ADR-002
      const { JourneyDelayConfirmedHandler } = await import(
        '../../src/handlers/journey-delay-confirmed.handler.js'
      );

      // Mock logger
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const handler = new JourneyDelayConfirmedHandler(
        dbConfig,
        { logger: mockLogger }
      );

      const event = journeyDelayConfirmedFixtures.dr15JourneyEvent;

      // Act
      await handler.handle(event);

      // Assert - log should include correlation_id
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: event.correlation_id,
        }),
        expect.any(String)
      );
    });
  });
});

// Import vi for mocking
import { vi } from 'vitest';
