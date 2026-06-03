/**
 * @module @enterstellar-ai/adapter-firebase
 * @description Firebase adapter — Auth + Data adapters for Firebase.
 *
 * This package provides factory functions that map Firebase Auth and Firestore
 * SDK calls to Enterstellar adapter interfaces. Each factory delegates to
 * `createAuthAdapter()` or `createDataAdapter()` from `@enterstellar-ai/adapters`
 * for validation and AD5 error wrapping.
 *
 * ## Quick Start
 *
 * ```ts
 * import { initializeApp } from 'firebase/app';
 * import { getAuth } from 'firebase/auth';
 * import { getFirestore } from 'firebase/firestore';
 * import {
 *   createFirebaseAuthAdapter,
 *   createFirebaseDataAdapter,
 * } from '@enterstellar-ai/adapter-firebase';
 *
 * const app = initializeApp({ projectId: 'my-project', ... });
 *
 * const auth = createFirebaseAuthAdapter({ auth: getAuth(app) });
 * const data = createFirebaseDataAdapter({ firestore: getFirestore(app) });
 *
 * // Pass adapters to Provider
 * // <Provider adapters={{ auth, data }} ... />
 * ```
 *
 * @see Bible §4.15
 * @see Design Choice AD1, AD4
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export { createFirebaseAuthAdapter } from './create-firebase-auth-adapter.js';
export { createFirebaseDataAdapter } from './create-firebase-data-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type { FirebaseAuthConfig, FirebaseDataConfig } from './types.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { FIREBASE_ADAPTER_VERSION } from './version.js';
