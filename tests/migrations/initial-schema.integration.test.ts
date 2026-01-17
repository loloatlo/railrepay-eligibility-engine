/**
 * Integration tests for eligibility_engine schema migrations
 * Per ADR-014: Tests written BEFORE migration implementation
 * Per Testing Strategy 2.0: Testcontainers for PostgreSQL
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Pool, PoolClient } from 'pg';
import { execSync } from 'child_process';
import path from 'path';

describe('eligibility_engine schema migrations', () => {
  let postgresContainer: StartedTestContainer;
  let pool: Pool;
  let connectionString: string;

  // Increase timeout for Testcontainers startup
  beforeAll(async () => {
    // Start PostgreSQL container
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

    connectionString = `postgres://test:test@${host}:${port}/railrepay_test`;

    // Create connection pool
    pool = new Pool({
      host,
      port,
      database: 'railrepay_test',
      user: 'test',
      password: 'test',
    });

    // Run migrations using node-pg-migrate
    const migrationsDir = path.join(__dirname, '../../migrations');

    execSync('npm run migrate:up', {
      cwd: path.join(__dirname, '../..'),
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        PGUSER: 'test',
        PGPASSWORD: 'test',
        PGHOST: host,
        PGPORT: port.toString(),
        PGDATABASE: 'railrepay_test',
      },
    });
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    await pool?.end();
    await postgresContainer?.stop();
  });

  // ============================================
  // SCHEMA CREATION TESTS
  // ============================================

  describe('schema creation', () => {
    it('should create eligibility_engine schema', async () => {
      const result = await pool.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name = 'eligibility_engine'
      `);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].schema_name).toBe('eligibility_engine');
    });
  });

  // ============================================
  // TABLE CREATION TESTS
  // ============================================

  describe('table creation', () => {
    it('should create eligibility_evaluations table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND table_name = 'eligibility_evaluations'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((r) => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('journey_id');
      expect(columns).toContain('toc_code');
      expect(columns).toContain('scheme');
      expect(columns).toContain('delay_minutes');
      expect(columns).toContain('eligible');
      expect(columns).toContain('compensation_percentage');
      expect(columns).toContain('compensation_pence');
      expect(columns).toContain('ticket_fare_pence');
      expect(columns).toContain('reasons');
      expect(columns).toContain('applied_rules');
      expect(columns).toContain('fare_breakdown');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should create toc_rulepacks table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND table_name = 'toc_rulepacks'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((r) => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('toc_code');
      expect(columns).toContain('toc_name');
      expect(columns).toContain('scheme');
      expect(columns).toContain('allows_online_claims');
      expect(columns).toContain('max_claim_days');
      expect(columns).toContain('special_rules');
      expect(columns).toContain('active');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should create compensation_bands table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND table_name = 'compensation_bands'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((r) => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('scheme_type');
      expect(columns).toContain('delay_threshold_minutes');
      expect(columns).toContain('compensation_percentage');
      expect(columns).toContain('created_at');
    });

    it('should create seated_fare_equivalents table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND table_name = 'seated_fare_equivalents'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((r) => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('route_code');
      expect(columns).toContain('sleeper_class');
      expect(columns).toContain('seated_equivalent_pence');
      expect(columns).toContain('effective_from');
      expect(columns).toContain('effective_to');
      expect(columns).toContain('created_at');
    });

    it('should create outbox table per standard pattern', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND table_name = 'outbox'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((r) => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('aggregate_type');
      expect(columns).toContain('aggregate_id');
      expect(columns).toContain('event_type');
      expect(columns).toContain('payload');
      expect(columns).toContain('created_at');
      expect(columns).toContain('published_at');
    });
  });

  // ============================================
  // CONSTRAINT TESTS
  // ============================================

  describe('constraints', () => {
    it('should enforce unique constraint on journey_id in eligibility_evaluations', async () => {
      // Insert first evaluation
      await pool.query(`
        INSERT INTO eligibility_engine.eligibility_evaluations (
          journey_id, toc_code, scheme, delay_minutes, eligible,
          compensation_percentage, compensation_pence, ticket_fare_pence
        ) VALUES (
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'GR', 'DR15', 20, true, 25.00, 375, 1500
        )
      `);

      // Attempt to insert duplicate journey_id should fail
      await expect(
        pool.query(`
          INSERT INTO eligibility_engine.eligibility_evaluations (
            journey_id, toc_code, scheme, delay_minutes, eligible,
            compensation_percentage, compensation_pence, ticket_fare_pence
          ) VALUES (
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'GW', 'DR30', 30, true, 50.00, 750, 1500
          )
        `)
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    });

    it('should enforce unique constraint on toc_code in toc_rulepacks', async () => {
      // TOC codes are seeded by migration, so insert duplicate should fail
      await expect(
        pool.query(`
          INSERT INTO eligibility_engine.toc_rulepacks (
            toc_code, toc_name, scheme
          ) VALUES (
            'GR', 'Duplicate LNER', 'DR15'
          )
        `)
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    });

    it('should enforce unique constraint on (scheme_type, delay_threshold_minutes) in compensation_bands', async () => {
      // Compensation bands are seeded, so insert duplicate should fail
      await expect(
        pool.query(`
          INSERT INTO eligibility_engine.compensation_bands (
            scheme_type, delay_threshold_minutes, compensation_percentage
          ) VALUES (
            'DR15', 15, 30.00
          )
        `)
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    });

    it('should enforce check constraint on scheme values in eligibility_evaluations', async () => {
      await expect(
        pool.query(`
          INSERT INTO eligibility_engine.eligibility_evaluations (
            journey_id, toc_code, scheme, delay_minutes, eligible,
            compensation_percentage, compensation_pence, ticket_fare_pence
          ) VALUES (
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            'GR', 'DR99', 20, true, 25.00, 375, 1500
          )
        `)
      ).rejects.toThrow(/violates check constraint/);
    });

    it('should enforce check constraint on scheme values in toc_rulepacks', async () => {
      await expect(
        pool.query(`
          INSERT INTO eligibility_engine.toc_rulepacks (
            toc_code, toc_name, scheme
          ) VALUES (
            'ZZ', 'Test TOC', 'INVALID'
          )
        `)
      ).rejects.toThrow(/violates check constraint/);
    });

    it('should enforce check constraint on scheme_type in compensation_bands', async () => {
      await expect(
        pool.query(`
          INSERT INTO eligibility_engine.compensation_bands (
            scheme_type, delay_threshold_minutes, compensation_percentage
          ) VALUES (
            'DR99', 15, 25.00
          )
        `)
      ).rejects.toThrow(/violates check constraint/);
    });
  });

  // ============================================
  // INDEX TESTS
  // ============================================

  describe('indexes', () => {
    it('should create indexes on eligibility_evaluations', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'eligibility_engine'
          AND tablename = 'eligibility_evaluations'
      `);

      const indexNames = result.rows.map((r) => r.indexname);

      // Check for expected indexes (naming may vary based on node-pg-migrate)
      expect(indexNames.some((n) => n.includes('journey_id'))).toBe(true);
      expect(indexNames.some((n) => n.includes('created_at'))).toBe(true);
    });

    it('should create indexes on toc_rulepacks', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'eligibility_engine'
          AND tablename = 'toc_rulepacks'
      `);

      const indexNames = result.rows.map((r) => r.indexname);

      expect(indexNames.some((n) => n.includes('toc_code'))).toBe(true);
      expect(indexNames.some((n) => n.includes('active'))).toBe(true);
    });

    it('should create partial index on outbox for unpublished events', async () => {
      const result = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'eligibility_engine'
          AND tablename = 'outbox'
      `);

      const unpublishedIndex = result.rows.find(
        (r) => r.indexdef.includes('published_at IS NULL')
      );

      expect(unpublishedIndex).toBeDefined();
    });
  });

  // ============================================
  // SEED DATA TESTS
  // ============================================

  describe('seed data', () => {
    it('should seed compensation_bands with 7 regulated values', async () => {
      const result = await pool.query(`
        SELECT scheme_type, delay_threshold_minutes, compensation_percentage
        FROM eligibility_engine.compensation_bands
        ORDER BY scheme_type, delay_threshold_minutes
      `);

      expect(result.rows).toHaveLength(7);

      // Verify DR15 bands
      const dr15Bands = result.rows.filter((r) => r.scheme_type === 'DR15');
      expect(dr15Bands).toHaveLength(4);
      expect(dr15Bands.find((b) => b.delay_threshold_minutes === 15)?.compensation_percentage).toBe('25.00');
      expect(dr15Bands.find((b) => b.delay_threshold_minutes === 30)?.compensation_percentage).toBe('50.00');
      expect(dr15Bands.find((b) => b.delay_threshold_minutes === 60)?.compensation_percentage).toBe('50.00');
      expect(dr15Bands.find((b) => b.delay_threshold_minutes === 120)?.compensation_percentage).toBe('100.00');

      // Verify DR30 bands
      const dr30Bands = result.rows.filter((r) => r.scheme_type === 'DR30');
      expect(dr30Bands).toHaveLength(3);
      expect(dr30Bands.find((b) => b.delay_threshold_minutes === 30)?.compensation_percentage).toBe('50.00');
      expect(dr30Bands.find((b) => b.delay_threshold_minutes === 60)?.compensation_percentage).toBe('50.00');
      expect(dr30Bands.find((b) => b.delay_threshold_minutes === 120)?.compensation_percentage).toBe('100.00');
    });

    it('should seed toc_rulepacks with initial TOC configuration', async () => {
      const result = await pool.query(`
        SELECT toc_code, toc_name, scheme, active
        FROM eligibility_engine.toc_rulepacks
        WHERE active = true
        ORDER BY toc_code
      `);

      // Verify at least 15 TOCs are seeded
      expect(result.rows.length).toBeGreaterThanOrEqual(15);

      // Verify DR15 TOCs
      const lner = result.rows.find((r) => r.toc_code === 'GR');
      expect(lner).toBeDefined();
      expect(lner?.toc_name).toBe('LNER');
      expect(lner?.scheme).toBe('DR15');

      // Verify DR30 TOCs
      const scotrail = result.rows.find((r) => r.toc_code === 'SR');
      expect(scotrail).toBeDefined();
      expect(scotrail?.toc_name).toBe('ScotRail');
      expect(scotrail?.scheme).toBe('DR30');
    });
  });

  // ============================================
  // DATA TYPE TESTS
  // ============================================

  describe('data types', () => {
    it('should use TIMESTAMPTZ for timestamp columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND column_name IN ('created_at', 'updated_at', 'published_at')
      `);

      result.rows.forEach((row) => {
        expect(row.data_type).toBe('timestamp with time zone');
      });
    });

    it('should use JSONB for JSON columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND column_name IN ('reasons', 'applied_rules', 'fare_breakdown', 'special_rules', 'payload')
      `);

      result.rows.forEach((row) => {
        expect(row.data_type).toBe('jsonb');
      });
    });

    it('should use UUID for id columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'eligibility_engine'
          AND column_name = 'id'
      `);

      result.rows.forEach((row) => {
        expect(row.data_type).toBe('uuid');
      });
    });
  });

  // ============================================
  // ROLLBACK TESTS
  // ============================================

  describe('rollback', () => {
    it('should rollback cleanly', async () => {
      // Create a new connection to run rollback
      const rollbackPool = new Pool({
        host: postgresContainer.getHost(),
        port: postgresContainer.getMappedPort(5432),
        database: 'railrepay_test',
        user: 'test',
        password: 'test',
      });

      try {
        // Run rollback
        execSync('npm run migrate:down', {
          cwd: path.join(__dirname, '../..'),
          env: {
            ...process.env,
            DATABASE_URL: connectionString,
            PGUSER: 'test',
            PGPASSWORD: 'test',
            PGHOST: postgresContainer.getHost(),
            PGPORT: postgresContainer.getMappedPort(5432).toString(),
            PGDATABASE: 'railrepay_test',
          },
        });

        // Verify schema is dropped
        const schemaResult = await rollbackPool.query(`
          SELECT schema_name
          FROM information_schema.schemata
          WHERE schema_name = 'eligibility_engine'
        `);

        expect(schemaResult.rows).toHaveLength(0);

        // Verify tables are dropped
        const tablesResult = await rollbackPool.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'eligibility_engine'
        `);

        expect(tablesResult.rows).toHaveLength(0);

        // Re-run migrations to restore state for other tests
        execSync('npm run migrate:up', {
          cwd: path.join(__dirname, '../..'),
          env: {
            ...process.env,
            DATABASE_URL: connectionString,
            PGUSER: 'test',
            PGPASSWORD: 'test',
            PGHOST: postgresContainer.getHost(),
            PGPORT: postgresContainer.getMappedPort(5432).toString(),
            PGDATABASE: 'railrepay_test',
          },
        });
      } finally {
        await rollbackPool.end();
      }
    });
  });

  // ============================================
  // SCHEMA ISOLATION TESTS (ADR-001)
  // ============================================

  describe('schema isolation (ADR-001)', () => {
    it('should not have cross-schema foreign keys', async () => {
      const result = await pool.query(`
        SELECT
          tc.constraint_name,
          tc.table_schema,
          tc.table_name,
          ccu.table_schema AS foreign_table_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'eligibility_engine'
          AND ccu.table_schema != 'eligibility_engine'
      `);

      // Should have no cross-schema FKs
      expect(result.rows).toHaveLength(0);
    });

    it('should use schema-prefixed table names in all queries', async () => {
      // This is more of a documentation test - ensure queries work with explicit schema
      const result = await pool.query(`
        SELECT * FROM eligibility_engine.compensation_bands LIMIT 1
      `);

      expect(result.rows).toHaveLength(1);
    });
  });

  // ============================================
  // TRANSACTIONAL OUTBOX PATTERN TESTS
  // ============================================

  describe('transactional outbox pattern', () => {
    it('should write event to outbox in same transaction as business data', async () => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Insert evaluation
        const evalResult = await client.query(`
          INSERT INTO eligibility_engine.eligibility_evaluations (
            journey_id, toc_code, scheme, delay_minutes, eligible,
            compensation_percentage, compensation_pence, ticket_fare_pence
          ) VALUES (
            'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'GR', 'DR15', 20, true, 25.00, 375, 1500
          ) RETURNING id
        `);

        const evalId = evalResult.rows[0].id;

        // Insert outbox event in same transaction
        await client.query(`
          INSERT INTO eligibility_engine.outbox (
            aggregate_type, aggregate_id, event_type, payload
          ) VALUES (
            'eligibility_evaluation',
            $1,
            'EligibilityEvaluated',
            $2
          )
        `, [evalId, JSON.stringify({ evaluationId: evalId, eligible: true })]);

        await client.query('COMMIT');

        // Verify both inserts succeeded
        const evalCheck = await pool.query(
          'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE id = $1',
          [evalId]
        );
        expect(evalCheck.rows).toHaveLength(1);

        const outboxCheck = await pool.query(
          'SELECT * FROM eligibility_engine.outbox WHERE aggregate_id = $1',
          [evalId]
        );
        expect(outboxCheck.rows).toHaveLength(1);
        expect(outboxCheck.rows[0].event_type).toBe('EligibilityEvaluated');
        expect(outboxCheck.rows[0].published_at).toBeNull();
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    it('should rollback both business data and outbox event on failure', async () => {
      const client = await pool.connect();
      const journeyId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

      try {
        await client.query('BEGIN');

        // Insert evaluation
        await client.query(`
          INSERT INTO eligibility_engine.eligibility_evaluations (
            journey_id, toc_code, scheme, delay_minutes, eligible,
            compensation_percentage, compensation_pence, ticket_fare_pence
          ) VALUES (
            $1,
            'GR', 'DR15', 20, true, 25.00, 375, 1500
          )
        `, [journeyId]);

        // Simulate error by trying to insert invalid outbox entry
        await client.query(`
          INSERT INTO eligibility_engine.outbox (
            aggregate_type, aggregate_id, event_type, payload
          ) VALUES (
            'eligibility_evaluation',
            NULL,
            'EligibilityEvaluated',
            'invalid'
          )
        `);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');

        // Verify BOTH inserts rolled back
        const evalCheck = await pool.query(
          'SELECT COUNT(*) FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
          [journeyId]
        );
        expect(evalCheck.rows[0].count).toBe('0');
      } finally {
        client.release();
      }
    });
  });
});
