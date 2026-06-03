/**
 * @module @enterstellar-ai/semantic-index/__tests__/memory-vector-store
 * @description Tests for `createMemoryVectorStore()` — the in-memory
 * brute-force vector store implementing the `VectorStore` interface.
 *
 * Validates add/remove/search/clear operations, topK sorting, duplicate
 * ID handling, and empty store behavior.
 *
 * @see Design Choice SI4 — brute-force cosine for ≤500 components.
 */

import { describe, it, expect } from 'vitest';

import { createMemoryVectorStore } from '../src/memory-vector-store.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMemoryVectorStore()', () => {
    // --- Initialization ---

    it('starts with size 0 and empty search results', () => {
        const store = createMemoryVectorStore();

        expect(store.size).toBe(0);
        expect(store.search(new Float64Array([1, 0, 0]), 5)).toEqual([]);
    });

    // --- add() ---

    describe('add()', () => {
        it('adds a vector and increments size', () => {
            const store = createMemoryVectorStore();
            store.add('ComponentA', new Float64Array([1, 0, 0]));

            expect(store.size).toBe(1);
        });

        it('adds multiple vectors', () => {
            const store = createMemoryVectorStore();
            store.add('ComponentA', new Float64Array([1, 0, 0]));
            store.add('ComponentB', new Float64Array([0, 1, 0]));
            store.add('ComponentC', new Float64Array([0, 0, 1]));

            expect(store.size).toBe(3);
        });

        it('overwrites existing vector on duplicate ID (incremental re-embedding)', () => {
            const store = createMemoryVectorStore();
            store.add('ComponentA', new Float64Array([1, 0, 0]));
            store.add('ComponentA', new Float64Array([0, 1, 0]));

            // Size stays 1 — overwrite, not duplicate
            expect(store.size).toBe(1);

            // Search with query aligned to the NEW vector should rank it high
            const hits = store.search(new Float64Array([0, 1, 0]), 1);
            expect(hits).toHaveLength(1);
            expect(hits[0]?.id).toBe('ComponentA');
            expect(hits[0]?.score).toBeCloseTo(1.0, 5);
        });
    });

    // --- remove() ---

    describe('remove()', () => {
        it('returns true and decrements size when removing an existing vector', () => {
            const store = createMemoryVectorStore();
            store.add('ComponentA', new Float64Array([1, 0, 0]));

            expect(store.remove('ComponentA')).toBe(true);
            expect(store.size).toBe(0);
        });

        it('returns false when removing a non-existent ID', () => {
            const store = createMemoryVectorStore();

            expect(store.remove('NonExistent')).toBe(false);
        });

        it('removes the vector from search results', () => {
            const store = createMemoryVectorStore();
            store.add('ComponentA', new Float64Array([1, 0, 0]));
            store.add('ComponentB', new Float64Array([0, 1, 0]));

            store.remove('ComponentA');

            const hits = store.search(new Float64Array([1, 0, 0]), 5);
            expect(hits).toHaveLength(1);
            expect(hits[0]?.id).toBe('ComponentB');
        });
    });

    // --- search() ---

    describe('search()', () => {
        it('returns results sorted by descending similarity score', () => {
            const store = createMemoryVectorStore();

            // Query: [1, 0, 0]
            // A = [1, 0, 0] → cos = 1.0 (identical)
            // B = [0.7, 0.7, 0] → cos ≈ 0.707
            // C = [0, 1, 0] → cos = 0.0 (orthogonal)
            store.add('ComponentA', new Float64Array([1, 0, 0]));
            store.add('ComponentB', new Float64Array([0.7, 0.7, 0]));
            store.add('ComponentC', new Float64Array([0, 1, 0]));

            const hits = store.search(new Float64Array([1, 0, 0]), 3);

            expect(hits).toHaveLength(3);
            expect(hits[0]?.id).toBe('ComponentA');
            expect(hits[0]?.score).toBeCloseTo(1.0, 5);
            expect(hits[1]?.id).toBe('ComponentB');
            expect(hits[1]?.score).toBeGreaterThan(0.5);
            expect(hits[2]?.id).toBe('ComponentC');
            expect(hits[2]?.score).toBeCloseTo(0.0, 5);
        });

        it('returns at most topK results', () => {
            const store = createMemoryVectorStore();
            store.add('A', new Float64Array([1, 0, 0]));
            store.add('B', new Float64Array([0.9, 0.1, 0]));
            store.add('C', new Float64Array([0.8, 0.2, 0]));
            store.add('D', new Float64Array([0.7, 0.3, 0]));
            store.add('E', new Float64Array([0.6, 0.4, 0]));

            const hits = store.search(new Float64Array([1, 0, 0]), 3);

            expect(hits).toHaveLength(3);
        });

        it('returns all entries when topK > store size', () => {
            const store = createMemoryVectorStore();
            store.add('A', new Float64Array([1, 0, 0]));
            store.add('B', new Float64Array([0, 1, 0]));

            const hits = store.search(new Float64Array([1, 0, 0]), 10);

            expect(hits).toHaveLength(2);
        });

        it('returns empty array when searching an empty store', () => {
            const store = createMemoryVectorStore();

            const hits = store.search(new Float64Array([1, 0, 0]), 5);

            expect(hits).toEqual([]);
        });

        it('returns results with correct VectorSearchHit shape', () => {
            const store = createMemoryVectorStore();
            store.add('PatientVitals', new Float64Array([1, 0, 0]));

            const hits = store.search(new Float64Array([1, 0, 0]), 1);

            expect(hits).toHaveLength(1);
            expect(hits[0]).toEqual(
                expect.objectContaining({
                    id: 'PatientVitals',
                    score: expect.any(Number) as number,
                }),
            );
        });
    });

    // --- clear() ---

    describe('clear()', () => {
        it('removes all vectors and resets size to 0', () => {
            const store = createMemoryVectorStore();
            store.add('A', new Float64Array([1, 0, 0]));
            store.add('B', new Float64Array([0, 1, 0]));
            store.add('C', new Float64Array([0, 0, 1]));

            expect(store.size).toBe(3);

            store.clear();

            expect(store.size).toBe(0);
            expect(store.search(new Float64Array([1, 0, 0]), 5)).toEqual([]);
        });

        it('allows adding vectors after clear()', () => {
            const store = createMemoryVectorStore();
            store.add('A', new Float64Array([1, 0, 0]));
            store.clear();
            store.add('B', new Float64Array([0, 1, 0]));

            expect(store.size).toBe(1);
            const hits = store.search(new Float64Array([0, 1, 0]), 1);
            expect(hits[0]?.id).toBe('B');
        });
    });

    // --- size ---

    describe('size', () => {
        it('accurately tracks the number of stored vectors', () => {
            const store = createMemoryVectorStore();

            expect(store.size).toBe(0);
            store.add('A', new Float64Array([1]));
            expect(store.size).toBe(1);
            store.add('B', new Float64Array([2]));
            expect(store.size).toBe(2);
            store.remove('A');
            expect(store.size).toBe(1);
            store.clear();
            expect(store.size).toBe(0);
        });
    });
});
