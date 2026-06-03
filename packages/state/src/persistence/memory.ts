/**
 * @module @enterstellar-ai/state/persistence/memory
 * @description In-memory persistence adapter (ephemeral, no persistence).
 *
 * This is the default adapter when no persistence strategy is configured.
 * State exists only in the JavaScript heap during the current session
 * and is lost on page refresh, app restart, or `destroy()`.
 *
 * Use cases:
 * - Unit tests (fast, predictable, zero side effects).
 * - SSR environments (no browser APIs available).
 * - Development prototyping.
 *
 * @see Design Choice S5 — `'memory'` is the default persistence strategy.
 */

import type { SerializedState } from '@enterstellar-ai/types';
import type { PersistenceAdapter } from '../types.js';

// ---------------------------------------------------------------------------
// Memory Adapter
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory persistence adapter.
 *
 * No actual persistence — `load()` always returns `undefined`,
 * `save()` and `clear()` are silent no-ops.
 *
 * @returns A `PersistenceAdapter` with no-op persistence.
 *
 * @example
 * ```ts
 * const adapter = createMemoryAdapter();
 * await adapter.load();  // undefined
 * await adapter.save(state); // no-op
 * await adapter.clear();     // no-op
 * ```
 */
export function createMemoryAdapter(): PersistenceAdapter {
    return {
        load(): Promise<SerializedState | undefined> {
            return Promise.resolve(undefined);
        },

        save(_state: SerializedState): Promise<void> {
            // No-op: memory adapter does not persist state.
            return Promise.resolve();
        },

        clear(): Promise<void> {
            // No-op: nothing to clear.
            return Promise.resolve();
        },
    };
}
