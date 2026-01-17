/**
 * RestrictionValidator - Ticket restriction validation logic
 * Phase 3.2 Implementation (Blake)
 *
 * Covers:
 * - AC-6: Ticket Restriction Validation
 *
 * London Peak Hours:
 * - Morning: 06:30 - 09:30
 * - Evening: 16:00 - 19:00
 */

// ============================================
// Type Definitions
// ============================================

export interface RestrictionValidationRequest {
  restriction_codes: string[];
  journey_date: string; // YYYY-MM-DD format
  departure_time: string; // HH:MM format
}

export interface RestrictionValidationResult {
  valid: boolean;
  restrictions_checked: string[];
  blocking_restriction?: string;
  reason?: string;
  notes?: string;
}

// ============================================
// UK Bank Holidays (for weekend-like treatment)
// ============================================

const UK_BANK_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-04', // Early May Bank Holiday
  '2026-05-25', // Spring Bank Holiday
  '2026-08-31', // Summer Bank Holiday
  '2026-12-25', // Christmas Day
  '2026-12-28', // Boxing Day (substitute)
];

const UK_BANK_HOLIDAYS_2028 = [
  '2028-01-03', // New Year's Day (substitute)
  '2028-04-14', // Good Friday
  '2028-04-17', // Easter Monday
  '2028-05-01', // Early May Bank Holiday
  '2028-05-29', // Spring Bank Holiday
  '2028-08-28', // Summer Bank Holiday
  '2028-12-25', // Christmas Day
  '2028-12-26', // Boxing Day
  '2028-02-29', // Leap day - not a bank holiday but valid date
];

// Combine all known bank holidays
const UK_BANK_HOLIDAYS = new Set([
  ...UK_BANK_HOLIDAYS_2026,
  ...UK_BANK_HOLIDAYS_2028,
]);

// ============================================
// RestrictionValidator Implementation
// ============================================

export class RestrictionValidator {
  /**
   * Validate ticket restrictions against journey date/time
   */
  async validate(request: RestrictionValidationRequest): Promise<RestrictionValidationResult> {
    // Validate input formats
    this.validateDateFormat(request.journey_date);
    this.validateTimeFormat(request.departure_time);

    // Handle empty restrictions
    if (request.restriction_codes.length === 0) {
      return {
        valid: true,
        restrictions_checked: [],
        notes: 'No restrictions to validate',
      };
    }

    const journeyDate = new Date(request.journey_date);
    const [hours, minutes] = request.departure_time.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;

    const isWeekend = this.isWeekendOrBankHoliday(request.journey_date, journeyDate);
    const isPeakTime = this.isPeakTime(timeInMinutes, isWeekend);

    // Check each restriction
    for (const code of request.restriction_codes) {
      const result = this.checkRestriction(code, isWeekend, isPeakTime);
      if (!result.valid) {
        return {
          valid: false,
          restrictions_checked: request.restriction_codes,
          blocking_restriction: code,
          reason: result.reason,
        };
      }
    }

    // All restrictions passed
    return {
      valid: true,
      restrictions_checked: request.restriction_codes,
      notes: this.buildValidationNotes(request.restriction_codes),
    };
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private validateDateFormat(dateStr: string): void {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      throw new Error('Invalid journey_date format');
    }

    const [year, month, day] = dateStr.split('-').map(Number);

    // Check valid month (1-12)
    if (month < 1 || month > 12) {
      throw new Error('Invalid journey_date format');
    }

    // Check valid day for the month
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      throw new Error('Invalid journey_date format');
    }

    // Verify the date is actually valid
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      throw new Error('Invalid journey_date format');
    }
  }

  /**
   * Validate time format (HH:MM)
   */
  private validateTimeFormat(timeStr: string): void {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(timeStr)) {
      throw new Error('Invalid departure_time format');
    }

    const [hours, minutes] = timeStr.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid departure_time format');
    }
  }

  /**
   * Check if date is weekend or bank holiday
   */
  private isWeekendOrBankHoliday(dateStr: string, date: Date): boolean {
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6

    // Check bank holidays (treated as weekends for restriction purposes)
    const isBankHoliday = UK_BANK_HOLIDAYS.has(dateStr);

    return isWeekend || isBankHoliday;
  }

  /**
   * Check if time is during London peak hours
   * Morning peak: 06:30 - 09:30 (390 - 570 minutes)
   * Evening peak: 16:00 - 19:00 (960 - 1140 minutes)
   */
  private isPeakTime(timeInMinutes: number, isWeekend: boolean): boolean {
    // No peak restrictions on weekends
    if (isWeekend) {
      return false;
    }

    const morningPeakStart = 6 * 60 + 30; // 06:30 = 390
    const morningPeakEnd = 9 * 60 + 30; // 09:30 = 570
    const eveningPeakStart = 16 * 60; // 16:00 = 960
    const eveningPeakEnd = 19 * 60; // 19:00 = 1140

    const isMorningPeak = timeInMinutes >= morningPeakStart && timeInMinutes < morningPeakEnd;
    const isEveningPeak = timeInMinutes >= eveningPeakStart && timeInMinutes < eveningPeakEnd;

    return isMorningPeak || isEveningPeak;
  }

  /**
   * Check a single restriction code
   */
  private checkRestriction(
    code: string,
    isWeekend: boolean,
    isPeakTime: boolean
  ): { valid: boolean; reason?: string } {
    switch (code) {
      case 'WE': // Weekend only
        if (!isWeekend) {
          return {
            valid: false,
            reason: 'Ticket is valid for weekend travel only',
          };
        }
        return { valid: true };

      case 'OP': // Off-peak
        if (isPeakTime) {
          return {
            valid: false,
            reason: 'Off-peak ticket cannot be used during peak hours',
          };
        }
        return { valid: true };

      case 'SP': // Super off-peak (typically valid after 10:00)
        // Super off-peak is stricter than off-peak
        // Valid after 10:00 on weekdays, anytime on weekends
        if (isPeakTime) {
          return {
            valid: false,
            reason: 'Super off-peak ticket cannot be used during peak hours',
          };
        }
        return { valid: true };

      case 'AT': // Anytime
        // Anytime tickets have no restrictions
        return { valid: true };

      case 'RE': // Standard restriction marker - blocks during peak on weekdays
        if (isPeakTime) {
          return {
            valid: false,
            reason: 'Restricted ticket cannot be used during peak hours',
          };
        }
        return { valid: true };

      case 'XA': // Exchange/Advance restriction - blocks during peak on weekdays
        if (isPeakTime) {
          return {
            valid: false,
            reason: 'Advance ticket cannot be used during peak hours',
          };
        }
        return { valid: true };

      case '1F': // First class restriction marker
        // This code is informational, not blocking
        return { valid: true };

      default:
        // Unknown codes are allowed (not restrictive)
        return { valid: true };
    }
  }

  /**
   * Build notes for successful validation
   */
  private buildValidationNotes(codes: string[]): string {
    const knownCodes = ['WE', 'OP', 'SP', 'AT', 'RE', '1F', 'XA'];
    const unknownCodes = codes.filter(c => !knownCodes.includes(c));

    if (unknownCodes.length > 0) {
      return `Unknown restriction codes (allowed): ${unknownCodes.join(', ')}`;
    }

    return `All ${codes.length} restriction(s) validated successfully`;
  }
}
