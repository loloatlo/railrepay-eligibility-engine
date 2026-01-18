/**
 * TD-ELIGIBILITY-003: Winston Logger Integration Tests
 * Phase TD-1 - Test Specification (Jessie)
 *
 * These tests verify that the service uses @railrepay/winston-logger
 * instead of console.log/error/warn, and that correlation IDs are supported.
 * All tests MUST FAIL initially before Blake implements the fixes.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

describe('TD-ELIGIBILITY-003: Winston Logger Integration', () => {
  const projectRoot = resolve(__dirname, '../..');

  describe('AC-1: @railrepay/winston-logger@1.0.0 is installed as dependency', () => {
    it('should have @railrepay/winston-logger in dependencies', () => {
      const pkgPath = resolve(projectRoot, 'package.json');
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      expect(pkg.dependencies['@railrepay/winston-logger']).toBeDefined();
    });

    it('should use version 1.x of @railrepay/winston-logger', () => {
      const pkgPath = resolve(projectRoot, 'package.json');
      const pkgContent = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      const version = pkg.dependencies['@railrepay/winston-logger'];
      expect(version).toMatch(/^[\^~]?1\./);
    });
  });

  describe('AC-2: src/lib/logger.ts exports getLogger and resetLogger functions', () => {
    it('should have src/lib/logger.ts file', () => {
      const loggerPath = resolve(projectRoot, 'src/lib/logger.ts');
      expect(existsSync(loggerPath)).toBe(true);
    });

    it('should export getLogger function', async () => {
      // Dynamic import to test the actual module
      const loggerModule = await import('../../src/lib/logger.js');
      expect(typeof loggerModule.getLogger).toBe('function');
    });

    it('should export resetLogger function', async () => {
      const loggerModule = await import('../../src/lib/logger.js');
      expect(typeof loggerModule.resetLogger).toBe('function');
    });
  });

  describe('AC-3: All console.log, console.error, console.warn calls replaced with logger', () => {
    it('should have no console.log calls in src/ directory', () => {
      let output = '';
      try {
        output = execSync('grep -r "console\\.log" src/ || echo ""', {
          cwd: projectRoot,
          encoding: 'utf-8',
        });
      } catch (error: any) {
        output = error.stdout || '';
      }

      // Filter out any commented lines (very basic filter)
      const nonCommentLines = output
        .split('\n')
        .filter((line) => line.trim() && !line.includes('//'))
        .join('\n');

      expect(nonCommentLines.trim()).toBe('');
    });

    it('should have no console.error calls in src/ directory', () => {
      let output = '';
      try {
        output = execSync('grep -r "console\\.error" src/ || echo ""', {
          cwd: projectRoot,
          encoding: 'utf-8',
        });
      } catch (error: any) {
        output = error.stdout || '';
      }

      const nonCommentLines = output
        .split('\n')
        .filter((line) => line.trim() && !line.includes('//'))
        .join('\n');

      expect(nonCommentLines.trim()).toBe('');
    });

    it('should have no console.warn calls in src/ directory', () => {
      let output = '';
      try {
        output = execSync('grep -r "console\\.warn" src/ || echo ""', {
          cwd: projectRoot,
          encoding: 'utf-8',
        });
      } catch (error: any) {
        output = error.stdout || '';
      }

      const nonCommentLines = output
        .split('\n')
        .filter((line) => line.trim() && !line.includes('//'))
        .join('\n');

      expect(nonCommentLines.trim()).toBe('');
    });
  });

  describe('AC-4: Logs include correlation IDs from request context', () => {
    it('should return a logger with standard logging methods', async () => {
      const loggerModule = await import('../../src/lib/logger.js');
      const logger = loggerModule.getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should support child logger creation for correlation IDs', async () => {
      const loggerModule = await import('../../src/lib/logger.js');
      const logger = loggerModule.getLogger();

      // The logger should support child() method for adding correlation context
      // This is a standard Winston feature used for correlation IDs
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('AC-5: grep -r "console.log|console.error|console.warn" src/ returns no matches', () => {
    it('should pass the combined grep check with zero matches', () => {
      let matchCount = 0;
      try {
        const output = execSync(
          'grep -rE "console\\.(log|error|warn)" src/ | wc -l',
          {
            cwd: projectRoot,
            encoding: 'utf-8',
          }
        );
        matchCount = parseInt(output.trim(), 10);
      } catch (error: any) {
        // grep returns non-zero if no matches, which is actually what we want
        if (error.status === 1) {
          matchCount = 0;
        } else {
          throw error;
        }
      }

      expect(matchCount).toBe(0);
    });
  });
});
