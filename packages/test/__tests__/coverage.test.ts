/**
 * @module @enterstellar-ai/test/__tests__/coverage
 * @description Unit tests for `computeIntentCoverage()`.
 *
 * Verifies:
 * - Full coverage (all components tested)
 * - Partial coverage (percentage calculation)
 * - Empty registry (total: 0, percentage: 0)
 * - Empty results (all components uncovered)
 * - Duplicate results for same component (counted once)
 * - Results for non-registered components (ignored)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createRegistry, defineComponent } from '@enterstellar-ai/registry';

import { computeIntentCoverage } from '../src/coverage.js';
import type { TestResultRecord } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createComponent(name: string) {
    return defineComponent({
        name,
        description: `A test component: ${name}.`,
        category: 'utility',
        tags: ['test'],
        props: z.object({ value: z.string().optional() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [],
    });
}

function result(intent: string, component: string): TestResultRecord {
    return {
        intent,
        resolvedComponent: component,
        compilationPassed: true,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeIntentCoverage()', () => {
    describe('full coverage', () => {
        it('returns 100% when all components have tests', () => {
            const registry = createRegistry({
                components: [createComponent('Alpha'), createComponent('Beta')],
            });

            const results: TestResultRecord[] = [
                result('show alpha', 'Alpha'),
                result('show beta', 'Beta'),
            ];

            const coverage = computeIntentCoverage(registry, results);

            expect(coverage.covered).toBe(2);
            expect(coverage.total).toBe(2);
            expect(coverage.percentage).toBe(100);
            expect(coverage.uncovered).toHaveLength(0);
        });
    });

    describe('partial coverage', () => {
        it('calculates correct percentage for partial coverage', () => {
            const registry = createRegistry({
                components: [
                    createComponent('Alpha'),
                    createComponent('Beta'),
                    createComponent('Gamma'),
                    createComponent('Delta'),
                ],
            });

            const results: TestResultRecord[] = [
                result('show alpha', 'Alpha'),
                result('show beta', 'Beta'),
            ];

            const coverage = computeIntentCoverage(registry, results);

            expect(coverage.covered).toBe(2);
            expect(coverage.total).toBe(4);
            expect(coverage.percentage).toBe(50);
            expect(coverage.uncovered).toContain('Delta');
            expect(coverage.uncovered).toContain('Gamma');
        });

        it('rounds percentage to 2 decimal places', () => {
            const registry = createRegistry({
                components: [
                    createComponent('Alpha'),
                    createComponent('Beta'),
                    createComponent('Gamma'),
                ],
            });

            const results: TestResultRecord[] = [
                result('show alpha', 'Alpha'),
            ];

            const coverage = computeIntentCoverage(registry, results);

            // 1/3 = 33.333...% → rounded to 33.33
            expect(coverage.percentage).toBe(33.33);
        });
    });

    describe('empty registry', () => {
        it('returns zero coverage for empty registry', () => {
            const registry = createRegistry({ components: [] });

            const coverage = computeIntentCoverage(registry, []);

            expect(coverage.covered).toBe(0);
            expect(coverage.total).toBe(0);
            expect(coverage.percentage).toBe(0);
            expect(coverage.uncovered).toHaveLength(0);
        });
    });

    describe('empty results', () => {
        it('returns zero coverage when no tests were run', () => {
            const registry = createRegistry({
                components: [createComponent('Alpha'), createComponent('Beta')],
            });

            const coverage = computeIntentCoverage(registry, []);

            expect(coverage.covered).toBe(0);
            expect(coverage.total).toBe(2);
            expect(coverage.percentage).toBe(0);
            expect(coverage.uncovered).toHaveLength(2);
        });
    });

    describe('deduplication', () => {
        it('counts each component once regardless of how many tests resolve to it', () => {
            const registry = createRegistry({
                components: [createComponent('Alpha'), createComponent('Beta')],
            });

            const results: TestResultRecord[] = [
                result('show alpha v1', 'Alpha'),
                result('show alpha v2', 'Alpha'),
                result('show alpha v3', 'Alpha'),
            ];

            const coverage = computeIntentCoverage(registry, results);

            expect(coverage.covered).toBe(1);
            expect(coverage.total).toBe(2);
            expect(coverage.percentage).toBe(50);
            expect(coverage.uncovered).toEqual(['Beta']);
        });
    });

    describe('non-registry results', () => {
        it('ignores test results for components not in the registry', () => {
            const registry = createRegistry({
                components: [createComponent('Alpha')],
            });

            const results: TestResultRecord[] = [
                result('show alpha', 'Alpha'),
                result('show phantom', 'PhantomComponent'), // not in registry
            ];

            const coverage = computeIntentCoverage(registry, results);

            expect(coverage.covered).toBe(1);
            expect(coverage.total).toBe(1);
            expect(coverage.percentage).toBe(100);
            expect(coverage.uncovered).toHaveLength(0);
        });
    });
});
