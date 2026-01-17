# Phase 1 - Specification

**Service**: eligibility-engine
**Date**: 2026-01-17
**Orchestrator**: Quinn
**Source**: Notion > Architecture > Service Layer, Data Layer

---

## 1. Service Overview

### 1.1 Purpose

The eligibility-engine evaluates whether a journey delay qualifies for Delay Repay compensation under UK rail industry rules. It determines:

1. **Scheme applicability** - Which Delay Repay scheme (DR15 or DR30) applies based on the Train Operating Company (TOC)
2. **Delay threshold eligibility** - Whether the delay meets the minimum threshold for compensation
3. **Compensation amount** - The percentage of fare to be refunded based on delay duration
4. **Ticket restriction validation** - Whether the ticket restrictions allow a claim
5. **Fare apportionment** - Calculating compensation for multi-modal or multi-TOC tickets
6. **Sleeper fare capping** - Ensuring sleeper ticket compensation is capped at seated fare equivalent

### 1.2 Schema

- **Schema name**: `eligibility_engine`
- **Per ADR-001**: Schema-per-service on shared Railway PostgreSQL instance

### 1.3 Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Runtime | Node.js 20+ | LTS version |
| Language | TypeScript 5.x | Strict mode |
| Framework | Express.js 4.x | REST API |
| Database | PostgreSQL 16 | Via @railrepay/postgres-client |
| Event Bus | Confluent Kafka | Via @railrepay/kafka-client |
| Logging | Winston | Via @railrepay/winston-logger |
| Metrics | Prometheus | Via @railrepay/metrics-pusher |
| Testing | Vitest + Testcontainers | TDD per ADR-014 |

---

## 2. API Design

**Per Notion > Architecture > Service Layer > eligibility-engine**

### 2.1 Endpoints

#### POST /eligibility/evaluate

Evaluate a journey for Delay Repay eligibility.

**Request**:
```json
{
  "journey_id": "uuid",
  "toc_code": "string (2-char TOC code)",
  "scheduled_departure": "ISO8601 datetime",
  "actual_arrival": "ISO8601 datetime",
  "scheduled_arrival": "ISO8601 datetime",
  "ticket_fare_pence": 1500,
  "ticket_class": "standard|first",
  "ticket_type": "single|return|season",
  "ticket_restrictions": ["RE", "1F"],
  "is_sleeper": false,
  "journey_segments": [
    {
      "toc_code": "GW",
      "fare_portion_pence": 750
    }
  ]
}
```

**Response** (200 OK):
```json
{
  "journey_id": "uuid",
  "eligible": true,
  "scheme": "DR15",
  "delay_minutes": 45,
  "compensation_percentage": 50.00,
  "compensation_pence": 750,
  "evaluation_timestamp": "ISO8601",
  "reasons": ["Delay exceeds 30 minutes under DR15 scheme"],
  "applied_rules": ["DR15_30MIN_50PCT"],
  "fare_breakdown": [
    {
      "toc_code": "GW",
      "fare_pence": 750,
      "compensation_pence": 375
    }
  ]
}
```

**Response** (200 OK - Not Eligible):
```json
{
  "journey_id": "uuid",
  "eligible": false,
  "scheme": "DR30",
  "delay_minutes": 20,
  "compensation_percentage": 0,
  "compensation_pence": 0,
  "evaluation_timestamp": "ISO8601",
  "reasons": ["Delay of 20 minutes does not meet DR30 30-minute threshold"],
  "applied_rules": []
}
```

#### GET /eligibility/:journey_id

Retrieve a previously evaluated eligibility result.

**Response** (200 OK): Same as POST response

**Response** (404 Not Found):
```json
{
  "error": "Evaluation not found",
  "journey_id": "uuid"
}
```

#### POST /eligibility/restriction/validate

Validate whether ticket restriction codes allow a claim.

**Request**:
```json
{
  "restriction_codes": ["RE", "1F"],
  "journey_date": "2026-01-15",
  "departure_time": "14:30"
}
```

**Response** (200 OK):
```json
{
  "valid": true,
  "restrictions_checked": ["RE", "1F"],
  "notes": ["Weekend restriction does not apply to travel date"]
}
```

**Response** (200 OK - Invalid):
```json
{
  "valid": false,
  "restrictions_checked": ["RE", "1F"],
  "blocking_restriction": "RE",
  "reason": "Ticket restricted to specific service that was not delayed"
}
```

#### GET /health

