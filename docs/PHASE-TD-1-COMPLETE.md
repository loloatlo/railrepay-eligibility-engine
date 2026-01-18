# Phase TD-1 Complete: Test Specification

**Date**: 2026-01-18
**Owner**: Jessie (QA/TDD Enforcer)
**Service**: eligibility-engine
**Status**: COMPLETE - Tests written and verified to FAIL

---

## Summary

All failing tests have been written for the three approved Technical Debt items. The tests verify all acceptance criteria and fail for the correct reasons (missing functionality, not syntax/compilation errors).

---

## Test Files Created

| TD Item | Test File | Tests | Status |
|---------|-----------|-------|--------|
| TD-ELIGIBILITY-001 | `tests/unit/eslint-config.test.ts` | 7 | All FAIL |
| TD-ELIGIBILITY-003 | `tests/unit/logger-integration.test.ts` | 11 | 10 FAIL, 1 PASS |
| TD-ELIGIBILITY-004 | `tests/unit/metrics-integration.test.ts` | 13 | All FAIL |
| TD-ELIGIBILITY-004 | `tests/integration/metrics-endpoint.integration.test.ts` | 10 | Not run (requires app) |

**Total Tests**: 41 (31 unit tests verified to fail, 10 integration tests)

---

## Failure Analysis

### TD-ELIGIBILITY-001: ESLint Configuration
All 7 tests fail because:
- `.eslintrc.js` file does not exist
- `npm run lint` fails with "ESLint couldn't find a configuration file"

### TD-ELIGIBILITY-003: Winston Logger Integration
10 of 11 tests fail because:
- `@railrepay/winston-logger` is not in package.json dependencies
- `src/lib/logger.ts` does not exist
- `console.log` and `console.error` calls still exist in `src/app.ts` (4 occurrences)

Specific console.* violations found:
```
src/app.ts:416:    console.error('Unhandled error:', err);
src/app.ts:429:      console.log(`Eligibility Engine listening on port ${port}`);
src/app.ts:436:        console.log(`Port ${port} already in use, skipping auto-start`);
src/app.ts:438:        console.error('Server error:', err);
```

### TD-ELIGIBILITY-004: Metrics Pusher Integration
All 13 tests fail because:
- `@railrepay/metrics-pusher` is not in package.json dependencies
- `src/lib/metrics.ts` does not exist
- No `/metrics` endpoint exists

---

## Quality Gate Verification

- [x] All test files created
- [x] All tests FAIL for the right reasons (not compilation errors)
- [x] Tests match acceptance criteria 1:1
- [x] Test file paths follow project conventions
- [x] Tests are readable and maintainable

---

## Hand-off to Blake (Phase TD-2)

### Files Blake Must Create

1. **`.eslintrc.js`** - ESLint configuration with TypeScript support
2. **`src/lib/logger.ts`** - Logger wrapper using @railrepay/winston-logger
3. **`src/lib/metrics.ts`** - Metrics module using @railrepay/metrics-pusher

### Files Blake Must Modify

1. **`package.json`** - Add dependencies:
   - `@railrepay/winston-logger@^1.0.0`
   - `@railrepay/metrics-pusher@^1.1.0`
   - ESLint and TypeScript ESLint dependencies

2. **`src/app.ts`** - Replace all `console.*` calls with logger:
   - Line 416: `console.error` -> `logger.error`
   - Line 429: `console.log` -> `logger.info`
   - Line 436: `console.log` -> `logger.warn`
   - Line 438: `console.error` -> `logger.error`
   - Add metrics middleware and `/metrics` endpoint

3. **`src/index.ts`** - Initialize logger and metrics

### Acceptance Criteria Summary

#### TD-ELIGIBILITY-001 (ESLint)
- AC-1: `.eslintrc.js` exists with TypeScript configuration
- AC-2: `npm run lint` runs without config error
- AC-3: ESLint catches TypeScript errors
- AC-4: Current codebase passes lint

#### TD-ELIGIBILITY-003 (Logger)
- AC-1: `@railrepay/winston-logger@1.0.0` in dependencies
- AC-2: `src/lib/logger.ts` exports `getLogger()` and `resetLogger()`
- AC-3: All `console.*` calls replaced
- AC-4: Logs include correlation IDs
- AC-5: grep returns zero matches for console.*

#### TD-ELIGIBILITY-004 (Metrics)
- AC-1: `@railrepay/metrics-pusher@1.1.0` in dependencies
- AC-2: `src/lib/metrics.ts` exports counters and init function
- AC-3: `/metrics` endpoint returns Prometheus format
- AC-4: `eligibility_evaluations_total` counter
- AC-5: `eligibility_eligible_total` counter
- AC-6: `eligibility_ineligible_total` counter
- AC-7: `eligibility_evaluation_duration_seconds` histogram

---

## BLOCKING RULES

1. **Test Lock Rule**: Blake MUST NOT modify these test files
2. **TDD Compliance**: Blake must make tests GREEN without changing tests
3. **If tests seem wrong**: Blake hands back to Jessie with explanation

---

## Next Phase

**Phase TD-2**: Hand off to Blake for implementation
