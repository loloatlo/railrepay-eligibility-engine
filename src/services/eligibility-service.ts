/**
 * EligibilityService - Core eligibility evaluation logic
 * Phase 3.2 Implementation (Blake)
 *
 * Covers:
 * - AC-1: Evaluate DR15 Eligibility
 * - AC-2: Evaluate DR30 Eligibility
 * - AC-3: Calculate Compensation Amount
 */

// ============================================
// Type Definitions
// ============================================

export interface JourneySegment {
  toc_code: string;
  fare_portion_pence: number;
}

export interface EvaluationRequest {
  journey_id: string;
  toc_code: string;
  scheduled_departure: string;
  actual_arrival: string;
  scheduled_arrival: string;
  ticket_fare_pence: number;
  ticket_class: string;
  ticket_type: string;
  ticket_restrictions: string[];
  is_sleeper: boolean;
  journey_segments: JourneySegment[];
}

export interface EvaluationResult {
  journey_id: string;
  eligible: boolean;
  scheme: string;
  delay_minutes: number;
  compensation_percentage: number;
  compensation_pence: number;
  ticket_fare_pence: number;
  reasons: string[];
  applied_rules: string[];
  toc_code?: string;
  evaluation_timestamp?: string;
  evaluation_id?: string;
}

export interface TocRulepack {
  toc_code: string;
  toc_name: string;
  scheme: string;
  allows_online_claims: boolean;
  max_claim_days: number;
  active: boolean;
}

export interface CompensationBand {
  scheme_type: string;
  delay_threshold_minutes: number;
  compensation_percentage: number;
}

// Repository interfaces
export interface TocRepository {
  findByTocCode(tocCode: string): Promise<TocRulepack | null>;
}

export interface CompensationBandRepository {
  findBySchemeAndDelay(scheme: string, delayMinutes: number): Promise<CompensationBand | null>;
  findAllByScheme(scheme: string): Promise<CompensationBand[]>;
}

export interface EvaluationRepository {
  save(evaluation: EvaluationResult): Promise<void>;
  findByJourneyId(journeyId: string): Promise<EvaluationResult | null>;
}

// ============================================
// EligibilityService Implementation
// ============================================

export class EligibilityService {
  private tocRepository: TocRepository;
  private compensationBandRepository: CompensationBandRepository;
  private evaluationRepository: EvaluationRepository;

  constructor(
    tocRepository: TocRepository,
    compensationBandRepository: CompensationBandRepository,
    evaluationRepository: EvaluationRepository
  ) {
    this.tocRepository = tocRepository;
    this.compensationBandRepository = compensationBandRepository;
    this.evaluationRepository = evaluationRepository;
  }

  /**
   * Evaluate eligibility for a journey
   * Implements idempotency by checking for existing evaluation
   */
  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    // Check for existing evaluation (idempotency)
    const existingEvaluation = await this.evaluationRepository.findByJourneyId(request.journey_id);
    if (existingEvaluation) {
      return existingEvaluation;
    }

    // Look up TOC rulepack
    const tocRulepack = await this.tocRepository.findByTocCode(request.toc_code);
    if (!tocRulepack) {
      throw new Error(`Unknown TOC code: ${request.toc_code}`);
    }

    if (!tocRulepack.active) {
      throw new Error(`TOC ${request.toc_code} is not currently active`);
    }

    // Calculate delay in minutes
    const delayMinutes = this.calculateDelayMinutes(
      request.scheduled_arrival,
      request.actual_arrival
    );

    // Get compensation band for the delay
    const compensationBand = await this.compensationBandRepository.findBySchemeAndDelay(
      tocRulepack.scheme,
      delayMinutes
    );

    // Build result
    const result = this.buildEvaluationResult(
      request,
      tocRulepack,
      delayMinutes,
      compensationBand
    );

    return result;
  }

  /**
   * Calculate delay in minutes from scheduled and actual arrival times
   */
  private calculateDelayMinutes(scheduledArrival: string, actualArrival: string): number {
    const scheduled = new Date(scheduledArrival);
    const actual = new Date(actualArrival);
    const diffMs = actual.getTime() - scheduled.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // Early arrival should be treated as 0 delay, not negative
    return Math.max(0, diffMinutes);
  }

  /**
   * Build the evaluation result based on delay and compensation band
   */
  private buildEvaluationResult(
    request: EvaluationRequest,
    tocRulepack: TocRulepack,
    delayMinutes: number,
    compensationBand: CompensationBand | null
  ): EvaluationResult {
    const scheme = tocRulepack.scheme;
    const threshold = scheme === 'DR15' ? 15 : 30;

    if (!compensationBand) {
      // Not eligible - delay below threshold
      return {
        journey_id: request.journey_id,
        eligible: false,
        scheme,
        delay_minutes: delayMinutes,
        compensation_percentage: 0,
        compensation_pence: 0,
        ticket_fare_pence: request.ticket_fare_pence,
        reasons: [`Delay of ${delayMinutes} minutes does not meet ${scheme} ${threshold}-minute threshold`],
        applied_rules: [],
      };
    }

    // Calculate compensation
    const compensationPercentage = compensationBand.compensation_percentage;
    const compensationPence = Math.floor(
      (request.ticket_fare_pence * compensationPercentage) / 100
    );

    // Determine the rule name
    const ruleName = this.buildRuleName(scheme, compensationBand.delay_threshold_minutes, compensationPercentage);

    return {
      journey_id: request.journey_id,
      eligible: true,
      scheme,
      delay_minutes: delayMinutes,
      compensation_percentage: compensationPercentage,
      compensation_pence: compensationPence,
      ticket_fare_pence: request.ticket_fare_pence,
      reasons: [`Delay of ${delayMinutes} minutes qualifies for ${compensationPercentage}% refund under ${scheme} scheme`],
      applied_rules: [ruleName],
    };
  }

  /**
   * Build the rule name (e.g., DR15_15MIN_25PCT)
   */
  private buildRuleName(scheme: string, thresholdMinutes: number, percentage: number): string {
    return `${scheme}_${thresholdMinutes}MIN_${Math.round(percentage)}PCT`;
  }
}
