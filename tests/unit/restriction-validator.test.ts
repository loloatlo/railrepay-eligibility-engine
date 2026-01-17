/**
 * Unit tests for RestrictionValidator
 * Per ADR-014: Tests written BEFORE implementation (Phase 3.1 - Jessie)
 *
 * Tests cover:
 * - AC-6: Ticket Restriction Validation
 *
 * Test Lock Rule: Blake MUST NOT modify these tests.
 * If Blake believes a test is wrong, hand back to Jessie with explanation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import types that will be implemented by Blake
import type {
  RestrictionValidator,
  RestrictionValidationRequest,
  RestrictionValidationResult,
} from '../../src/services/restriction-validator.js';

// Import fixtures
import restrictionFixtures from '../fixtures/api/restriction-validate.fixture.json';

describe('RestrictionValidator', () => {
  /**
   * SERVICE CONTEXT: Ticket restriction validation logic
   * SPECIFICATION: Phase 1 Specification Section 2.1 (POST /eligibility/restriction/validate)
   * ADR COMPLIANCE: ADR-014 TDD Mandatory
   */

  // ============================================
  // AC-6: Ticket Restriction Validation
  // ============================================

  describe('AC-6: Ticket Restriction Validation', () => {
    /**
     * AC-6: Given a ticket with restriction codes
     * When POST /eligibility/restriction/validate is called
     * Then the restrictions are validated against the journey date/time
     */

    it('should return valid=true for weekend ticket used on Saturday', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['RE', '1F'],
        journey_date: '2026-01-18', // Saturday
        departure_time: '14:30',
      };

      // Act - This will fail until RestrictionValidator is implemented
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.restrictions_checked).toContain('RE');
      expect(result.restrictions_checked).toContain('1F');
      expect(result.notes).toBeDefined();
    });

    it('should return valid=false for restricted ticket with blocking restriction', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['RE', 'XA'],
        journey_date: '2026-01-15', // Wednesday
        departure_time: '08:30',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.restrictions_checked).toContain('RE');
      expect(result.restrictions_checked).toContain('XA');
      expect(result.blocking_restriction).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should return valid=false for weekend-only ticket used on weekday', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['WE'], // Weekend only
        journey_date: '2026-01-15', // Wednesday
        departure_time: '10:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.blocking_restriction).toBe('WE');
      expect(result.reason).toContain('weekend');
    });

    it('should return valid=true for weekend-only ticket used on Saturday', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['WE'], // Weekend only
        journey_date: '2026-01-18', // Saturday
        departure_time: '10:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.restrictions_checked).toContain('WE');
    });

    it('should return valid=false for off-peak ticket used during peak hours', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['OP'], // Off-peak
        journey_date: '2026-01-15', // Wednesday
        departure_time: '07:30', // Peak hour (before 09:30)
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.blocking_restriction).toBe('OP');
      expect(result.reason).toContain('peak');
    });

    it('should return valid=true for off-peak ticket used after peak hours', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['OP'], // Off-peak
        journey_date: '2026-01-15', // Wednesday
        departure_time: '10:30', // After peak (09:30+)
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.restrictions_checked).toContain('OP');
    });

    it('should return valid=true for empty restriction codes', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: [],
        journey_date: '2026-01-15',
        departure_time: '12:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.restrictions_checked).toHaveLength(0);
      expect(result.notes).toContain('No restrictions to validate');
    });

    it('should return valid=false for super off-peak ticket used during peak', async () => {
      // Arrange - Super off-peak typically valid after 10:00
      const request: RestrictionValidationRequest = {
        restriction_codes: ['SP'], // Super off-peak
        journey_date: '2026-01-15',
        departure_time: '09:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.blocking_restriction).toBe('SP');
    });

    it('should return valid=true for anytime ticket regardless of time', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['AT'], // Anytime
        journey_date: '2026-01-15',
        departure_time: '07:00', // Peak hour
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.restrictions_checked).toContain('AT');
    });

    it('should check multiple restrictions and return first blocking one', async () => {
      // Arrange - multiple restrictions, one blocks
      const request: RestrictionValidationRequest = {
        restriction_codes: ['AT', 'OP', 'WE'], // Anytime, Off-peak, Weekend
        journey_date: '2026-01-15', // Wednesday (not weekend)
        departure_time: '12:00', // Off-peak OK
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert - WE should block
      expect(result.valid).toBe(false);
      expect(result.blocking_restriction).toBe('WE');
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle unknown restriction codes gracefully', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['XX', 'YY'], // Unknown codes
        journey_date: '2026-01-15',
        departure_time: '12:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert - unknown codes should be allowed (not restrictive)
      expect(result.valid).toBe(true);
      expect(result.notes).toBeDefined();
    });

    it('should handle leap year dates correctly', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['WE'],
        journey_date: '2028-02-29', // Leap year Saturday
        departure_time: '10:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
    });

    it('should handle edge-of-peak boundary times correctly (09:29 vs 09:30)', async () => {
      // Arrange - exactly at peak boundary
      const requestPeak: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-01-15',
        departure_time: '09:29', // 1 minute before end of peak
      };

      const requestOffPeak: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-01-15',
        departure_time: '09:30', // Exactly at off-peak start
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const resultPeak = await validator.validate(requestPeak);
      const resultOffPeak = await validator.validate(requestOffPeak);

      // Assert
      expect(resultPeak.valid).toBe(false); // Still peak
      expect(resultOffPeak.valid).toBe(true); // Off-peak starts
    });

    it('should handle bank holiday dates as weekend-like', async () => {
      // Arrange - Boxing Day 2026 (Saturday, but test as if it were Friday)
      const request: RestrictionValidationRequest = {
        restriction_codes: ['WE'], // Weekend only
        journey_date: '2026-12-25', // Christmas Day (Friday in 2026)
        departure_time: '10:00',
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert - Bank holidays should be treated as weekends for restrictions
      expect(result.valid).toBe(true);
    });

    it('should validate departure_time format strictly', async () => {
      // Arrange - invalid time format
      const request: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-01-15',
        departure_time: '25:00', // Invalid time
      };

      // Act & Assert
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();

      await expect(validator.validate(request)).rejects.toThrow('Invalid departure_time format');
    });

    it('should validate journey_date format strictly', async () => {
      // Arrange - invalid date format
      const request: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-13-45', // Invalid date
        departure_time: '10:00',
      };

      // Act & Assert
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();

      await expect(validator.validate(request)).rejects.toThrow('Invalid journey_date format');
    });
  });

  // ============================================
  // London-specific Peak Hours
  // ============================================

  describe('London-specific Peak Hours', () => {
    it('should recognize London morning peak as 06:30-09:30', async () => {
      // Arrange
      const requestEarlyPeak: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-01-15',
        departure_time: '06:30', // Start of London peak
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(requestEarlyPeak);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.blocking_restriction).toBe('OP');
    });

    it('should recognize London evening peak as 16:00-19:00', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-01-15',
        departure_time: '17:30', // Evening peak
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.blocking_restriction).toBe('OP');
    });

    it('should allow off-peak between morning and evening peaks', async () => {
      // Arrange
      const request: RestrictionValidationRequest = {
        restriction_codes: ['OP'],
        journey_date: '2026-01-15',
        departure_time: '12:00', // Mid-day off-peak
      };

      // Act
      const { RestrictionValidator } = await import('../../src/services/restriction-validator.js');
      const validator = new RestrictionValidator();
      const result = await validator.validate(request);

      // Assert
      expect(result.valid).toBe(true);
    });
  });
});
