/**
 * JourneyDelayConfirmedHandler - Kafka event handler for JourneyDelayConfirmed events
 * Phase 3.2 Implementation (Blake)
 *
 * Covers:
 * - AC-9: Event Consumption (JourneyDelayConfirmed)
 * - AC-10: Event Production (EligibilityEvaluated)
 *
 * Implements transactional outbox pattern for reliable event publishing.
 */

import { Client } from 'pg';

// ============================================
// Type Definitions
// ============================================

export interface JourneyDelayConfirmedEvent {
  event_type: 'JourneyDelayConfirmed';
  event_id: string;
  timestamp: string;
  correlation_id: string;
  payload: JourneyDelayConfirmedPayload;
}

export interface JourneyDelayConfirmedPayload {
  journey_id: string;
  toc_code: string;
  scheduled_departure: string;
  actual_arrival: string;
  scheduled_arrival: string;
  delay_minutes: number;
  ticket_fare_pence: number;
  ticket_class: string;
  ticket_type: string;
  ticket_restrictions: string[];
  is_sleeper: boolean;
  journey_segments: Array<{
    toc_code: string;
    fare_portion_pence: number;
  }>;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface HandlerOptions {
  logger?: {
    info: (meta: object, msg: string) => void;
    error: (meta: object, msg: string) => void;
    debug: (meta: object, msg: string) => void;
  };
  metrics?: {
    incrementCounter: (name: string, labels: object) => void;
    recordHistogram: (name: string, value: number, labels: object) => void;
  };
}

interface TocRulepack {
  toc_code: string;
  scheme: string;
  is_active: boolean;
}

interface CompensationBand {
  delay_minutes_min: number;
  delay_minutes_max: number | null;
  compensation_percentage: number;
}

// ============================================
// JourneyDelayConfirmedHandler Implementation
// ============================================

export class JourneyDelayConfirmedHandler {
  private dbConfig: DatabaseConfig;
  private options: HandlerOptions;

  constructor(dbConfig: DatabaseConfig, options: HandlerOptions = {}) {
    this.dbConfig = dbConfig;
    this.options = options;
  }

  /**
   * Handle a JourneyDelayConfirmed event
   */
  async handle(event: JourneyDelayConfirmedEvent): Promise<void> {
    // Validate event payload
    this.validateEvent(event);

    const client = new Client(this.dbConfig);
    await client.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Check for existing evaluation (idempotency)
      const existingResult = await client.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [event.payload.journey_id]
      );

      if (existingResult.rows.length > 0) {
        // Already processed - idempotent handling
        await client.query('COMMIT');
        this.log('info', { correlation_id: event.correlation_id }, 'Duplicate event - already processed');
        return;
      }

      // Look up TOC rulepack
      const tocResult = await client.query(
        'SELECT toc_code, scheme, is_active FROM eligibility_engine.toc_rulepacks WHERE toc_code = $1',
        [event.payload.toc_code]
      );

      let eligible: boolean;
      let scheme: string;
      let compensationPercentage: number;
      let compensationPence: number;
      let reasons: string[];
      let appliedRules: string[];

      if (tocResult.rows.length === 0) {
        // Unknown TOC
        eligible = false;
        scheme = 'UNKNOWN';
        compensationPercentage = 0;
        compensationPence = 0;
        reasons = ['Unknown TOC'];
        appliedRules = [];
      } else {
        const tocRulepack: TocRulepack = tocResult.rows[0];
        scheme = tocRulepack.scheme;

        if (!tocRulepack.is_active) {
          eligible = false;
          compensationPercentage = 0;
          compensationPence = 0;
          reasons = ['TOC is not active for delay repay claims'];
          appliedRules = [];
        } else {
          // Get compensation band
          const bandResult = await client.query(
            `SELECT delay_minutes_min, delay_minutes_max, compensation_percentage
             FROM eligibility_engine.compensation_bands
             WHERE scheme = $1
               AND delay_minutes_min <= $2
               AND (delay_minutes_max IS NULL OR delay_minutes_max >= $2)
             ORDER BY delay_minutes_min DESC
             LIMIT 1`,
            [scheme, event.payload.delay_minutes]
          );

          if (bandResult.rows.length === 0) {
            // Below threshold
            eligible = false;
            compensationPercentage = 0;
            compensationPence = 0;
            const threshold = scheme === 'DR15' ? 15 : 30;
            reasons = [`Delay of ${event.payload.delay_minutes} minutes does not meet ${scheme} ${threshold}-minute threshold`];
            appliedRules = [];
          } else {
            const band: CompensationBand = bandResult.rows[0];
            eligible = true;
            compensationPercentage = parseFloat(band.compensation_percentage.toString());
            compensationPence = Math.floor(
              (event.payload.ticket_fare_pence * compensationPercentage) / 100
            );
            reasons = [`Delay of ${event.payload.delay_minutes} minutes qualifies for ${compensationPercentage}% refund under ${scheme} scheme`];
            appliedRules = [`${scheme}_${band.delay_minutes_min}MIN_${Math.round(compensationPercentage)}PCT`];
          }
        }
      }

