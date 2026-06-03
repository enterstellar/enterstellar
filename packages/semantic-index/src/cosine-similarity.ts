/**
 * @module @enterstellar-ai/semantic-index/cosine-similarity
 * @description Pure math function computing cosine similarity between two
 * dense embedding vectors.
 *
 * Cosine similarity measures the angular distance between two vectors,
 * producing a score in [-1.0, 1.0]:
 * - `1.0` = identical direction (maximum similarity)
 * - `0.0` = orthogonal (no similarity)
 * - `-1.0` = opposite direction (maximum dissimilarity)
 *
 * For normalized embedding vectors (as produced by most embedding models),
 * output is always in [0.0, 1.0].
 *
 * **Performance:** Single-pass computation — dot product and both magnitudes
 * are computed in one loop for cache-line efficiency. Target: sub-microsecond
 * per pair for 384-dimensional vectors.
 *
 * **L15 compliance:** Zero framework imports. Pure mathematics.
 *
 * @see Design Choice SI4 — brute-force cosine similarity for ≤500 components.
 * @see Design Choice SI10 — <10ms for 500 components.
 */

import { dimensionMismatchError } from './errors.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the cosine similarity between two dense vectors.
 *
 * ```
 * similarity(a, b) = (a · b) / (‖a‖ × ‖b‖)
 * ```
 *
 * @param a - First embedding vector.
 * @param b - Second embedding vector. Must have the same length as `a`.
 * @returns Cosine similarity score in [-1.0, 1.0]. Returns `0.0` if either
 *          vector has zero magnitude (no meaningful direction).
 *
 * @throws {EnterstellarError} Code `ENS-5024` if vectors have different dimensions.
 *
 * @example
 * ```ts
 * const a = new Float64Array([1, 0, 0]);
 * const b = new Float64Array([0, 1, 0]);
 * cosineSimilarity(a, b); // 0.0 (orthogonal)
 *
 * const c = new Float64Array([1, 0, 0]);
 * cosineSimilarity(a, c); // 1.0 (identical)
 * ```
 */
export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
    // ------------------------------------------------------------------
    // Dimension guard — vectors must be the same length
    // ------------------------------------------------------------------
    if (a.length !== b.length) {
        throw dimensionMismatchError(a.length, b.length);
    }

    // ------------------------------------------------------------------
    // Single-pass computation: dot product + squared magnitudes
    // ------------------------------------------------------------------
    // Computing all three values in one loop maximizes cache locality.
    // For 384-dim vectors this completes in < 1µs on modern hardware.
    // ------------------------------------------------------------------
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
        // Float64Array is a fixed-length typed array — indices within
        // `0 <= i < a.length` are always defined. We use `as number`
        // to satisfy noUncheckedIndexedAccess without the `!` operator.
        const ai = a[i] as number;
        const bi = b[i] as number;

        dotProduct += ai * bi;
        magnitudeA += ai * ai;
        magnitudeB += bi * bi;
    }

    // ------------------------------------------------------------------
    // Zero-magnitude guard — a zero vector has no direction
    // ------------------------------------------------------------------
    // If either vector has zero magnitude (all zeros), cosine similarity
    // is undefined (division by zero). We return 0.0 — a zero vector
    // has no meaningful similarity to anything.
    // ------------------------------------------------------------------
    const magnitudeProduct = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

    if (magnitudeProduct === 0) {
        return 0;
    }

    return dotProduct / magnitudeProduct;
}
