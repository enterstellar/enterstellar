/**
 * @module @enterstellar-ai/cache/types
 * @description Cache-local type definitions.
 *
 * This file declares the `RenderCache` interface (the public API surface),
 * `RenderCacheConfig` (factory configuration), `CachedRender` (cached entry
 * shape), `CacheStats` (observability), and warmup-related types.
 *
 * **Naming:** Interface for the object with methods (`RenderCache`), types for
 * data shapes (`CachedRender`, `CacheStats`, etc.) — per Design Choice T1.
 *
 * **L15 compliance:** Zero framework imports. This module is platform-agnostic.
 *
 * @see Implementation Bible §4.6
 * @see Design Choices CA1–CA7
 */

import type { CompilationResult, ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for `createRenderCache()`.
 *
 * @see Implementation Bible §4.6
 * @see Design Choice CA2 — cache `CompilationResult` only.
 */
export type RenderCacheConfig = {
    /**
     * Cache eviction strategy.
     * Currently only LRU is supported — future strategies may include LFU.
     */
    readonly strategy: 'lru';

    /**
     * Maximum number of entries in the cache.
     * When exceeded, the least-recently-used entry is evicted.
     *
     * @default 1000
     * @see Design Choice CA3 — global cache, no zone partitioning.
     */
    readonly maxEntries: number;

    /**
     * Time-to-live for cached entries, in seconds.
     * Entries older than TTL are lazily evicted on next `get()`.
     *
     * @default 3600
     * @see Design Choice CA4 — TTL expiry is one of four invalidation triggers.
     */
    readonly ttl: number;

    /**
     * Optional callback invoked whenever an entry is invalidated or evicted.
     * Useful for DevTools Cache Dashboard integration.
     *
     * @param key - The cache key that was invalidated.
     * @param reason - The reason for invalidation.
     */
    readonly onEvict?: (key: string, reason: EvictionReason) => void;
};

/**
 * Reason an entry was evicted from the cache.
 *
 * - `'expired'` — TTL exceeded (lazy eviction on `get()`).
 * - `'capacity'` — LRU eviction due to `maxEntries` limit.
 * - `'manual'` — Explicitly invalidated via `invalidate()` or `invalidateAll()`.
 * - `'component-update'` — Registry component update/unregister (CA5).
 */
export type EvictionReason =
    | 'expired'
    | 'capacity'
    | 'manual'
    | 'component-update';

// ---------------------------------------------------------------------------
// Cached Entry
// ---------------------------------------------------------------------------

/**
 * A cached render entry — the value stored in the cache.
 *
 * Contains the compiled intent and its compilation result (per CA2 — only
 * `CompilationResult` is cached, NOT rendered React trees).
 *
 * @see Design Choice CA2 — `CompilationResult` only, not rendered React tree.
 */
export type CachedRender = {
    /** The original compiled intent that produced this result. */
    readonly compiledIntent: ComponentIntent;

    /** The compilation result from the compiler pipeline. */
    readonly compilationResult: CompilationResult;

    /** Timestamp (ms since epoch) when this entry was cached. */
    readonly cachedAt: number;

    /** Timestamp (ms since epoch) when this entry expires. */
    readonly expiresAt: number;
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Cache performance statistics.
 *
 * Exposed via `renderCache.getStats()` for DevTools Cache Dashboard.
 * Stats are cumulative since last `invalidateAll()` call.
 */
export type CacheStats = {
    /** Total number of cache hits since last reset. */
    readonly hits: number;

    /** Total number of cache misses since last reset. */
    readonly misses: number;

    /** Current number of entries in the cache. */
    readonly entries: number;

    /**
     * Cache hit rate as a ratio (0.0–1.0).
     * Calculated as `hits / (hits + misses)`. Returns `0` if no lookups yet.
     */
    readonly hitRate: number;
};

// ---------------------------------------------------------------------------
// Warmup
// ---------------------------------------------------------------------------

/**
 * A warmup entry describing a zone + intent pair to pre-compile and cache.
 *
 * @see Design Choice CA6 — warmup from static config + historical traces.
 * @see Design Choice CA7 — async warmup, never blocking.
 */
export type WarmupEntry = {
    /** Zone name for the cache key context. */
    readonly zone: string;

    /** The component intent to pre-compile and cache. */
    readonly intent: ComponentIntent;
};

/**
 * Compile function signature for warmup.
 *
 * The consumer wires this to `compiler.compile()`. The cache does NOT
 * import `@enterstellar-ai/compiler` directly — dependency injection keeps the
 * cache testable and avoids circular dependencies.
 *
 * @param intent - The `ComponentIntent` to compile.
 * @returns The `CompilationResult` from the compiler pipeline.
 */
export type CompileFn = (intent: ComponentIntent) => Promise<CompilationResult>;

// ---------------------------------------------------------------------------
// RenderCache Interface
// ---------------------------------------------------------------------------

/**
 * The Enterstellar Render Cache — makes GenUI feel instant.
 *
 * A global (non-zone-partitioned, per CA3) LRU cache that stores
 * `CompilationResult` entries keyed by `intentHash + componentName` (per CA1).
 * Cached entries bypass re-compilation for identical intents, dramatically
 * reducing latency for repeated queries.
 *
 * **Factory:** Created via `createRenderCache(config)`. Returns a plain object
 * with closures — no class instance, no prototype chain (per R1 pattern).
 *
 * **Invalidation triggers (CA4):**
 * - Registry component update/unregister
 * - Design token change (via `invalidateAll()`)
 * - TTL expiry (lazy on `get()`)
 * - Manual `invalidate()` / `invalidateAll()`
 *
 * @see Implementation Bible §4.6
 * @see Design Choices CA1–CA7
 *
 * @example
 * ```ts
 * import { createRenderCache, buildCacheKey } from '@enterstellar-ai/cache';
 *
 * const cache = createRenderCache({ maxEntries: 500, ttl: 1800 });
 * const key = buildCacheKey(intentHash, componentName);
 *
 * // Store
 * cache.set(key, { compiledIntent, compilationResult, cachedAt, expiresAt });
 *
 * // Retrieve
 * const cached = cache.get(key); // CachedRender | undefined
 *
 * // Stats
 * cache.getStats(); // { hits, misses, entries, hitRate }
 * ```
 */
export interface RenderCache {
    /**
     * Retrieves a cached render entry by key.
     *
     * Returns `undefined` if the key is not found or the entry has expired.
     * Expired entries are lazily evicted on access.
     * A successful lookup counts as a cache hit; a miss (including expiry)
     * counts as a cache miss.
     *
     * @param key - Cache key (from `buildCacheKey()`).
     * @returns The cached render entry, or `undefined` if not found/expired.
     */
    get(key: string): CachedRender | undefined;

    /**
     * Stores a render entry in the cache.
     *
     * If the cache is at capacity (`maxEntries`), the least-recently-used
     * entry is evicted before insertion.
     *
     * @param key - Cache key (from `buildCacheKey()`).
     * @param render - The `CachedRender` entry to store.
     */
    set(key: string, render: CachedRender): void;

    /**
     * Invalidates (removes) a single entry by exact key.
     *
     * @param key - Cache key to remove.
     * @returns `true` if an entry was removed, `false` if the key was not found.
     */
    invalidate(key: string): boolean;

    /**
     * Invalidates all cache entries for a specific component name.
     *
     * Iterates all entries and evicts those whose `compilationResult` resolved
     * to the given component name. Returns the count of evicted entries.
     *
     * @param componentName - PascalCase component name.
     * @returns The number of entries evicted.
     *
     * @see Design Choice CA5 — evict ALL entries for a changed component.
     */
    invalidateByComponent(componentName: string): number;

    /**
     * Clears the entire cache and resets all stats counters.
     *
     * @see Design Choice CA4 — manual clear is one of four invalidation triggers.
     */
    invalidateAll(): void;

    /**
     * Returns a snapshot of cache performance statistics.
     *
     * Stats are cumulative since the last `invalidateAll()` call.
     *
     * @returns A `CacheStats` object with hits, misses, entries, and hitRate.
     */
    getStats(): CacheStats;

    /**
     * Pre-warms the cache with common intents.
     *
     * Compiles each intent via the provided `compile` function and stores
     * the result. Failures are logged and skipped — warmup never throws.
     *
     * Should be called after app startup using `requestIdleCallback` or
     * `setTimeout(0)` as a fallback (per CA7 — never blocking).
     *
     * @param entries - Array of `{ zone, intent }` pairs to pre-compile.
     * @param compile - Compile function (typically `compiler.compile()`).
     *
     * @see Design Choice CA6 — warmup from static config + historical traces.
     * @see Design Choice CA7 — async warmup, never blocking.
     */
    warmup(entries: readonly WarmupEntry[], compile: CompileFn): Promise<void>;

    /**
     * Current number of entries in the cache.
     */
    readonly size: number;
}
