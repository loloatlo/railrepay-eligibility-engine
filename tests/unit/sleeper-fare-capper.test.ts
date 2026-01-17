/**
 * Unit tests for SleeperFareCapper
 * Per ADR-014: Tests written BEFORE implementation (Phase 3.1 - Jessie)
 *
 * Tests cover:
 * - AC-7: Sleeper Fare Capping
 *
 * Test Lock Rule: Blake MUST NOT modify these tests.
 * If Blake believes a test is wrong, hand back to Jessie with explanation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import types that will be implemented by Blake
import type {
  SleeperFareCapper,
  SleeperCapRequest,
  SleeperCapResult,
} from '../../src/services/sleeper-fare-capper.js';

// Import fixtures
import seatedFareEquivalents from '../fixtures/db/seated-fare-equivalents.fixture.json';

describe('SleeperFareCapper', () => {
  /**
   * SERVICE CONTEXT: Sleeper fare capping logic for Caledonian Sleeper and Night Riviera
   * SPECIFICATION: Phase 1 Specification Section 5.3 (Sleeper Fare Capping)
   * ADR COMPLIANCE: ADR-014 TDD Mandatory
   */

  // Mock dependencies
  let mockSeatedFareRepository: {
    findByRouteAndClass: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSeatedFareRepository = {
      findByRouteAndClass: vi.fn(),
    };
  });

  // ============================================
  // AC-7: Sleeper Fare Capping
  // ============================================

  describe('AC-7: Sleeper Fare Capping', () => {
    /**
     * AC-7: Given a sleeper ticket with fare 5000 pence
     * And the seated equivalent is 2000 pence
     * When evaluated with 120+ minute delay (100% compensation)
     * Then compensation_pence = 2000 (capped)
     */

    it('should cap compensation at seated equivalent for 100% delay refund', async () => {
      // Arrange
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 5000,
        calculated_compensation_pence: 5000, // 100% of fare
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 2000,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act - This will fail until SleeperFareCapper is implemented
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(2000);
      expect(result.cap_applied).toBe(true);
      expect(result.original_compensation_pence).toBe(5000);
      expect(result.seated_equivalent_pence).toBe(2000);
    });

    it('should not cap when compensation is below seated equivalent', async () => {
      // Arrange - 50% compensation (2500) is above seated equivalent (2000)
      // But when compensation is below, no cap needed
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 3000,
        calculated_compensation_pence: 1500, // 50% of 3000
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 2000,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(1500);
      expect(result.cap_applied).toBe(false);
    });

    it('should use correct seated equivalent for first class berth', async () => {
      // Arrange
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'first_berth',
        sleeper_fare_pence: 25000,
        calculated_compensation_pence: 25000, // 100%
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'first_berth',
        seated_equivalent_pence: 15000,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(15000);
      expect(result.cap_applied).toBe(true);
    });

    it('should handle Caledonian Sleeper routes correctly', async () => {
      // Arrange - Euston to Fort William
      const request: SleeperCapRequest = {
        route_code: 'EUS-FTW',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 12000,
        calculated_compensation_pence: 12000,
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-FTW',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 7500,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(7500);
      expect(result.cap_applied).toBe(true);
    });

    it('should handle Night Riviera routes correctly', async () => {
      // Arrange - Paddington to Penzance
      const request: SleeperCapRequest = {
        route_code: 'PAD-PNZ',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 10000,
        calculated_compensation_pence: 10000,
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'PAD-PNZ',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 6000,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(6000);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should use standard calculation when no seated equivalent found', async () => {
      // Arrange
      const request: SleeperCapRequest = {
        route_code: 'UNKNOWN-ROUTE',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 8000,
        calculated_compensation_pence: 8000,
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue(null);

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert - no cap applied, use original
      expect(result.capped_compensation_pence).toBe(8000);
      expect(result.cap_applied).toBe(false);
      expect(result.notes).toContain('No seated fare equivalent found');
    });

    it('should use current effective fare based on journey date', async () => {
      // Arrange - journey date falls in new pricing period
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 15000,
        calculated_compensation_pence: 15000,
        journey_date: '2026-06-15', // After effective_from of new pricing
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 9500, // Updated pricing
        effective_from: '2026-05-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(9500);
      expect(result.seated_equivalent_pence).toBe(9500);
    });

    it('should handle expired effective_to dates', async () => {
      // Arrange - query returns expired rate
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 12000,
        calculated_compensation_pence: 12000,
        journey_date: '2026-07-01',
      };

      // Repository should filter this out, but if it returns expired:
      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 7000,
        effective_from: '2025-01-01',
        effective_to: '2025-12-31', // Expired
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert - should not use expired rate
      expect(result.cap_applied).toBe(false);
      expect(result.capped_compensation_pence).toBe(12000);
      expect(result.notes).toContain('Expired fare equivalent');
    });

    it('should handle partial refund scenarios (50% compensation)', async () => {
      // Arrange - 50% refund scenario
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 10000,
        calculated_compensation_pence: 5000, // 50% of sleeper fare
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 4000, // 50% of seated would be 2000
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert - 50% of seated equivalent = 2000, not 50% of sleeper (5000)
      // The cap should be 50% of seated equivalent, not 50% of sleeper
      expect(result.capped_compensation_pence).toBe(2000);
      expect(result.cap_applied).toBe(true);
    });

    it('should handle club and suite sleeper classes', async () => {
      // Arrange - Caledonian Sleeper club class
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'club',
        sleeper_fare_pence: 35000,
        calculated_compensation_pence: 35000,
        journey_date: '2026-01-15',
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'club',
        seated_equivalent_pence: 20000,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert
      expect(result.capped_compensation_pence).toBe(20000);
      expect(result.cap_applied).toBe(true);
    });
  });

  // ============================================
  // Compensation Percentage Proportional Capping
  // ============================================

  describe('Compensation Percentage Proportional Capping', () => {
    it('should apply proportional cap for 25% compensation', async () => {
      // Arrange - DR15 15-29 minute delay = 25%
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 16000,
        calculated_compensation_pence: 4000, // 25% of 16000
        journey_date: '2026-01-15',
        compensation_percentage: 25,
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 8500,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert - 25% of seated equivalent (8500) = 2125
      expect(result.capped_compensation_pence).toBe(2125);
      expect(result.cap_applied).toBe(true);
    });

    it('should apply proportional cap for 50% compensation', async () => {
      // Arrange - 50% compensation
      const request: SleeperCapRequest = {
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        sleeper_fare_pence: 16000,
        calculated_compensation_pence: 8000, // 50% of 16000
        journey_date: '2026-01-15',
        compensation_percentage: 50,
      };

      mockSeatedFareRepository.findByRouteAndClass.mockResolvedValue({
        route_code: 'EUS-INV',
        sleeper_class: 'standard_berth',
        seated_equivalent_pence: 8500,
        effective_from: '2026-01-01',
        effective_to: null,
      });

      // Act
      const { SleeperFareCapper } = await import('../../src/services/sleeper-fare-capper.js');
      const capper = new SleeperFareCapper(mockSeatedFareRepository);
      const result = await capper.applyCap(request);

      // Assert - 50% of seated equivalent (8500) = 4250
      expect(result.capped_compensation_pence).toBe(4250);
      expect(result.cap_applied).toBe(true);
    });
  });
});
