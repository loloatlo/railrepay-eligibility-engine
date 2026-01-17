/**
 * Express Application - Eligibility Engine API
 * Phase 3.2 Implementation (Blake)
 *
 * Covers:
 * - AC-4: Retrieve evaluation by journey_id
 * - AC-5: Health check endpoint
 * - POST /eligibility/evaluate
 * - POST /eligibility/restriction/validate
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { Client } from 'pg';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { RestrictionValidator } from './services/restriction-validator.js';

// ============================================
// Type Definitions
// ============================================

export interface AppConfig {
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

interface EvaluateRequestBody {
  journey_id: string;
  toc_code: string;
  scheduled_departure?: string;
  actual_arrival?: string;
  scheduled_arrival?: string;
  delay_minutes?: number;
  ticket_fare_pence: number;
  ticket_class?: string;
  ticket_type?: string;
  ticket_restrictions?: string[];
  is_sleeper?: boolean;
  journey_segments?: Array<{
    toc_code: string;
    fare_portion_pence: number;
  }>;
}

interface RestrictionValidateBody {
  restriction_codes: string[];
  journey_date: string;
  departure_time: string;
}

// ============================================
// Application Factory
// ============================================

// Server instance for testing - singleton pattern
let serverInstance: ReturnType<Express['listen']> | null = null;
let currentApp: Express | null = null;

/**
 * Create Express app and automatically start server on port 3000
 * This supports the integration test pattern where tests create apps
 * and immediately fetch from localhost:3000
 *
 * The server uses a singleton pattern - creating a new app will replace
 * the existing server with the new app configuration.
 */
