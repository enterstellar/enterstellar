/**
 * @module @enterstellar-ai/compiler/cache
 * @description Internal LRU cache for deduplicating Zod parse results.
 *
 * Prevents redundant re-validation when the same `componentName + props`
 * combination is compiled multiple times within a session. The cache is
 * automatically invalidated on any registry mutation (register, unregister,
 * update) to ensure stale contracts never serve cached results.
 *
 * This is a lightweight, compiler-internal cache — full caching semantics
 * (TTL, eviction policies, disk persistence) live in `@enterstellar-ai/cache`.
 *
 * **L15 compliance:** Zero framework imports. Pure data structure.
 *
 * @see Design Choice C17 — key: `componentName + JSON.stringify(props)`.
 * @see Design Choice C3 — compiler-level cache is optional, lightweight dedup.
 */

// ---------------------------------------------------------------------------
// Cache Entry
// ---------------------------------------------------------------------------

/**
 * A single cached parse result entry.
 * Stores the validated props and the timestamp of insertion for LRU tracking.
 */
type CacheEntry = {
    /** Validated props after Zod parse (the cached result). */
    readonly props: Readonly<Record<string, unknown>>;
    /** Insertion timestamp for LRU eviction ordering. */
    lastAccessed: number;
};

// ---------------------------------------------------------------------------
// CompilationCache Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the compiler's internal parse result cache.
 *
 * Consumers do not interact with this directly — `createCompiler()` creates
 * it internally and wires it to the compilation pipeline.
 */
export interface CompilationCache {
    /**
     * Retrieves a cached parse result for the given component and props.
     *
     * @param componentName - PascalCase component name.
     * @param props - The raw props to look up.
     * @returns Cached validated props, or `undefined` on cache miss.
     */
    get(
        componentName: string,
        props: Readonly<Record<string, unknown>>,
    ): Readonly<Record<string, unknown>> | undefined;

    /**
     * Stores a validated parse result in the cache.
     *
     * If the cache exceeds `maxSize`, the least-recently-accessed entry is evicted.
     *
     * @param componentName - PascalCase component name.
     * @param props - The raw props (used to build the cache key).
     * @param validatedProps - The validated props to cache.
     */
    set(
        componentName: string,
        props: Readonly<Record<string, unknown>>,
        validatedProps: Readonly<Record<string, unknown>>,
    ): void;

    /**
     * Clears all cached entries.
     * Called automatically on registry mutation events.
     */
    clear(): void;

    /** Number of entries currently in the cache. */
    readonly size: number;

    /**
     * Disposes the cache and unsubscribes from registry events.
     * Call this when the compiler is no longer needed to prevent memory leaks.
     */
    dispose(): void;
}

// ---------------------------------------------------------------------------
// Deterministic Cache Key
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic cache key from component name and props.
 *
 * Props keys are sorted to ensure `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }`
 * produce the same key. This prevents cache misses due to key ordering
 * differences in LLM output.
 *
 * @param componentName - PascalCase component name.
 * @param props - The raw props object.
 * @returns A deterministic string key.
 */
function buildCacheKey(
    componentName: string,
    props: Readonly<Record<string, unknown>>,
): string {
    // Sort keys for deterministic serialization
    const sortedKeys = Object.keys(props).sort();
    const sorted: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        sorted[key] = props[key];
    }
    return `${componentName}::${JSON.stringify(sorted)}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a compiler-internal LRU parse result cache.
 *
 * The cache subscribes to the provided registry's mutation events and
 * automatically clears itself when the registry changes. This ensures
 * stale cached results from a previous registry state are never used.
 *
 * @param maxSize - Maximum number of entries. Default: `500`.
 * @param registrySubscribe - Optional registry event subscription function.
 *   When provided, the cache auto-clears on `register`, `unregister`,
 *   and `update` events.
 * @returns A `CompilationCache` instance.
 *
 * @see Design Choice C17
 *
 * @example
 * ```ts
 * const cache = createCompilationCache(500, (event, handler) =>
 *   registry.on(event, handler),
 * );
 *
 * cache.set('PatientVitals', rawProps, validatedProps);
 * cache.get('PatientVitals', rawProps); // validatedProps
 * cache.dispose(); // unsubscribes from registry events
 * ```
 */
export function createCompilationCache(
    maxSize: number = 500,
    registrySubscribe?: (
        event: 'register' | 'unregister' | 'update',
        handler: () => void,
    ) => () => void,
): CompilationCache {
    const store = new Map<string, CacheEntry>();
    const unsubscribers: Array<() => void> = [];

    /** Monotonic counter for LRU ordering — avoids Date.now() granularity issues. */
    let accessCounter = 0;

    // Subscribe to registry events for auto-invalidation
    if (registrySubscribe !== undefined) {
        const events = ['register', 'unregister', 'update'] as const;
        for (const event of events) {
            const unsub = registrySubscribe(event, () => {
                store.clear();
            });
            unsubscribers.push(unsub);
        }
    }

    /**
     * Evicts the least-recently-accessed entry when the cache exceeds maxSize.
     * Scans all entries to find the one with the oldest `lastAccessed` timestamp.
     */
    function evictLRU(): void {
        if (store.size <= maxSize) {
            return;
        }

        let oldestKey: string | undefined;
        let oldestTime = Infinity;

        for (const [key, entry] of store) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey !== undefined) {
            store.delete(oldestKey);
        }
    }

    return {
        get(
            componentName: string,
            props: Readonly<Record<string, unknown>>,
        ): Readonly<Record<string, unknown>> | undefined {
            const key = buildCacheKey(componentName, props);
            const entry = store.get(key);
            if (entry === undefined) {
                return undefined;
            }
            // Update last accessed time for LRU tracking
            entry.lastAccessed = ++accessCounter;
            return entry.props;
        },

        set(
            componentName: string,
            props: Readonly<Record<string, unknown>>,
            validatedProps: Readonly<Record<string, unknown>>,
        ): void {
            const key = buildCacheKey(componentName, props);
            store.set(key, {
                props: validatedProps,
                lastAccessed: ++accessCounter,
            });
            evictLRU();
        },

        clear(): void {
            store.clear();
        },

        get size(): number {
            return store.size;
        },

        dispose(): void {
            store.clear();
            for (const unsub of unsubscribers) {
                unsub();
            }
            unsubscribers.length = 0;
        },
    };
}
