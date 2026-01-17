/**
 * Unit tests for EligibilityService
 * Per ADR-014: Tests written BEFORE implementation (Phase 3.1 - Jessie)
 *
 * Tests cover:
 * - AC-1: Evaluate DR15 Eligibility
 * - AC-2: Evaluate DR30 Eligibility
 * - AC-3: Calculate Compensation Amount
 *
 * Test Lock Rule: Blake MUST NOT modify these tests.
 * If Blake believes a test is wrong, hand back to Jessie with explanation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import types that will be implemented by Blake
// These imports will fail until Blake creates the implementation
import type {
  EligibilityService,
  EvaluationRequest,
  EvaluationResult,
  TocRulepack,
  CompensationBand
} from '../../src/services/eligibility-service.js';

// Import fixtures
import requestFixtures from '../fixtures/api/evaluate-request.fixture.json';
import responseFixtures from '../fixtures/api/evaluate-response.fixture.json';
import tocRulepacks from '../fixtures/db/toc-rulepacks.fixture.json';
import compensationBands from '../fixtures/db/compensation-bands.fixture.json';

describe('EligibilityService', () => {
  /**
   * SERVICE CONTEXT: Core eligibility evaluation logic
   * SPECIFICATION: Phase 1 Specification Section 5 (Business Rules)
   * ADR COMPLIANCE: ADR-014 TDD Mandatory
   */

  // Mock dependencies - will be injected in real implementation
  let mockTocRepository: {
    findByTocCode: ReturnType<typeof vi.fn>;
  };
  let mockCompensationBandRepository: {
    findBySchemeAndDelay: ReturnType<typeof vi.fn>;
    findAllByScheme: ReturnType<typeof vi.fn>;
  };
  let mockEvaluationRepository: {
    save: ReturnType<typeof vi.fn>;
    findByJourneyId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTocRepository = {
      findByTocCode: vi.fn(),
    };
    mockCompensationBandRepository = {
      findBySchemeAndDelay: vi.fn(),
      findAllByScheme: vi.fn(),
    };
    mockEvaluationRepository = {
      save: vi.fn(),
      findByJourneyId: vi.fn(),
    };
  });

  // ============================================
  // AC-1: Evaluate DR15 Eligibility
  // ============================================

  describe('AC-1: Evaluate DR15 Eligibility', () => {
    /**
     * AC-1: Given a journey with TOC code 'GR' (LNER)
     * When the delay is 20 minutes
     * Then the evaluation returns eligible=true, scheme='DR15', compensation_percentage=25.00
     */

    it('should return eligible=true with 25% compensation for 20 minute delay on DR15 TOC (GR/LNER)', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440001',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:20:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 15,
        compensation_percentage: 25.00,
      });

      // Act - This will fail until EligibilityService is implemented
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(true);
      expect(result.scheme).toBe('DR15');
      expect(result.delay_minutes).toBe(20);
      expect(result.compensation_percentage).toBe(25.00);
      expect(result.reasons).toContain('Delay of 20 minutes qualifies for 25% refund under DR15 scheme');
      expect(result.applied_rules).toContain('DR15_15MIN_25PCT');
    });

    it('should return 50% compensation for 35 minute delay on DR15 TOC', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440006',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:35:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 2000,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 2000 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 30,
        compensation_percentage: 50.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(true);
      expect(result.scheme).toBe('DR15');
      expect(result.delay_minutes).toBe(35);
      expect(result.compensation_percentage).toBe(50.00);
      expect(result.applied_rules).toContain('DR15_30MIN_50PCT');
    });

    it('should return 100% compensation for 120+ minute delay on DR15 TOC', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440007',
        toc_code: 'VT',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T14:05:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 5000,
        ticket_class: 'first',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'VT', fare_portion_pence: 5000 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'VT',
        toc_name: 'Avanti West Coast',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 120,
        compensation_percentage: 100.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(true);
      expect(result.scheme).toBe('DR15');
      expect(result.delay_minutes).toBe(125);
      expect(result.compensation_percentage).toBe(100.00);
      expect(result.applied_rules).toContain('DR15_120MIN_100PCT');
    });

    it('should return ineligible for delay under 15 minutes on DR15 TOC', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440008',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:10:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue(null);

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(false);
      expect(result.scheme).toBe('DR15');
      expect(result.delay_minutes).toBe(10);
      expect(result.compensation_percentage).toBe(0);
      expect(result.compensation_pence).toBe(0);
      expect(result.reasons).toContain('Delay of 10 minutes does not meet DR15 15-minute threshold');
    });
  });

  // ============================================
  // AC-2: Evaluate DR30 Eligibility
  // ============================================

  describe('AC-2: Evaluate DR30 Eligibility', () => {
    /**
     * AC-2: Given a journey with TOC code 'SW' (South Western Railway - DR30)
     * When the delay is 20 minutes
     * Then the evaluation returns eligible=false, scheme='DR30' (threshold not met)
     */

    it('should return ineligible for 20 minute delay on DR30 TOC (threshold not met)', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440002',
        toc_code: 'SW',
        scheduled_departure: '2026-01-15T14:00:00Z',
        actual_arrival: '2026-01-15T16:20:00Z',
        scheduled_arrival: '2026-01-15T16:00:00Z',
        ticket_fare_pence: 2500,
        ticket_class: 'standard',
        ticket_type: 'return',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'SW', fare_portion_pence: 2500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'SW',
        toc_name: 'South Western Railway',
        scheme: 'DR30',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue(null);

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(false);
      expect(result.scheme).toBe('DR30');
      expect(result.delay_minutes).toBe(20);
      expect(result.compensation_percentage).toBe(0);
      expect(result.compensation_pence).toBe(0);
      expect(result.reasons).toContain('Delay of 20 minutes does not meet DR30 30-minute threshold');
      expect(result.applied_rules).toHaveLength(0);
    });

    it('should return 50% compensation for 35 minute delay on DR30 TOC', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440009',
        toc_code: 'SR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:35:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1800,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'SR', fare_portion_pence: 1800 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'SR',
        toc_name: 'ScotRail',
        scheme: 'DR30',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR30',
        delay_threshold_minutes: 30,
        compensation_percentage: 50.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(true);
      expect(result.scheme).toBe('DR30');
      expect(result.delay_minutes).toBe(35);
      expect(result.compensation_percentage).toBe(50.00);
      expect(result.applied_rules).toContain('DR30_30MIN_50PCT');
    });

    it('should return 100% compensation for 120+ minute delay on DR30 TOC', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440010',
        toc_code: 'TL',
        scheduled_departure: '2026-01-15T08:00:00Z',
        actual_arrival: '2026-01-15T12:30:00Z',
        scheduled_arrival: '2026-01-15T10:00:00Z',
        ticket_fare_pence: 3500,
        ticket_class: 'standard',
        ticket_type: 'return',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'TL', fare_portion_pence: 3500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'TL',
        toc_name: 'Thameslink',
        scheme: 'DR30',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR30',
        delay_threshold_minutes: 120,
        compensation_percentage: 100.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(true);
      expect(result.scheme).toBe('DR30');
      expect(result.delay_minutes).toBe(150);
      expect(result.compensation_percentage).toBe(100.00);
      expect(result.applied_rules).toContain('DR30_120MIN_100PCT');
    });
  });

  // ============================================
  // AC-3: Calculate Compensation Amount
  // ============================================

  describe('AC-3: Calculate Compensation Amount', () => {
    /**
     * AC-3: Given a journey with fare 1500 pence and 50% compensation
     * Then compensation_pence = 750
     */

    it('should calculate compensation_pence as 750 for 1500 pence fare at 50%', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440011',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:35:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 30,
        compensation_percentage: 50.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.compensation_pence).toBe(750);
      expect(result.ticket_fare_pence).toBe(1500);
      expect(result.compensation_percentage).toBe(50.00);
    });

    it('should calculate compensation_pence as 375 for 1500 pence fare at 25%', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440012',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:20:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 15,
        compensation_percentage: 25.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.compensation_pence).toBe(375);
      expect(result.compensation_percentage).toBe(25.00);
    });

    it('should calculate full refund for 100% compensation', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440013',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T14:05:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 4500,
        ticket_class: 'first',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 4500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 120,
        compensation_percentage: 100.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.compensation_pence).toBe(4500);
      expect(result.compensation_percentage).toBe(100.00);
    });

    it('should round compensation down to nearest pence', async () => {
      // Arrange - fare that doesn't divide evenly
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440014',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:20:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1999, // 1999 * 0.25 = 499.75 -> should round to 499
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1999 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 15,
        compensation_percentage: 25.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert - should round down
      expect(result.compensation_pence).toBe(499);
    });
  });

  // ============================================
  // Edge Cases and Error Handling
  // ============================================

  describe('Edge Cases and Error Handling', () => {
    it('should throw error for unknown TOC code', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440015',
        toc_code: 'ZZ',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:20:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'ZZ', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue(null);

      // Act & Assert
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );

      await expect(service.evaluate(request)).rejects.toThrow('Unknown TOC code: ZZ');
    });

    it('should throw error for inactive TOC', async () => {
      // Arrange
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440016',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:20:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: false, // Inactive TOC
      });

      // Act & Assert
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );

      await expect(service.evaluate(request)).rejects.toThrow('TOC GR is not currently active');
    });

    it('should calculate delay correctly from timestamps', async () => {
      // Arrange - 45 minute delay
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440017',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:45:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 2000,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 2000 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue({
        scheme_type: 'DR15',
        delay_threshold_minutes: 30,
        compensation_percentage: 50.00,
      });

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.delay_minutes).toBe(45);
    });

    it('should handle zero delay gracefully', async () => {
      // Arrange - on time arrival
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440018',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:00:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue(null);

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(false);
      expect(result.delay_minutes).toBe(0);
      expect(result.compensation_pence).toBe(0);
    });

    it('should handle early arrival as zero delay', async () => {
      // Arrange - arrived 5 minutes early
      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440019',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T11:55:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      mockTocRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        toc_name: 'LNER',
        scheme: 'DR15',
        allows_online_claims: true,
        max_claim_days: 28,
        active: true,
      });

      mockCompensationBandRepository.findBySchemeAndDelay.mockResolvedValue(null);

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert
      expect(result.eligible).toBe(false);
      expect(result.delay_minutes).toBe(0); // Early arrival should be 0, not negative
    });
  });

  // ============================================
  // Idempotency Tests
  // ============================================

  describe('Idempotency', () => {
    it('should return cached result for duplicate journey_id', async () => {
      // Arrange
      const existingEvaluation = {
        id: 'eval-123',
        journey_id: '550e8400-e29b-41d4-a716-446655440020',
        toc_code: 'GR',
        scheme: 'DR15',
        delay_minutes: 20,
        eligible: true,
        compensation_percentage: 25.00,
        compensation_pence: 375,
        ticket_fare_pence: 1500,
        reasons: ['Delay of 20 minutes qualifies for 25% refund under DR15 scheme'],
        applied_rules: ['DR15_15MIN_25PCT'],
        created_at: new Date().toISOString(),
      };

      mockEvaluationRepository.findByJourneyId.mockResolvedValue(existingEvaluation);

      const request: EvaluationRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440020',
        toc_code: 'GR',
        scheduled_departure: '2026-01-15T10:00:00Z',
        actual_arrival: '2026-01-15T12:20:00Z',
        scheduled_arrival: '2026-01-15T12:00:00Z',
        ticket_fare_pence: 1500,
        ticket_class: 'standard',
        ticket_type: 'single',
        ticket_restrictions: [],
        is_sleeper: false,
        journey_segments: [{ toc_code: 'GR', fare_portion_pence: 1500 }],
      };

      // Act
      const { EligibilityService } = await import('../../src/services/eligibility-service.js');
      const service = new EligibilityService(
        mockTocRepository,
        mockCompensationBandRepository,
        mockEvaluationRepository
      );
      const result = await service.evaluate(request);

      // Assert - should return cached result without re-evaluation
      expect(result.journey_id).toBe('550e8400-e29b-41d4-a716-446655440020');
      expect(result.eligible).toBe(true);
      expect(mockTocRepository.findByTocCode).not.toHaveBeenCalled(); // Should not query TOC
    });
  });
});
