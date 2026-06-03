/**
 * @module @enterstellar-ai/types/state
 * @description EnterstellarStore — the framework-agnostic persistent state container.
 *
 * The EnterstellarStore is the "OS's memory." It holds zone state, trace history,
 * and session metadata. It is a pure TypeScript interface with zero
 * framework dependencies (L15).
 *
 * @see Bible §3.8
 * @see Design Choices S1–S15, T1, T5
 * @see Appendix E P3 (threadId)
 * @see Appendix D Ruling 3
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Nested Data Types
// ---------------------------------------------------------------------------

/**
 * State of a single zone within the store.
 * Auto-populated when an `Zone` mounts (S15).
 */
export type ZoneState = {
    /** Zone name. */
    readonly name: string;
    /** Current lifecycle state. */
    readonly lifecycleState: 'loading' | 'ready' | 'streaming' | 'error' | 'empty';
    /** Determinism level at mount time. */
    readonly determinism: number;
    /** Last compiled component name, if any. */
    readonly lastComponent?: string;
    /** ISO 8601 timestamp of the last update. */
    readonly lastUpdated: string;
};

/**
 * Session metadata within the store.
 * Ephemeral session data + optional persistent `threadId`.
 */
export type SessionState = {
    /** Ephemeral session ID generated on app mount. Lost on refresh. */
    readonly id: string;
    /**
     * Persistent conversation thread ID that survives across sessions.
     * Passed via `<Provider threadId="...">`.
     * When `undefined`, Enterstellar operates in stateless mode (no conversation resumption).
     *
     * @see Appendix E P3
     */
    readonly threadId?: string;
    /** ISO 8601 timestamp when the session started. */
    readonly startedAt: string;
};

/**
 * Serializable representation of the full store state.
 * Produced by `snapshot()`, consumed by `restore()`.
 */
export type SerializedState = {
    /** Semver string for schema versioning (e.g., `"1.0.0"`). */
    readonly schemaVersion: string;
    /** Zone state map, keyed by zone name. */
    readonly zones: Readonly<Record<string, ZoneState>>;
    /** Trace ID history (most recent first). */
    readonly traceIds: readonly string[];
    /** Session metadata. */
    readonly session: SessionState;
    /** Extension data from `store.extend()`. Keyed by extension name. */
    readonly extensions: Readonly<Record<string, unknown>>;
};

/**
 * Configuration for a store state migration.
 * Migrations chain sequentially from older versions to current.
 *
 * @see Design Choice S5 (amended v2)
 */
export type MigrationConfig = {
    /** Source schema version (semver). */
    readonly from: string;
    /** Target schema version (semver). */
    readonly to: string;
    /** Migration function that transforms the state. */
    readonly migrate: (state: SerializedState) => SerializedState;
};

/**
 * Persistence strategy for the store.
 * Determines where state is stored between sessions.
 *
 * @see Design Choices S5–S7
 */
export type PersistenceStrategy = 'memory' | 'local-storage' | 'indexed-db' | 'custom';

/**
 * Configuration for cross-device state sync.
 *
 * @see Design Choices S9–S12
 */
export type SyncConfig = {
    /** Whether sync is enabled. */
    readonly enabled: boolean;
    /** Endpoint URL for state synchronization. */
    readonly endpoint: string;
    /** Sync debounce interval in milliseconds. Default: 100ms. */
    readonly debounceMs: number;
};

// ---------------------------------------------------------------------------
// EnterstellarStore Interface
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic persistent state container — the OS's memory.
 *
 * This is an **interface** (not a type) because it has methods.
 * Implementations are provided by `@enterstellar-ai/state` (`createEnterstellarStore()`).
 * React binding is provided by `@enterstellar-ai/react` (`useEnterstellarStore()` hook via
 * `useSyncExternalStore`).
 *
 * @see Bible §3.8
 * @see Design Choice T1 — interfaces for objects with methods.
 * @see Design Choice S1 — single global store per app.
 */
