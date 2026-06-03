/**
 * @module @enterstellar-ai/adapter-firebase/create-firebase-data-adapter
 * @description Factory function for creating a Firestore-backed `DataAdapter`.
 *
 * This factory maps Firestore SDK calls to the Enterstellar `DataAdapter` interface:
 * - `query(resource, params?)` → `getDocs(collection(...))` + `where()` constraints
 * - `mutate(resource, action, data)` → `addDoc` / `updateDoc` / `deleteDoc`
 * - `subscribe(resource, cb)` → `onSnapshot(collection(...), cb)` → returns `unsubscribe`
 *
 * It builds a `DataAdapterConfig` and delegates to `createDataAdapter()` from
 * `@enterstellar-ai/adapters`, which handles all validation (ENS-7001) and AD5 error
 * wrapping (ENS-7003 / ENS-7004 / ENS-7002). This factory is purely an
 * SDK-to-Enterstellar translator.
 *
 * @see Bible §4.15
 * @see Design Choice AD3 — convention-based dot-notation for resource names
 * @see Design Choice AD5 — error wrapping delegated to createDataAdapter()
 */

import type { DataAdapter } from '@enterstellar-ai/types';
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query as firestoreQuery,
    where,
} from 'firebase/firestore';

import { createDataAdapter } from '@enterstellar-ai/adapters';

import type { FirebaseDataConfig } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default adapter name when none is provided via config. */
const DEFAULT_NAME = 'firebase-data';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Firestore-backed `DataAdapter`.
 *
 * Maps Firestore SDK methods to the Enterstellar `DataAdapter` interface,
 * then delegates to `createDataAdapter()` from `@enterstellar-ai/adapters`
 * for config validation and AD5 error wrapping.
 *
 * @param config - Firestore data configuration with Firestore instance and optional overrides.
 * @returns A frozen, validated `DataAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { initializeApp } from 'firebase/app';
 * import { getFirestore } from 'firebase/firestore';
 * import { createFirebaseDataAdapter } from '@enterstellar-ai/adapter-firebase';
 *
 * const app = initializeApp({ projectId: 'my-project', ... });
 * const firestore = getFirestore(app);
 * const data = createFirebaseDataAdapter({ firestore });
 *
 * // Query with filters
 * const patients = await data.query('patients', { status: 'active' });
 *
 * // Mutate — create a document
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
export function createFirebaseDataAdapter(config: FirebaseDataConfig): DataAdapter {
    const { firestore, name = DEFAULT_NAME } = config;

    // -----------------------------------------------------------------------
    // Build DataAdapterConfig and delegate to createDataAdapter()
    // -----------------------------------------------------------------------

    return createDataAdapter({
        name,

        /**
         * Maps to `getDocs(collection(firestore, resource))` with optional
         * `where()` equality constraints.
         *
         * Each key-value pair in `params` is applied as a `where(key, '==', value)`
         * constraint. If `params` is omitted, fetches all documents in the collection.
         *
         * Each document is returned as `{ id, ...data() }` — the Firestore document
         * ID is injected as the `id` field for consistency with Supabase and Enterstellar
         * conventions.
         *
         * @param resource - Collection name (AD3 dot-notation supported at v1 as literal).
         * @param params - Optional equality filters.
         */
        async query(
            resource: string,
            params?: Readonly<Record<string, unknown>>,
        ): Promise<readonly Record<string, unknown>[]> {
            const collectionRef = collection(firestore, resource);

            // Build query constraints from params
            const constraints = params
                ? Object.entries(params).map(([key, value]) => where(key, '==', value))
                : [];

            const queryRef = constraints.length > 0
                ? firestoreQuery(collectionRef, ...constraints)
                : collectionRef;

            const snapshot = await getDocs(queryRef);

            // Extract document data with injected `id` field
            return snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
            }));
        },

        /**
         * Maps to `addDoc` / `updateDoc` / `deleteDoc` based on action.
         *
         * - `'create'` → `addDoc(collection(...), data)` → returns `{ id, ...data }`
         * - `'update'` → `updateDoc(doc(..., data.id), data)` → returns updated data with `id`
         * - `'delete'` → `deleteDoc(doc(..., data.id))` → returns `null`
         *
         * For `'update'` and `'delete'`, the `data` payload MUST include an `id`
         * field identifying the Firestore document.
         *
         * @param resource - Collection name.
         * @param action - Mutation type: `'create'`, `'update'`, or `'delete'`.
         * @param data - Mutation payload. For update/delete, must include an `id` field.
         */
        async mutate(
            resource: string,
            action: 'create' | 'update' | 'delete',
            data: Readonly<Record<string, unknown>>,
        ): Promise<Record<string, unknown> | null> {
            if (action === 'create') {
                // Strip `id` from the payload — Firestore auto-generates document IDs
                const { id: _id, ...payload } = data;
                const docRef = await addDoc(collection(firestore, resource), payload);
                return { id: docRef.id, ...payload };
            }

            if (action === 'update') {
                const documentId = data['id'] as string;
                const docRef = doc(firestore, resource, documentId);

                // Strip `id` from the update payload — don't write it as a field
                const { id: _id, ...payload } = data;
                await updateDoc(docRef, payload);

                return { id: documentId, ...payload };
            }

            // action === 'delete'
            const documentId = data['id'] as string;
            const docRef = doc(firestore, resource, documentId);
            await deleteDoc(docRef);
            return null;
        },

        /**
         * Maps to `onSnapshot(collection(firestore, resource), snapshot => ...)`.
         *
         * Subscribes to Firestore realtime updates for the specified collection.
         * When documents change, the callback receives all documents in the
         * collection with `{ id, ...data() }` shape.
         *
         * Returns the Firestore `Unsubscribe` function directly — a 1:1 mapping
         * to Enterstellar's `subscribe()` return type.
         *
         * @param resource - Collection name to subscribe to.
         * @param callback - Called with the full set of documents after each change.
         */
        subscribe(
            resource: string,
            callback: (data: readonly Record<string, unknown>[]) => void,
        ): () => void {
            const collectionRef = collection(firestore, resource);

            // onSnapshot returns an Unsubscribe function — direct mapping
            return onSnapshot(collectionRef, (snapshot) => {
                const records = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                })) as readonly Record<string, unknown>[];

                callback(records);
            });
        },
    });
}
