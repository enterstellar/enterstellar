/**
 * @module @enterstellar-ai/adapter-firebase/create-firebase-auth-adapter
 * @description Factory function for creating a Firebase-backed `AuthAdapter`.
 *
 * This factory maps Firebase Auth SDK calls to the Enterstellar `AuthAdapter` interface:
 * - `getSession()` → `auth.currentUser` + `getIdTokenResult()` → `{ userId, roles } | null`
 * - `hasRole(role)` → `getSession()` → checks `roles.includes(role)`
 * - `onAuthChange(cb)` → `onAuthStateChanged(auth, cb)` → returns `unsubscribe`
 *
 * It builds an `AuthAdapterConfig` and delegates to `createAuthAdapter()` from
 * `@enterstellar-ai/adapters`, which handles all validation (ENS-7001) and AD5 error
 * wrapping (ENS-7005 / ENS-7002). This factory is purely an SDK-to-Enterstellar translator.
 *
 * ## Role Extraction Strategy
 *
 * Firebase stores RBAC roles in custom claims via `getIdTokenResult().claims`.
 * The default behavior extracts roles from `claims['roles']` (an async operation).
 * If a custom `roleExtractor` is provided, it is called synchronously with the
 * raw Firebase `User` object — this enables `onAuthChange()` to include roles
 * in the callback (since `onAuthChange` is synchronous).
 *
 * When no custom `roleExtractor` is provided and `onAuthChange()` fires,
 * roles default to `[]` in the callback. Full role resolution happens
 * through `getSession()` or `hasRole()` (which can await `getIdTokenResult()`).
 *
 * @see Bible §4.15
 * @see Design Choice AD1 — minimal but complete: getSession, hasRole, onAuthChange
 * @see Design Choice AD5 — error wrapping delegated to createAuthAdapter()
 */

import type { AuthAdapter } from '@enterstellar-ai/types';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

import { createAuthAdapter } from '@enterstellar-ai/adapters';

import type { FirebaseAuthConfig } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default adapter name when none is provided via config. */
const DEFAULT_NAME = 'firebase-auth';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts roles from a Firebase user via `getIdTokenResult()` custom claims.
 *
 * This is an **async** operation — it fetches the ID token result from Firebase
 * to read custom claims. Falls back to `[]` if the `roles` claim is missing
 * or not an array.
 *
 * @param user - The Firebase `User` object.
 * @returns Array of role strings.
 *
 * @internal
 */
async function extractRolesFromClaims(user: User): Promise<string[]> {
    const tokenResult = await user.getIdTokenResult();
    const roles = tokenResult.claims['roles'];

    if (!Array.isArray(roles)) return [];

    // Ensure all elements are strings — reject non-string values silently
    return roles.filter((role): role is string => typeof role === 'string');
}

/**
 * Converts a Firebase `User` to the Enterstellar session shape using the
 * synchronous `roleExtractor`. Returns `null` if the user is null.
 *
 * Only used when a custom `roleExtractor` is provided (synchronous path).
 *
 * @param user - The Firebase `User` object (or null).
 * @param roleExtractor - The synchronous role extraction function.
 * @returns Enterstellar session `{ userId, roles }` or `null`.
 *
 * @internal
 */
