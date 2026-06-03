/**
 * @module @enterstellar-ai/cache/__tests__/with-registry-invalidation
 * @description Tests for `withRegistryInvalidation()` — wiring registry events
 * to cache invalidation per Design Choices CA4/CA5.
 *
 * Uses a mock registry implementing `CacheInvalidationSource`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ComponentContract } from '@enterstellar-ai/types';
import { createComponentId } from '@enterstellar-ai/types';
import { z } from 'zod';

import { createRenderCache } from '../src/create-render-cache.js';
import { buildCacheKey } from '../src/cache-key.js';
import { withRegistryInvalidation } from '../src/with-registry-invalidation.js';
import type { CacheInvalidationSource } from '../src/with-registry-invalidation.js';
import type { CachedRender, RenderCache } from '../src/types.js';
import type { CompilationResult, ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fully typed `ComponentContract` for event simulation.
 * All required fields are populated with sensible test defaults.
 * Only `name` varies — it is the field consumed by the invalidation handler.
 */
function makeContract(name: string): ComponentContract {
    return {
        name,
        id: createComponentId(name),
        description: `Test contract for ${name}`,
        category: 'data-display',
        tags: [name.toLowerCase()],
        props: z.object({}),
        tokens: {},
        accessibility: {
            role: 'region',
            ariaLabel: name,
            announceOnUpdate: false,
        },
        states: {
            loading: 'Loading...',
            error: 'Error occurred',
            empty: 'No data',
            ready: 'Ready',
        },
        examples: [{ intent: `show ${name.toLowerCase()}`, props: {} }],
        _meta: {
            forged: false,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
        },
    };
}

/**
 * Creates a `CachedRender` entry for testing.
 */
function makeCachedRender(componentName: string): CachedRender {
    const now = Date.now();
    const intent: ComponentIntent = {
        component: componentName,
        props: { value: 'test' },
        confidence: 0.95,
    };
    const compilationResult: CompilationResult = {
        componentName,
        props: { value: 'compiled' },
        status: 'pass',
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: [],
        selfCorrectionAttempts: 0,
    };

    return {
        compiledIntent: intent,
        compilationResult,
        cachedAt: now,
        expiresAt: now + 3_600_000,
    };
}

/**
 * Creates a mock registry that implements `CacheInvalidationSource`.
 * Stores handlers by event type and provides a `fire()` method for testing.
 */
