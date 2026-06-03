/**
 * @module @enterstellar-ai/adapter-supabase/create-supabase-auth-adapter
 * @description Factory function for creating a Supabase-backed `AuthAdapter`.
 *
 * This factory maps Supabase SDK auth calls to the Enterstellar `AuthAdapter` interface:
 * - `getSession()` → `client.auth.getSession()` → `{ userId, roles } | null`
 * - `hasRole(role)` → internally calls `getSession()`, checks `roles.includes(role)`
 * - `onAuthChange(cb)` → `client.auth.onAuthStateChange()` → returns `unsubscribe`
 *
 * It builds an `AuthAdapterConfig` and delegates to `createAuthAdapter()` from
 * `@enterstellar-ai/adapters`, which handles all validation (ENS-7001) and AD5 error
 * wrapping (ENS-7005 / ENS-7002). This factory is purely an SDK-to-Enterstellar translator.
 *
 * @see Bible §4.15
 * @see Design Choice AD1 — minimal but complete: getSession, hasRole, onAuthChange
 * @see Design Choice AD4 — Supabase P0: auth + queries + realtime
 * @see Design Choice AD5 — error wrapping delegated to createAuthAdapter()
 */

import type { AuthAdapter } from '@enterstellar-ai/types';

import { createAuthAdapter } from '@enterstellar-ai/adapters';

import type { SupabaseAuthConfig } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default adapter name when none is provided via config. */
const DEFAULT_NAME = 'supabase-auth';

// ---------------------------------------------------------------------------
// Default Role Extractor
// ---------------------------------------------------------------------------

/**
 * Default role extraction function for Supabase users.
 *
 * Extracts roles from `user.user_metadata.roles`. Falls back to an empty
 * array if the field is missing, undefined, or not an array.
 *
 * Consumers can override this via `SupabaseAuthConfig.roleExtractor` for
 * custom RBAC implementations (e.g., `app_metadata`, custom claims table).
 *
 * @param user - The raw Supabase user object.
 * @returns Array of role strings (e.g., `['clinician', 'admin']`).
 *
 * @internal
 */
function defaultRoleExtractor(user: unknown): string[] {
    if (typeof user !== 'object' || user === null) return [];

    const metadata = (user as Record<string, unknown>)['user_metadata'];
    if (typeof metadata !== 'object' || metadata === null) return [];

    const roles = (metadata as Record<string, unknown>)['roles'];
    if (!Array.isArray(roles)) return [];

    // Ensure all elements are strings — reject non-string values silently
    return roles.filter((role): role is string => typeof role === 'string');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase-backed `AuthAdapter`.
 *
 * Maps Supabase SDK auth methods to the Enterstellar `AuthAdapter` interface,
 * then delegates to `createAuthAdapter()` from `@enterstellar-ai/adapters` for
 * config validation and AD5 error wrapping.
 *
 * @param config - Supabase auth configuration with client and optional overrides.
 * @returns A frozen, validated `AuthAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * import { createSupabaseAuthAdapter } from '@enterstellar-ai/adapter-supabase';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *
 * const auth = createSupabaseAuthAdapter({ client: supabase });
 *
 * // With custom role extraction
 * const authWithRoles = createSupabaseAuthAdapter({
 *   client: supabase,
 *   roleExtractor: (user) => (user as any).app_metadata?.roles ?? [],
 * });
 *
 * // Usage
 * const session = await auth.getSession();     // { userId, roles } | null
 * const isAdmin = await auth.hasRole('admin');  // boolean
 * const unsub = auth.onAuthChange((session) => {
 *   console.log('Auth state changed:', session);
 * });
 * ```
 */
export function createSupabaseAuthAdapter(config: SupabaseAuthConfig): AuthAdapter {
    const { client, name = DEFAULT_NAME, roleExtractor = defaultRoleExtractor } = config;

    // -----------------------------------------------------------------------
    // Internal helper: extract Enterstellar session from Supabase session
    // -----------------------------------------------------------------------

    /**
     * Converts a raw Supabase session into the Enterstellar session shape.
     * Returns `null` if the session is null or the user is missing.
     *
     * @param session - The raw Supabase session object (or null).
     * @returns Enterstellar session `{ userId, roles }` or `null`.
     */
    function toEnterstellarSession(
        session: { user: { id: string } } | null,
    ): { userId: string; roles: string[] } | null {
        if (!session?.user) return null;

        return {
            userId: session.user.id,
            roles: roleExtractor(session.user),
        };
    }

    // -----------------------------------------------------------------------
    // Build AuthAdapterConfig and delegate to createAuthAdapter()
    // -----------------------------------------------------------------------

    return createAuthAdapter({
        name,

        /**
         * Maps to `client.auth.getSession()`.
         *
         * Extracts `{ userId, roles }` from the Supabase session.
         * Returns `null` if unauthenticated (no active session).
         */
        async getSession(): Promise<{ userId: string; roles: string[] } | null> {
            const { data } = await client.auth.getSession();
            return toEnterstellarSession(data.session);
        },

        /**
         * Maps to `getSession()` → checks `roles.includes(role)`.
         *
         * DRY pattern: re-uses `getSession()` logic to avoid duplicating
         * the session fetch and role extraction. Returns `false` if
         * unauthenticated (no session).
         *
         * @param role - The role to check (e.g., `'clinician'`, `'admin'`).
         */
        async hasRole(role: string): Promise<boolean> {
            const { data } = await client.auth.getSession();
            const session = toEnterstellarSession(data.session);
            if (!session) return false;
            return session.roles.includes(role);
        },

        /**
         * Maps to `client.auth.onAuthStateChange()`.
         *
         * Subscribes to Supabase auth state changes and translates each
         * event into the Enterstellar session shape. Returns a synchronous
         * unsubscribe function.
         *
         * @param callback - Called with the new Enterstellar session or `null`.
         */
        onAuthChange(
            callback: (session: { userId: string; roles: string[] } | null) => void,
        ): () => void {
            const { data } = client.auth.onAuthStateChange((_event, session) => {
                callback(toEnterstellarSession(session));
            });
            return () => { data.subscription.unsubscribe(); };
        },
    });
}
