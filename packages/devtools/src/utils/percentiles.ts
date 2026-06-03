/**
 * @module @enterstellar-ai/devtools/utils/percentiles
 * @description Pure utility functions for computing percentile statistics.
 *
 * Used by the Performance Profiler panel to aggregate latency data
 * from the trace ring buffer into P50/P95/P99 statistics.
 *
 * All functions are pure — no side effects, no state, no DOM access.
 * Designed for correctness on edge cases: empty arrays, single values,
 * unsorted input, and uniform distributions.
 *
 * @see Bible §4.4 — Performance Profiler tab ("P50/P95/P99")
 * @see Design Choice DT5 — 500 traces in memory
 *
 * @internal
 */

import type { LatencyStats } from '../types.js';

// ---------------------------------------------------------------------------
// Percentile Computation
// ---------------------------------------------------------------------------

/**
 * Computes a single percentile value from a **sorted** numeric array
 * using the nearest-rank method.
 *
 * The nearest-rank method selects the value at the position
 * `ceil(p / 100 * n) - 1`, where `n` is the array length and
 * `p` is the desired percentile (0–100).
 *
 * @param sorted - Pre-sorted array of numbers in ascending order.
 *   The caller is responsible for ensuring the array is sorted.
 * @param p - Percentile to compute (0–100 inclusive).
 *   Values outside this range are clamped.
 * @returns The percentile value at the nearest rank.
 *
 * @example
 * ```ts
 * percentile([10, 20, 30, 40, 50], 50);  // → 30
 * percentile([10, 20, 30, 40, 50], 95);  // → 50
 * percentile([42], 99);                   // → 42
 * ```
 *
 * @internal
 */
export function percentile(sorted: readonly number[], p: number): number {
    const length = sorted.length;

    // Guard: empty array (should not happen — callers check first)
    if (length === 0) {
        return 0;
    }

    // Guard: single value — all percentiles equal this value
    if (length === 1) {
        return sorted[0] ?? 0;
    }

    // Clamp percentile to valid range
    const clamped = Math.max(0, Math.min(100, p));

    // Nearest-rank index (0-based)
    const rank = Math.ceil(clamped / 100 * length) - 1;
    const index = Math.max(0, Math.min(length - 1, rank));

    return sorted[index] ?? 0;
}

// ---------------------------------------------------------------------------
// Aggregated Statistics
// ---------------------------------------------------------------------------

/**
 * Computes aggregated latency statistics from a numeric array.
 *
 * Returns `null` if the input array is empty — the caller should
 * display an appropriate empty state (e.g., "Not enough data").
 *
 * Internally sorts the input (ascending) before computing percentiles.
 * The original array is not mutated.
 *
 * @param values - Array of numeric values (e.g., `totalMs` measurements).
 *   May be unsorted. Empty arrays return `null`.
 * @returns Aggregated statistics including P50/P95/P99/mean/min/max,
 *   or `null` if the input is empty.
 *
 * @example
 * ```ts
 * const stats = computeLatencyStats([120, 45, 80, 200, 90]);
 * // stats.p50 === 90
 * // stats.mean === 107
 * // stats.count === 5
 *
 * computeLatencyStats([]);  // → null
 * computeLatencyStats([42]); // → { p50: 42, p95: 42, p99: 42, mean: 42, ... }
 * ```
 *
 * @see {@link LatencyStats} — return type shape
 * @see Bible §4.4 — Performance Profiler tab
 *
 * @internal
 */
export function computeLatencyStats(values: readonly number[]): LatencyStats | null {
    // Empty dataset — no meaningful statistics
    if (values.length === 0) {
        return null;
    }

    // Sort ascending for percentile computation (copy to avoid mutation)
    const sorted = [...values].sort((a, b) => a - b);

    // Compute sum for mean calculation
    let sum = 0;
    for (const value of sorted) {
        sum += value;
    }

    // Min/max from sorted endpoints (guaranteed defined by length > 0 check)
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;

    return {
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        mean: Math.round((sum / values.length) * 100) / 100,
        min,
        max,
        count: values.length,
    };
}
