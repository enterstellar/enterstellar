/**
 * @module @enterstellar-ai/adapter-supabase/types
 * @description Configuration types for Supabase adapter factories.
 *
 * These types define the input shapes consumers pass to
 * `createSupabaseAuthAdapter()` and `createSupabaseDataAdapter()`.
 * The factories map Supabase SDK calls to Enterstellar adapter interfaces.
 *
 * @see Bible §4.15
 * @see Design Choice AD1 — minimal but complete: getSession, hasRole, onAuthChange
 * @see Design Choice AD4 — Supabase P0: auth + queries + realtime
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Auth Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createSupabaseAuthAdapter}.
 *
 * Takes a Supabase client and optional overrides. The factory maps
 * Supabase auth calls to the Enterstellar `AuthAdapter` interface.
 *
 * @example
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * import { createSupabaseAuthAdapter } from '@enterstellar-ai/adapter-supabase';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 * const auth = createSupabaseAuthAdapter({ client: supabase });
 * ```
 */
export type SupabaseAuthConfig = {
    /**
     * The Supabase client instance.
     * Must be initialized with `createClient()` from `@supabase/supabase-js`.
     */
    readonly client: SupabaseClient;

    /**
     * Human-readable adapter name for error messages and DevTools display.
     * @default `'supabase-auth'`
     */
    readonly name?: string;

    /**
     * Custom role extraction function.
     *
     * Called with the raw Supabase `user` object after a successful session
     * fetch. Returns an array of role strings for RBAC zone gating.
     *
     * @default Extracts from `user.user_metadata.roles` (falls back to `[]`).
     * @param user - The raw Supabase user object.
     * @returns Array of role strings (e.g., `['clinician', 'admin']`).
     *
     * @example
     * ```ts
     * // Extract roles from custom claims
     * roleExtractor: (user) => (user as any).app_metadata?.roles ?? []
     * ```
     */
    readonly roleExtractor?: (user: unknown) => string[];
};

// ---------------------------------------------------------------------------
// Data Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createSupabaseDataAdapter}.
 *
 * Takes a Supabase client and optional overrides. The factory maps
 * Supabase query/mutate/subscribe calls to the Enterstellar `DataAdapter` interface.
 *
 * @example
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * import { createSupabaseDataAdapter } from '@enterstellar-ai/adapter-supabase';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 * const data = createSupabaseDataAdapter({ client: supabase });
 * ```
 */
export type SupabaseDataConfig = {
    /**
     * The Supabase client instance.
     * Must be initialized with `createClient()` from `@supabase/supabase-js`.
     */
    readonly client: SupabaseClient;

    /**
     * Human-readable adapter name for error messages and DevTools display.
     * @default `'supabase-data'`
     */
    readonly name?: string;
};