      // Generate evaluation ID
      const evaluationIdResult = await client.query('SELECT gen_random_uuid() as id');
      const evaluationId = evaluationIdResult.rows[0].id;
      const evaluationTimestamp = new Date().toISOString();

      // Insert evaluation
      await client.query(
        `INSERT INTO eligibility_engine.eligibility_evaluations (
          evaluation_id, journey_id, toc_code, scheme, delay_minutes,
          ticket_fare_pence, eligible, compensation_percentage, compensation_pence,
          reasons, applied_rules, evaluation_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          evaluationId,
          event.payload.journey_id,
          event.payload.toc_code,
          scheme,
          event.payload.delay_minutes,
          event.payload.ticket_fare_pence,
          eligible,
          compensationPercentage,
          compensationPence,
          reasons,
          appliedRules,
          evaluationTimestamp,
        ]
      );

      // Write to outbox (transactional outbox pattern)
      const outboxPayload = {
        evaluation_id: evaluationId,
        journey_id: event.payload.journey_id,
        toc_code: event.payload.toc_code,
        scheme,
        delay_minutes: event.payload.delay_minutes,
        ticket_fare_pence: event.payload.ticket_fare_pence,
        eligible,
        compensation_percentage: compensationPercentage,
        compensation_pence: compensationPence,
        reasons,
        applied_rules: appliedRules,
        evaluation_timestamp: evaluationTimestamp,
        correlation_id: event.correlation_id,
      };

      await client.query(
        `INSERT INTO eligibility_engine.outbox (
          aggregate_type, aggregate_id, event_type, payload
        ) VALUES ($1, $2, $3, $4)`,
        [
          'eligibility_evaluation',
          event.payload.journey_id,
          'EligibilityEvaluated',
          JSON.stringify(outboxPayload),
        ]
      );

      // Commit transaction
      await client.query('COMMIT');

      // Log and emit metrics
      this.log('info', {
        correlation_id: event.correlation_id,
        journey_id: event.payload.journey_id,
        eligible,
        scheme,
        compensation_pence: compensationPence,
      }, 'Eligibility evaluation completed');

      this.emitMetric('eligibility_evaluations_total', {
        eligible: eligible.toString(),
        scheme,
      });

    } catch (error) {
      await client.query('ROLLBACK');
      this.log('error', {
        correlation_id: event.correlation_id,
        error: (error as Error).message,
      }, 'Error processing event');
      throw error;
    } finally {
      await client.end();
    }
  }

  /**
   * Validate event payload
   */
  private validateEvent(event: JourneyDelayConfirmedEvent): void {
    if (!event.payload) {
      throw new Error('Missing payload');
    }
    if (!event.payload.journey_id) {
      throw new Error('Missing journey_id');
    }
    if (!event.payload.toc_code) {
      throw new Error('Missing toc_code');
    }
    if (event.payload.delay_minutes === undefined) {
      throw new Error('Missing delay_minutes');
    }
    if (event.payload.ticket_fare_pence === undefined) {
      throw new Error('Missing ticket_fare_pence');
    }
  }

  /**
   * Log helper
   */
  private log(level: 'info' | 'error' | 'debug', meta: object, msg: string): void {
    if (this.options.logger) {
      this.options.logger[level](meta, msg);
    }
  }

  /**
   * Metrics helper
   */
  private emitMetric(name: string, labels: object): void {
    if (this.options.metrics) {
      this.options.metrics.incrementCounter(name, labels);
    }
  }
}
