/**
 * MultiTocApportioner - Multi-TOC fare apportionment logic
 * Phase 3.2 Implementation (Blake)
 *
 * Covers:
 * - AC-8: Multi-TOC Apportionment
 *
 * For split-ticket journeys across multiple Train Operating Companies,
 * each segment is evaluated against its TOC's delay repay scheme independently.
 */

// ============================================
// Type Definitions
// ============================================

export interface JourneySegment {
  toc_code: string;
  fare_portion_pence: number;
  segment_order: number;
}

export interface ApportionmentRequest {
  journey_id: string;
  delay_minutes: number;
  total_fare_pence: number;
  journey_segments: JourneySegment[];
}

export interface SegmentEligibility {
  toc_code: string;
  segment_order: number;
  fare_portion_pence: number;
  eligible: boolean;
  compensation_percentage: number;
  compensation_pence: number;
  scheme?: string;
  notes?: string;
}

export interface ApportionmentResult {
  journey_id: string;
  segment_eligibilities: SegmentEligibility[];
  total_compensation_pence: number;
}

export interface TocRulepack {
  toc_code: string;
  scheme: string;
  is_active: boolean;
}

// Repository interface
export interface TocRulepackRepository {
  findByTocCode(tocCode: string): Promise<TocRulepack | null>;
}

// ============================================
// Compensation Band Constants
// ============================================

// DR15 scheme: 15-minute threshold
const DR15_BANDS = [
  { minMinutes: 15, maxMinutes: 29, percentage: 25 },
  { minMinutes: 30, maxMinutes: 59, percentage: 50 },
  { minMinutes: 60, maxMinutes: 119, percentage: 50 },
  { minMinutes: 120, maxMinutes: Infinity, percentage: 100 },
];

// DR30 scheme: 30-minute threshold
const DR30_BANDS = [
  { minMinutes: 30, maxMinutes: 59, percentage: 50 },
  { minMinutes: 60, maxMinutes: 119, percentage: 50 },
  { minMinutes: 120, maxMinutes: Infinity, percentage: 100 },
];

// ============================================
// MultiTocApportioner Implementation
// ============================================

export class MultiTocApportioner {
  private tocRulepackRepository: TocRulepackRepository;

  constructor(tocRulepackRepository: TocRulepackRepository) {
    this.tocRulepackRepository = tocRulepackRepository;
  }

  /**
   * Apportion compensation across multiple TOC segments
   */
  async apportion(request: ApportionmentRequest): Promise<ApportionmentResult> {
    // Validate request
    this.validateRequest(request);

    // Process each segment
    const segmentEligibilities: SegmentEligibility[] = [];

    for (const segment of request.journey_segments) {
      const eligibility = await this.evaluateSegment(segment, request.delay_minutes);
      segmentEligibilities.push(eligibility);
    }

    // Sort by segment order to maintain ordering
    segmentEligibilities.sort((a, b) => a.segment_order - b.segment_order);

    // Calculate total compensation
    const totalCompensationPence = segmentEligibilities.reduce(
      (sum, seg) => sum + seg.compensation_pence,
      0
    );

    return {
      journey_id: request.journey_id,
      segment_eligibilities: segmentEligibilities,
      total_compensation_pence: totalCompensationPence,
    };
  }

  /**
   * Validate the apportionment request
   */
  private validateRequest(request: ApportionmentRequest): void {
    // Check for empty segments
    if (request.journey_segments.length === 0) {
      throw new Error('At least one journey segment is required');
    }

    // Check fare portions sum to total
    const fareSum = request.journey_segments.reduce(
      (sum, seg) => sum + seg.fare_portion_pence,
      0
    );

    if (fareSum !== request.total_fare_pence) {
      throw new Error('Fare portions do not sum to total fare');
    }
  }

  /**
   * Evaluate a single segment for eligibility
   */
  private async evaluateSegment(
    segment: JourneySegment,
    delayMinutes: number
  ): Promise<SegmentEligibility> {
    // Look up TOC rulepack
    const tocRulepack = await this.tocRulepackRepository.findByTocCode(segment.toc_code);

    // Unknown TOC
    if (!tocRulepack) {
      return {
        toc_code: segment.toc_code,
        segment_order: segment.segment_order,
        fare_portion_pence: segment.fare_portion_pence,
        eligible: false,
        compensation_percentage: 0,
        compensation_pence: 0,
        notes: 'Unknown TOC code',
      };
    }

    // Inactive TOC
    if (!tocRulepack.is_active) {
      return {
        toc_code: segment.toc_code,
        segment_order: segment.segment_order,
        fare_portion_pence: segment.fare_portion_pence,
        eligible: false,
        compensation_percentage: 0,
        compensation_pence: 0,
        scheme: tocRulepack.scheme,
        notes: 'TOC is inactive for delay repay claims',
      };
    }

    // Get compensation percentage based on scheme and delay
    const compensationPercentage = this.getCompensationPercentage(
      tocRulepack.scheme,
      delayMinutes
    );

    // Calculate compensation
    const compensationPence = Math.floor(
      (segment.fare_portion_pence * compensationPercentage) / 100
    );

    const eligible = compensationPercentage > 0;

    return {
      toc_code: segment.toc_code,
      segment_order: segment.segment_order,
      fare_portion_pence: segment.fare_portion_pence,
      eligible,
      compensation_percentage: compensationPercentage,
      compensation_pence: compensationPence,
      scheme: tocRulepack.scheme,
    };
  }

  /**
   * Get compensation percentage based on scheme and delay minutes
   */
  private getCompensationPercentage(scheme: string, delayMinutes: number): number {
    const bands = scheme === 'DR15' ? DR15_BANDS : DR30_BANDS;

    for (const band of bands) {
      if (delayMinutes >= band.minMinutes && delayMinutes <= band.maxMinutes) {
        return band.percentage;
      }
    }

    // Delay below minimum threshold
    return 0;
  }
}
