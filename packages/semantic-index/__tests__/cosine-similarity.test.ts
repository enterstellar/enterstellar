/**
 * @module @enterstellar-ai/semantic-index/__tests__/cosine-similarity
 * @description Tests for `cosineSimilarity()` — the pure math function
 * computing cosine similarity between two dense embedding vectors.
 *
 * Validates mathematical correctness, edge cases (zero-magnitude,
 * dimension mismatch), and floating-point precision.
 *
 * @see Design Choice SI4 — brute-force cosine similarity.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { cosineSimilarity } from '../src/cosine-similarity.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Floating-point tolerance for cosine similarity comparisons.
 * IEEE 754 double-precision introduces rounding errors at ~1e-15.
 * We use a generous tolerance to avoid flaky tests.
 */
const EPSILON = 1e-10;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cosineSimilarity()', () => {
    // --- Fundamental Cases ---

    it('returns 1.0 for identical vectors', () => {
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([1, 2, 3]);

        expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
    });

    it('returns 1.0 for identical normalized vectors', () => {
        // Normalized unit vectors (magnitude = 1)
        const norm = Math.sqrt(3);
        const a = new Float64Array([1 / norm, 1 / norm, 1 / norm]);
        const b = new Float64Array([1 / norm, 1 / norm, 1 / norm]);

        expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
    });

    it('returns 0.0 for orthogonal vectors', () => {
        const a = new Float64Array([1, 0, 0]);
        const b = new Float64Array([0, 1, 0]);

        expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
    });

    it('returns -1.0 for opposite vectors', () => {
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([-1, -2, -3]);

        expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
    });

    // --- Similarity Score Range ---

    it('returns a value between 0 and 1 for similar (non-identical) normalized vectors', () => {
        // Two vectors pointing in similar directions
        const a = new Float64Array([1, 0.5, 0]);
        const b = new Float64Array([1, 0.3, 0]);

        const score = cosineSimilarity(a, b);
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(1);
    });

    it('produces higher scores for more similar vectors', () => {
        const query = new Float64Array([1, 0, 0]);
        const similar = new Float64Array([0.9, 0.1, 0]);
        const dissimilar = new Float64Array([0.1, 0.9, 0]);

        const scoreSimilar = cosineSimilarity(query, similar);
        const scoreDissimilar = cosineSimilarity(query, dissimilar);

        expect(scoreSimilar).toBeGreaterThan(scoreDissimilar);
    });

    // --- Zero-Magnitude (Edge Case) ---

    it('returns 0.0 when the first vector is all zeros', () => {
        const a = new Float64Array([0, 0, 0]);
        const b = new Float64Array([1, 2, 3]);

        expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('returns 0.0 when the second vector is all zeros', () => {
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([0, 0, 0]);

        expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('returns 0.0 when both vectors are all zeros', () => {
        const a = new Float64Array([0, 0, 0]);
        const b = new Float64Array([0, 0, 0]);

        expect(cosineSimilarity(a, b)).toBe(0);
    });

    // --- Dimension Mismatch (ENS-5024) ---

    it('throws ENS-5024 when vectors have different dimensions', () => {
        const a = new Float64Array([1, 2, 3]);
        const b = new Float64Array([1, 2]);

        expect(() => cosineSimilarity(a, b)).toThrow(EnterstellarError);
        try {
            cosineSimilarity(a, b);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.code).toBe('ENS-5024');
            expect(enterstellarErr.module).toBe('semantic-index');
            expect(enterstellarErr.recoverable).toBe(false);
        }
    });

    it('throws ENS-5024 with correct dimensions in message', () => {
        const a = new Float64Array(384);
        const b = new Float64Array(1536);

        expect(() => cosineSimilarity(a, b)).toThrow(/expected 384, got 1536/);
    });

    // --- Single Dimension ---

    it('handles single-dimension vectors', () => {
        const a = new Float64Array([3]);
        const b = new Float64Array([5]);

        // Same direction → 1.0
        expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
    });

    it('handles single-dimension opposite vectors', () => {
        const a = new Float64Array([3]);
        const b = new Float64Array([-5]);

        expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
    });

    // --- High-Dimensional (Realistic) ---

    it('handles 384-dimensional vectors (all-MiniLM-L6-v2 output size)', () => {
        // Create two random-ish vectors with known similarity
        const a = new Float64Array(384);
        const b = new Float64Array(384);

        for (let i = 0; i < 384; i++) {
            a[i] = Math.sin(i);
            b[i] = Math.sin(i + 0.1); // Slightly offset → high similarity
        }

        const score = cosineSimilarity(a, b);

        // Should be very close to 1.0 (small offset)
        expect(score).toBeGreaterThan(0.99);
        expect(score).toBeLessThanOrEqual(1.0);
    });

    // --- Empty Vectors ---

    it('handles zero-length vectors (returns 0.0)', () => {
        const a = new Float64Array(0);
        const b = new Float64Array(0);

        // No elements to compute → magnitude product is 0 → returns 0
        expect(cosineSimilarity(a, b)).toBe(0);
    });

    // --- Symmetry ---

    it('is symmetric: similarity(a, b) === similarity(b, a)', () => {
        const a = new Float64Array([1, 3, 5, 7]);
        const b = new Float64Array([2, 4, 6, 8]);

        const scoreAB = cosineSimilarity(a, b);
        const scoreBA = cosineSimilarity(b, a);

        expect(Math.abs(scoreAB - scoreBA)).toBeLessThan(EPSILON);
    });
});
