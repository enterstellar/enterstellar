/**
 * @module @enterstellar-ai/state/types
 * @description Internal types for `@enterstellar-ai/state`.
 *
 * These types are used within the `@enterstellar-ai/state` package only.
 * Public types (`EnterstellarStore`, `SerializedState`, etc.) live in `@enterstellar-ai/types`.
 *
 * @see Design Choices S1–S15
 * @see Coding Rules — Naming Conventions
 */

import type {
    ZoneState,
    SessionState,
    SerializedState,
    PersistenceStrategy,
    SyncConfig,
    MigrationConfig,
} from '@enterstellar-ai/types';
import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Persistence Adapter Interface
// ---------------------------------------------------------------------------

/**
 * Interface for state persistence adapters.
 *
 * Each persistence strategy (`memory`, `local-storage`, `indexed-db`, `custom`)
 * implements this interface. The `encrypted` adapter wraps any adapter to add
 * AES-GCM encryption transparently.
 *
 * @see Design Choices S5–S7
 */
export interface PersistenceAdapter {
    /**
     * Loads persisted state from the storage backend.
     *
     * @returns The deserialized state, or `undefined` if no state is persisted.
     */
    load(): Promise<SerializedState | undefined>;

    /**
     * Saves the current state to the storage backend.
     *
     * @param state - The serialized state to persist.
     */
    save(state: SerializedState): Promise<void>;

    /**
     * Clears all persisted state from the storage backend.
     */
    clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Encryption Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for optional AES-GCM encryption at rest.
 *
 * When enabled, state is encrypted before being passed to the underlying
 * persistence adapter. Uses the Web Crypto API.
 *
 * @see Design Choice S7 — optional, configurable encryption.
 */
export type EncryptionConfig = {
    /** Whether encryption is enabled. */
    readonly enabled: boolean;

    /**
     * Async function that provides the `CryptoKey` for AES-GCM.
     * Called once during store initialization.
     *
     * The consumer is responsible for key management (derivation, storage, rotation).
     * Enterstellar does not store or manage encryption keys.
     */
    readonly keySource: () => Promise<CryptoKey>;
};

// ---------------------------------------------------------------------------
// Store Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for `createEnterstellarStore()`.
 *
 * All fields are optional with sensible defaults. The config follows
 * camelCase convention per T3.
 *
 * @example
 * ```ts
 * const store = createEnterstellarStore({
 *   persistence: 'indexed-db',
 *   maxTraces: 50,
 *   devMode: true,
 * });
 * ```
 *
 * @see Design Choices S1–S15
 */
export type EnterstellarStoreConfig = {
    /**
     * Persistence strategy. Determines where state is stored between sessions.
     *
     * - `'memory'` — Ephemeral, no persistence (default).
     * - `'local-storage'` — Browser `localStorage` via `JSON.stringify`.
     * - `'indexed-db'` — IndexedDB via `idb-keyval` (recommended for production).
     * - `'custom'` — Consumer-provided adapter via `customAdapter`.
     *
     * @see Design Choices S5–S6
     * @default 'memory'
     */
    readonly persistence?: PersistenceStrategy;

    /**
     * Custom persistence adapter. Required when `persistence` is `'custom'`.
     * Ignored for other persistence strategies.
     */
    readonly customAdapter?: PersistenceAdapter;

    /**
     * Optional AES-GCM encryption at rest.
     * When enabled, state is encrypted before persisting.
     *
     * @see Design Choice S7
     */
    readonly encryption?: EncryptionConfig;

    /**
     * Cross-device state synchronization configuration.
     * When `enabled: true`, state changes push to `endpoint`.
     *
     * @see Design Choices S9–S12
     */
    readonly sync?: SyncConfig;

    /**
     * Maximum number of trace IDs to retain before FIFO eviction.
     *
     * @see Design Choice S14
     * @default 100
     */
    readonly maxTraces?: number;

    /**
     * Whether to enable development-mode Zod validation on `get()`.
     * Production mode skips validation for zero runtime overhead.
     *
     * @see Design Choice S3
     * @default false
     */
    readonly devMode?: boolean;

    /**
     * Persistent conversation thread ID.
     * Passed from `<Provider threadId="...">`.
     * When `undefined`, Enterstellar operates in stateless mode.
     *
     * @see Appendix E P3
     */
    readonly threadId?: string;

    /**
     * Write-behind debounce interval in milliseconds.
     * Memory updates are immediate; persistence is debounced.
     *
     * @see Design Choice S8
     * @default 200
     */
    readonly debounceMs?: number;
};

// ---------------------------------------------------------------------------
// Internal State Shape
// ---------------------------------------------------------------------------

/**
 * Mutable internal state held within the `createEnterstellarStore()` closure.
 *
 * This is NOT the public `SerializedState` — it uses `Map` for O(1) lookups
 * and keeps mutable references for efficient updates. Converted to
 * `SerializedState` by `snapshot()` / `getSnapshot()`.
 *
 * @internal
 */
export type InternalState = {
    /** Zone state map, keyed by zone name. */
    zones: Map<string, ZoneState>;

    /** Trace ID history (most recent first). Capped at `maxTraces`. */
    traceIds: string[];

    /** Session metadata. */
    session: SessionState;

    /** Extension data, keyed by extension name. */
    extensions: Map<string, unknown>;
};

// ---------------------------------------------------------------------------
// Extension Registry
// ---------------------------------------------------------------------------

/**
 * Internal registry for extension schemas.
 * Maps extension name → Zod schema for validation.
 *
 * @internal
 */
export type ExtensionRegistry = Map<string, z.ZodType>;

// ---------------------------------------------------------------------------
// Migration Registry
// ---------------------------------------------------------------------------

/**
 * Internal registry for state migrations.
 * Maps `from` version → `MigrationConfig`.
 *
 * @internal
 */
export type MigrationRegistry = Map<string, MigrationConfig>;
