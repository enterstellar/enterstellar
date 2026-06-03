/**
 * @module @enterstellar-ai/cache/__tests__/create-render-cache
 * @description Tests for `createRenderCache()` — factory, config validation,
 * get/set with TTL, invalidation, stats, and warmup.
 *
 * Uses `vi.useFakeTimers()` for deterministic TTL verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';
import type { CompilationResult, ComponentIntent } from '@enterstellar-ai/types';

import { createRenderCache } from '../src/create-render-cache.js';
import { buildCacheKey } from '../src/cache-key.js';
import type { CachedRender, RenderCache } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid `ComponentIntent` for testing.
 */
function makeIntent(component: string): ComponentIntent {
    return {
        component,
        props: { value: 'test' },
        confidence: 0.95,
    };
}

/**
 * Creates a minimal valid `CompilationResult` for testing.
 */
function makeCompilationResult(
    componentName: string,
    status: 'pass' | 'fail' | 'corrected' = 'pass',
): CompilationResult {
    return {
        componentName,
        props: { value: 'compiled' },
        status,
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: [],
        selfCorrectionAttempts: 0,
    };
}

/**
 * Creates a `CachedRender` entry with the given TTL (in seconds).
 */
function makeCachedRender(
    componentName: string,
    ttlSeconds: number = 3600,
): CachedRender {
    const now = Date.now();
    return {
        compiledIntent: makeIntent(componentName),
        compilationResult: makeCompilationResult(componentName),
        cachedAt: now,
        expiresAt: now + ttlSeconds * 1000,
    };
}

// ---------------------------------------------------------------------------
// Factory — Config
// ---------------------------------------------------------------------------

