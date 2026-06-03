/**
 * @module @enterstellar-ai/telemetry/queue/indexed-db-queue
 * @description IndexedDB-backed `SignalQueue` for browser persistence.
 *
 * Signals survive page refreshes and browser crashes, enabling
 * offline-first telemetry collection. Uses a dedicated database
 * (`enterstellar-telemetry`) that is completely isolated from `@enterstellar-ai/state`'s
 * `enterstellar-store` database (TL4).
 *
 * **No `idb-keyval` dependency.** This module wraps the raw IndexedDB
 * API in a thin utility. `idb-keyval` is reserved for `@enterstellar-ai/state` (S6).
 *
 * @see Design Choice TL4 — separate IndexedDB, DB name `enterstellar-telemetry`.
 */

import type { ForgeSignal } from '@enterstellar-ai/types';

import type { SignalQueue } from './signal-queue.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Database name — MUST be separate from `enterstellar-store` (TL4). */
const DB_NAME = 'enterstellar-telemetry';

/** Database version — bump only on schema changes. */
const DB_VERSION = 1;

/** Object store name within the database. */
const STORE_NAME = 'signals';

/** Index name for timestamp-based queries. */
const TIMESTAMP_INDEX = 'timestamp';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Opens (or creates) the `enterstellar-telemetry` IndexedDB database.
 *
 * On first open, creates the `signals` object store with an
 * auto-incrementing primary key and a `timestamp` index.
 *
 * @returns A promise resolving to the opened `IDBDatabase`.
 */
function openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            // Create the object store if it doesn't exist (first open or version bump).
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true,
                });

                // Timestamp index for ordered retrieval and potential future cleanup.
                store.createIndex(TIMESTAMP_INDEX, 'timestamp', { unique: false });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(
                new Error(
                    `[@enterstellar-ai/telemetry] Failed to open IndexedDB "${DB_NAME}": ${String(request.error?.message)}`,
                ),
            );
        };
    });
}

/**
 * Wraps an `IDBRequest` in a promise.
 *
 * @param request - The IndexedDB request to promisify.
 * @returns A promise resolving to the request result.
 */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error ?? new Error('[@enterstellar-ai/telemetry] IndexedDB request failed.'));
        };
    });
}

/**
 * Wraps an `IDBTransaction` completion in a promise.
 *
 * @param tx - The IndexedDB transaction to await.
 * @returns A promise that resolves when the transaction completes.
 */
function promisifyTransaction(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => {
            resolve();
        };
        tx.onerror = () => {
            reject(tx.error ?? new Error('[@enterstellar-ai/telemetry] IndexedDB transaction failed.'));
        };
        tx.onabort = () => {
            reject(tx.error ?? new Error('[@enterstellar-ai/telemetry] IndexedDB transaction aborted.'));
        };
    });
}

// ---------------------------------------------------------------------------
// IndexedDB Signal Record
// ---------------------------------------------------------------------------

/**
 * Internal record shape stored in IndexedDB.
 * Extends `ForgeSignal` with an auto-generated `id` primary key.
 */
type SignalRecord = ForgeSignal & {
    /** Auto-incremented primary key. */
    readonly id: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates an IndexedDB-backed {@link SignalQueue}.
 *
 * Signals persist across page refreshes and browser crashes.
 * The database is completely isolated from `@enterstellar-ai/state`'s `enterstellar-store`.
 *
 * **Prerequisites:** Must be called in an environment where `indexedDB`
 * is available (browser, Web Worker). Not available in Node.js or SSR —
 * use `createMemoryQueue()` for those environments.
 *
 * @returns A promise resolving to a new persistent `SignalQueue`.
 *
 * @example
 * ```ts
 * const queue = await createIndexedDBQueue();
 * await queue.enqueue(signal);
 * const batch = await queue.dequeue(10);
 * ```
 *
 * @see Design Choice TL4
 */
export async function createIndexedDBQueue(): Promise<SignalQueue> {
    const db = await openDatabase();

    return {
        async enqueue(signal: ForgeSignal): Promise<void> {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            store.add(signal);

            await promisifyTransaction(tx);
        },

        async dequeue(count: number): Promise<readonly ForgeSignal[]> {
            if (count <= 0) {
                return [];
            }

            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            // Open a cursor to read the first `count` records (FIFO via auto-increment key).
            const signals: ForgeSignal[] = [];

            return new Promise<readonly ForgeSignal[]>((resolve, reject) => {
                const cursorRequest = store.openCursor();

                cursorRequest.onsuccess = () => {
                    const cursor = cursorRequest.result;

                    if (cursor !== null && signals.length < count) {
                        const record = cursor.value as SignalRecord;

                        // Extract the ForgeSignal fields (strip the auto-generated `id`).
                        const { id: _id, ...signal } = record;
                        signals.push(signal);

                        // Delete the record from the store (dequeue = remove).
                        cursor.delete();
                        cursor.continue();
                    } else {
                        // Done — either no more records or reached `count`.
                        resolve(signals);
                    }
                };

                cursorRequest.onerror = () => {
                    reject(cursorRequest.error ?? new Error('[@enterstellar-ai/telemetry] IndexedDB cursor request failed.'));
                };
            });
        },

        async requeue(signals: readonly ForgeSignal[]): Promise<void> {
            if (signals.length === 0) {
                return;
            }

            // Re-add signals to the store. They get new auto-increment keys,
            // so they appear at the end. For IndexedDB, strict FIFO retry ordering
            // is approximated — the signals are re-persisted and will be picked up
            // on the next dequeue cycle. This is acceptable because the telemetry
            // pipeline is eventually-consistent by design (TL12).
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            for (const signal of signals) {
                store.add(signal);
            }

            await promisifyTransaction(tx);
        },

        async size(): Promise<number> {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);

            return promisifyRequest(store.count());
        },

        async clear(): Promise<void> {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            store.clear();

            await promisifyTransaction(tx);
        },

        close(): void {
            db.close();
        },
    };
}
