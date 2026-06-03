/**
 * @module @enterstellar-ai/test/regression
 * @description Regression detection for Enterstellar GenUI test suites.
 *
 * Compares two sets of test results (baseline vs. current) and identifies
 * intents that resolved to a **different component** between runs. This
 * detects regressions caused by:
 *
 * - LLM model upgrades (e.g., GPT-4o → GPT-4.5)
 * - Registry changes (components added, removed, or renamed)
 * - Semantic index re-embedding
 * - Prompt template modifications
 *
 * Only intents present in **both** baseline and current are compared.
 * New intents (current only) and removed intents (baseline only) are
 * not considered regressions.
 *
 * @see Design Choice TE7 — regression detection for LLM upgrades.
 */

import type { RegressionEntry, TestResultRecord } from './types.js';

// ---------------------------------------------------------------------------
// detectRegressions
// ---------------------------------------------------------------------------

/**
 * Detects regressions between a baseline and current test run.
 *
 * An intent is a regression if it exists in both runs but resolved to
 * a **different component**. Intents appearing only in the baseline
 * or only in the current run are ignored.
 *
 * @param baseline - Test results from a known-good run (e.g., saved VCR fixtures).
 * @param current - Test results from the current run.
 * @returns Array of `RegressionEntry` for each detected regression.
 *
 * @example
 * ```ts
 * import { detectRegressions } from '@enterstellar-ai/test';
 *
 * const regressions = detectRegressions(baselineResults, currentResults);
 * if (regressions.length > 0) {
 *   console.error(`${regressions.length} regressions detected!`);
 *   for (const r of regressions) {
 *     console.error(`  "${r.intent}": ${r.baselineComponent} → ${r.currentComponent}`);
 *   }
 * }
 * ```
 */
export function detectRegressions(
    baseline: readonly TestResultRecord[],
    current: readonly TestResultRecord[],
): readonly RegressionEntry[] {
    // Build a lookup map from baseline: intent → resolvedComponent.
    // If duplicate intents exist in the baseline, the last one wins.
    const baselineMap = new Map<string, string>();

    for (const record of baseline) {
        baselineMap.set(record.intent, record.resolvedComponent);
    }

    // Compare each current result against the baseline.
    const regressions: RegressionEntry[] = [];

    for (const record of current) {
        const baselineComponent = baselineMap.get(record.intent);

        // Skip intents not present in the baseline (new tests, not regressions).
        if (baselineComponent === undefined) {
            continue;
        }

        // Detect regression: same intent, different resolved component.
        if (baselineComponent !== record.resolvedComponent) {
            regressions.push({
                intent: record.intent,
                baselineComponent,
                currentComponent: record.resolvedComponent,
            });
        }
    }

    return regressions;
}
