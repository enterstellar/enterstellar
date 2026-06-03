/**
 * @module @enterstellar-ai/state/persistence
 * @description Factory for creating persistence adapters from configuration.
 *
 * Routes `EnterstellarStoreConfig.persistence` → concrete `PersistenceAdapter`,
 * optionally wrapping with AES-GCM encryption when configured (S7).
 *
 * @see Design Choices S5–S7
 */

import type { EnterstellarStoreConfig, PersistenceAdapter } from '../types.js';
import { createMemoryAdapter } from './memory.js';
import { createLocalStorageAdapter } from './local-storage.js';
import { createIndexedDbAdapter } from './indexed-db.js';
import { createEncryptedAdapter } from './encrypted.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the appropriate persistence adapter based on store configuration.
 *
 * Strategy routing:
 * - `'memory'` (default) → {@link createMemoryAdapter}
 * - `'local-storage'` → {@link createLocalStorageAdapter}
 * - `'indexed-db'` → {@link createIndexedDbAdapter}
 * - `'custom'` → uses `config.customAdapter` (throws if missing)
 *
 * If `config.encryption.enabled` is `true`, the adapter is wrapped with
 * {@link createEncryptedAdapter} for transparent AES-GCM encryption.
 *
 * @param config - The store configuration.
 * @returns A `PersistenceAdapter` resolved from the configuration.
 *
 * @example
 * ```ts
 * const adapter = await createPersistenceAdapter({
 *   persistence: 'indexed-db',
 *   encryption: {
 *     enabled: true,
 *     keySource: () => deriveKey(password),
 *   },
 * });
 * ```
 */
export async function createPersistenceAdapter(
    config: EnterstellarStoreConfig,
): Promise<PersistenceAdapter> {
    const strategy = config.persistence ?? 'memory';

    // Resolve base adapter from strategy
    let adapter: PersistenceAdapter;

    switch (strategy) {
        case 'memory': {
            adapter = createMemoryAdapter();
            break;
        }
        case 'local-storage': {
            adapter = createLocalStorageAdapter();
            break;
        }
        case 'indexed-db': {
            adapter = createIndexedDbAdapter();
            break;
        }
        case 'custom': {
            if (config.customAdapter === undefined) {
                throw new Error(
                    '[EnterstellarStore] persistence: "custom" requires a customAdapter to be provided.',
                );
            }
            adapter = config.customAdapter;
            break;
        }
        default: {
            // Exhaustive check — all PersistenceStrategy variants are handled.
            // This will cause a compile error if a new variant is added to the union
            // without a corresponding case here.
            const _exhaustive: never = strategy;
            throw new Error(`[EnterstellarStore] Unknown persistence strategy: ${String(_exhaustive)}`);
        }
    }

    // Optionally wrap with encryption (S7)
    if (config.encryption?.enabled) {
        const key = await config.encryption.keySource();
        adapter = createEncryptedAdapter(adapter, key);
    }

    return adapter;
}