export interface EnterstellarStore {
    /**
     * Gets a value from the store by key.
     * In development mode, validates against the registered Zod schema.
     *
     * @param key - The store key to read.
     * @returns The stored value, or `undefined` if not found.
     *
     * @see Design Choice S3
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Deliberate: consumer-facing generic for type-safe reads (e.g., store.get<ZoneState>('zones'))
    get<T = unknown>(key: string): T | undefined;

    /**
     * Sets a value in the store.
     * Updates memory immediately; persistence is write-behind (debounced, S8).
     * Fires subscriptions only on actual value change (shallow equality, S4).
     *
     * @param key - The store key to write.
     * @param value - The value to store.
     */
    set(key: string, value: unknown): void;

    /**
     * Subscribes to store changes.
     * Callback fires only on actual value change (shallow equality check, S4).
     *
     * @param callback - Called when any store value changes.
     * @returns An unsubscribe function.
     */
    subscribe(callback: () => void): () => void;

    /**
     * Extends the store with a named, schema-validated section.
     * Prevents untyped global state.
     *
     * The `schema` parameter is intentionally `z.ZodType` (unparameterized)
     * to allow consumers to register any valid Zod schema shape.
     *
     * @param name - Extension name (e.g., `'preferences'`).
     * @param schema - Zod schema for the extension's value shape.
     *
     * @see Design Choice S2
     */
    extend(name: string, schema: z.ZodType): void;

    /**
     * Checks whether a named extension has been registered via `extend()`.
     *
     * Use this to guard idempotent extension registration in components that
     * may mount multiple times (e.g., `Provider` re-renders). This method
     * returns `true` only for extension keys — fixed schema keys (`zones`,
     * `traceIds`, `session`) are NOT considered extensions and always return
     * `false`.
     *
     * @param name - Extension name to check (e.g., `'traces'`, `'preferences'`).
     * @returns `true` if `extend(name, schema)` was previously called for this name.
     *
     * @example
     * ```ts
     * if (!store.hasExtension('traces')) {
     *   store.extend('traces', z.array(ZoneTraceSchema));
     * }
     * ```
     *
     * @see Design Choice S2 — typed extension point.
     */
    hasExtension(name: string): boolean;

    /**
     * Serializes the entire store state for cross-device transfer.
     * Zone configs only — NOT render trees (S9, max 1MB).
     *
     * @returns A `SerializedState` snapshot with `schemaVersion`.
     * @throws {EnterstellarError} If state exceeds 1MB (ENS-4006).
     */
    snapshot(): SerializedState;

    /**
     * Restores state from a snapshot. Full overwrite, not merge (S10).
     * Applies chained migrations if snapshot version is older.
     * Hard-rejects major version forward jumps (ENS-4007).
     *
     * @param state - The serialized state to restore.
     * @throws {EnterstellarError} If major version is ahead (ENS-4007).
     *
     * @see Design Choice S5 (amended v2)
     */
    restore(state: SerializedState): void;

    /**
     * Registers a migration for handling older state snapshots.
     *
     * @param config - Migration config with `from`, `to`, and `migrate` function.
     */
    registerMigration(config: MigrationConfig): void;

    /**
     * Returns the full store snapshot for `useSyncExternalStore` compatibility.
     * React's `useSyncExternalStore` requires a `getSnapshot` function.
     */
    getSnapshot(): SerializedState;

    /**
     * Destroys the store, clearing all state and subscriptions.
     * Called when `Provider` unmounts.
     */
    destroy(): void;
}

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating `ZoneState` at runtime.
 *
 * @see Design Choice T7
 */
export const ZoneStateSchema = z.object({
    name: z.string().min(1),
    lifecycleState: z.enum(['loading', 'ready', 'streaming', 'error', 'empty']),
    determinism: z.number().min(0).max(1),
    lastComponent: z.string().optional(),
    lastUpdated: z.string().min(1),
});

/**
 * Zod schema for validating `SessionState` at runtime.
 *
 * @see Design Choice T7
 */
export const SessionStateSchema = z.object({
    id: z.string().min(1),
    threadId: z.string().optional(),
    startedAt: z.string().min(1),
});

/**
 * Zod schema for validating `SerializedState` at runtime.
 * Used by `restore()` to validate snapshots before applying.
 *
 * @see Design Choice T7, S5
 */
export const SerializedStateSchema = z.object({
    schemaVersion: z.string().min(1, 'Schema version is required.'),
    zones: z.record(z.string(), ZoneStateSchema),
    traceIds: z.array(z.string()),
    session: SessionStateSchema,
    extensions: z.record(z.string(), z.unknown()),
});
