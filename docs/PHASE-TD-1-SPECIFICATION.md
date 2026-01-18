# Phase TD-1: Test Specification for Technical Debt Remediation

**Date**: 2026-01-18
**Owner**: Jessie (QA/TDD Enforcer)
**Service**: eligibility-engine
**Workflow**: TD Remediation (Phases TD-0 through TD-5)

## Overview

This document specifies the failing tests Jessie must write for three technical debt items approved for remediation. These tests must FAIL before Blake implements the fixes.

---

## TD-ELIGIBILITY-001: Missing ESLint Configuration

### Problem Statement
The eligibility-engine service has no ESLint configuration, meaning code quality issues and TypeScript errors are not caught during development or CI.

### Acceptance Criteria

| AC ID | Criterion | Testable Assertion |
|-------|-----------|-------------------|
| AC-1 | `.eslintrc.js` file exists with TypeScript configuration | File exists and contains TypeScript parser config |
| AC-2 | `npm run lint` executes without "No ESLint configuration found" error | Lint command exits with code 0 or lint errors (not config error) |
| AC-3 | ESLint catches TypeScript errors and import path issues | Lint detects intentional errors in test files |
| AC-4 | No existing code violations block the build | `npm run lint` passes on current codebase |

### Test File Location
`tests/unit/eslint-config.test.ts`

### Test Cases (Must FAIL Initially)

```typescript
// AC-1: ESLint config exists
describe('TD-ELIGIBILITY-001: ESLint Configuration', () => {
  it('AC-1: .eslintrc.js file exists with TypeScript configuration', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const configPath = path.resolve(process.cwd(), '.eslintrc.js');
    const stats = await fs.stat(configPath);
    expect(stats.isFile()).toBe(true);

    // Verify it contains TypeScript parser
    const content = await fs.readFile(configPath, 'utf-8');
    expect(content).toContain('@typescript-eslint/parser');
  });

  it('AC-2: npm run lint executes without configuration error', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Should not throw "No ESLint configuration found"
    try {
      await execAsync('npm run lint', { cwd: process.cwd() });
    } catch (error: any) {
      // Lint errors are OK, config errors are NOT
      expect(error.stderr || '').not.toContain('No ESLint configuration found');
      expect(error.stderr || '').not.toContain('ESLint couldn\'t find a configuration file');
    }
  });

  it('AC-3: ESLint catches TypeScript errors', async () => {
    // This test verifies ESLint is properly configured for TypeScript
    // by checking that the eslint rules include TypeScript-specific rules
    const fs = await import('fs/promises');
    const path = await import('path');

    const configPath = path.resolve(process.cwd(), '.eslintrc.js');
    const content = await fs.readFile(configPath, 'utf-8');

    // Should extend TypeScript recommended rules
    expect(content).toMatch(/@typescript-eslint\/recommended|plugin:@typescript-eslint/);
  });
});
```

---

## TD-ELIGIBILITY-003: Service Uses console.log Instead of @railrepay/winston-logger

### Problem Statement
The service uses `console.log`, `console.error`, and `console.warn` instead of the shared `@railrepay/winston-logger` package, violating ADR-002 (correlation IDs required).

### Current Violations (from grep)
- `src/app.ts:416`: `console.error('Unhandled error:', err);`
- `src/app.ts:429`: `console.log('Eligibility Engine listening on port ${port}');`
- `src/app.ts:436`: `console.log('Port ${port} already in use, skipping auto-start');`
- `src/app.ts:438`: `console.error('Server error:', err);`

### Acceptance Criteria

| AC ID | Criterion | Testable Assertion |
|-------|-----------|-------------------|
| AC-1 | `@railrepay/winston-logger@1.0.0` is installed as dependency | Package exists in dependencies |
| AC-2 | `src/lib/logger.ts` exports `getLogger()` and `resetLogger()` functions | Module exports these functions |
| AC-3 | All console.* calls replaced with logger | No console.* in src/ directory |
| AC-4 | Logs include correlation IDs from request context | Logger middleware sets correlation ID |
| AC-5 | grep returns no console.* matches in src/ | Zero matches for console.log/error/warn |

### Test File Location
`tests/unit/logger-integration.test.ts`

### Test Cases (Must FAIL Initially)

```typescript
describe('TD-ELIGIBILITY-003: Winston Logger Integration', () => {
  it('AC-1: @railrepay/winston-logger is installed as dependency', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    expect(pkg.dependencies['@railrepay/winston-logger']).toBeDefined();
    expect(pkg.dependencies['@railrepay/winston-logger']).toMatch(/^[\^~]?1\./);
  });

  it('AC-2: src/lib/logger.ts exports getLogger and resetLogger functions', async () => {
    // Dynamic import to check if module exists and exports correctly
    const loggerModule = await import('../../src/lib/logger.js');

    expect(typeof loggerModule.getLogger).toBe('function');
    expect(typeof loggerModule.resetLogger).toBe('function');
  });

  it('AC-3: No console.log calls in src/ directory', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(
        'grep -r "console\\.log" src/ || true',
        { cwd: process.cwd() }
      );
      expect(stdout.trim()).toBe('');
    } catch (error) {
      // grep returns non-zero if no matches (which is what we want)
      // If we get here with an error, check if it's the expected case
    }
  });

  it('AC-3: No console.error calls in src/ directory', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(
        'grep -r "console\\.error" src/ || true',
        { cwd: process.cwd() }
      );
      expect(stdout.trim()).toBe('');
    } catch (error) {
      // Expected if no matches
    }
  });

  it('AC-3: No console.warn calls in src/ directory', async () => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(
        'grep -r "console\\.warn" src/ || true',
        { cwd: process.cwd() }
      );
      expect(stdout.trim()).toBe('');
    } catch (error) {
      // Expected if no matches
    }
  });

  it('AC-4: Logger includes correlation ID support', async () => {
    const loggerModule = await import('../../src/lib/logger.js');
    const logger = loggerModule.getLogger();

    // Logger should have childLogger method or similar for correlation IDs
    // The @railrepay/winston-logger package supports this pattern
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
```

