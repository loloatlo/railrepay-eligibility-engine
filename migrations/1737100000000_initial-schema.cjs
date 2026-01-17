/**
 * Initial schema migration for eligibility-engine service.
 *
 * Creates the eligibility_engine schema with 5 tables:
 * - eligibility_evaluations: Main evaluation records
 * - toc_rulepacks: TOC-specific DR15/DR30 scheme assignments
 * - compensation_bands: Consumer Rights Act 2015 regulated compensation percentages
 * - seated_fare_equivalents: Fare lookup for standing tickets
 * - outbox: Transactional outbox for event delivery
 *
 * Per ADR-001: Schema-per-service pattern - no cross-schema queries or FKs.
 * Per ADR-003: All migrations use node-pg-migrate.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */

/** @type {import('node-pg-migrate').ColumnDefinitions | undefined} */
exports.shorthands = undefined;

/**
 * Forward migration - creates eligibility_engine schema and all tables.
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // ============================================================
  // STEP 1: Create the eligibility_engine schema
  // ============================================================
  pgm.sql('CREATE SCHEMA IF NOT EXISTS eligibility_engine');

  // ============================================================
  // STEP 2: Create updated_at trigger function
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE FUNCTION eligibility_engine.update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // ============================================================
  // STEP 3: Create toc_rulepacks table (reference data)
  // ============================================================
  pgm.createTable(
    { schema: 'eligibility_engine', name: 'toc_rulepacks' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      toc_code: {
        type: 'varchar(10)',
        notNull: true,
        unique: true,
      },
      toc_name: {
        type: 'varchar(100)',
        notNull: true,
      },
      scheme: {
        type: 'varchar(10)',
        notNull: true,
        check: "scheme IN ('DR15', 'DR30')",
      },
      allows_online_claims: {
        type: 'boolean',
        notNull: true,
        default: true,
      },
      max_claim_days: {
        type: 'integer',
        notNull: true,
        default: 28,
      },
      special_rules: {
        type: 'jsonb',
        notNull: false,
      },
      active: {
        type: 'boolean',
        notNull: true,
        default: true,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
    }
  );

  // Index on toc_code for fast lookups
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'toc_rulepacks' },
    'toc_code',
    { name: 'idx_toc_rulepacks_toc_code' }
  );

  // Index on active for filtering
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'toc_rulepacks' },
    'active',
    { name: 'idx_toc_rulepacks_active' }
  );

  // Trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER toc_rulepacks_updated_at
    BEFORE UPDATE ON eligibility_engine.toc_rulepacks
    FOR EACH ROW
    EXECUTE FUNCTION eligibility_engine.update_updated_at_column();
  `);

  // ============================================================
  // STEP 4: Create compensation_bands table (reference data)
  // ============================================================
  pgm.createTable(
    { schema: 'eligibility_engine', name: 'compensation_bands' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      scheme_type: {
        type: 'varchar(10)',
        notNull: true,
        check: "scheme_type IN ('DR15', 'DR30')",
      },
      delay_threshold_minutes: {
        type: 'integer',
        notNull: true,
      },
      compensation_percentage: {
        type: 'numeric(5,2)',
        notNull: true,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
    }
  );

  // Unique constraint on scheme_type + delay_threshold_minutes
  pgm.addConstraint(
    { schema: 'eligibility_engine', name: 'compensation_bands' },
    'uq_compensation_bands_scheme_threshold',
    { unique: ['scheme_type', 'delay_threshold_minutes'] }
  );

  // Index for fast lookups by scheme_type
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'compensation_bands' },
    'scheme_type',
    { name: 'idx_compensation_bands_scheme_type' }
  );

  // ============================================================
  // STEP 5: Create seated_fare_equivalents table (reference data)
  // ============================================================
  pgm.createTable(
    { schema: 'eligibility_engine', name: 'seated_fare_equivalents' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      route_code: {
        type: 'varchar(50)',
        notNull: true,
      },
      sleeper_class: {
        type: 'varchar(50)',
        notNull: true,
      },
      seated_equivalent_pence: {
        type: 'integer',
        notNull: true,
      },
      effective_from: {
        type: 'date',
        notNull: true,
      },
      effective_to: {
        type: 'date',
        notNull: false,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
    }
  );

  // Index on route_code for lookups
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'seated_fare_equivalents' },
    'route_code',
    { name: 'idx_seated_fare_equivalents_route_code' }
  );

  // ============================================================
  // STEP 6: Create eligibility_evaluations table (main table)
  // ============================================================
  pgm.createTable(
    { schema: 'eligibility_engine', name: 'eligibility_evaluations' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      journey_id: {
        type: 'uuid',
        notNull: true,
        unique: true,
      },
      toc_code: {
        type: 'varchar(10)',
        notNull: true,
      },
      scheme: {
        type: 'varchar(10)',
        notNull: true,
        check: "scheme IN ('DR15', 'DR30')",
      },
      delay_minutes: {
        type: 'integer',
        notNull: true,
      },
      eligible: {
        type: 'boolean',
        notNull: true,
      },
      compensation_percentage: {
        type: 'numeric(5,2)',
        notNull: false,
      },
      compensation_pence: {
        type: 'integer',
        notNull: false,
      },
      ticket_fare_pence: {
        type: 'integer',
        notNull: false,
      },
      reasons: {
        type: 'jsonb',
        notNull: false,
      },
      applied_rules: {
        type: 'jsonb',
        notNull: false,
      },
      fare_breakdown: {
        type: 'jsonb',
        notNull: false,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
    }
  );

  // Index on journey_id (unique constraint already creates this, but explicit for clarity)
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'eligibility_evaluations' },
    'journey_id',
    { name: 'idx_eligibility_evaluations_journey_id' }
  );

  // Index on created_at for time-range queries
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'eligibility_evaluations' },
    'created_at',
    { name: 'idx_eligibility_evaluations_created_at' }
  );

  // Trigger for updated_at
  pgm.sql(`
    CREATE TRIGGER eligibility_evaluations_updated_at
    BEFORE UPDATE ON eligibility_engine.eligibility_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION eligibility_engine.update_updated_at_column();
  `);

  // ============================================================
  // STEP 7: Create outbox table (transactional outbox pattern)
  // ============================================================
  pgm.createTable(
    { schema: 'eligibility_engine', name: 'outbox' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      aggregate_type: {
        type: 'varchar(100)',
        notNull: true,
      },
      aggregate_id: {
        type: 'uuid',
        notNull: true,
      },
      event_type: {
        type: 'varchar(100)',
        notNull: true,
      },
      payload: {
        type: 'jsonb',
        notNull: true,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('CURRENT_TIMESTAMP'),
      },
      published_at: {
        type: 'timestamptz',
        notNull: false,
      },
    }
  );

  // Partial index on outbox for finding unpublished events (transactional outbox pattern)
  pgm.sql(`
    CREATE INDEX idx_outbox_unpublished
    ON eligibility_engine.outbox (created_at)
    WHERE published_at IS NULL;
  `);

  // Index on aggregate_type + aggregate_id for event sourcing queries
  pgm.createIndex(
    { schema: 'eligibility_engine', name: 'outbox' },
    ['aggregate_type', 'aggregate_id'],
    { name: 'idx_outbox_aggregate' }
  );

  // ============================================================
  // STEP 8: Seed compensation_bands with Consumer Rights Act 2015 values
  // Per spec: DR15 has 4 bands (15, 30, 60, 120), DR30 has 3 bands (30, 60, 120)
  // DR15: 15m=25%, 30m=50%, 60m=50%, 120m=100%
  // DR30: 30m=50%, 60m=50%, 120m=100%
  // ============================================================
  pgm.sql(`
    INSERT INTO eligibility_engine.compensation_bands
      (scheme_type, delay_threshold_minutes, compensation_percentage)
    VALUES
      -- DR15 scheme (enhanced compensation for participating TOCs)
      ('DR15', 15, 25.00),
      ('DR15', 30, 50.00),
      ('DR15', 60, 50.00),
      ('DR15', 120, 100.00),
      -- DR30 scheme (standard compensation for most TOCs)
      ('DR30', 30, 50.00),
      ('DR30', 60, 50.00),
      ('DR30', 120, 100.00);
  `);

  // ============================================================
  // STEP 9: Seed toc_rulepacks with TOC scheme assignments
  // Per spec: GR (LNER) is DR15, SR (ScotRail) is DR30
  // ============================================================
  pgm.sql(`
    INSERT INTO eligibility_engine.toc_rulepacks
      (toc_code, toc_name, scheme, allows_online_claims, max_claim_days, active)
    VALUES
      -- DR15 TOCs (enhanced compensation)
      ('CC', 'c2c', 'DR15', true, 28, true),
      ('TL', 'Thameslink', 'DR15', true, 28, true),
      ('GN', 'Great Northern', 'DR15', true, 28, true),
      ('SE', 'Southeastern', 'DR15', true, 28, true),
      ('SN', 'Southern', 'DR15', true, 28, true),
      ('SW', 'South Western Railway', 'DR15', true, 28, true),
      ('GX', 'Gatwick Express', 'DR15', true, 28, true),
      ('GR', 'LNER', 'DR15', true, 28, true),
      -- DR30 TOCs (standard compensation)
      ('AW', 'Transport for Wales', 'DR30', true, 28, true),
      ('CH', 'Chiltern Railways', 'DR30', true, 28, true),
      ('CS', 'Caledonian Sleeper', 'DR30', true, 28, true),
      ('EM', 'East Midlands Railway', 'DR30', true, 28, true),
      ('GC', 'Grand Central', 'DR30', true, 28, true),
      ('GW', 'Great Western Railway', 'DR30', true, 28, true),
      ('HT', 'Hull Trains', 'DR30', true, 28, true),
      ('HX', 'Heathrow Express', 'DR30', true, 28, true),
      ('LM', 'West Midlands Trains', 'DR30', true, 28, true),
      ('NT', 'Northern Trains', 'DR30', true, 28, true),
      ('SR', 'ScotRail', 'DR30', true, 28, true),
      ('TP', 'TransPennine Express', 'DR30', true, 28, true),
      ('VT', 'Avanti West Coast', 'DR30', true, 28, true),
      ('XC', 'CrossCountry', 'DR30', true, 28, true),
      ('XR', 'Elizabeth line', 'DR30', true, 28, true);
  `);
};

/**
 * Rollback migration - drops all tables and the schema.
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // Drop tables in reverse dependency order
  pgm.dropTable({ schema: 'eligibility_engine', name: 'outbox' }, { ifExists: true });
  pgm.dropTable({ schema: 'eligibility_engine', name: 'eligibility_evaluations' }, { ifExists: true });
  pgm.dropTable({ schema: 'eligibility_engine', name: 'seated_fare_equivalents' }, { ifExists: true });
  pgm.dropTable({ schema: 'eligibility_engine', name: 'compensation_bands' }, { ifExists: true });
  pgm.dropTable({ schema: 'eligibility_engine', name: 'toc_rulepacks' }, { ifExists: true });

  // Drop the trigger function
  pgm.sql('DROP FUNCTION IF EXISTS eligibility_engine.update_updated_at_column() CASCADE');

  // Drop the schema
  pgm.sql('DROP SCHEMA IF EXISTS eligibility_engine CASCADE');
};