Health check endpoint per ADR-008.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "eligibility-engine",
  "timestamp": "ISO8601",
  "dependencies": {
    "database": "healthy",
    "kafka": "healthy"
  }
}
```

---

## 3. Database Schema

**Per Notion > Architecture > Data Layer > eligibility_engine schema**

### 3.1 Tables

#### eligibility_evaluations

Stores evaluation results for audit and retrieval.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Evaluation ID |
| journey_id | UUID | NOT NULL, UNIQUE | Reference to journey (no FK - cross-service) |
| toc_code | VARCHAR(2) | NOT NULL | Train Operating Company code |
| scheme | VARCHAR(10) | NOT NULL | 'DR15' or 'DR30' |
| delay_minutes | INTEGER | NOT NULL | Calculated delay in minutes |
| eligible | BOOLEAN | NOT NULL | Whether claim is eligible |
| compensation_percentage | DECIMAL(5,2) | NOT NULL | Percentage of fare (0-100) |
| compensation_pence | INTEGER | NOT NULL | Amount in pence |
| ticket_fare_pence | INTEGER | NOT NULL | Original ticket fare |
| reasons | JSONB | NOT NULL DEFAULT '[]' | Array of reason strings |
| applied_rules | JSONB | NOT NULL DEFAULT '[]' | Rules that were applied |
| fare_breakdown | JSONB | NULL | Per-TOC breakdown for multi-leg journeys |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Evaluation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_evaluations_journey_id` on `journey_id`
- `idx_evaluations_created_at` on `created_at`

#### toc_rulepacks

Configuration of TOC-specific Delay Repay rules.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Rulepack ID |
| toc_code | VARCHAR(2) | NOT NULL, UNIQUE | TOC identifier |
| toc_name | VARCHAR(100) | NOT NULL | Full TOC name |
| scheme | VARCHAR(10) | NOT NULL | 'DR15' or 'DR30' |
| allows_online_claims | BOOLEAN | NOT NULL DEFAULT true | Online claim support |
| max_claim_days | INTEGER | NOT NULL DEFAULT 28 | Claim window in days |
| special_rules | JSONB | NULL | Additional TOC-specific rules |
| active | BOOLEAN | NOT NULL DEFAULT true | Whether rulepack is active |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_toc_rulepacks_toc_code` on `toc_code`
- `idx_toc_rulepacks_active` on `active`

#### compensation_bands

Static lookup table for compensation percentages.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Band ID |
| scheme_type | VARCHAR(10) | NOT NULL | 'DR15' or 'DR30' |
| delay_threshold_minutes | INTEGER | NOT NULL | Minimum delay for this band |
| compensation_percentage | DECIMAL(5,2) | NOT NULL | Refund percentage |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Creation timestamp |

**Unique constraint**: `(scheme_type, delay_threshold_minutes)`

**Seed data** (Consumer Rights Act 2015 regulated values):
```sql
INSERT INTO eligibility_engine.compensation_bands
  (delay_threshold_minutes, compensation_percentage, scheme_type) VALUES
  (15, 25.00, 'DR15'),
  (30, 50.00, 'DR15'),
  (30, 50.00, 'DR30'),
  (60, 50.00, 'DR15'),
  (60, 50.00, 'DR30'),
  (120, 100.00, 'DR15'),
  (120, 100.00, 'DR30');
