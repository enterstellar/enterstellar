/**
 * @module @enterstellar-ai/adapter-firebase/types
 * @description Configuration types for Firebase adapter factories.
 *
 * These types define the input shapes consumers pass to
 * `createFirebaseAuthAdapter()` and `createFirebaseDataAdapter()`.
 * The factories map Firebase SDK calls to Enterstellar adapter interfaces.
 *
 * @see Bible §4.15
 * @see Design Choice AD1 — minimal but complete: getSession, hasRole, onAuthChange
 */

import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Auth Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createFirebaseAuthAdapter}.
 *
 * Takes a Firebase `Auth` instance and optional overrides. The factory maps
 * Firebase auth calls to the Enterstellar `AuthAdapter` interface.
 *
 * @example
 * ```ts
 * import { getAuth } from 'firebase/auth';
 * import { createFirebaseAuthAdapter } from '@enterstellar-ai/adapter-firebase';
 *
 * const auth = getAuth(app);
 * const adapter = createFirebaseAuthAdapter({ auth });
 * ```
 */
export type FirebaseAuthConfig = {
    /**
     * The Firebase Auth instance.
     * Must be initialized with `getAuth()` from `firebase/auth`.
     */
    readonly auth: Auth;

    /**
     * Human-readable adapter name for error messages and DevTools display.
     * @default `'firebase-auth'`
     */
    readonly name?: string;

    /**
     * Custom role extraction function.
     *
     * Called with the raw Firebase `User` object after a successful auth check.
     * Returns an array of role strings for RBAC zone gating.
     *
     * @default Extracts from `getIdTokenResult().claims.roles` (falls back to `[]`).
     * @param user - The raw Firebase user object.
     * @returns Array of role strings (e.g., `['clinician', 'admin']`).
     *
     * @example
     * ```ts
     * // Extract roles from custom claims
     * roleExtractor: (user) => (user as any).customClaims?.roles ?? []
     * ```
     */
    readonly roleExtractor?: (user: unknown) => string[];
};

// ---------------------------------------------------------------------------
// Data Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createFirebaseDataAdapter}.
 *
 * Takes a Firestore instance and optional overrides. The factory maps
 * Firestore query/mutate/subscribe calls to the Enterstellar `DataAdapter` interface.
 *
 * @example
 * ```ts
 * import { getFirestore } from 'firebase/firestore';
 * import { createFirebaseDataAdapter } from '@enterstellar-ai/adapter-firebase';
 *
 * const firestore = getFirestore(app);
 * const data = createFirebaseDataAdapter({ firestore });
 * ```
 */
export type FirebaseDataConfig = {
    /**
     * The Firestore instance.
     * Must be initialized with `getFirestore()` from `firebase/firestore`.
     */
    readonly firestore: Firestore;

    /**
     * Human-readable adapter name for error messages and DevTools display.
     * @default `'firebase-data'`
     */
    readonly name?: string;
};
