/**
 * @module @enterstellar-ai/adapter-supabase/create-supabase-data-adapter
 * @description Factory function for creating a Supabase-backed `DataAdapter`.
 *
 * This factory maps Supabase PostgREST and Realtime calls to the Enterstellar
 * `DataAdapter` interface:
 * - `query(resource, params?)` → `client.from(resource).select('*')` + filters
 * - `mutate(resource, action, data)` → `client.from(resource).insert/update/delete`
 * - `subscribe(resource, cb)` → `client.channel().on('postgres_changes', ...).subscribe()`
 *
 * It builds a `DataAdapterConfig` and delegates to `createDataAdapter()` from
 * `@enterstellar-ai/adapters`, which handles all validation (ENS-7001) and AD5 error
 * wrapping (ENS-7003 / ENS-7004 / ENS-7002). This factory is purely an
 * SDK-to-Enterstellar translator.
 *
 * @see Bible §4.15
 * @see Design Choice AD3 — convention-based dot-notation for resource names
 * @see Design Choice AD4 — Supabase P0: auth + queries + realtime
 * @see Design Choice AD5 — error wrapping delegated to createDataAdapter()
 */

import type { DataAdapter } from '@enterstellar-ai/types';

import { createDataAdapter } from '@enterstellar-ai/adapters';

import type { SupabaseDataConfig } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default adapter name when none is provided via config. */
const DEFAULT_NAME = 'supabase-data';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase-backed `DataAdapter`.
 *
 * Maps Supabase PostgREST and Realtime methods to the Enterstellar `DataAdapter`
 * interface, then delegates to `createDataAdapter()` from `@enterstellar-ai/adapters`
 * for config validation and AD5 error wrapping.
 *
 * @param config - Supabase data configuration with client and optional overrides.
 * @returns A frozen, validated `DataAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * import { createSupabaseDataAdapter } from '@enterstellar-ai/adapter-supabase';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 * const data = createSupabaseDataAdapter({ client: supabase });
 *
 * // Query with filters
 * const vitals = await data.query('patients', { status: 'active' });
 *
 * // Mutate — create a record
 * const newPatient = await data.mutate('patients', 'create', {
 *   name: 'Jane Doe',
 *   status: 'active',
 * });
 *
 * // Subscribe to realtime changes
 * const unsub = data.subscribe('patients', (records) => {
 *   console.log('Patients updated:', records);
 * });
 * ```
 */
export function createSupabaseDataAdapter(config: SupabaseDataConfig): DataAdapter {
    const { client, name = DEFAULT_NAME } = config;

    // -----------------------------------------------------------------------
    // Build DataAdapterConfig and delegate to createDataAdapter()
    // -----------------------------------------------------------------------

    return createDataAdapter({
        name,

        /**
         * Maps to `client.from(resource).select('*')` with optional equality filters.
         *
         * Each key-value pair in `params` is applied as a `.eq(key, value)` filter.
         * If `params` is omitted, selects all rows without filters.
         *
         * Throws if Supabase returns an error — the error propagates up to
         * `createDataAdapter()`, which wraps it as `ENS-7003`.
         *
         * @param resource - Table name (AD3 dot-notation supported at v1 as literal).
         * @param params - Optional equality filters.
         */
        async query(
            resource: string,
            params?: Readonly<Record<string, unknown>>,
        ): Promise<readonly Record<string, unknown>[]> {
            let builder = client.from(resource).select('*');

            // Apply equality filters from params
            if (params) {
                for (const [key, value] of Object.entries(params)) {
                    builder = builder.eq(key, value);
                }
            }

            const { data, error } = await builder;

            // Let the error propagate — createDataAdapter() wraps it as ENS-7003
            if (error) throw error;

            // Supabase types guarantee data is non-null after error check,
            // but we keep a defensive fallback for runtime robustness.
            return ((data as Record<string, unknown>[] | null) ?? []);
        },

        /**
         * Maps to `client.from(resource).insert/update/delete` based on action.
         *
         * - `'create'` → `.insert(data).select().single()` → returns the new record
         * - `'update'` → `.update(data).eq('id', data.id).select().single()` → returns updated record
         * - `'delete'` → `.delete().eq('id', data.id)` → returns `null`
         *
         * Throws if Supabase returns an error — the error propagates up to
         * `createDataAdapter()`, which wraps it as `ENS-7004`.
         *
         * @param resource - Table name.
         * @param action - Mutation type: `'create'`, `'update'`, or `'delete'`.
         * @param data - Mutation payload. For update/delete, must include an `id` field.
         */
        async mutate(
            resource: string,
            action: 'create' | 'update' | 'delete',
            data: Readonly<Record<string, unknown>>,
        ): Promise<Record<string, unknown> | null> {
            if (action === 'create') {
                const result: { data: Record<string, unknown> | null; error: Error | null } = await client
                    .from(resource)
                    .insert(data as Record<string, unknown>)
                    .select()
                    .single();

                if (result.error) throw result.error;
                return result.data;
            }

            if (action === 'update') {
                const result: { data: Record<string, unknown> | null; error: Error | null } = await client
                    .from(resource)
                    .update(data as Record<string, unknown>)
                    .eq('id', data['id'] as string)
                    .select()
                    .single();

                if (result.error) throw result.error;
                return result.data;
            }

            // action === 'delete'
            const { error } = await client
                .from(resource)
                .delete()
                .eq('id', data['id']);

            if (error) throw error;
            return null;
        },

        /**
         * Maps to `client.channel().on('postgres_changes', ...).subscribe()`.
         *
         * Subscribes to Supabase Realtime postgres_changes events for the
         * specified resource (table). When a change is detected, re-fetches
         * all rows from the table and passes them to the callback.
         *
         * Returns a synchronous unsubscribe function that removes the channel.
         *
         * @param resource - Table name to subscribe to.
         * @param callback - Called with the full set of records after each change.
         */
        subscribe(
            resource: string,
            callback: (data: readonly Record<string, unknown>[]) => void,
        ): () => void {
            const channel = client
                .channel(`enterstellar-${resource}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: resource },
                    () => {
                        // Re-fetch all rows on any change — simple but correct at v1.
                        // A v2 optimization could apply incremental updates.
                        void client
                            .from(resource)
                            .select('*')
                            .then(({ data: rows }) => {
                                callback((rows ?? []) as readonly Record<string, unknown>[]);
                            });
                    },
                )
                .subscribe();

            // Return synchronous unsubscribe function
            return () => { void client.removeChannel(channel); };
        },
    });
}
