/**
 * TD-ELIGIBILITY-001: ESLint Configuration Tests
 * Phase TD-1 - Test Specification (Jessie)
 *
 * These tests verify that ESLint is properly configured for the eligibility-engine service.
 * All tests MUST FAIL initially before Blake implements the fixes.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

describe('TD-ELIGIBILITY-001: ESLint Configuration', () => {
  const projectRoot = resolve(__dirname, '../..');

  describe('AC-1: .eslintrc.cjs file exists with TypeScript configuration', () => {
    it('should have .eslintrc.cjs file in project root (cjs required for ES module projects)', () => {
      const configPath = resolve(projectRoot, '.eslintrc.cjs');
      expect(existsSync(configPath)).toBe(true);
    });

    it('should configure TypeScript parser', () => {
      const configPath = resolve(projectRoot, '.eslintrc.cjs');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('@typescript-eslint/parser');
    });

    it('should include TypeScript ESLint plugin', () => {
      const configPath = resolve(projectRoot, '.eslintrc.cjs');
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('@typescript-eslint');
    });
  });

  describe('AC-2: npm run lint executes without configuration error', () => {
    it('should not throw "No ESLint configuration found" error', () => {
      let output: string;
      let exitCode = 0;

      try {
        output = execSync('npm run lint 2>&1', {
          cwd: projectRoot,
          encoding: 'utf-8',
        });
      } catch (error: any) {
        output = error.stdout || error.stderr || '';
        exitCode = error.status || 1;
      }

      // The lint command should not fail due to missing configuration
      expect(output).not.toContain('No ESLint configuration found');
      expect(output).not.toContain("ESLint couldn't find a configuration file");
    });
  });

  describe('AC-3: ESLint catches TypeScript errors and import path issues', () => {
    it('should extend TypeScript recommended rules', () => {
      const configPath = resolve(projectRoot, '.eslintrc.cjs');
      const content = readFileSync(configPath, 'utf-8');

      // Should use recommended TypeScript rules
      const hasRecommended =
        content.includes('plugin:@typescript-eslint/recommended') ||
        content.includes('@typescript-eslint/recommended');
      expect(hasRecommended).toBe(true);
    });

    it('should be configured for ES modules', () => {
      const configPath = resolve(projectRoot, '.eslintrc.cjs');
      const content = readFileSync(configPath, 'utf-8');

      // Should handle ES modules (sourceType: 'module')
      expect(content).toContain('module');
    });
  });

  describe('AC-4: No existing code violations block the build', () => {
    it('should pass lint on current codebase', () => {
      let exitCode = 0;

      try {
        execSync('npm run lint', {
          cwd: projectRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      } catch (error: any) {
        exitCode = error.status || 1;
      }

      // Lint should pass (exit code 0)
      expect(exitCode).toBe(0);
    });
  });
});
