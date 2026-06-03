/**
 * @module @enterstellar-ai/cache/with-registry-invalidation
 * @description Wires registry events to cache invalidation.
 *
 * Higher-order function that subscribes to `EnterstellarRegistry` events (`update`,
 * `unregister`) and automatically calls `cache.invalidateByComponent()` for
 * the affected component. New component registrations (`register` events)
 * do NOT trigger invalidation — new components don't affect existing cache
 * entries.
 *
 * **Dependency model:** `EnterstellarRegistry` is imported as a **type-only** import.
 * The registry instance is injected at runtime by the consumer. There is NO
 * hard dependency on `@enterstellar-ai/registry` in `package.json`. This avoids
 * circular dependencies and keeps the cache self-contained.
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript.
 *
 * @see Design Choice CA4 — registry update is one of four invalidation triggers.
 * @see Design Choice CA5 — evict ALL entries for a changed component.
 */

import type { ComponentContract } from '@enterstellar-ai/types';

import type { RenderCache } from './types.js';

// ---------------------------------------------------------------------------
// Registry Shim Interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface required from an `EnterstellarRegistry` for cache invalidation.
 *
 * This avoids importing the full `EnterstellarRegistry` type from `@enterstellar-ai/registry`,
 * keeping `@enterstellar-ai/cache` decoupled. Any object that satisfies this interface
 * (including the real `EnterstellarRegistry`) can be used.
 *
 * @see Design Choice R18 — registry emits `register`, `unregister`, `update` events.
 */
export interface CacheInvalidationSource {
    /**
     * Subscribes to a registry event.
     *
     * @param event - The event type to listen for.
     * @param handler - Callback receiving the affected contract.
     * @returns An unsubscribe function.
     */
    on(
        event: 'register' | 'unregister' | 'update',
        handler: (contract: ComponentContract) => void,
    ): () => void;
}

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

/**
 * Result of wiring registry invalidation to a cache.
 * Contains the cache (unchanged) and a dispose function for cleanup.
 */
export type RegistryInvalidationBinding = {
    /** The same `RenderCache` instance passed in (for chaining convenience). */
    readonly cache: RenderCache;

    /**
     * Unsubscribes all registry event listeners.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    readonly dispose: () => void;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Wires registry events to cache invalidation.
 *
 * Subscribes to `update` and `unregister` events on the provided registry
 * (or any object implementing `CacheInvalidationSource`). When a component
 * is updated or removed, all cache entries for that component are evicted
 * (per CA5 — evict ALL entries for the changed component).
 *
 * The `register` event is intentionally ignored — new component registrations
 * do not invalidate existing cache entries.
 *
 * Returns a `dispose()` function that unsubscribes all listeners. This should
 * be called during app teardown or when the cache is no longer needed.
 *
 * @param cache - The `RenderCache` to wire invalidation to.
 * @param registry - An `EnterstellarRegistry` (or compatible `CacheInvalidationSource`).
 * @returns A `RegistryInvalidationBinding` with the cache and a dispose function.
 *
 * @see Design Choice CA4 — registry update triggers cache invalidation.
 * @see Design Choice CA5 — ALL entries for a changed component are evicted.
 *
 * @example
 * ```ts
 * import { createRenderCache, withRegistryInvalidation } from '@enterstellar-ai/cache';
 * import { createRegistry } from '@enterstellar-ai/registry';
 *
 * const cache = createRenderCache();
 * const registry = createRegistry({ components: [...] });
 *
 * const { dispose } = withRegistryInvalidation(cache, registry);
 *
 * // When a component is updated in the registry, the cache auto-evicts
 * // all entries for that component.
 *
 * // Cleanup on app teardown:
 * dispose();
 * ```
 */
export function withRegistryInvalidation(
    cache: RenderCache,
    registry: CacheInvalidationSource,
): RegistryInvalidationBinding {
    /** Whether dispose has already been called. */
    let disposed = false;

    /**
     * Handler for `update` and `unregister` events.
     * Evicts all cache entries for the affected component.
     *
     * @param contract - The component contract that was updated or removed.
     */
    const handleInvalidation = (contract: ComponentContract): void => {
        cache.invalidateByComponent(contract.name);
    };

    // Subscribe to invalidation-triggering events
    const unsubUpdate = registry.on('update', handleInvalidation);
    const unsubUnregister = registry.on('unregister', handleInvalidation);

    /**
     * Unsubscribes all event listeners.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    const dispose = (): void => {
        if (disposed) {
            return;
        }
        disposed = true;
        unsubUpdate();
        unsubUnregister();
    };

    return { cache, dispose };
}
