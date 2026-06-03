/**
 * @module @enterstellar-ai/test/coverage
 * @description Intent coverage analysis for Enterstellar GenUI test suites.
 *
 * Compares registered components against test results to determine which
 * components have at least one test resolving to them. This is the
 * "intent coverage" metric — analogous to code coverage, but for GenUI
 * component reachability.
 *
 * The coverage report helps identify components that are never tested:
 * if no test intent resolves to a component, that component's rendering
 * path is unverified and may break silently after registry or LLM changes.
 *
 * @see Design Choice TE5 — intent coverage reporting.
 */

import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

import type { IntentCoverageResult, TestResultRecord } from './types.js';

// ---------------------------------------------------------------------------
// computeIntentCoverage
// ---------------------------------------------------------------------------

/**
 * Computes intent coverage: which components have at least one test.
 *
 * Iterates the registry to get all registered component names, then
 * checks which of those names appear in the test results' `resolvedComponent`
 * field. Components resolved in tests but not in the registry are ignored —
 * only registry components contribute to the coverage metric.
 *
 * @param registry - The `EnterstellarRegistry` to measure coverage against.
 * @param results - Array of test result records from completed test runs.
 * @returns An `IntentCoverageResult` with covered/total/percentage/uncovered.
 *
 * @example
 * ```ts
 * import { computeIntentCoverage } from '@enterstellar-ai/test';
 *
 * const coverage = computeIntentCoverage(registry, testResults);
 * console.log(`Coverage: ${coverage.percentage}%`);
 * console.log(`Uncovered: ${coverage.uncovered.join(', ')}`);
 * ```
 */
export function computeIntentCoverage(
    registry: EnterstellarRegistry,
    results: readonly TestResultRecord[],
): IntentCoverageResult {
    // Get all registered component names.
    const allComponents = registry.list();
    const total = allComponents.length;

    // Handle empty registry edge case.
    if (total === 0) {
        return {
            covered: 0,
            total: 0,
            percentage: 0,
            uncovered: [],
        };
    }

    // Build a set of component names that appear in test results.
    // Using Set ensures each component is counted once regardless of
    // how many tests resolve to it.
    const testedComponents = new Set<string>();

    for (const result of results) {
        testedComponents.add(result.resolvedComponent);
    }

    // Partition registry components into covered and uncovered.
    const uncovered: string[] = [];

    for (const name of allComponents) {
        if (!testedComponents.has(name)) {
            uncovered.push(name);
        }
    }

    const covered = total - uncovered.length;

    // Calculate percentage, rounded to 2 decimal places.
    const percentage = Math.round((covered / total) * 100 * 100) / 100;

    return {
        covered,
        total,
        percentage,
        uncovered,
    };
}
