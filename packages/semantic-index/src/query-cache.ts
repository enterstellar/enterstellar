/**
 * @module @enterstellar-ai/semantic-index/query-cache
 * @description LRU (Least Recently Used) cache for semantic search results.
 *
 * Caches results of identical intent-string queries to avoid redundant
 * embedding computations and vector searches. Keyed by exact intent string
 * match — no fuzzy matching (fuzzy caching is unreliable per SI9).
 *
 * **Implementation:** Built on ES2015+ `Map` iteration order semantics.
 * `Map` preserves insertion order; on access, entries are moved to the
 * "most recently used" position via delete-then-set. Eviction removes
 * the first entry (oldest) when capacity is reached.
 *
 * **Factory pattern:** `createQueryCache()` returns a plain object with
 * closures — no class instance. Consistent with the R1 pattern.
 *
 * **L15 compliance:** Zero framework imports. Zero external dependencies.
 *
 * @see Design Choice SI9 — LRU cache for identical queries, max 100, invalidate on registry update.
 */

import type { SemanticSearchResult } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// QueryCache Interface
// ---------------------------------------------------------------------------

/**
 * LRU cache for semantic search results.
 *
 * Caches `SemanticSearchResult[]` arrays keyed by exact intent string.
 * Invalidated in bulk when the registry changes (SI9).
 */
export interface QueryCache {
    /**
     * Retrieves cached search results for an exact intent string.
     *
     * On cache hit, the entry is promoted to "most recently used" position
     * to prevent eviction of frequently accessed intents.
     *
     * @param intent - The exact intent string to look up.
     * @returns Cached results array, or `undefined` on cache miss.
     */
    get(intent: string): readonly SemanticSearchResult[] | undefined;

    /**
     * Stores search results for an intent string.
     *
     * If the cache is at capacity (`maxSize`), the least recently used
     * entry is evicted before insertion.
     *
     * @param intent - The exact intent string key.
     * @param results - The search results to cache.
     */
    set(intent: string, results: readonly SemanticSearchResult[]): void;

    /**
     * Clears the entire cache.
     *
     * Called when the registry emits `register`, `unregister`, or `update`
     * events — any registry change may alter search results for cached intents.
     *
     * @see Design Choice SI9 — invalidated on registry update.
     */
    invalidate(): void;

    /** The current number of cached entries. */
    readonly size: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an LRU cache for semantic search query results.
 *
 * @param maxSize - Maximum number of cached entries before LRU eviction.
 *                  Default: `100` per Design Choice SI9.
 * @returns A `QueryCache` instance.
 *
 * @example
 * ```ts
 * const cache = createQueryCache(100);
 *
 * cache.set('show vitals', results);
 * cache.get('show vitals');   // results (cache hit, promoted to MRU)
 * cache.get('unknown query'); // undefined (cache miss)
 *
 * cache.invalidate();         // clears all entries
 * ```
 *
 * @see Design Choice SI9 — max 100 entries, exact match, invalidate on registry update.
 */
export function createQueryCache(maxSize: number = 100): QueryCache {
    // Internal LRU storage. Map insertion order = access order after
    // delete-then-set promotion. First entry = least recently used.
    const cache = new Map<string, readonly SemanticSearchResult[]>();

    return {
        get(intent: string): readonly SemanticSearchResult[] | undefined {
            const entry = cache.get(intent);

            if (entry === undefined) {
                return undefined;
            }

            // Promote to most recently used: delete and re-insert at the end
            // of the Map's iteration order. This ensures LRU eviction targets
            // entries that haven't been accessed recently.
            cache.delete(intent);
            cache.set(intent, entry);

            return entry;
        },

        set(intent: string, results: readonly SemanticSearchResult[]): void {
            // If maxSize is 0, caching is effectively disabled — no-op
            if (maxSize <= 0) {
                return;
            }

            // If updating an existing entry, delete first so re-insertion
            // moves it to the most recently used position.
            if (cache.has(intent)) {
                cache.delete(intent);
            }

            // Evict least recently used (first entry) if at capacity.
            // Map.keys().next() returns the oldest key due to insertion order.
            if (cache.size >= maxSize) {
                const oldestKey = cache.keys().next();
                if (!oldestKey.done) {
                    cache.delete(oldestKey.value);
                }
            }

            cache.set(intent, results);
        },

        invalidate(): void {
            cache.clear();
        },

        get size(): number {
            return cache.size;
        },
    };
}