export function createApp(config: AppConfig): Express {
  const app = express();
  currentApp = app;

  // CRITICAL: Required for Railway/proxy environments (per SOPs)
  app.set('trust proxy', true);

  // Middleware
  app.use(express.json());

  // Correlation ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.get('X-Correlation-ID') || uuidv4();
    res.set('X-Correlation-ID', correlationId);
    (req as any).correlationId = correlationId;
    next();
  });

  // ============================================
  // AC-5: Health Check Endpoint
  // ============================================

  app.get('/health', async (req: Request, res: Response) => {
    const client = new Client(config.database);
    let dbStatus = 'disconnected';

    try {
      await client.connect();
      await client.query('SELECT 1');
      dbStatus = 'connected';
      await client.end();

      res.status(200).json({
        status: 'healthy',
        service: 'eligibility-engine',
        database: dbStatus,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await client.end();
      } catch (e) {
        // Ignore cleanup errors
      }

      res.status(503).json({
        status: 'unhealthy',
        service: 'eligibility-engine',
        database: 'disconnected',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      });
    }
  });

  // ============================================
  // AC-4: Retrieve Evaluation by journey_id
  // ============================================

  app.get('/eligibility/:journey_id', async (req: Request, res: Response) => {
    const { journey_id } = req.params;

    // Validate UUID format
    if (!uuidValidate(journey_id)) {
      return res.status(400).json({
        error: 'Invalid journey_id format',
        journey_id,
      });
    }

    const client = new Client(config.database);

    try {
      await client.connect();

      const result = await client.query(
        `SELECT
          journey_id, eligible, scheme, delay_minutes,
          compensation_percentage, compensation_pence, ticket_fare_pence,
          reasons, applied_rules, evaluation_timestamp
         FROM eligibility_engine.eligibility_evaluations
         WHERE journey_id = $1`,
        [journey_id]
      );

      await client.end();

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Evaluation not found',
          journey_id,
        });
      }

      const row = result.rows[0];
      return res.status(200).json({
        journey_id: row.journey_id,
        eligible: row.eligible,
        scheme: row.scheme,
        delay_minutes: row.delay_minutes,
        compensation_percentage: parseFloat(row.compensation_percentage),
        compensation_pence: row.compensation_pence,
        ticket_fare_pence: row.ticket_fare_pence,
        reasons: row.reasons,
        applied_rules: row.applied_rules,
        evaluation_timestamp: row.evaluation_timestamp,
      });
    } catch (error) {
      try {
        await client.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      throw error;
    }
  });

  // ============================================
  // POST /eligibility/evaluate
  // ============================================

  app.post('/eligibility/evaluate', async (req: Request, res: Response) => {
    const body: EvaluateRequestBody = req.body;

    // Validate required fields
    const validationErrors: string[] = [];

    if (!body.journey_id) {
      validationErrors.push('journey_id is required');
    }
    if (!body.toc_code) {
      validationErrors.push('toc_code is required');
    }
    if (body.toc_code && body.toc_code.length > 5) {
      validationErrors.push('toc_code must be 5 characters or less');
    }
    if (body.delay_minutes === undefined && (!body.scheduled_arrival || !body.actual_arrival)) {
      validationErrors.push('delay_minutes or (scheduled_arrival and actual_arrival) is required');
    }
    if (!body.ticket_fare_pence) {
      validationErrors.push('ticket_fare_pence is required');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation error',
        details: validationErrors.join(', '),
      });
    }

    const client = new Client(config.database);

    try {
      await client.connect();

      // Check for existing evaluation (idempotency)
      const existingResult = await client.query(
        'SELECT * FROM eligibility_engine.eligibility_evaluations WHERE journey_id = $1',
        [body.journey_id]
      );

      if (existingResult.rows.length > 0) {
        // Return existing evaluation (idempotent response)
        const row = existingResult.rows[0];
        await client.end();
        return res.status(200).json({
          journey_id: row.journey_id,
          eligible: row.eligible,
          scheme: row.scheme,
          delay_minutes: row.delay_minutes,
          compensation_percentage: parseFloat(row.compensation_percentage),
          compensation_pence: row.compensation_pence,
          ticket_fare_pence: row.ticket_fare_pence,
          reasons: row.reasons,
          applied_rules: row.applied_rules,
          evaluation_timestamp: row.evaluation_timestamp,
        });
      }

      // Calculate delay minutes if not provided
      let delayMinutes = body.delay_minutes;
      if (delayMinutes === undefined && body.scheduled_arrival && body.actual_arrival) {
        const scheduled = new Date(body.scheduled_arrival);
        const actual = new Date(body.actual_arrival);
        delayMinutes = Math.max(0, Math.floor((actual.getTime() - scheduled.getTime()) / (1000 * 60)));
      }

      // Look up TOC rulepack
      const tocResult = await client.query(
        'SELECT toc_code, scheme, is_active FROM eligibility_engine.toc_rulepacks WHERE toc_code = $1',
        [body.toc_code]
      );

      if (tocResult.rows.length === 0) {
        await client.end();
        return res.status(400).json({
          error: 'Validation error',
          details: `Unknown TOC code: ${body.toc_code}`,
        });
      }

      const tocRulepack = tocResult.rows[0];
      const scheme = tocRulepack.scheme;

      let eligible: boolean;
      let compensationPercentage: number;
      let compensationPence: number;
      let reasons: string[];
      let appliedRules: string[];

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
          [scheme, delayMinutes]
        );

        if (bandResult.rows.length === 0) {
          eligible = false;
          compensationPercentage = 0;
          compensationPence = 0;
          const threshold = scheme === 'DR15' ? 15 : 30;
          reasons = [`Delay of ${delayMinutes} minutes does not meet ${scheme} ${threshold}-minute threshold`];
          appliedRules = [];
        } else {
          const band = bandResult.rows[0];
          eligible = true;
          compensationPercentage = parseFloat(band.compensation_percentage);
          compensationPence = Math.floor((body.ticket_fare_pence * compensationPercentage) / 100);
          reasons = [`Delay of ${delayMinutes} minutes qualifies for ${compensationPercentage}% refund under ${scheme} scheme`];
          appliedRules = [`${scheme}_${band.delay_minutes_min}MIN_${Math.round(compensationPercentage)}PCT`];
        }
      }

      // Store evaluation
      const evaluationIdResult = await client.query('SELECT gen_random_uuid() as id');
      const evaluationId = evaluationIdResult.rows[0].id;
      const evaluationTimestamp = new Date().toISOString();

      await client.query(
        `INSERT INTO eligibility_engine.eligibility_evaluations (
          evaluation_id, journey_id, toc_code, scheme, delay_minutes,
          ticket_fare_pence, eligible, compensation_percentage, compensation_pence,
          reasons, applied_rules, evaluation_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          evaluationId,
          body.journey_id,
          body.toc_code,
          scheme,
          delayMinutes,
          body.ticket_fare_pence,
          eligible,
          compensationPercentage,
          compensationPence,
          reasons,
          appliedRules,
          evaluationTimestamp,
        ]
      );

      await client.end();

      return res.status(200).json({
        journey_id: body.journey_id,
        eligible,
        scheme,
        delay_minutes: delayMinutes,
        compensation_percentage: compensationPercentage,
        compensation_pence: compensationPence,
        ticket_fare_pence: body.ticket_fare_pence,
        reasons,
        applied_rules: appliedRules,
        evaluation_timestamp: evaluationTimestamp,
      });
    } catch (error) {
      try {
        await client.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      throw error;
    }
  });

  // ============================================
  // POST /eligibility/restriction/validate
  // ============================================

  app.post('/eligibility/restriction/validate', async (req: Request, res: Response) => {
    const body: RestrictionValidateBody = req.body;

    const validator = new RestrictionValidator();

    try {
      const result = await validator.validate({
        restriction_codes: body.restriction_codes,
        journey_date: body.journey_date,
        departure_time: body.departure_time,
      });

      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: (error as Error).message,
      });
    }
  });

  // ============================================
  // Error Handler
  // ============================================

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  // Auto-start server for integration tests and production
  // We need to keep the same server instance to avoid port conflicts
  // Only start a new server if none exists
  const port = parseInt(process.env.PORT || '3000', 10);
  if (!serverInstance) {
    serverInstance = app.listen(port, () => {
      console.log(`Eligibility Engine listening on port ${port}`);
    });

    // Handle port in use errors gracefully
    serverInstance.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use - this is OK
        console.log(`Port ${port} already in use, skipping auto-start`);
      } else {
        console.error('Server error:', err);
      }
    });
  } else {
    // Server already running - update the request handler to use new app
    // This is a workaround: we redirect the existing server to the new app
    serverInstance.removeAllListeners('request');
    serverInstance.on('request', app);
  }

  return app;
}

/**
 * Start the server on specified port
 * Used primarily for testing
 */
export function startServer(app: Express, port: number = 3000): Promise<void> {
  return new Promise((resolve) => {
    serverInstance = app.listen(port, () => {
      resolve();
    });
  });
}

/**
 * Stop the server
 * Used primarily for testing cleanup
 */
export function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      serverInstance.close((err) => {
        serverInstance = null;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

/**
 * Get the server instance
 */
export function getServer() {
  return serverInstance;
}
