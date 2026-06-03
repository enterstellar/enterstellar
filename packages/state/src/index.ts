/**
 * @module @enterstellar-ai/state
 * @description Framework-agnostic persistent state management for Enterstellar OS.
 *
 * The `@enterstellar-ai/state` package provides the `createEnterstellarStore()` factory
 * that implements the `EnterstellarStore` interface from `@enterstellar-ai/types`.
 *
 * Features:
 * - Pluggable persistence (memory, localStorage, IndexedDB, custom).
 * - Optional AES-GCM encryption at rest.
 * - Semver-based schema versioning with chained migrations.
 * - Write-behind debounce with write-through for locked zones.
 * - Shallow equality subscription change detection.
 * - Typed extension point via `store.extend()`.
 * - Snapshot/restore with 1MB size limit.
 *
 * @example
 * ```ts
 * import { createEnterstellarStore } from '@enterstellar-ai/state';
 *
 * const store = await createEnterstellarStore({
 *   persistence: 'indexed-db',
 *   maxTraces: 50,
 * });
 *
 * store.extend('preferences', preferencesSchema);
 * store.set('preferences', { theme: 'dark' });
 * store.subscribe(() => console.log('changed'));
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export { createEnterstellarStore } from './create-store.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export { STATE_SCHEMA_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Snapshot Utilities
// ---------------------------------------------------------------------------

export { createEmptyState } from './snapshot.js';

// ---------------------------------------------------------------------------
// Internal Types (for consumers who need config types)
// ---------------------------------------------------------------------------

export type { EnterstellarStoreConfig, PersistenceAdapter, EncryptionConfig } from './types.js';

// ---------------------------------------------------------------------------
// Re-exports from @enterstellar-ai/types (convenience)
// ---------------------------------------------------------------------------

export type {
    EnterstellarStore,
    SerializedState,
    ZoneState,
    SessionState,
    MigrationConfig,
    PersistenceStrategy,
    SyncConfig,
} from '@enterstellar-ai/types';
