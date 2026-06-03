/**
 * @module @enterstellar-ai/cli/__tests__/init-enterstellarignore
 * @description Tests for the `.enterstellarignore` template generator.
 *
 * Validates that `generateEnterstellarIgnore()` produces the canonical
 * 26-pattern `.enterstellarignore` file with all 8 category sections,
 * 2 commented optional patterns, and the documentation URL header.
 *
 * These patterns are prescribed by Correction 6, L301-354 — any
 * deviation from the spec must be caught here.
 *
 * @see Correction 6, L301-354 — canonical `.enterstellarignore` contents
 * @see Correction 6, L457-473 — `enterstellar init` auto-generation rules
 */

import { describe, it, expect } from 'vitest';

import { generateEnterstellarIgnore } from '../src/templates/template-enterstellarignore.js';

// ---------------------------------------------------------------------------
// generateEnterstellarIgnore
// ---------------------------------------------------------------------------

describe('generateEnterstellarIgnore', () => {
    const content = generateEnterstellarIgnore();

    // --- Header ---

    it('includes the file description header', () => {
        expect(content).toContain('# .enterstellarignore');
        expect(content).toContain('Files excluded from `enterstellar migrate`');
    });

    it('includes the documentation URL', () => {
        expect(content).toContain('# Docs: https://enterstellar.dev/docs/cli/enterstellarignore');
    });

    it('includes the syntax description', () => {
        expect(content).toContain('# Syntax: .gitignore-compatible glob patterns');
    });

    // --- Category 1: Test Files ---

    it('includes test file patterns', () => {
        expect(content).toContain('**/*.test.tsx');
        expect(content).toContain('**/*.test.ts');
        expect(content).toContain('**/*.spec.tsx');
        expect(content).toContain('**/*.spec.ts');
        expect(content).toContain('**/__tests__/**');
        expect(content).toContain('**/__mocks__/**');
        expect(content).toContain('**/test-utils/**');
        expect(content).toContain('**/fixtures/**');
    });

    it('includes the Test Files category header', () => {
        expect(content).toContain('# ── Test Files');
    });

    // --- Category 2: Storybook ---

    it('includes Storybook patterns', () => {
        expect(content).toContain('**/*.stories.tsx');
        expect(content).toContain('**/*.stories.ts');
        expect(content).toContain('**/.storybook/**');
    });

    it('includes the Storybook category header', () => {
        expect(content).toContain('# ── Storybook');
    });

    // --- Category 3: E2E / Integration Tests ---

    it('includes E2E patterns', () => {
        expect(content).toContain('**/cypress/**');
        expect(content).toContain('**/e2e/**');
        expect(content).toContain('**/playwright/**');
    });

    it('includes the E2E category header', () => {
        expect(content).toContain('# ── E2E / Integration Tests');
    });

    // --- Category 4: Generated Code ---

    it('includes generated code patterns', () => {
        expect(content).toContain('**/generated/**');
        expect(content).toContain('**/*.generated.ts');
        expect(content).toContain('**/*.generated.tsx');
    });

    it('includes the Generated Code category header', () => {
        expect(content).toContain('# ── Generated Code');
    });

    // --- Category 5: Configuration Files ---

    it('includes configuration file patterns', () => {
        expect(content).toContain('*.config.ts');
        expect(content).toContain('*.config.tsx');
        expect(content).toContain('*.config.js');
        expect(content).toContain('*.config.mjs');
    });

    it('includes the Configuration Files category header', () => {
        expect(content).toContain('# ── Configuration Files');
    });

    // --- Category 6: Build Artifacts ---

    it('includes build artifact patterns', () => {
        expect(content).toContain('**/dist/**');
        expect(content).toContain('**/build/**');
        expect(content).toContain('**/.next/**');
        expect(content).toContain('**/.turbo/**');
    });

    it('includes the Build Artifacts category header', () => {
        expect(content).toContain('# ── Build Artifacts');
    });

    // --- Category 7: Type Declarations ---

    it('includes type declaration pattern', () => {
        expect(content).toContain('**/*.d.ts');
    });

    it('includes the Type Declarations category header', () => {
        expect(content).toContain('# ── Type Declarations');
    });

    // --- Category 8: Internal / Private (commented optional) ---

    it('includes commented optional internal/private patterns', () => {
        expect(content).toContain('# **/internal/**');
        expect(content).toContain('# **/private/**');
    });

    it('includes the Internal / Private category header', () => {
        expect(content).toContain('# ── Internal / Private');
    });

    it('includes the NOTE about internal directories', () => {
        expect(content).toContain('NOTE: Many codebases use internal/ for real components');
    });

    // --- Count Validation ---

    it('has exactly 26 active patterns (non-comment, non-blank lines)', () => {
        const lines = content.split('\n');
        const activePatterns = lines.filter((line) => {
            const trimmed = line.trim();
            // Active pattern: non-empty, not a comment, not a blank line.
            return trimmed.length > 0 && !trimmed.startsWith('#');
        });

        expect(activePatterns).toHaveLength(26);
    });

    it('has exactly 2 commented optional patterns', () => {
        const lines = content.split('\n');
        const commentedPatterns = lines.filter((line) => {
            const trimmed = line.trim();
            // Commented patterns start with `# **/` (pattern prefix).
            return trimmed.startsWith('# **/') && !trimmed.includes('──');
        });

        expect(commentedPatterns).toHaveLength(2);
    });

    it('has all 8 category section headers', () => {
        const categoryHeaders = [
            '# ── Test Files',
            '# ── Storybook',
            '# ── E2E / Integration Tests',
            '# ── Generated Code',
            '# ── Configuration Files',
            '# ── Build Artifacts',
            '# ── Type Declarations',
            '# ── Internal / Private',
        ];

        for (const header of categoryHeaders) {
            expect(content).toContain(header);
        }
    });

    // --- Format Validation ---

    it('ends with a trailing newline', () => {
        expect(content.endsWith('\n')).toBe(true);
    });

    it('returns a non-empty string', () => {
        expect(content.length).toBeGreaterThan(0);
    });
});
