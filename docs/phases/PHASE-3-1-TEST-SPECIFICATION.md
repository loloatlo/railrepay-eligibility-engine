# Phase 3.1: Test Specification - Eligibility Engine

**Phase**: 3.1 - Test Specification (TDD)
**Owner**: Jessie (QA Engineer)
**Status**: COMPLETE
**Date**: 2026-01-17

## Overview

This document records the completion of Phase 3.1 (Test Specification) for the eligibility-engine service. Per ADR-014, all tests have been written BEFORE implementation code exists.

## Test Summary

| Category | Tests | Status |
|----------|-------|--------|
| Unit Tests - EligibilityService | 17 | FAIL (expected) |
| Unit Tests - RestrictionValidator | 19 | FAIL (expected) |
| Unit Tests - SleeperFareCapper | 12 | FAIL (expected) |
| Unit Tests - MultiTocApportioner | 15 | FAIL (expected) |
| Integration Tests - API Endpoints | 16 | FAIL (expected) |
| Integration Tests - Kafka Events | 15 | FAIL (expected) |
| **Total New Tests** | **94** | **FAIL (expected)** |
| Migration Tests (existing) | 25 | PASS |

## Acceptance Criteria Coverage

All 10 acceptance criteria from the Phase 1 Specification are covered:

### AC-1: Evaluate DR15 Eligibility
- File: `tests/unit/eligibility-service.test.ts`
- Tests: 4 tests covering 25%, 50%, 100% compensation and ineligibility

### AC-2: Evaluate DR30 Eligibility
- File: `tests/unit/eligibility-service.test.ts`
- Tests: 3 tests covering threshold differences vs DR15

### AC-3: Calculate Compensation Amount
- File: `tests/unit/eligibility-service.test.ts`
- Tests: 4 tests covering percentage calculations and rounding

### AC-4: Retrieve Evaluation by journey_id
- File: `tests/integration/api-endpoints.integration.test.ts`
- Tests: 4 tests covering GET /eligibility/:journey_id

### AC-5: Health Check Endpoint
- File: `tests/integration/api-endpoints.integration.test.ts`
- Tests: 3 tests covering GET /health

### AC-6: Ticket Restriction Validation
- File: `tests/unit/restriction-validator.test.ts`
- Tests: 19 tests covering restriction codes and peak hours

### AC-7: Sleeper Fare Capping
- File: `tests/unit/sleeper-fare-capper.test.ts`
- Tests: 12 tests covering seated fare equivalent capping

### AC-8: Multi-TOC Fare Apportionment
- File: `tests/unit/multi-toc-apportioner.test.ts`
- Tests: 15 tests covering fare apportionment across TOC segments

### AC-9: Event Consumption (JourneyDelayConfirmed)
- File: `tests/integration/kafka-events.integration.test.ts`
- Tests: 6 tests covering Kafka event handling

### AC-10: Event Production (EligibilityEvaluated)
- File: `tests/integration/kafka-events.integration.test.ts`
- Tests: 4 tests covering transactional outbox pattern

## Test Files Created

### Unit Tests
- `/tests/unit/eligibility-service.test.ts` - Core eligibility evaluation logic
- `/tests/unit/restriction-validator.test.ts` - Ticket restriction validation
- `/tests/unit/sleeper-fare-capper.test.ts` - Sleeper fare capping logic
- `/tests/unit/multi-toc-apportioner.test.ts` - Multi-TOC fare apportionment

### Integration Tests
- `/tests/integration/api-endpoints.integration.test.ts` - REST API endpoints
- `/tests/integration/kafka-events.integration.test.ts` - Kafka event handling

### Fixtures (per ADR-017)
- `/tests/fixtures/api/evaluate-request.fixture.json`
- `/tests/fixtures/api/evaluate-response.fixture.json`
- `/tests/fixtures/api/restriction-validate.fixture.json`
- `/tests/fixtures/db/toc-rulepacks.fixture.json`
- `/tests/fixtures/db/compensation-bands.fixture.json`
- `/tests/fixtures/db/seated-fare-equivalents.fixture.json`
- `/tests/fixtures/messages/journey-delay-confirmed.fixture.json`
- `/tests/fixtures/messages/eligibility-evaluated.fixture.json`

## Test Failure Verification

All 94 new tests fail for the correct reason: **implementation modules do not exist yet**.

```
Error: Failed to load url ../../src/services/eligibility-service.js
Error: Failed to load url ../../src/services/restriction-validator.js
Error: Failed to load url ../../src/services/sleeper-fare-capper.js
Error: Failed to load url ../../src/services/multi-toc-apportioner.js
Error: Failed to load url ../../src/handlers/journey-delay-confirmed.handler.js
Error: Failed to load url ../../src/app.js
```

This confirms:
1. Tests are correctly structured to import implementation modules
2. Tests will pass once Blake implements the corresponding code
3. No setup or configuration errors exist

## Types to Be Implemented

The tests import these types that Blake must implement:

```typescript
// src/services/eligibility-service.ts
export interface EvaluateRequest { ... }
export interface EvaluateResult { ... }
export class EligibilityService { ... }

// src/services/restriction-validator.ts
export interface RestrictionValidationRequest { ... }
export interface RestrictionValidationResult { ... }
export class RestrictionValidator { ... }

// src/services/sleeper-fare-capper.ts
export interface SleeperCapRequest { ... }
export interface SleeperCapResult { ... }
export class SleeperFareCapper { ... }

// src/services/multi-toc-apportioner.ts
export interface ApportionmentRequest { ... }
export interface ApportionmentResult { ... }
export class MultiTocApportioner { ... }

// src/handlers/journey-delay-confirmed.handler.ts
export class JourneyDelayConfirmedHandler { ... }

// src/app.ts
export function createApp(config: AppConfig): Express { ... }
```

## Test Lock Rule

**CRITICAL**: Blake MUST NOT modify these tests.

If Blake believes a test specification is incorrect:
1. Blake hands back to Jessie with detailed explanation
2. Jessie reviews and updates the test if warranted
3. Jessie re-hands off the updated failing test

Rationale: The test is the specification. Modifying the test changes the requirement.

## Coverage Thresholds (Phase 4 Verification)

Blake's implementation must achieve (per ADR-014):
- Lines: >= 80%
- Functions: >= 80%
- Statements: >= 80%
- Branches: >= 75%

## Hand-off to Blake (Phase 3.2)

**Ready for Phase 3.2**: YES

Blake should implement the following modules to make all tests pass:

1. `src/services/eligibility-service.ts` - Core eligibility evaluation
2. `src/services/restriction-validator.ts` - Ticket restriction validation
3. `src/services/sleeper-fare-capper.ts` - Sleeper fare capping
4. `src/services/multi-toc-apportioner.ts` - Multi-TOC apportionment
5. `src/handlers/journey-delay-confirmed.handler.ts` - Kafka event handler
6. `src/app.ts` - Express application with all endpoints

Blake should follow TDD discipline:
1. Run tests to see them fail (RED)
2. Implement minimal code to pass tests (GREEN)
3. Refactor while maintaining green tests
4. Repeat for each module

## Phase 3.1 Completion Checklist

- [x] Test directory structure created
- [x] Fixture files created with realistic data (ADR-017)
- [x] Unit tests for all service modules
- [x] Integration tests with Testcontainers
- [x] All acceptance criteria covered
- [x] Tests fail for the right reasons (missing modules)
- [x] Test Lock Rule documented
- [x] Hand-off documentation complete

---

**Signed off by**: Jessie (QA Engineer)
**Date**: 2026-01-17
**Next Phase**: Phase 3.2 (Implementation) - Blake
