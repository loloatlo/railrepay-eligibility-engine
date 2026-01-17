/**
 * Unit tests for MultiTocApportioner
 * Per ADR-014: Tests written BEFORE implementation (Phase 3.1 - Jessie)
 *
 * Tests cover:
 * - AC-8: Multi-TOC Apportionment
 *
 * Test Lock Rule: Blake MUST NOT modify these tests.
 * If Blake believes a test is wrong, hand back to Jessie with explanation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import types that will be implemented by Blake
import type {
  MultiTocApportioner,
  ApportionmentRequest,
  ApportionmentResult,
  JourneySegment,
  SegmentEligibility,
} from '../../src/services/multi-toc-apportioner.js';

describe('MultiTocApportioner', () => {
  /**
   * SERVICE CONTEXT: Multi-TOC fare apportionment for split-ticket journeys
   * SPECIFICATION: Phase 1 Specification Section 5.2 (Multi-TOC Apportionment)
   * ADR COMPLIANCE: ADR-014 TDD Mandatory
   */

  // Mock dependencies
  let mockTocRulepackRepository: {
    findByTocCode: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTocRulepackRepository = {
      findByTocCode: vi.fn(),
    };
  });

  // ============================================
  // AC-8: Multi-TOC Apportionment
  // ============================================

  describe('AC-8: Multi-TOC Apportionment', () => {
    /**
     * AC-8: Given a journey with segments on GR (DR15) and SW (DR30)
     * When evaluated with 20 minute delay
     * Then GR portion is eligible (25%), SW portion is not eligible
     */

    it('should apportion fare when GR (DR15) and SW (DR30) segments with 20min delay', async () => {
      // Arrange
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440010',
        delay_minutes: 20,
        total_fare_pence: 5000,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 3000,
            segment_order: 1,
          },
          {
            toc_code: 'SW',
            fare_portion_pence: 2000,
            segment_order: 2,
          },
        ],
      };

      // Mock GR as DR15 (15-minute threshold)
      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({
          toc_code: 'GR',
          scheme: 'DR15',
          is_active: true,
        })
        // Mock SW as DR30 (30-minute threshold)
        .mockResolvedValueOnce({
          toc_code: 'SW',
          scheme: 'DR30',
          is_active: true,
        });

      // Act - This will fail until MultiTocApportioner is implemented
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert
      expect(result.segment_eligibilities).toHaveLength(2);

      // GR segment should be eligible (20 min >= 15 min threshold, 25% compensation)
      const grSegment = result.segment_eligibilities.find(s => s.toc_code === 'GR');
      expect(grSegment).toBeDefined();
      expect(grSegment!.eligible).toBe(true);
      expect(grSegment!.compensation_percentage).toBe(25);
      expect(grSegment!.compensation_pence).toBe(750); // 3000 * 0.25

      // SW segment should NOT be eligible (20 min < 30 min threshold)
      const swSegment = result.segment_eligibilities.find(s => s.toc_code === 'SW');
      expect(swSegment).toBeDefined();
      expect(swSegment!.eligible).toBe(false);
      expect(swSegment!.compensation_percentage).toBe(0);
      expect(swSegment!.compensation_pence).toBe(0);

      // Total compensation should only be GR portion
      expect(result.total_compensation_pence).toBe(750);
    });

    it('should make both segments eligible when delay exceeds both thresholds', async () => {
      // Arrange - 45 minute delay exceeds both DR15 and DR30 thresholds
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440011',
        delay_minutes: 45,
        total_fare_pence: 5000,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 3000,
            segment_order: 1,
          },
          {
            toc_code: 'SW',
            fare_portion_pence: 2000,
            segment_order: 2,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({
          toc_code: 'GR',
          scheme: 'DR15',
          is_active: true,
        })
        .mockResolvedValueOnce({
          toc_code: 'SW',
          scheme: 'DR30',
          is_active: true,
        });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert
      const grSegment = result.segment_eligibilities.find(s => s.toc_code === 'GR');
      expect(grSegment!.eligible).toBe(true);
      expect(grSegment!.compensation_percentage).toBe(50); // 30-59 min = 50%
      expect(grSegment!.compensation_pence).toBe(1500); // 3000 * 0.50

      const swSegment = result.segment_eligibilities.find(s => s.toc_code === 'SW');
      expect(swSegment!.eligible).toBe(true);
      expect(swSegment!.compensation_percentage).toBe(50); // 30-59 min = 50%
      expect(swSegment!.compensation_pence).toBe(1000); // 2000 * 0.50

      expect(result.total_compensation_pence).toBe(2500);
    });

    it('should handle three-segment journey with mixed eligibility', async () => {
      // Arrange - GR (DR15), SW (DR30), VT (DR15) with 25 min delay
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440012',
        delay_minutes: 25,
        total_fare_pence: 9000,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 4000,
            segment_order: 1,
          },
          {
            toc_code: 'SW',
            fare_portion_pence: 2000,
            segment_order: 2,
          },
          {
            toc_code: 'VT',
            fare_portion_pence: 3000,
            segment_order: 3,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'SW', scheme: 'DR30', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'VT', scheme: 'DR15', is_active: true });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert
      expect(result.segment_eligibilities).toHaveLength(3);

      // GR eligible (25%): 4000 * 0.25 = 1000
      const grSegment = result.segment_eligibilities.find(s => s.toc_code === 'GR');
      expect(grSegment!.eligible).toBe(true);
      expect(grSegment!.compensation_pence).toBe(1000);

      // SW NOT eligible
      const swSegment = result.segment_eligibilities.find(s => s.toc_code === 'SW');
      expect(swSegment!.eligible).toBe(false);
      expect(swSegment!.compensation_pence).toBe(0);

      // VT eligible (25%): 3000 * 0.25 = 750
      const vtSegment = result.segment_eligibilities.find(s => s.toc_code === 'VT');
      expect(vtSegment!.eligible).toBe(true);
      expect(vtSegment!.compensation_pence).toBe(750);

      expect(result.total_compensation_pence).toBe(1750);
    });

    it('should handle single-segment journey (no apportionment needed)', async () => {
      // Arrange
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440013',
        delay_minutes: 35,
        total_fare_pence: 2500,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 2500,
            segment_order: 1,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        scheme: 'DR15',
        is_active: true,
      });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert
      expect(result.segment_eligibilities).toHaveLength(1);
      expect(result.segment_eligibilities[0].eligible).toBe(true);
      expect(result.segment_eligibilities[0].compensation_percentage).toBe(50);
      expect(result.segment_eligibilities[0].compensation_pence).toBe(1250);
      expect(result.total_compensation_pence).toBe(1250);
    });

    it('should handle all DR30 segments with delay below threshold', async () => {
      // Arrange - all DR30 TOCs with 20 min delay (below 30 min threshold)
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440014',
        delay_minutes: 20,
        total_fare_pence: 4000,
        journey_segments: [
          {
            toc_code: 'SW',
            fare_portion_pence: 2000,
            segment_order: 1,
          },
          {
            toc_code: 'SR',
            fare_portion_pence: 2000,
            segment_order: 2,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'SW', scheme: 'DR30', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'SR', scheme: 'DR30', is_active: true });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert - no segments eligible
      expect(result.segment_eligibilities.every(s => !s.eligible)).toBe(true);
      expect(result.total_compensation_pence).toBe(0);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle unknown TOC gracefully', async () => {
      // Arrange
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440015',
        delay_minutes: 30,
        total_fare_pence: 3000,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 2000,
            segment_order: 1,
          },
          {
            toc_code: 'XX', // Unknown TOC
            fare_portion_pence: 1000,
            segment_order: 2,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce(null); // Unknown TOC

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert - unknown TOC should be marked as ineligible with note
      const unknownSegment = result.segment_eligibilities.find(s => s.toc_code === 'XX');
      expect(unknownSegment!.eligible).toBe(false);
      expect(unknownSegment!.notes).toContain('Unknown TOC');
    });

    it('should handle inactive TOC segment', async () => {
      // Arrange
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440016',
        delay_minutes: 30,
        total_fare_pence: 3000,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 2000,
            segment_order: 1,
          },
          {
            toc_code: 'ME', // Inactive TOC
            fare_portion_pence: 1000,
            segment_order: 2,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'ME', scheme: 'DR30', is_active: false });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert - inactive TOC should be marked ineligible
      const inactiveSegment = result.segment_eligibilities.find(s => s.toc_code === 'ME');
      expect(inactiveSegment!.eligible).toBe(false);
      expect(inactiveSegment!.notes).toContain('inactive');
    });

    it('should validate fare portions sum to total fare', async () => {
      // Arrange - fare portions don't match total
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440017',
        delay_minutes: 30,
        total_fare_pence: 5000,
        journey_segments: [
          {
            toc_code: 'GR',
            fare_portion_pence: 2000,
            segment_order: 1,
          },
          {
            toc_code: 'SW',
            fare_portion_pence: 1000, // Total = 3000, not 5000
            segment_order: 2,
          },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'SW', scheme: 'DR30', is_active: true });

      // Act & Assert
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);

      await expect(apportioner.apportion(request)).rejects.toThrow(
        'Fare portions do not sum to total fare'
      );
    });

    it('should handle empty journey segments', async () => {
      // Arrange
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440018',
        delay_minutes: 30,
        total_fare_pence: 0,
        journey_segments: [],
      };

      // Act & Assert
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);

      await expect(apportioner.apportion(request)).rejects.toThrow(
        'At least one journey segment is required'
      );
    });

    it('should maintain segment order in results', async () => {
      // Arrange
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440019',
        delay_minutes: 120,
        total_fare_pence: 6000,
        journey_segments: [
          { toc_code: 'GR', fare_portion_pence: 2000, segment_order: 1 },
          { toc_code: 'VT', fare_portion_pence: 2000, segment_order: 2 },
          { toc_code: 'SW', fare_portion_pence: 2000, segment_order: 3 },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'VT', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'SW', scheme: 'DR30', is_active: true });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert - order should be maintained
      expect(result.segment_eligibilities[0].toc_code).toBe('GR');
      expect(result.segment_eligibilities[0].segment_order).toBe(1);
      expect(result.segment_eligibilities[1].toc_code).toBe('VT');
      expect(result.segment_eligibilities[1].segment_order).toBe(2);
      expect(result.segment_eligibilities[2].toc_code).toBe('SW');
      expect(result.segment_eligibilities[2].segment_order).toBe(3);
    });

    it('should handle zero fare portion for a segment', async () => {
      // Arrange - one segment has zero fare (e.g., included in other ticket)
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440020',
        delay_minutes: 30,
        total_fare_pence: 2000,
        journey_segments: [
          { toc_code: 'GR', fare_portion_pence: 2000, segment_order: 1 },
          { toc_code: 'SW', fare_portion_pence: 0, segment_order: 2 },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'SW', scheme: 'DR30', is_active: true });

      // Act
      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      // Assert - zero fare segment should have zero compensation
      const swSegment = result.segment_eligibilities.find(s => s.toc_code === 'SW');
      expect(swSegment!.compensation_pence).toBe(0);
    });
  });

  // ============================================
  // Compensation Percentage by Delay Duration
  // ============================================

  describe('Compensation Percentage by Delay Duration', () => {
    it('should apply 25% for 15-29 minute delay (DR15)', async () => {
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440021',
        delay_minutes: 20,
        total_fare_pence: 4000,
        journey_segments: [
          { toc_code: 'GR', fare_portion_pence: 4000, segment_order: 1 },
        ],
      };

      mockTocRulepackRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        scheme: 'DR15',
        is_active: true,
      });

      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      expect(result.segment_eligibilities[0].compensation_percentage).toBe(25);
    });

    it('should apply 50% for 30-59 minute delay', async () => {
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440022',
        delay_minutes: 45,
        total_fare_pence: 4000,
        journey_segments: [
          { toc_code: 'GR', fare_portion_pence: 4000, segment_order: 1 },
        ],
      };

      mockTocRulepackRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        scheme: 'DR15',
        is_active: true,
      });

      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      expect(result.segment_eligibilities[0].compensation_percentage).toBe(50);
    });

    it('should apply 100% for 120+ minute delay', async () => {
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440023',
        delay_minutes: 150,
        total_fare_pence: 4000,
        journey_segments: [
          { toc_code: 'GR', fare_portion_pence: 4000, segment_order: 1 },
        ],
      };

      mockTocRulepackRepository.findByTocCode.mockResolvedValue({
        toc_code: 'GR',
        scheme: 'DR15',
        is_active: true,
      });

      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      expect(result.segment_eligibilities[0].compensation_percentage).toBe(100);
    });

    it('should apply different percentages to segments based on their scheme thresholds', async () => {
      // Arrange - 20 min delay: DR15 gets 25%, DR30 gets 0%
      const request: ApportionmentRequest = {
        journey_id: '550e8400-e29b-41d4-a716-446655440024',
        delay_minutes: 20,
        total_fare_pence: 4000,
        journey_segments: [
          { toc_code: 'GR', fare_portion_pence: 2000, segment_order: 1 },
          { toc_code: 'SW', fare_portion_pence: 2000, segment_order: 2 },
        ],
      };

      mockTocRulepackRepository.findByTocCode
        .mockResolvedValueOnce({ toc_code: 'GR', scheme: 'DR15', is_active: true })
        .mockResolvedValueOnce({ toc_code: 'SW', scheme: 'DR30', is_active: true });

      const { MultiTocApportioner } = await import('../../src/services/multi-toc-apportioner.js');
      const apportioner = new MultiTocApportioner(mockTocRulepackRepository);
      const result = await apportioner.apportion(request);

      const grSegment = result.segment_eligibilities.find(s => s.toc_code === 'GR');
      const swSegment = result.segment_eligibilities.find(s => s.toc_code === 'SW');

      expect(grSegment!.compensation_percentage).toBe(25);
      expect(swSegment!.compensation_percentage).toBe(0);
    });
  });
});
