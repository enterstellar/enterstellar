/**
 * @module @enterstellar-ai/cache/create-render-cache
 * @description Factory function for creating an Enterstellar Render Cache.
 *
 * Returns a plain object with closures (per R1 — no class instance, no
 * prototype chain). The cache uses an internal LRU data structure for O(1)
 * get/set/eviction, with lazy TTL expiry on `get()`.
 *
 * **Configuration defaults:**
 * - `strategy: 'lru'`
 * - `maxEntries: 1000`
 * - `ttl: 3600` (1 hour in seconds)
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript.
 *
 * @see Implementation Bible §4.6
 * @see Design Choices CA1–CA7
 */

import { z } from 'zod';

import { EnterstellarError } from '@enterstellar-ai/types';
import type { CompilationResult } from '@enterstellar-ai/types';

import { buildCacheKey, extractComponentName } from './cache-key.js';
import { LRUCache } from './lru-cache.js';
import type {
    CachedRender,
    CacheStats,
    CompileFn,
    EvictionReason,
    RenderCache,
    RenderCacheConfig,
    WarmupEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Config Schema (Zod validation at factory creation time)
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating the data fields of `RenderCacheConfig`.
 *
 * **Note:** The `onEvict` callback is NOT validated by Zod — Zod's
 * `z.function()` produces incompatible types under `exactOptionalPropertyTypes`.
 * The callback is already type-safe at the TypeScript level; Zod validates
 * only the serializable data fields (strategy, maxEntries, ttl).
 *
 * @internal
 */
const RenderCacheConfigSchema = z.object({
    strategy: z.literal('lru'),
    maxEntries: z
        .number()
        .int('maxEntries must be an integer.')
        .min(1, 'maxEntries must be at least 1.'),
    ttl: z
        .number()
        .int('ttl must be an integer.')
        .min(1, 'ttl must be at least 1 second.'),
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default configuration values for the render cache.
 *
 * @internal
 */
const DEFAULT_CONFIG: RenderCacheConfig = {
    strategy: 'lru',
    maxEntries: 1000,
    ttl: 3600,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an Enterstellar Render Cache for compiled intents.
 *
 * The cache stores `CompilationResult` entries (per CA2 — NOT rendered React
 * trees) in a global LRU (per CA3 — no zone partitioning). Cache keys are
 * `intentHash + componentName` (per CA1 — NOT prop hashes).
 *
 * Configuration is validated with Zod at creation time (fail-fast). Invalid
 * config throws `EnterstellarError` with code `ENS-3001`.
 *
 * @param config - Optional partial configuration. Unspecified fields use defaults.
 * @returns A `RenderCache` instance (plain object with closures per R1).
 * @throws {EnterstellarError} If the configuration is invalid (`ENS-3001`).
 *
 * @see Implementation Bible §4.6
 * @see Design Choice CA1 — cache key = intentHash + componentName.
 * @see Design Choice CA2 — cache `CompilationResult` only.
 * @see Design Choice CA3 — global cache, no zone partitioning.
 *
 * @example
 * ```ts
 * import { createRenderCache, buildCacheKey } from '@enterstellar-ai/cache';
 *
 * const cache = createRenderCache({ maxEntries: 500, ttl: 1800 });
 * const key = buildCacheKey(intentHash, 'PatientVitals');
 *
 * cache.set(key, {
 *   compiledIntent: intent,
 *   compilationResult: result,
 *   cachedAt: Date.now(),
 *   expiresAt: Date.now() + 1800 * 1000,
 * });
 *
 * const cached = cache.get(key); // CachedRender | undefined
 * ```
 */
export function createRenderCache(config?: Partial<RenderCacheConfig>): RenderCache {
    // -----------------------------------------------------------------------
    // Configuration validation (fail-fast per R5 pattern)
    // -----------------------------------------------------------------------
    const merged: RenderCacheConfig = {
        ...DEFAULT_CONFIG,
        ...config,
    };

    // Validate serializable data fields via Zod (fail-fast per R5)
    const parseResult = RenderCacheConfigSchema.safeParse(merged);
    if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        const message = firstIssue !== undefined
            ? `Invalid RenderCache config: ${firstIssue.message}`
            : 'Invalid RenderCache config.';
        throw new EnterstellarError(
            'ENS-3001',
            'cache',
            message,
            false, // Not recoverable — dev error
        );
    }

    // Use merged config (includes onEvict callback, which Zod doesn't validate)
    const resolvedConfig = merged;

    // -----------------------------------------------------------------------
    // Internal state
    // -----------------------------------------------------------------------

    /** Cache hit counter. */
    let hits = 0;
    /** Cache miss counter. */
    let misses = 0;

    /**
     * LRU cache instance with eviction callback for stats tracking.
     * The eviction callback forwards to the consumer's `onEvict` hook.
     */
    const lru = new LRUCache<CachedRender>(
        resolvedConfig.maxEntries,
        (key: string, _value: CachedRender) => {
            if (resolvedConfig.onEvict !== undefined) {
                resolvedConfig.onEvict(key, 'capacity');
            }
        },
    );

    // -----------------------------------------------------------------------
    // Helper: TTL check
    // -----------------------------------------------------------------------

    /**
     * Checks if a cached entry has expired.
     *
     * @param entry - The cached render entry.
     * @returns `true` if the entry's `expiresAt` has passed.
     */
    function isExpired(entry: CachedRender): boolean {
        return Date.now() >= entry.expiresAt;
    }

    // -----------------------------------------------------------------------
    // Helper: Notify eviction
    // -----------------------------------------------------------------------

    /**
     * Notifies the consumer's `onEvict` callback if configured.
     *
     * @param key - The evicted cache key.
     * @param reason - Why the entry was evicted.
     */
    function notifyEvict(key: string, reason: EvictionReason): void {
        if (resolvedConfig.onEvict !== undefined) {
            resolvedConfig.onEvict(key, reason);
        }
    }

    // -----------------------------------------------------------------------
    // RenderCache implementation (plain object with closures per R1)
    // -----------------------------------------------------------------------

    const renderCache: RenderCache = {
        get(key: string): CachedRender | undefined {
            const entry = lru.get(key);

            if (entry === undefined) {
                misses++;
                return undefined;
            }

            // Lazy TTL expiry (CA4)
            if (isExpired(entry)) {
                lru.delete(key);
                misses++;
                notifyEvict(key, 'expired');
                return undefined;
            }

            hits++;
            return entry;
        },

        set(key: string, render: CachedRender): void {
            lru.set(key, render);
        },

        invalidate(key: string): boolean {
            const deleted = lru.delete(key);
            if (deleted) {
                notifyEvict(key, 'manual');
            }
            return deleted;
        },

        invalidateByComponent(componentName: string): number {
            // Collect keys to evict (cannot modify LRU during iteration)
            const keysToEvict: string[] = [];

            lru.forEach((key: string, value: CachedRender) => {
                // Fast path: extract component name from key directly
                const nameFromKey = extractComponentName(key);
                if (nameFromKey === componentName) {
                    keysToEvict.push(key);
                    return;
                }

                // Fallback: check the compilationResult for the component name
                if (value.compilationResult.componentName === componentName) {
                    keysToEvict.push(key);
                }
            });

            // Evict collected keys
            for (const key of keysToEvict) {
                lru.delete(key);
                notifyEvict(key, 'component-update');
            }

            return keysToEvict.length;
        },

        invalidateAll(): void {
            lru.clear();
            hits = 0;
            misses = 0;
            if (resolvedConfig.onEvict !== undefined) {
                resolvedConfig.onEvict('*', 'manual');
            }
        },

        getStats(): CacheStats {
            const total = hits + misses;
            return {
                hits,
                misses,
                entries: lru.size,
                hitRate: total === 0 ? 0 : hits / total,
            };
        },

        async warmup(entries: readonly WarmupEntry[], compile: CompileFn): Promise<void> {
            for (const entry of entries) {
                try {
                    const compilationResult: CompilationResult = await compile(entry.intent);

                    // Only cache successful compilations
                    if (compilationResult.status === 'fail') {
                        continue;
                    }

                    const now = Date.now();
                    const cachedRender: CachedRender = {
                        compiledIntent: entry.intent,
                        compilationResult,
                        cachedAt: now,
                        expiresAt: now + resolvedConfig.ttl * 1000,
                    };

                    // Build cache key via buildCacheKey() for consistent format
                    // with runtime lookups (CA1). During warmup, the intent's
                    // component name serves as the intentHash stand-in — this
                    // is the same value Zone uses for cache key construction
                    // when the intent arrives for the first time.
                    const key = buildCacheKey(entry.intent.component, compilationResult.componentName);
                    lru.set(key, cachedRender);
                } catch {
                    // Warmup failures are silently skipped (CA7 — never blocking).
                    // The warmup is best-effort: if a compile call fails,
                    // we continue with the next entry.
                    continue;
                }
            }
        },

        get size(): number {
            return lru.size;
        },
    };

    return renderCache;
}
