/**
 * @module @enterstellar-ai/semantic-index/memory-vector-store
 * @description In-memory brute-force vector store for cosine similarity search.
 *
 * Implements the `VectorStore` interface using an internal `Map<string, Float64Array>`
 * and brute-force cosine similarity scan. Designed for registries with ≤500
 * components where sub-10ms search latency is achievable without approximate
 * nearest neighbor indices.
 *
 * **Factory pattern:** `createMemoryVectorStore()` returns a plain object with
 * closures — no class instance, no prototype chain. Consistent with the R1
 * pattern used across all Enterstellar modules.
 *
 * **Performance targets:**
 * - ≤500 components, 384 dimensions: <5ms per search
 * - ≤500 components, 1536 dimensions: <10ms per search
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice SI4 — brute-force for ≤500, HNSW for 500+.
 * @see Design Choice SI10 — <10ms for 500 components.
 */

import { cosineSimilarity } from './cosine-similarity.js';
import type { VectorSearchHit, VectorStore } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory brute-force vector store.
 *
 * The store maps string IDs (component names) to dense embedding vectors
 * (`Float64Array`). Search performs a full scan computing cosine similarity
 * against every stored vector, returning the top-K highest-scoring hits
 * sorted by descending score.
 *
 * @returns A `VectorStore` instance backed by an in-memory `Map`.
 *
 * @example
 * ```ts
 * const store = createMemoryVectorStore();
 *
 * store.add('PatientVitals', new Float64Array([0.1, 0.9, 0.3]));
 * store.add('MedicationList', new Float64Array([0.8, 0.2, 0.1]));
 *
 * const hits = store.search(new Float64Array([0.1, 0.8, 0.4]), 2);
 * // [{ id: 'PatientVitals', score: 0.98 }, { id: 'MedicationList', score: 0.42 }]
 * ```
 *
 * @see Design Choice SI4 — auto-selected for registries ≤500 components.
 */
export function createMemoryVectorStore(): VectorStore {
    // Internal storage: component name → embedding vector.
    // Map provides O(1) add/remove and preserves insertion order for
    // deterministic iteration during search.
    const vectors = new Map<string, Float64Array>();

    return {
        /**
         * Stores a vector under the given ID. Overwrites if ID already exists.
         * Overwrite behavior supports incremental re-embedding on contract update (SI3).
         *
         * @param id - Unique identifier (component name).
         * @param vector - Dense embedding vector.
         */
        add(id: string, vector: Float64Array): void {
            vectors.set(id, vector);
        },

        /**
         * Removes a vector by ID.
         *
         * @param id - The identifier to remove.
         * @returns `true` if the vector was removed, `false` if not found.
         */
        remove(id: string): boolean {
            return vectors.delete(id);
        },

        /**
         * Searches for the top-K most similar vectors to the query.
         *
         * Performs a full brute-force scan: computes cosine similarity between
         * the query and every stored vector, collects all hits, sorts by
         * descending score, and returns the top-K.
         *
         * For an empty store, returns an empty array (not an error).
         * If `topK` exceeds the store size, returns all entries.
         *
         * @param query - The query embedding vector.
         * @param topK - Maximum number of results to return.
         * @returns Array of hits sorted by descending similarity score.
         */
        search(query: Float64Array, topK: number): readonly VectorSearchHit[] {
            // Early return for empty store — no vectors to compare against
            if (vectors.size === 0) {
                return [];
            }

            // Compute cosine similarity against every stored vector.
            // Pre-allocate array at known size for memory efficiency.
            const hits: VectorSearchHit[] = [];

            for (const [id, vector] of vectors) {
                const score = cosineSimilarity(query, vector);
                hits.push({ id, score });
            }

            // Sort by descending similarity score.
            // Using a simple sort is optimal for ≤500 items — the overhead of
            // a heap-based top-K selection is not justified at this scale.
            hits.sort((a, b) => b.score - a.score);

            // Return at most topK results. If topK > hits.length, returns all.
            return hits.slice(0, topK);
        },

        /** Removes all stored vectors. */
        clear(): void {
            vectors.clear();
        },

        /** The current number of stored vectors. */
        get size(): number {
            return vectors.size;
        },
    };
}
