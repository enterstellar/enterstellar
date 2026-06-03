/**
 * @module @enterstellar-ai/devtools/__tests__/percentiles
 * @description Tests for the percentile computation utility functions.
 *
 * Covers:
 * - `percentile()` — nearest-rank percentile on sorted arrays
 * - `computeLatencyStats()` — aggregated P50/P95/P99/mean/min/max
 *
 * Edge cases tested:
 * - Empty arrays → `null` / `0`
 * - Single-value arrays → all percentiles equal that value
 * - Two-value arrays → correct boundary behavior
 * - Large sorted arrays → accurate P50/P95/P99
 * - Unsorted input → internal sort produces correct results
 * - Uniform distributions → all percentiles equal the single value
 * - Known datasets → deterministic verification
 *
 * @internal
 */

import { describe, it, expect } from 'vitest';

import { percentile, computeLatencyStats } from '../src/utils/percentiles.js';

// ---------------------------------------------------------------------------
// percentile()
// ---------------------------------------------------------------------------

describe('percentile()', () => {
    it('returns 0 for an empty array', () => {
        expect(percentile([], 50)).toBe(0);
    });

    it('returns the single value for a 1-element array at any percentile', () => {
        expect(percentile([42], 0)).toBe(42);
        expect(percentile([42], 50)).toBe(42);
        expect(percentile([42], 95)).toBe(42);
        expect(percentile([42], 99)).toBe(42);
        expect(percentile([42], 100)).toBe(42);
    });

    it('computes P50 (median) for an odd-length sorted array', () => {
        // [10, 20, 30, 40, 50] → P50 = 30 (index 2)
        expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    });

    it('computes P50 for an even-length sorted array', () => {
        // [10, 20, 30, 40] → ceil(0.5 * 4) - 1 = 1 → value 20
        expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    });

    it('computes P95 correctly', () => {
        // 10 elements, P95 → ceil(0.95 * 10) - 1 = 9 → last element
        const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        expect(percentile(sorted, 95)).toBe(100);
    });

    it('computes P99 correctly for a 100-element array', () => {
        // 1..100, P99 → ceil(0.99 * 100) - 1 = 98 → value 99
        const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
        expect(percentile(sorted, 99)).toBe(99);
    });

    it('clamps percentile to 0 for negative input', () => {
        expect(percentile([10, 20, 30], -5)).toBe(10);
    });

    it('clamps percentile to 100 for values above 100', () => {
        expect(percentile([10, 20, 30], 150)).toBe(30);
    });

    it('handles P0 (minimum) correctly', () => {
        expect(percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    });

    it('handles P100 (maximum) correctly', () => {
        expect(percentile([10, 20, 30, 40, 50], 100)).toBe(50);
    });

    it('handles a two-element array', () => {
        expect(percentile([5, 95], 50)).toBe(5);
        expect(percentile([5, 95], 51)).toBe(95);
        expect(percentile([5, 95], 99)).toBe(95);
    });

    it('handles uniform values (all identical)', () => {
        expect(percentile([50, 50, 50, 50, 50], 50)).toBe(50);
        expect(percentile([50, 50, 50, 50, 50], 99)).toBe(50);
    });
});

// ---------------------------------------------------------------------------
// computeLatencyStats()
// ---------------------------------------------------------------------------

describe('computeLatencyStats()', () => {
    it('returns null for an empty array', () => {
        expect(computeLatencyStats([])).toBeNull();
    });

    it('returns correct stats for a single value', () => {
        const stats = computeLatencyStats([42]);

        expect(stats).not.toBeNull();
        expect(stats?.p50).toBe(42);
        expect(stats?.p95).toBe(42);
        expect(stats?.p99).toBe(42);
        expect(stats?.mean).toBe(42);
        expect(stats?.min).toBe(42);
        expect(stats?.max).toBe(42);
        expect(stats?.count).toBe(1);
    });

    it('computes correct percentiles for a known dataset', () => {
        // [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        const values = [50, 10, 90, 30, 70, 20, 80, 40, 100, 60];
        const stats = computeLatencyStats(values);

        expect(stats).not.toBeNull();
        // After sort: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        expect(stats?.p50).toBe(50);       // ceil(0.5 * 10) - 1 = 4 → 50
        expect(stats?.p95).toBe(100);      // ceil(0.95 * 10) - 1 = 9 → 100
        expect(stats?.p99).toBe(100);      // ceil(0.99 * 10) - 1 = 9 → 100
        expect(stats?.min).toBe(10);
        expect(stats?.max).toBe(100);
        expect(stats?.mean).toBe(55);      // sum=550, count=10
        expect(stats?.count).toBe(10);
    });

    it('does not mutate the original array', () => {
        const original = [50, 10, 30, 20, 40];
        const copy = [...original];
        computeLatencyStats(original);

        expect(original).toEqual(copy);
    });

    it('handles unsorted input correctly', () => {
        const stats = computeLatencyStats([100, 1, 50, 25, 75]);

        expect(stats).not.toBeNull();
        expect(stats?.min).toBe(1);
        expect(stats?.max).toBe(100);
    });

    it('handles uniform distribution (all identical values)', () => {
        const stats = computeLatencyStats([42, 42, 42, 42, 42]);

        expect(stats).not.toBeNull();
        expect(stats?.p50).toBe(42);
        expect(stats?.p95).toBe(42);
        expect(stats?.p99).toBe(42);
        expect(stats?.mean).toBe(42);
        expect(stats?.min).toBe(42);
        expect(stats?.max).toBe(42);
    });

    it('rounds mean to 2 decimal places', () => {
        // [1, 2, 3] → mean = 2.0 (exact)
        const exact = computeLatencyStats([1, 2, 3]);
        expect(exact?.mean).toBe(2);

        // [1, 3] → mean = 2.0 (exact)
        const halves = computeLatencyStats([1, 3]);
        expect(halves?.mean).toBe(2);

        // [1, 2, 4] → mean = 7/3 ≈ 2.33
        const thirds = computeLatencyStats([1, 2, 4]);
        expect(thirds?.mean).toBe(2.33);
    });

    it('handles two values correctly', () => {
        const stats = computeLatencyStats([5, 95]);

        expect(stats).not.toBeNull();
        expect(stats?.min).toBe(5);
        expect(stats?.max).toBe(95);
        expect(stats?.mean).toBe(50);
        expect(stats?.count).toBe(2);
    });

    it('handles a large dataset without error', () => {
        // 500 traces (DT5 buffer size)
        const values = Array.from({ length: 500 }, (_, i) => i + 1);
        const stats = computeLatencyStats(values);

        expect(stats).not.toBeNull();
        expect(stats?.count).toBe(500);
        expect(stats?.min).toBe(1);
        expect(stats?.max).toBe(500);
        // P50 of 1..500 → ceil(0.5 * 500) - 1 = 249 → value 250
        expect(stats?.p50).toBe(250);
    });
});
