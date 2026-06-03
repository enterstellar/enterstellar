/**
 * @module @enterstellar-ai/semantic-index/__tests__/query-cache
 * @description Tests for `createQueryCache()` — the LRU cache for
 * semantic search results.
 *
 * Validates cache hit/miss behavior, LRU eviction at capacity, access
 * promotion, bulk invalidation, and zero-size mode.
 *
 * @see Design Choice SI9 — LRU cache, max 100, exact match, invalidated on registry update.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { ComponentContract, ComponentCategory, SemanticSearchResult } from '@enterstellar-ai/types';
import { createComponentId } from '@enterstellar-ai/types';

import { createQueryCache } from '../src/query-cache.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `SemanticSearchResult` for cache testing.
 * The exact contract contents aren't relevant — cache behavior is key-based.
 */
function createMockResult(name: string, similarity: number): SemanticSearchResult {
    const contract: ComponentContract = {
        id: createComponentId(name),
        name,
        description: `Test component ${name}`,
        category: 'utility' as ComponentCategory,
        tags: ['test'],
        props: z.object({}),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [],
        _meta: { forged: false, version: '1.0.0', createdAt: new Date().toISOString() },
    };

    return { componentName: name, similarity, contract };
}

/**
 * Creates an array of mock results for bulk cache operations.
 */
function createMockResults(count: number): readonly SemanticSearchResult[] {
    return Array.from({ length: count }, (_, i) =>
        createMockResult(`Component${String(i)}`, 0.9 - i * 0.1),
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createQueryCache()', () => {
    // --- Initialization ---

    it('starts with size 0', () => {
        const cache = createQueryCache();
        expect(cache.size).toBe(0);
    });

    // --- Cache Miss ---

    it('returns undefined for a cache miss', () => {
        const cache = createQueryCache();
        expect(cache.get('unknown query')).toBeUndefined();
    });

    // --- Cache Hit ---

    it('returns cached results for an exact intent string match', () => {
        const cache = createQueryCache();
        const results = createMockResults(3);

        cache.set('show vitals', results);
        const cached = cache.get('show vitals');

        expect(cached).toEqual(results);
    });

    it('does NOT match similar but non-identical intent strings', () => {
        const cache = createQueryCache();
        const results = createMockResults(2);

        cache.set('show patient vitals', results);

        expect(cache.get('show vitals')).toBeUndefined();
        expect(cache.get('Show patient vitals')).toBeUndefined();
        expect(cache.get('show patient vitals ')).toBeUndefined();
    });

    // --- Size Tracking ---

    it('tracks size accurately through set operations', () => {
        const cache = createQueryCache();

        cache.set('query1', createMockResults(1));
        expect(cache.size).toBe(1);

        cache.set('query2', createMockResults(1));
        expect(cache.size).toBe(2);

        cache.set('query3', createMockResults(1));
        expect(cache.size).toBe(3);
    });

    // --- LRU Eviction ---

    it('evicts the least recently used entry when at max capacity', () => {
        const cache = createQueryCache(3); // Max 3 entries

        cache.set('oldest', createMockResults(1));
        cache.set('middle', createMockResults(1));
        cache.set('newest', createMockResults(1));

        expect(cache.size).toBe(3);

        // Adding a 4th entry should evict 'oldest'
        cache.set('extra', createMockResults(1));

        expect(cache.size).toBe(3);
        expect(cache.get('oldest')).toBeUndefined(); // Evicted
        expect(cache.get('middle')).toBeDefined();
        expect(cache.get('newest')).toBeDefined();
        expect(cache.get('extra')).toBeDefined();
    });

    it('evicts exactly one entry per insertion at capacity', () => {
        const cache = createQueryCache(2);

        cache.set('a', createMockResults(1));
        cache.set('b', createMockResults(1));
        cache.set('c', createMockResults(1)); // Evicts 'a'
        cache.set('d', createMockResults(1)); // Evicts 'b'

        expect(cache.size).toBe(2);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBeDefined();
        expect(cache.get('d')).toBeDefined();
    });

    // --- Access Promotion (LRU) ---

    it('promotes accessed entries to most recently used (protects from eviction)', () => {
        const cache = createQueryCache(3);

        cache.set('first', createMockResults(1));
        cache.set('second', createMockResults(1));
        cache.set('third', createMockResults(1));

        // Access 'first' — promotes it to MRU
        cache.get('first');

        // Adding a new entry should now evict 'second' (the actual LRU),
        // not 'first' (which was promoted by the get)
        cache.set('fourth', createMockResults(1));

        expect(cache.get('first')).toBeDefined();   // Promoted — still present
        expect(cache.get('second')).toBeUndefined(); // Evicted — was LRU
        expect(cache.get('third')).toBeDefined();
        expect(cache.get('fourth')).toBeDefined();
    });

    // --- Key Overwrite ---

    it('overwrites existing entries and moves them to MRU position', () => {
        const cache = createQueryCache(3);
        const originalResults = createMockResults(1);
        const updatedResults = createMockResults(2);

        cache.set('query', originalResults);
        cache.set('other1', createMockResults(1));
        cache.set('other2', createMockResults(1));

        // Overwrite 'query' with new results — moves to MRU
        cache.set('query', updatedResults);

        // Size should not increase (overwrite, not duplicate)
        expect(cache.size).toBe(3);

        // Should return the updated results
        expect(cache.get('query')).toEqual(updatedResults);

        // Adding another entry should evict 'other1' (LRU), not 'query' (MRU)
        cache.set('extra', createMockResults(1));
        expect(cache.get('query')).toBeDefined();
        expect(cache.get('other1')).toBeUndefined();
    });

    // --- Invalidation ---

    it('clears all entries on invalidate()', () => {
        const cache = createQueryCache();

        cache.set('a', createMockResults(1));
        cache.set('b', createMockResults(2));
        cache.set('c', createMockResults(3));

        expect(cache.size).toBe(3);

        cache.invalidate();

        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBeUndefined();
    });

    it('allows new entries after invalidation', () => {
        const cache = createQueryCache();
        const results = createMockResults(2);

        cache.set('before', createMockResults(1));
        cache.invalidate();
        cache.set('after', results);

        expect(cache.size).toBe(1);
        expect(cache.get('after')).toEqual(results);
    });

    // --- Zero-Size Cache ---

    it('always misses when maxSize is 0 (caching disabled)', () => {
        const cache = createQueryCache(0);
        const results = createMockResults(1);

        cache.set('query', results);

        expect(cache.size).toBe(0);
        expect(cache.get('query')).toBeUndefined();
    });

    // --- Default Max Size ---

    it('defaults to max 100 entries', () => {
        const cache = createQueryCache(); // Default: 100

        for (let i = 0; i < 101; i++) {
            cache.set(`query-${String(i)}`, createMockResults(1));
        }

        // Should have evicted the first entry
        expect(cache.size).toBe(100);
        expect(cache.get('query-0')).toBeUndefined(); // Evicted
        expect(cache.get('query-100')).toBeDefined(); // Most recent
    });
});
