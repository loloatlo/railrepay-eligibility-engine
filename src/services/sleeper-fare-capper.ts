/**
 * SleeperFareCapper - Sleeper fare capping logic
 * Phase 3.2 Implementation (Blake)
 *
 * Covers:
 * - AC-7: Sleeper Fare Capping
 *
 * Sleeper tickets (Caledonian Sleeper, Night Riviera) have compensation
 * capped at the seated equivalent fare, not the full sleeper fare.
 */

// ============================================
// Type Definitions
// ============================================

export interface SleeperCapRequest {
  route_code: string;
  sleeper_class: string;
  sleeper_fare_pence: number;
  calculated_compensation_pence: number;
  journey_date: string;
  compensation_percentage?: number; // Optional - used for proportional capping
}

export interface SleeperCapResult {
  capped_compensation_pence: number;
  cap_applied: boolean;
  original_compensation_pence: number;
  seated_equivalent_pence?: number;
  notes?: string;
}

export interface SeatedFareEquivalent {
  route_code: string;
  sleeper_class: string;
  seated_equivalent_pence: number;
  effective_from: string;
  effective_to: string | null;
}

// Repository interface
export interface SeatedFareRepository {
  findByRouteAndClass(routeCode: string, sleeperClass: string): Promise<SeatedFareEquivalent | null>;
}

// ============================================
// SleeperFareCapper Implementation
// ============================================

export class SleeperFareCapper {
  private seatedFareRepository: SeatedFareRepository;

  constructor(seatedFareRepository: SeatedFareRepository) {
    this.seatedFareRepository = seatedFareRepository;
  }

  /**
   * Apply sleeper fare capping to compensation amount
   *
   * Capping rules:
   * 1. If compensation_percentage IS provided: ALWAYS apply proportional cap
   *    - Apply that percentage to seated equivalent
   *    - This caps the payout regardless of calculated compensation
   *
   * 2. If compensation_percentage is NOT provided:
   *    a. If compensation <= seated_equivalent: NO cap (compensation is reasonable)
   *    b. If compensation > seated_equivalent: Cap at seated_equivalent
   */
  async applyCap(request: SleeperCapRequest): Promise<SleeperCapResult> {
    // Find seated fare equivalent for this route and class
    const seatedFareEquivalent = await this.seatedFareRepository.findByRouteAndClass(
      request.route_code,
      request.sleeper_class
    );

    // No seated equivalent found - use original calculation
    if (!seatedFareEquivalent) {
      return {
        capped_compensation_pence: request.calculated_compensation_pence,
        cap_applied: false,
        original_compensation_pence: request.calculated_compensation_pence,
        notes: 'No seated fare equivalent found for route/class',
      };
    }

    // Check if the fare equivalent is expired
    if (this.isExpired(seatedFareEquivalent, request.journey_date)) {
      return {
        capped_compensation_pence: request.calculated_compensation_pence,
        cap_applied: false,
        original_compensation_pence: request.calculated_compensation_pence,
        notes: 'Expired fare equivalent - using original calculation',
      };
    }

    const seatedEquivalentPence = seatedFareEquivalent.seated_equivalent_pence;

    // If compensation_percentage is provided, ALWAYS apply proportional cap
    if (request.compensation_percentage !== undefined && request.compensation_percentage > 0) {
      const proportionalCap = Math.floor((seatedEquivalentPence * request.compensation_percentage) / 100);
      return {
        capped_compensation_pence: proportionalCap,
        cap_applied: true,
        original_compensation_pence: request.calculated_compensation_pence,
        seated_equivalent_pence: seatedEquivalentPence,
      };
    }

    // No percentage provided - use simple comparison
    // If compensation is at or below seated equivalent, no cap needed
    if (request.calculated_compensation_pence <= seatedEquivalentPence) {
      return {
        capped_compensation_pence: request.calculated_compensation_pence,
        cap_applied: false,
        original_compensation_pence: request.calculated_compensation_pence,
        seated_equivalent_pence: seatedEquivalentPence,
      };
    }

    // Compensation exceeds seated equivalent - apply PROPORTIONAL cap
    // Calculate the effective percentage from the sleeper fare
    // e.g., if sleeper_fare is 10000 and calculated_compensation is 5000, that's 50%
    // Apply that 50% to the seated equivalent (4000) = 2000
    const effectivePercentage = (request.calculated_compensation_pence / request.sleeper_fare_pence) * 100;
    const proportionalCap = Math.floor((seatedEquivalentPence * effectivePercentage) / 100);

    return {
      capped_compensation_pence: proportionalCap,
      cap_applied: true,
      original_compensation_pence: request.calculated_compensation_pence,
      seated_equivalent_pence: seatedEquivalentPence,
    };
  }

  /**
   * Check if the fare equivalent is expired based on journey date
   */
  private isExpired(fareEquivalent: SeatedFareEquivalent, journeyDate: string): boolean {
    if (!fareEquivalent.effective_to) {
      return false;
    }

    const journeyDateObj = new Date(journeyDate);
    const effectiveToObj = new Date(fareEquivalent.effective_to);

    return journeyDateObj > effectiveToObj;
  }

}