function toEnterstellarSessionSync(
    user: User | null,
    roleExtractor: (user: unknown) => string[],
): { userId: string; roles: string[] } | null {
    if (!user) return null;
    return { userId: user.uid, roles: roleExtractor(user) };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Firebase-backed `AuthAdapter`.
 *
 * Maps Firebase Auth SDK methods to the Enterstellar `AuthAdapter` interface,
 * then delegates to `createAuthAdapter()` from `@enterstellar-ai/adapters` for
 * config validation and AD5 error wrapping.
 *
 * @param config - Firebase auth configuration with `Auth` instance and optional overrides.
 * @returns A frozen, validated `AuthAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { initializeApp } from 'firebase/app';
 * import { getAuth } from 'firebase/auth';
 * import { createFirebaseAuthAdapter } from '@enterstellar-ai/adapter-firebase';
 *
 * const app = initializeApp({ projectId: 'my-project', ... });
 * const firebaseAuth = getAuth(app);
 *
 * const auth = createFirebaseAuthAdapter({ auth: firebaseAuth });
 *
 * // With custom role extraction (synchronous — enables roles in onAuthChange)
 * const authWithRoles = createFirebaseAuthAdapter({
 *   auth: firebaseAuth,
 *   roleExtractor: (user) => {
 *     const u = user as { customClaims?: { roles?: string[] } };
 *     return u.customClaims?.roles ?? [];
 *   },
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
export function createFirebaseAuthAdapter(config: FirebaseAuthConfig): AuthAdapter {
    const { auth, name = DEFAULT_NAME, roleExtractor } = config;

    // -----------------------------------------------------------------------
    // Determine role extraction strategy
    // -----------------------------------------------------------------------
    // If a custom roleExtractor is provided, use it synchronously everywhere.
    // If not, use async getIdTokenResult() for getSession/hasRole,
    // and fall back to [] for onAuthChange (sync context).
    const hasCustomExtractor = typeof roleExtractor === 'function';

    // -----------------------------------------------------------------------
    // Build AuthAdapterConfig and delegate to createAuthAdapter()
    // -----------------------------------------------------------------------

    return createAuthAdapter({
        name,

        /**
         * Maps to `auth.currentUser` + role extraction.
         *
         * If a custom `roleExtractor` is provided, uses it synchronously.
         * Otherwise, fetches roles from `getIdTokenResult().claims['roles']`.
         *
         * Returns `null` if no user is signed in (`auth.currentUser === null`).
         */
        async getSession(): Promise<{ userId: string; roles: string[] } | null> {
            const user = auth.currentUser;
            if (!user) return null;

            if (hasCustomExtractor) {
                return { userId: user.uid, roles: roleExtractor(user) };
            }

            // Default: async role extraction from custom claims
            const roles = await extractRolesFromClaims(user);
            return { userId: user.uid, roles };
        },

        /**
         * Maps to `getSession()` → checks `roles.includes(role)`.
         *
         * DRY pattern: re-uses session logic to avoid duplicating the
         * user fetch and role extraction. Returns `false` if no user
         * is signed in.
         *
         * @param role - The role to check (e.g., `'clinician'`, `'admin'`).
         */
        async hasRole(role: string): Promise<boolean> {
            const user = auth.currentUser;
            if (!user) return false;

            if (hasCustomExtractor) {
                return roleExtractor(user).includes(role);
            }

            // Default: async role extraction from custom claims
            const roles = await extractRolesFromClaims(user);
            return roles.includes(role);
        },

        /**
         * Maps to `onAuthStateChanged(auth, callback)`.
         *
         * Firebase's `onAuthStateChanged()` returns an `Unsubscribe` function
         * directly — a 1:1 mapping to Enterstellar's `onAuthChange()` signature.
         *
         * **Role resolution in callbacks:**
         * - With custom `roleExtractor`: roles are extracted synchronously
         *   from the Firebase `User` object.
         * - Without custom `roleExtractor`: roles default to `[]` in the
         *   callback. Full role resolution happens via `getSession()`/`hasRole()`.
         *   This is a pragmatic tradeoff — `getIdTokenResult()` is async and
         *   cannot be awaited inside `onAuthStateChanged`.
         *
         * @param callback - Called with the new Enterstellar session or `null`.
         */
        onAuthChange(
            callback: (session: { userId: string; roles: string[] } | null) => void,
        ): () => void {
            return onAuthStateChanged(auth, (user) => {
                if (hasCustomExtractor) {
                    callback(toEnterstellarSessionSync(user, roleExtractor));
                } else {
                    // No custom extractor — roles default to [] in sync context.
                    // Full role resolution available via getSession()/hasRole().
                    callback(user ? { userId: user.uid, roles: [] } : null);
                }
            });
        },
    });
}
