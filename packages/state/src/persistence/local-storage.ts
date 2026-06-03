/**
 * @module @enterstellar-ai/state/persistence/local-storage
 * @description `localStorage` persistence adapter.
 *
 * Stores serialized state as a JSON string under the key `enterstellar-store`.
 * Uses `JSON.stringify` / `JSON.parse` — no `superjson`, no Dates/Maps/Sets
 * in the state schema (S5 amended v2).
 *
 * Handles edge cases:
 * - `localStorage` unavailable (SSR, privacy mode) → returns `undefined`.
 * - `QuotaExceededError` → wraps in `ENS-4005` persistence error.
 * - Corrupted JSON → returns `undefined` (treated as no persisted state).
 *
 * @see Design Choice S5 — `JSON.stringify` serialization.
 * @see Design Choice S6 — `localStorage` for web persistence.
 */

import type { SerializedState } from '@enterstellar-ai/types';
import { SerializedStateSchema } from '@enterstellar-ai/types';
import type { PersistenceAdapter } from '../types.js';
import { persistenceError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for EnterstellarStore state. */
const STORAGE_KEY = 'enterstellar-store';

// ---------------------------------------------------------------------------
// Availability Check
// ---------------------------------------------------------------------------

/**
 * Tests whether `localStorage` is available and writable.
 * Returns `false` in SSR, privacy mode, or when storage is full.
 *
 * @returns `true` if `localStorage` is available.
 */
function isLocalStorageAvailable(): boolean {
    try {
        const testKey = '__enterstellar_ls_test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// localStorage Adapter
// ---------------------------------------------------------------------------

/**
 * Creates a `localStorage` persistence adapter.
 *
 * State is serialized via `JSON.stringify` and stored under the
 * `enterstellar-store` key. On load, the JSON is parsed and validated
 * against `SerializedStateSchema`.
 *
 * @returns A `PersistenceAdapter` backed by `localStorage`.
 *
 * @example
 * ```ts
 * const adapter = createLocalStorageAdapter();
 * await adapter.save(state); // Writes to localStorage['enterstellar-store']
 * const restored = await adapter.load(); // Reads + validates
 * ```
 */
export function createLocalStorageAdapter(): PersistenceAdapter {
    return {
        load(): Promise<SerializedState | undefined> {
            if (!isLocalStorageAvailable()) {
                return Promise.resolve(undefined);
            }

            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw === null) {
                    return Promise.resolve(undefined);
                }

                const parsed: unknown = JSON.parse(raw);
                const result = SerializedStateSchema.safeParse(parsed);
                if (result.success) {
                    return Promise.resolve(result.data as SerializedState);
                }

                // Corrupted or incompatible data — treat as no persisted state.
                // Don't throw — the store will initialize with empty state.
                return Promise.resolve(undefined);
            } catch {
                // JSON.parse failure or unexpected error — treat as no persisted state.
                return Promise.resolve(undefined);
            }
        },

        save(state: SerializedState): Promise<void> {
            if (!isLocalStorageAvailable()) {
                return Promise.resolve();
            }

            try {
                const serialized = JSON.stringify(state);
                localStorage.setItem(STORAGE_KEY, serialized);
                return Promise.resolve();
            } catch (error: unknown) {
                // QuotaExceededError or other write failure
                throw persistenceError('local-storage', error);
            }
        },

        clear(): Promise<void> {
            if (!isLocalStorageAvailable()) {
                return Promise.resolve();
            }

            try {
                localStorage.removeItem(STORAGE_KEY);
                return Promise.resolve();
            } catch (error: unknown) {
                throw persistenceError('local-storage', error);
            }
        },
    };
}
