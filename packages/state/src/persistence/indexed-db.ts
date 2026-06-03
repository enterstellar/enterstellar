/**
 * @module @enterstellar-ai/state/persistence/indexed-db
 * @description IndexedDB persistence adapter via `idb-keyval`.
 *
 * Stores serialized state in an IndexedDB database named `enterstellar-store`.
 * Uses the `idb-keyval` library (~600B) for a clean `get`/`set`/`del` API
 * over the raw IndexedDB API.
 *
 * **Critical isolation rule (S6):**
 * The `enterstellar-store` DB is for EnterstellarStore state ONLY. Telemetry signals
 * use a separate `enterstellar-telemetry` DB. Clearing or restoring `enterstellar-store`
 * MUST NOT affect the telemetry signal queue.
 *
 * @see Design Choice S6 — `idb-keyval`, DB name `enterstellar-store`.
 */

import type { SerializedState } from '@enterstellar-ai/types';
import { SerializedStateSchema } from '@enterstellar-ai/types';
import { createStore, get, set, del } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { PersistenceAdapter } from '../types.js';
import { persistenceError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * IndexedDB database name for EnterstellarStore state.
 * MUST be different from `enterstellar-telemetry` (TL4).
 */
const DB_NAME = 'enterstellar-store';

/** IndexedDB object store name. */
const STORE_NAME = 'state';

/** Key under which the serialized state is stored. */
const STATE_KEY = 'current';

// ---------------------------------------------------------------------------
// IndexedDB Adapter
// ---------------------------------------------------------------------------

/**
 * Creates an IndexedDB persistence adapter via `idb-keyval`.
 *
 * State is stored as a single JSON-serializable object under the
 * key `current` in the `state` object store of the `enterstellar-store` database.
 *
 * On load, the data is validated against `SerializedStateSchema`.
 * Corrupted or incompatible data is silently discarded (returns `undefined`).
 *
 * @param customStore - Optional `idb-keyval` store to use instead of the default.
 *   Exposed for testing with `fake-indexeddb`. Production code should NOT pass this.
 * @returns A `PersistenceAdapter` backed by IndexedDB.
 *
 * @example
 * ```ts
 * const adapter = createIndexedDbAdapter();
 * await adapter.save(state); // Writes to IndexedDB 'enterstellar-store'
 * const restored = await adapter.load(); // Reads + validates
 * ```
 */
export function createIndexedDbAdapter(customStore?: UseStore): PersistenceAdapter {
    // Create a dedicated idb-keyval store instance bound to our DB + object store.
    // This ensures complete isolation from other IndexedDB databases.
    const idbStore: UseStore = customStore ?? createStore(DB_NAME, STORE_NAME);

    return {
        async load(): Promise<SerializedState | undefined> {
            try {
                const raw: unknown = await get(STATE_KEY, idbStore);
                if (raw === undefined) {
                    return undefined;
                }

                const result = SerializedStateSchema.safeParse(raw);
                if (result.success) {
                    return result.data as SerializedState;
                }

                // Corrupted or incompatible data — treat as no persisted state.
                return undefined;
            } catch (error: unknown) {
                // IndexedDB failure (e.g., browser in private mode with IDB disabled).
                // Log and return undefined — store will initialize with empty state.
                throw persistenceError('indexed-db', error);
            }
        },

        async save(state: SerializedState): Promise<void> {
            try {
                await set(STATE_KEY, state, idbStore);
            } catch (error: unknown) {
                throw persistenceError('indexed-db', error);
            }
        },

        async clear(): Promise<void> {
            try {
                await del(STATE_KEY, idbStore);
            } catch (error: unknown) {
                throw persistenceError('indexed-db', error);
            }
        },
    };
}