describe('createRenderCache() — configuration', () => {
    it('creates a cache with default config when none provided', () => {
        const cache = createRenderCache();
        expect(cache.size).toBe(0);
    });

    it('accepts partial config and merges with defaults', () => {
        const cache = createRenderCache({ maxEntries: 50 });
        expect(cache.size).toBe(0);
    });

    it('accepts full config', () => {
        const cache = createRenderCache({
            strategy: 'lru',
            maxEntries: 100,
            ttl: 600,
        });
        expect(cache.size).toBe(0);
    });

    it('throws EnterstellarError on invalid maxEntries (0)', () => {
        expect(() => createRenderCache({ maxEntries: 0 })).toThrow(EnterstellarError);
    });

    it('throws EnterstellarError on invalid maxEntries (negative)', () => {
        expect(() => createRenderCache({ maxEntries: -1 })).toThrow(EnterstellarError);
    });

    it('throws EnterstellarError on invalid ttl (0)', () => {
        expect(() => createRenderCache({ ttl: 0 })).toThrow(EnterstellarError);
    });

    it('throws EnterstellarError on non-integer maxEntries', () => {
        expect(() => createRenderCache({ maxEntries: 1.5 })).toThrow(EnterstellarError);
    });

    it('throws EnterstellarError with code ENS-3001', () => {
        try {
            createRenderCache({ maxEntries: 0 });
            expect.fail('Should have thrown');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-3001');
            expect((error as EnterstellarError).module).toBe('cache');
            expect((error as EnterstellarError).recoverable).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// get() / set()
// ---------------------------------------------------------------------------

describe('RenderCache — get() and set()', () => {
    it('returns undefined for a missing key', () => {
        const cache = createRenderCache();
        expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('stores and retrieves a CachedRender entry', () => {
        const cache = createRenderCache();
        const key = buildCacheKey('intent-hash', 'PatientVitals');
        const entry = makeCachedRender('PatientVitals');

        cache.set(key, entry);

        const result = cache.get(key);
        expect(result).toBeDefined();
        expect(result?.compilationResult.componentName).toBe('PatientVitals');
    });

    it('updates size after set()', () => {
        const cache = createRenderCache();

        cache.set('key1', makeCachedRender('CompA'));
        expect(cache.size).toBe(1);

        cache.set('key2', makeCachedRender('CompB'));
        expect(cache.size).toBe(2);
    });

    it('overwrites entry for duplicate key', () => {
        const cache = createRenderCache();
        const key = 'same-key';

        cache.set(key, makeCachedRender('CompA'));
        cache.set(key, makeCachedRender('CompB'));

        expect(cache.size).toBe(1);
        expect(cache.get(key)?.compilationResult.componentName).toBe('CompB');
    });
});

// ---------------------------------------------------------------------------
// TTL Expiry
// ---------------------------------------------------------------------------

describe('RenderCache — TTL expiry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns entry before TTL expires', () => {
        const cache = createRenderCache({ ttl: 60 });
        const key = 'ttl-test';
        const entry = makeCachedRender('Component', 60);

        cache.set(key, entry);

        // Advance 30 seconds — still within TTL
        vi.advanceTimersByTime(30_000);

        expect(cache.get(key)).toBeDefined();
    });

    it('returns undefined after TTL expires (lazy eviction)', () => {
        const cache = createRenderCache({ ttl: 60 });
        const key = 'ttl-test';

        const now = Date.now();
        const entry: CachedRender = {
            compiledIntent: makeIntent('Component'),
            compilationResult: makeCompilationResult('Component'),
            cachedAt: now,
            expiresAt: now + 60_000, // 60 seconds
        };

        cache.set(key, entry);

        // Advance past TTL
        vi.advanceTimersByTime(61_000);

        expect(cache.get(key)).toBeUndefined();
    });

    it('expired get() counts as a miss in stats', () => {
        const cache = createRenderCache({ ttl: 10 });
        const key = 'expire-stats';

        const now = Date.now();
        cache.set(key, {
            compiledIntent: makeIntent('Comp'),
            compilationResult: makeCompilationResult('Comp'),
            cachedAt: now,
            expiresAt: now + 10_000,
        });

        // Advance past TTL
        vi.advanceTimersByTime(11_000);

        cache.get(key); // Should be a miss

        const stats = cache.getStats();
        expect(stats.misses).toBe(1);
        expect(stats.hits).toBe(0);
    });

    it('calls onEvict with reason "expired" for TTL eviction', () => {
        const onEvict = vi.fn();
        const cache = createRenderCache({ ttl: 5, onEvict });
        const key = 'evict-ttl';

        const now = Date.now();
        cache.set(key, {
            compiledIntent: makeIntent('Comp'),
            compilationResult: makeCompilationResult('Comp'),
            cachedAt: now,
            expiresAt: now + 5_000,
        });

        // Advance past TTL
        vi.advanceTimersByTime(6_000);

        cache.get(key); // Triggers lazy eviction

        expect(onEvict).toHaveBeenCalledWith(key, 'expired');
    });
});

// ---------------------------------------------------------------------------
// LRU Eviction
// ---------------------------------------------------------------------------

describe('RenderCache — LRU eviction', () => {
    it('evicts least-recently-used when maxEntries exceeded', () => {
        const cache = createRenderCache({ maxEntries: 2 });

        cache.set('key1', makeCachedRender('CompA'));
        cache.set('key2', makeCachedRender('CompB'));
        cache.set('key3', makeCachedRender('CompC')); // Evicts 'key1'

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.get('key2')).toBeDefined();
        expect(cache.get('key3')).toBeDefined();
        expect(cache.size).toBe(2);
    });

    it('calls onEvict with reason "capacity" for LRU eviction', () => {
        const onEvict = vi.fn();
        const cache = createRenderCache({ maxEntries: 1, onEvict });

        cache.set('key1', makeCachedRender('CompA'));
        cache.set('key2', makeCachedRender('CompB')); // Evicts 'key1'

        expect(onEvict).toHaveBeenCalledWith('key1', 'capacity');
    });
});

// ---------------------------------------------------------------------------
// invalidate()
// ---------------------------------------------------------------------------

describe('RenderCache — invalidate()', () => {
    it('removes a specific entry and returns true', () => {
        const cache = createRenderCache();
        const key = 'to-invalidate';

        cache.set(key, makeCachedRender('Comp'));
        expect(cache.invalidate(key)).toBe(true);
        expect(cache.get(key)).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it('returns false for a non-existent key', () => {
        const cache = createRenderCache();
        expect(cache.invalidate('missing')).toBe(false);
    });

    it('calls onEvict with reason "manual"', () => {
        const onEvict = vi.fn();
        const cache = createRenderCache({ onEvict });
        const key = 'manual-evict';

        cache.set(key, makeCachedRender('Comp'));
        cache.invalidate(key);

        expect(onEvict).toHaveBeenCalledWith(key, 'manual');
    });
});

// ---------------------------------------------------------------------------
// invalidateByComponent()
// ---------------------------------------------------------------------------

describe('RenderCache — invalidateByComponent()', () => {
    it('evicts all entries for a given component by key extraction', () => {
        const cache = createRenderCache();

        // Two entries for PatientVitals, one for MedicationList
        cache.set(buildCacheKey('hash-1', 'PatientVitals'), makeCachedRender('PatientVitals'));
        cache.set(buildCacheKey('hash-2', 'PatientVitals'), makeCachedRender('PatientVitals'));
        cache.set(buildCacheKey('hash-3', 'MedicationList'), makeCachedRender('MedicationList'));

        const evicted = cache.invalidateByComponent('PatientVitals');

        expect(evicted).toBe(2);
        expect(cache.size).toBe(1);
    });

    it('returns 0 when no entries match', () => {
        const cache = createRenderCache();
        cache.set(buildCacheKey('hash', 'CompA'), makeCachedRender('CompA'));

        expect(cache.invalidateByComponent('NonExistent')).toBe(0);
        expect(cache.size).toBe(1);
    });

    it('calls onEvict with reason "component-update" for each evicted entry', () => {
        const onEvict = vi.fn();
        const cache = createRenderCache({ onEvict });

        cache.set(buildCacheKey('h1', 'Target'), makeCachedRender('Target'));
        cache.set(buildCacheKey('h2', 'Target'), makeCachedRender('Target'));

        cache.invalidateByComponent('Target');

        expect(onEvict).toHaveBeenCalledTimes(2);
        expect(onEvict).toHaveBeenCalledWith(
            buildCacheKey('h1', 'Target'),
            'component-update',
        );
        expect(onEvict).toHaveBeenCalledWith(
            buildCacheKey('h2', 'Target'),
            'component-update',
        );
    });

    it('falls back to compilationResult.componentName when key format differs', () => {
        const cache = createRenderCache();

        // Insert with a non-standard key (no :: separator)
        const entry = makeCachedRender('FallbackComp');
        cache.set('custom-key-no-separator', entry);

        const evicted = cache.invalidateByComponent('FallbackComp');
        expect(evicted).toBe(1);
        expect(cache.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// invalidateAll()
// ---------------------------------------------------------------------------

describe('RenderCache — invalidateAll()', () => {
    it('clears all entries', () => {
        const cache = createRenderCache();
        cache.set('a', makeCachedRender('A'));
        cache.set('b', makeCachedRender('B'));

        cache.invalidateAll();

        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
    });

    it('resets stats counters', () => {
        const cache = createRenderCache();
        cache.set('a', makeCachedRender('A'));
        cache.get('a'); // hit
        cache.get('missing'); // miss

        cache.invalidateAll();

        const stats = cache.getStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
        expect(stats.entries).toBe(0);
        expect(stats.hitRate).toBe(0);
    });

    it('calls onEvict with wildcard key and reason "manual"', () => {
        const onEvict = vi.fn();
        const cache = createRenderCache({ onEvict });
        cache.set('a', makeCachedRender('A'));

        cache.invalidateAll();

        expect(onEvict).toHaveBeenCalledWith('*', 'manual');
    });
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------

describe('RenderCache — getStats()', () => {
    it('starts with zero counters', () => {
        const cache = createRenderCache();
        const stats = cache.getStats();
        expect(stats).toEqual({ hits: 0, misses: 0, entries: 0, hitRate: 0 });
    });

    it('tracks hits correctly', () => {
        const cache = createRenderCache();
        cache.set('key', makeCachedRender('Comp'));

        cache.get('key');
        cache.get('key');

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
    });

    it('tracks misses correctly', () => {
        const cache = createRenderCache();
        cache.get('missing-1');
        cache.get('missing-2');
        cache.get('missing-3');

        const stats = cache.getStats();
        expect(stats.misses).toBe(3);
    });

    it('calculates hitRate correctly', () => {
        const cache = createRenderCache();
        cache.set('key', makeCachedRender('Comp'));

        cache.get('key');    // hit
        cache.get('key');    // hit
        cache.get('key');    // hit
        cache.get('miss-1'); // miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(3);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBe(0.75);
    });

    it('returns hitRate 0 when no lookups performed', () => {
        const cache = createRenderCache();
        expect(cache.getStats().hitRate).toBe(0);
    });

    it('reflects current entry count', () => {
        const cache = createRenderCache();
        cache.set('a', makeCachedRender('A'));
        cache.set('b', makeCachedRender('B'));

        expect(cache.getStats().entries).toBe(2);

        cache.invalidate('a');
        expect(cache.getStats().entries).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// warmup()
// ---------------------------------------------------------------------------

describe('RenderCache — warmup()', () => {
    let cache: RenderCache;

    beforeEach(() => {
        cache = createRenderCache({ ttl: 3600 });
    });

    it('compiles and caches provided intents', async () => {
        const compile = vi.fn(async (intent: ComponentIntent): Promise<CompilationResult> => {
            return makeCompilationResult(intent.component);
        });

        await cache.warmup(
            [
                { zone: 'sidebar', intent: makeIntent('PatientVitals') },
                { zone: 'main', intent: makeIntent('MedicationList') },
            ],
            compile,
        );

        expect(compile).toHaveBeenCalledTimes(2);
        expect(cache.size).toBe(2);
    });

    it('skips failed compilations (status === "fail")', async () => {
        const compile = vi.fn(async (): Promise<CompilationResult> => {
            return makeCompilationResult('FailedComp', 'fail');
        });

        await cache.warmup(
            [{ zone: 'test', intent: makeIntent('FailedComp') }],
            compile,
        );

        expect(cache.size).toBe(0);
    });

    it('silently skips compile errors without throwing', async () => {
        const compile = vi.fn(async (intent: ComponentIntent): Promise<CompilationResult> => {
            if (intent.component === 'BadComp') {
                throw new Error('Compile failed');
            }
            return makeCompilationResult(intent.component);
        });

        // Should not throw
        await expect(
            cache.warmup(
                [
                    { zone: 'test', intent: makeIntent('BadComp') },
                    { zone: 'test', intent: makeIntent('GoodComp') },
                ],
                compile,
            ),
        ).resolves.toBeUndefined();

        // Only GoodComp should be cached
        expect(cache.size).toBe(1);
    });

    it('caches corrected compilations', async () => {
        const compile = vi.fn(async (): Promise<CompilationResult> => {
            return makeCompilationResult('CorrectedComp', 'corrected');
        });

        await cache.warmup(
            [{ zone: 'test', intent: makeIntent('CorrectedComp') }],
            compile,
        );

        expect(cache.size).toBe(1);
    });

    it('handles empty entries array', async () => {
        const compile = vi.fn();

        await cache.warmup([], compile);

        expect(compile).not.toHaveBeenCalled();
        expect(cache.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe('RenderCache — size', () => {
    it('reflects current entry count accurately', () => {
        const cache = createRenderCache();

        expect(cache.size).toBe(0);

        cache.set('a', makeCachedRender('A'));
        expect(cache.size).toBe(1);

        cache.set('b', makeCachedRender('B'));
        expect(cache.size).toBe(2);

        cache.invalidate('a');
        expect(cache.size).toBe(1);

        cache.invalidateAll();
        expect(cache.size).toBe(0);
    });
});