```

#### seated_fare_equivalents

Lookup table for sleeper fare capping.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Record ID |
| route_code | VARCHAR(20) | NOT NULL | Route identifier |
| sleeper_class | VARCHAR(20) | NOT NULL | 'standard_berth', 'first_berth', etc. |
| seated_equivalent_pence | INTEGER | NOT NULL | Cap amount in pence |
| effective_from | DATE | NOT NULL | Start of validity |
| effective_to | DATE | NULL | End of validity (NULL = current) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Creation timestamp |

**Index**: `idx_seated_fare_effective` on `(route_code, effective_from, effective_to)`

#### outbox

Transactional outbox for event delivery (per Data Layer spec).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Event ID |
| aggregate_type | VARCHAR(50) | NOT NULL | 'eligibility_evaluation' |
| aggregate_id | UUID | NOT NULL | evaluation.id |
| event_type | VARCHAR(100) | NOT NULL | e.g., 'EligibilityEvaluated' |
| payload | JSONB | NOT NULL | Event payload |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Creation timestamp |
| published_at | TIMESTAMPTZ | NULL | When published to Kafka |

**Index**: `idx_outbox_unpublished` on `created_at` WHERE `published_at IS NULL`

---

## 4. Event Integration

### 4.1 Events Consumed

| Event | Source | Action |
|-------|--------|--------|
| `JourneyDelayConfirmed` | delay-tracker | Trigger automatic eligibility evaluation |

### 4.2 Events Produced

| Event | Topic | Payload |
|-------|-------|---------|
| `EligibilityEvaluated` | `eligibility.evaluated` | Full evaluation result |

---

## 5. Business Rules

### 5.1 Delay Repay Schemes

**DR15 (Delay Repay 15)** - TOCs: Avanti West Coast, c2c, Greater Anglia, LNER, South Western Railway, Southeastern, Thameslink/Great Northern, TPE
- 15-29 minutes: 25% refund
- 30-59 minutes: 50% refund
- 60-119 minutes: 50% refund (or 100% for single)
- 120+ minutes: 100% refund

**DR30 (Delay Repay 30)** - All other TOCs
- 30-59 minutes: 50% refund
- 60-119 minutes: 50% refund (or 100% for single)
- 120+ minutes: 100% refund

### 5.2 TOC Scheme Assignments

Per Notion > Architecture > Data Layer:

**DR15 TOCs**: AW (Avanti), CC (c2c), LE (Greater Anglia), GR (LNER), SW (South Western), SE (Southeastern), TL (Thameslink), GN (Great Northern), TP (TPE)

**DR30 TOCs**: All others including GW (Great Western), VT (CrossCountry), NT (Northern), EM (East Midlands), SR (ScotRail), ME (Merseyrail), LO (London Overground), TW (Tyne and Wear Metro)

### 5.3 Sleeper Fare Capping

For sleeper services (Caledonian Sleeper, Night Riviera):
- Compensation is capped at the equivalent seated fare
- Lookup in `seated_fare_equivalents` table
- If no equivalent found, use standard calculation

### 5.4 Multi-TOC Fare Apportionment

For journeys spanning multiple TOCs:
- Calculate compensation per-TOC based on fare portion
- Use the scheme of each TOC for their portion
- Sum to get total compensation

---

## 6. ADR Applicability Checklist

| ADR | Title | Applicable | Implementation Notes |
|-----|-------|------------|---------------------|
| ADR-001 | Schema-per-service | YES | Use `eligibility_engine` schema |
| ADR-002 | Correlation IDs | YES | Pass through all requests/events |
| ADR-005 | Railway Native Rollback | YES | No canary deployments |
| ADR-006 | Metrics Pusher | YES | Use @railrepay/metrics-pusher |
| ADR-007 | Winston Logger | YES | Use @railrepay/winston-logger |
| ADR-008 | Health Check Endpoint | YES | Implement /health |
| ADR-010 | Smoke Tests | YES | Post-deployment verification |
| ADR-012 | OpenAPI Specifications | YES | Document all endpoints |
| ADR-013 | Service Naming | YES | SERVICE_NAME=eligibility-engine |
| ADR-014 | TDD Mandatory | YES | Tests first, then implementation |

---

## 7. Acceptance Criteria

### AC-1: Evaluate DR15 Eligibility
**Given** a journey with TOC code 'GR' (LNER)
**When** the delay is 20 minutes
**Then** the evaluation returns eligible=true, scheme='DR15', compensation_percentage=25.00

### AC-2: Evaluate DR30 Eligibility
**Given** a journey with TOC code 'GW' (Great Western)
**When** the delay is 20 minutes
**Then** the evaluation returns eligible=false, scheme='DR30' (threshold not met)

### AC-3: Calculate Compensation Amount
**Given** a journey with fare 1500 pence and 50% compensation
**Then** compensation_pence = 750

### AC-4: Retrieve Evaluation
**Given** an evaluation has been performed for journey_id X
**When** GET /eligibility/X is called
**Then** the stored evaluation is returned

### AC-5: Health Check
**Given** the service is running and database is connected
**When** GET /health is called
**Then** status 200 with healthy status is returned

### AC-6: Ticket Restriction Validation
**Given** a ticket with restriction codes
**When** POST /eligibility/restriction/validate is called
**Then** the restrictions are validated against the journey date/time

### AC-7: Sleeper Fare Capping
**Given** a sleeper ticket with fare 5000 pence
**And** the seated equivalent is 2000 pence
**When** evaluated with 120+ minute delay (100% compensation)
**Then** compensation_pence = 2000 (capped)

### AC-8: Multi-TOC Apportionment
**Given** a journey with segments on GR (DR15) and GW (DR30)
**When** evaluated with 20 minute delay
**Then** GR portion is eligible (25%), GW portion is not eligible

### AC-9: Event Consumption
**Given** a `JourneyDelayConfirmed` event is received
**When** processed by the consumer
**Then** an eligibility evaluation is performed and stored

### AC-10: Event Production
**Given** an eligibility evaluation is completed
**Then** an `EligibilityEvaluated` event is written to the outbox

---

## 8. Non-Functional Requirements

### 8.1 Performance
- Evaluation API response time < 200ms p99
- Support 100 concurrent evaluations

### 8.2 Security
- No PII stored in this service
- Authentication via API gateway (future)

### 8.3 Observability
- All requests logged with correlation IDs
- Metrics: evaluation_count, evaluation_duration_ms, eligible_count, ineligible_count
- Health check includes database connectivity

### 8.4 Reliability
- Transactional outbox ensures event delivery
- Idempotent evaluation (same journey_id returns cached result)

---

## 9. Definition of Done

### Design
- [x] Notion requirements referenced with specific page/section links
- [x] All open questions resolved or documented as assumptions
- [x] Non-functional requirements explicitly listed

### TDD (Test-Driven Development)
- [ ] Failing tests authored FIRST (Phase 3.1 - Jessie)
- [ ] Implementation written to pass tests (Phase 3.2 - Blake)
- [ ] All tests passing in CI

### Data (Database)
- [ ] RFC written with business context and alternatives (Phase 2 - Hoops)
- [ ] Forward and rollback SQL migrations created (Phase 2 - Hoops)
- [ ] Zero-downtime migration plan documented
- [ ] Migration tests pass with Testcontainers
- [ ] Schema ownership boundaries respected

### Code Quality
- [ ] TypeScript types are precise and complete
- [ ] ESLint and Prettier checks clean
- [ ] No TODO comments remaining
- [ ] Security scan clean

### Observability
- [ ] Winston logs include correlation IDs
- [ ] Prometheus metrics instrument key operations
- [ ] Error cases log appropriate severity levels

### Documentation
- [x] Phase specification document created
- [ ] API contracts documented (OpenAPI)
- [ ] README updated

### Release
- [ ] Smoke tests passed (Phase 5 - Moykle)
- [ ] Railway deployment successful
- [ ] Dashboards and alerts configured

### Technical Debt
- [ ] All shortcuts documented in Technical Debt Register

### Sign-Offs
- [ ] Hoops approved (data layer)
- [ ] Jessie approved (test coverage)
- [ ] Moykle approved (deployment)
- [ ] Quinn final approval

---

## 10. Work Sequence Plan

### Phase 2: Data Layer (Hoops)
1. Create RFC for eligibility_engine schema
2. Write failing migration integration tests (Testcontainers)
3. Write forward migrations (CREATE SCHEMA, tables, indexes, seed data)
4. Write rollback migrations
5. Verify migrations pass
6. Hand off to Jessie

### Phase 3.1: Test Specification (Jessie)
1. Write failing unit tests for evaluation logic
2. Write failing unit tests for API endpoints
3. Write failing integration tests for database operations
4. Write failing tests for Kafka consumer
5. Verify all tests FAIL for the right reasons
6. Hand off failing tests to Blake

### Phase 3.2: Implementation (Blake)
1. Set up project structure (package.json, tsconfig, etc.)
2. Implement domain logic to pass Jessie's tests
3. Implement API endpoints to pass Jessie's tests
4. Implement Kafka consumer to pass Jessie's tests
5. Implement health check endpoint
6. DO NOT modify Jessie's tests
7. Hand off to Jessie for QA

### Phase 4: QA (Jessie)
1. Verify TDD compliance (tests written before implementation)
2. Verify coverage thresholds (>=80% lines/functions/statements, >=75% branches)
3. Verify integration tests use Testcontainers
4. Verify observability instrumented
5. Sign off for deployment

### Phase 5: Deployment (Moykle)
1. Create Railway service configuration
2. Configure environment variables
3. Set up CI/CD pipeline
4. Run database migrations
5. Deploy to Railway
6. Execute smoke tests
7. Configure dashboards and alerts

### Phase 6: Verification (Quinn)
1. Verify deployment via Railway MCP
2. Verify health endpoint responds
3. Verify logs and metrics flowing to Grafana
4. Update Notion documentation
5. Record any technical debt
6. Close out the feature

---

**Specification Approved by**: Quinn (Orchestrator)
**Date**: 2026-01-17
**Ready for Phase 2**: YES
