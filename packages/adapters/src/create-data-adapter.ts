/**
 * @module @enterstellar-ai/adapters/create-data-adapter
 * @description Factory functions for creating validated `DataAdapter` instances.
 *
 * - `createDataAdapter(config)` — wraps a consumer-provided implementation,
 *   validates config via {@link validateAdapterConfig}, and wraps every method
 *   in error handling per Design Choice AD5 (raw vendor errors never leak).
 *
 * - `createNoopDataAdapter()` — returns a no-op adapter for testing and
 *   development when no real data source is connected.
 *
 * Both factories return a plain object with closures (R1 pattern — no classes).
 *
 * @see Bible §4.15
 * @see Design Choice AD1 — minimal but complete: query, mutate, subscribe
 * @see Design Choice AD2 — always async (except subscribe's sync unsubscribe return)
 * @see Design Choice AD3 — convention-based dot-notation resolver
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import type { DataAdapter } from '@enterstellar-ai/types';

import { adapterMethodError, adapterMutationError, adapterQueryError } from './errors.js';
import type { DataAdapterConfig } from './types.js';
import { validateAdapterConfig } from './validate-adapter.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a validated `DataAdapter` from consumer-provided config.
 *
 * The factory:
 * 1. Validates the config (name + required methods) — throws `ENS-7001` on failure.
 * 2. Wraps `query()` in error handling → `ENS-7003` on throw (includes resource name).
 * 3. Wraps `mutate()` in error handling → `ENS-7004` on throw (includes resource + action).
 * 4. Wraps `subscribe()` in error handling → `ENS-7002` on throw (generic method error).
 *
 * Consumers never see raw vendor errors — all failures are `EnterstellarError` (AD5).
 *
 * @param config - The adapter implementation with a `name` and all required methods.
 * @returns A frozen `DataAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { createDataAdapter } from '@enterstellar-ai/adapters';
 *
 * const data = createDataAdapter({
 *   name: 'supabase-data',
 *   query: async (resource, params) => {
 *     const { data } = await supabase.from(resource).select('*').match(params ?? {});
 *     return data ?? [];
 *   },
 *   mutate: async (resource, action, payload) => {
 *     if (action === 'create') {
 *       const { data } = await supabase.from(resource).insert(payload).select().single();
 *       return data;
 *     }
 *     return null;
 *   },
 *   subscribe: (resource, callback) => {
 *     const channel = supabase.channel(resource)
 *       .on('postgres_changes', { event: '*', schema: 'public', table: resource },
 *         () => { data.query(resource).then(callback); })
 *       .subscribe();
 *     return () => { void supabase.removeChannel(channel); };
 *   },
 * });
 * ```
 */
export function createDataAdapter(config: DataAdapterConfig): DataAdapter {
    // -----------------------------------------------------------------------
    // Step 1: Validate config — throws ENS-7001 on failure
    // -----------------------------------------------------------------------
    validateAdapterConfig('data', config);

    const adapterName = config.name;

    // -----------------------------------------------------------------------
    // Step 2: Build wrapped adapter (plain object with closures — R1 pattern)
    // -----------------------------------------------------------------------
    const adapter: DataAdapter = {
        /**
         * Wrapped `query()` — catches vendor errors → `ENS-7003`.
         * Includes the queried resource name in the error for debugging.
         */
        async query(
            resource: string,
            params?: Readonly<Record<string, unknown>>,
        ): Promise<readonly Record<string, unknown>[]> {
            try {
                return await config.query(resource, params);
            } catch (error: unknown) {
                throw adapterQueryError(adapterName, resource, error);
            }
        },

        /**
         * Wrapped `mutate()` — catches vendor errors → `ENS-7004`.
         * Includes the resource name and mutation action in the error for debugging.
         */
        async mutate(
            resource: string,
            action: 'create' | 'update' | 'delete',
            data: Readonly<Record<string, unknown>>,
        ): Promise<Record<string, unknown> | null> {
            try {
                return await config.mutate(resource, action, data);
            } catch (error: unknown) {
                throw adapterMutationError(adapterName, resource, action, error);
            }
        },

        /**
         * Wrapped `subscribe()` — catches vendor errors → `ENS-7002`.
         *
         * Only the `subscribe()` invocation itself is wrapped. The consumer's
         * callback is NOT wrapped — callback errors are the consumer's responsibility.
         * The returned unsubscribe function is also NOT wrapped — unsubscribe
         * failures are fire-and-forget cleanup operations.
         */
        subscribe(
            resource: string,
            callback: (data: readonly Record<string, unknown>[]) => void,
        ): () => void {
            try {
                return config.subscribe(resource, callback);
            } catch (error: unknown) {
                throw adapterMethodError(adapterName, 'subscribe', error);
            }
        },
    };

    // -----------------------------------------------------------------------
    // Step 3: Freeze and return — prevents accidental mutation (R4 pattern)
    // -----------------------------------------------------------------------
    return Object.freeze(adapter);
}

// ---------------------------------------------------------------------------
// No-Op Factory
// ---------------------------------------------------------------------------

/**
 * Creates a no-op `DataAdapter` for testing and development.
 *
 * All methods resolve to safe defaults:
 * - `query()` → `[]` (empty result set)
 * - `mutate()` → `null` (no record returned)
 * - `subscribe()` → no-op unsubscribe function
 *
 * @returns A frozen, no-op `DataAdapter` instance.
 *
 * @example
 * ```ts
 * import { createNoopDataAdapter } from '@enterstellar-ai/adapters';
 *
 * const data = createNoopDataAdapter();
 * await data.query('patients.vitals'); // []
 * await data.mutate('patients', 'create', { name: 'Test' }); // null
 * const unsub = data.subscribe('patients', () => {}); // noop unsub
 * unsub(); // no-op
 * ```
 */
export function createNoopDataAdapter(): DataAdapter {
    const adapter: DataAdapter = {
        query(
            _resource: string,
            _params?: Readonly<Record<string, unknown>>,
        ): Promise<readonly Record<string, unknown>[]> {
            return Promise.resolve([]);
        },

        mutate(
            _resource: string,
            _action: 'create' | 'update' | 'delete',
            _data: Readonly<Record<string, unknown>>,
        ): Promise<Record<string, unknown> | null> {
            return Promise.resolve(null);
        },

        subscribe(
            _resource: string,
            _callback: (data: readonly Record<string, unknown>[]) => void,
        ): () => void {
            // Return a no-op unsubscribe function.
            return () => {
                // No-op — no subscription to clean up.
            };
        },
    };

    return Object.freeze(adapter);
}