---

## TD-ELIGIBILITY-004: No @railrepay/metrics-pusher Integration

### Problem Statement
The service has no metrics integration, making it invisible in Grafana dashboards and violating observability requirements.

### Acceptance Criteria

| AC ID | Criterion | Testable Assertion |
|-------|-----------|-------------------|
| AC-1 | `@railrepay/metrics-pusher@1.1.0` is installed as dependency | Package exists in dependencies |
| AC-2 | `src/lib/metrics.ts` exports metric counters and initialization function | Module exports required functions |
| AC-3 | `/metrics` endpoint returns Prometheus-formatted metrics | Endpoint exists and returns text/plain |
| AC-4 | `eligibility_evaluations_total` increments on each POST /eligibility/evaluate | Counter metric exists |
| AC-5 | `eligibility_eligible_total` increments when evaluation is eligible | Counter metric exists |
| AC-6 | `eligibility_ineligible_total` increments when evaluation is ineligible | Counter metric exists |
| AC-7 | `eligibility_evaluation_duration_seconds` records evaluation latency | Histogram metric exists |

### Test File Location
`tests/unit/metrics-integration.test.ts`

### Test Cases (Must FAIL Initially)

```typescript
describe('TD-ELIGIBILITY-004: Metrics Pusher Integration', () => {
  it('AC-1: @railrepay/metrics-pusher is installed as dependency', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    expect(pkg.dependencies['@railrepay/metrics-pusher']).toBeDefined();
    expect(pkg.dependencies['@railrepay/metrics-pusher']).toMatch(/^[\^~]?1\./);
  });

  it('AC-2: src/lib/metrics.ts exports required functions', async () => {
    const metricsModule = await import('../../src/lib/metrics.js');

    expect(typeof metricsModule.initMetrics).toBe('function');
    expect(typeof metricsModule.getMetricsMiddleware).toBe('function');
  });

  it('AC-2: src/lib/metrics.ts exports metric counters', async () => {
    const metricsModule = await import('../../src/lib/metrics.js');

    // These should be exported for direct access if needed
    expect(metricsModule.eligibilityEvaluationsTotal).toBeDefined();
    expect(metricsModule.eligibilityEligibleTotal).toBeDefined();
    expect(metricsModule.eligibilityIneligibleTotal).toBeDefined();
    expect(metricsModule.eligibilityEvaluationDuration).toBeDefined();
  });
});
```

### Integration Test File Location
`tests/integration/metrics-endpoint.integration.test.ts`

### Integration Test Cases (Must FAIL Initially)

```typescript
describe('TD-ELIGIBILITY-004: Metrics Endpoint Integration', () => {
  it('AC-3: /metrics endpoint returns Prometheus-formatted metrics', async () => {
    const response = await fetch('http://localhost:3000/metrics');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');

    const body = await response.text();
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });

  it('AC-4: eligibility_evaluations_total metric exists', async () => {
    const response = await fetch('http://localhost:3000/metrics');
    const body = await response.text();

    expect(body).toContain('eligibility_evaluations_total');
  });

  it('AC-5: eligibility_eligible_total metric exists', async () => {
    const response = await fetch('http://localhost:3000/metrics');
    const body = await response.text();

    expect(body).toContain('eligibility_eligible_total');
  });

  it('AC-6: eligibility_ineligible_total metric exists', async () => {
    const response = await fetch('http://localhost:3000/metrics');
    const body = await response.text();

    expect(body).toContain('eligibility_ineligible_total');
  });

  it('AC-7: eligibility_evaluation_duration_seconds metric exists', async () => {
    const response = await fetch('http://localhost:3000/metrics');
    const body = await response.text();

    expect(body).toContain('eligibility_evaluation_duration_seconds');
  });
});
```

---

## Summary of Test Files to Create

| TD Item | Test File | Test Type | Expected Initial State |
|---------|-----------|-----------|----------------------|
| TD-ELIGIBILITY-001 | `tests/unit/eslint-config.test.ts` | Unit | FAIL (no .eslintrc.js) |
| TD-ELIGIBILITY-003 | `tests/unit/logger-integration.test.ts` | Unit | FAIL (no logger.ts, console.* exists) |
| TD-ELIGIBILITY-004 | `tests/unit/metrics-integration.test.ts` | Unit | FAIL (no metrics.ts) |
| TD-ELIGIBILITY-004 | `tests/integration/metrics-endpoint.integration.test.ts` | Integration | FAIL (no /metrics endpoint) |

## Quality Gates

Before hand-off to Blake (Phase TD-2):
- [ ] All test files created
- [ ] All tests FAIL for the right reasons (not compilation errors)
- [ ] Tests match acceptance criteria 1:1
- [ ] Test file paths follow project conventions

## Hand-off Instructions for Jessie

1. Create all four test files listed above
2. Run `npm test` to verify tests FAIL
3. Confirm failures are due to missing functionality, not syntax errors
4. Document which tests fail and why in a summary
5. Hand back to Quinn for Phase TD-2 dispatch to Blake

---

**BLOCKING RULE**: Blake cannot begin implementation until ALL tests are written and verified to FAIL.