function createMockRegistry(): CacheInvalidationSource & {
    fire: (event: 'register' | 'unregister' | 'update', contract: ComponentContract) => void;
} {
    const handlers = new Map<string, Set<(contract: ComponentContract) => void>>();

    return {
        on(
            event: 'register' | 'unregister' | 'update',
            handler: (contract: ComponentContract) => void,
        ): () => void {
            const eventHandlers = handlers.get(event) ?? new Set();
            eventHandlers.add(handler);
            handlers.set(event, eventHandlers);

            return () => {
                eventHandlers.delete(handler);
            };
        },

        fire(
            event: 'register' | 'unregister' | 'update',
            contract: ComponentContract,
        ): void {
            const eventHandlers = handlers.get(event);
            if (eventHandlers !== undefined) {
                for (const handler of eventHandlers) {
                    handler(contract);
                }
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function setupTest(): {
    cache: RenderCache;
    registry: ReturnType<typeof createMockRegistry>;
    dispose: () => void;
} {
    const cache = createRenderCache({ maxEntries: 100 });
    const registry = createMockRegistry();
    const { dispose } = withRegistryInvalidation(cache, registry);
    return { cache, registry, dispose };
}

// ---------------------------------------------------------------------------
// withRegistryInvalidation()
// ---------------------------------------------------------------------------

describe('withRegistryInvalidation()', () => {
    it('returns the same cache instance (for chaining)', () => {
        const originalCache = createRenderCache();
        const registry = createMockRegistry();
        const { cache: returnedCache } = withRegistryInvalidation(
            originalCache,
            registry,
        );

        expect(returnedCache).toBe(originalCache);
    });

    it('returns a dispose function', () => {
        const cache = createRenderCache();
        const registry = createMockRegistry();
        const { dispose } = withRegistryInvalidation(cache, registry);

        expect(typeof dispose).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// Registry 'update' event → invalidation
// ---------------------------------------------------------------------------

describe('withRegistryInvalidation — "update" event', () => {
    it('invalidates all cache entries for the updated component', () => {
        const { cache, registry } = setupTest();

        // Cache two entries for PatientVitals, one for MedicationList
        cache.set(
            buildCacheKey('h1', 'PatientVitals'),
            makeCachedRender('PatientVitals'),
        );
        cache.set(
            buildCacheKey('h2', 'PatientVitals'),
            makeCachedRender('PatientVitals'),
        );
        cache.set(
            buildCacheKey('h3', 'MedicationList'),
            makeCachedRender('MedicationList'),
        );

        expect(cache.size).toBe(3);

        // Fire registry update for PatientVitals
        registry.fire('update', makeContract('PatientVitals'));

        // Only PatientVitals entries should be evicted
        expect(cache.size).toBe(1);
        expect(
            cache.get(buildCacheKey('h3', 'MedicationList')),
        ).toBeDefined();
    });

    it('is a no-op when updated component has no cache entries', () => {
        const { cache, registry } = setupTest();

        cache.set(
            buildCacheKey('h1', 'CompA'),
            makeCachedRender('CompA'),
        );

        registry.fire('update', makeContract('NonCachedComponent'));

        expect(cache.size).toBe(1); // Unchanged
    });
});

// ---------------------------------------------------------------------------
// Registry 'unregister' event → invalidation
// ---------------------------------------------------------------------------

describe('withRegistryInvalidation — "unregister" event', () => {
    it('invalidates all cache entries for the unregistered component', () => {
        const { cache, registry } = setupTest();

        cache.set(
            buildCacheKey('h1', 'RemovedComp'),
            makeCachedRender('RemovedComp'),
        );
        cache.set(
            buildCacheKey('h2', 'KeptComp'),
            makeCachedRender('KeptComp'),
        );

        registry.fire('unregister', makeContract('RemovedComp'));

        expect(cache.size).toBe(1);
        expect(
            cache.get(buildCacheKey('h2', 'KeptComp')),
        ).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Registry 'register' event → NO invalidation
// ---------------------------------------------------------------------------

describe('withRegistryInvalidation — "register" event', () => {
    it('does NOT invalidate cache on new component registration', () => {
        const { cache, registry } = setupTest();

        cache.set(
            buildCacheKey('h1', 'ExistingComp'),
            makeCachedRender('ExistingComp'),
        );

        // Register a new component — should NOT affect cache
        registry.fire('register', makeContract('NewComponent'));

        expect(cache.size).toBe(1); // Unchanged
        expect(
            cache.get(buildCacheKey('h1', 'ExistingComp')),
        ).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe('withRegistryInvalidation — dispose()', () => {
    it('unsubscribes from all registry events', () => {
        const { cache, registry, dispose } = setupTest();

        cache.set(
            buildCacheKey('h1', 'CompA'),
            makeCachedRender('CompA'),
        );

        // Dispose — unsubscribe
        dispose();

        // Fire events — should have NO effect on cache
        registry.fire('update', makeContract('CompA'));

        expect(cache.size).toBe(1); // Still there — not invalidated
    });

    it('is safe to call multiple times (idempotent)', () => {
        const { dispose } = setupTest();

        // Should not throw on repeated calls
        expect(() => {
            dispose();
            dispose();
            dispose();
        }).not.toThrow();
    });

    it('does not cause duplicate invalidations after re-binding', () => {
        const cache = createRenderCache({ maxEntries: 100 });
        const registry = createMockRegistry();

        // Bind, then dispose
        const { dispose: dispose1 } = withRegistryInvalidation(cache, registry);
        dispose1();

        // Re-bind
        const { dispose: dispose2 } = withRegistryInvalidation(cache, registry);

        cache.set(
            buildCacheKey('h1', 'CompA'),
            makeCachedRender('CompA'),
        );

        // Spy on invalidateByComponent
        const spy = vi.spyOn(cache, 'invalidateByComponent');

        registry.fire('update', makeContract('CompA'));

        // Should only be called once (from second binding, not first)
        expect(spy).toHaveBeenCalledTimes(1);

        dispose2();
        spy.mockRestore();
    });
});
