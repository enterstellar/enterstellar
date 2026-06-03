/**
 * @module @enterstellar-ai/cli/__tests__/format-text
 * @description Tests for the human-readable text formatters.
 *
 * Verifies both `formatBatchSummaryText` and `formatResultText` against
 * the Correction 1 terminal output spec, including Audit M1 SKIP
 * sub-count breakdown.
 *
 * **Note:** Tests use `pc.createColors(false)` to strip ANSI color codes
 * for stable string assertions. Since `picocolors` is the formatter's
 * runtime dep, we instead strip ANSI manually with a regex.
 *
 * @see Correction 1 — Batch Summary: Terminal Output Format
 * @see Audit M1 — SKIP sub-count breakdown
 */

import { describe, it, expect } from 'vitest';

import {
    formatBatchSummaryText,
    formatResultText,
} from '../src/migrate/format-text.js';

import type { MigrateBatchSummary, MigrationResult } from '@enterstellar-ai/migration';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Strips ANSI escape codes from a string for stable assertions.
 * picocolors injects color codes which vary by terminal capability.
 */
// eslint-disable-next-line no-control-regex -- intentional ANSI stripping
const stripAnsi = (str: string): string => str.replace(/\x1B\[[0-9;]*m/g, '');

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<MigrationResult>): MigrationResult {
    return {
        componentName: 'Button',
        sourcePath: 'src/Button.tsx',
        outcome: 'clean',
        contractPath: 'src/Button.contract.ts',
        testPath: 'src/Button.test.ts',
        reviewAnnotations: [],
        warnAnnotations: [],
        diagnostics: [],
        ...overrides,
    };
}

function makeSummary(overrides: Partial<MigrateBatchSummary>): MigrateBatchSummary {
    return {
        totalFiles: 10,
        cleanCount: 10,
        warnCount: 0,
        reviewCount: 0,
        skipCount: 0,
        results: [],
        durationMs: 1234,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// formatBatchSummaryText
// ---------------------------------------------------------------------------

describe('formatBatchSummaryText', () => {
    it('renders header with file count and duration', () => {
        const output = stripAnsi(formatBatchSummaryText(makeSummary({}), 'src/'));
        expect(output).toContain('enterstellar migrate');
        expect(output).toContain('10 files scanned');
        expect(output).toContain('1.2s');
    });

    it('renders clean count line when cleanCount > 0', () => {
        const output = stripAnsi(formatBatchSummaryText(makeSummary({ cleanCount: 5 }), 'src/'));
        expect(output).toContain('5 contracts generated');
        expect(output).toContain('(clean)');
    });

    it('renders warn count line when warnCount > 0', () => {
        const output = stripAnsi(
            formatBatchSummaryText(makeSummary({ warnCount: 3 }), 'src/'),
        );
        expect(output).toContain('3 contracts generated');
        expect(output).toContain('(warnings)');
    });

    it('renders review count line when reviewCount > 0', () => {
        const output = stripAnsi(
            formatBatchSummaryText(makeSummary({ reviewCount: 7 }), 'src/'),
        );
        expect(output).toContain('7 contracts generated');
        expect(output).toContain('(need review)');
    });

    it('omits zero-count sections entirely', () => {
        const summary = makeSummary({ cleanCount: 5, warnCount: 0, reviewCount: 0, skipCount: 0 });
        const output = stripAnsi(formatBatchSummaryText(summary, 'src/'));
        expect(output).not.toContain('(warnings)');
        expect(output).not.toContain('(need review)');
        expect(output).not.toContain('skipped');
    });

    it('renders SKIP section with sub-counts grouped by skipReason (Audit M1)', () => {
        const results: MigrationResult[] = [
            makeResult({ outcome: 'skip', skipReason: 'no exports' }),
            makeResult({ outcome: 'skip', skipReason: 'no exports' }),
            makeResult({ outcome: 'skip', skipReason: 'no exports' }),
            makeResult({ outcome: 'skip', skipReason: 'syntax error' }),
            makeResult({ outcome: 'skip', skipReason: 'not React component' }),
        ];
        const summary = makeSummary({
            totalFiles: 15,
            cleanCount: 10,
            skipCount: 5,
            results,
        });
        const output = stripAnsi(formatBatchSummaryText(summary, 'src/'));
        expect(output).toContain('5 files skipped');
        expect(output).toContain('3 no exports');
        expect(output).toContain('1 syntax error');
        expect(output).toContain('1 not React component');
    });

    it('renders review guidance line when reviewCount > 0', () => {
        const summary = makeSummary({ reviewCount: 2 });
        const output = stripAnsi(formatBatchSummaryText(summary, 'src/'));
        expect(output).toContain('Next:');
        expect(output).toContain('@enterstellar-review');
    });

    it('omits review guidance when reviewCount = 0', () => {
        const summary = makeSummary({ reviewCount: 0 });
        const output = stripAnsi(formatBatchSummaryText(summary, 'src/'));
        expect(output).not.toContain('Next:');
    });

    it('renders output path hint when any contracts generated', () => {
        const summary = makeSummary({ cleanCount: 5 });
        const output = stripAnsi(formatBatchSummaryText(summary, 'src/components/'));
        expect(output).toContain('Output:');
        expect(output).toContain('.contract.ts');
    });
});

// ---------------------------------------------------------------------------
// formatResultText
// ---------------------------------------------------------------------------

describe('formatResultText', () => {
    it('formats a clean result with ✓ symbol', () => {
        const output = stripAnsi(formatResultText(makeResult({ outcome: 'clean' })));
        expect(output).toContain('✓');
        expect(output).toContain('src/Button.tsx');
        expect(output).toContain('(clean)');
    });

    it('formats a warn result with ⚠ symbol and warning count', () => {
        const result = makeResult({
            outcome: 'warn',
            warnAnnotations: ['@enterstellar-warn heuristic', '@enterstellar-warn category'],
        });
        const output = stripAnsi(formatResultText(result));
        expect(output).toContain('⚠');
        expect(output).toContain('2 warnings');
    });

    it('formats a review result with ~ symbol and review count', () => {
        const result = makeResult({
            outcome: 'review',
            reviewAnnotations: ['@enterstellar-review missing aria-label'],
        });
        const output = stripAnsi(formatResultText(result));
        expect(output).toContain('~');
        expect(output).toContain('1 review items');
    });

    it('formats a skip result with ✗ symbol and reason', () => {
        const result = makeResult({
            outcome: 'skip',
            skipReason: 'no component export found',
        });
        const output = stripAnsi(formatResultText(result));
        expect(output).toContain('✗');
        expect(output).toContain('no component export found');
    });

    it('uses fallback text when skip result has no skipReason', () => {
        const result = makeResult({ outcome: 'skip' });
        const output = stripAnsi(formatResultText(result));
        expect(output).toContain('skipped');
    });
});
