/**
 * @module @enterstellar-ai/state/create-store
 * @description `createEnterstellarStore()` — factory for creating an `EnterstellarStore`.
 *
 * The EnterstellarStore is the OS's memory: a framework-agnostic persistent state
 * container following the closure-based factory pattern established by
 * `createRegistry()` and `createCompiler()`.
 *
 * **Key behaviors:**
 * - **S1:** Single global store per app.
 * - **S2:** Fixed schema (`zones`, `traceIds`, `session`) + typed `extend()`.
 * - **S3:** Dev-mode Zod validation on `get()`.
 * - **S4:** Subscriptions fire only on actual value change (shallow equality).
 * - **S8:** Write-behind debounce (200ms default). Locked zones are write-through.
 * - **S9:** 1MB snapshot limit.
 * - **S10:** Full overwrite on `restore()`.
 * - **S14:** Trace FIFO eviction (default 100).
 *
 * @example
 * ```ts
 * import { createEnterstellarStore } from '@enterstellar-ai/state';
 *
 * const store = await createEnterstellarStore({
 *   persistence: 'indexed-db',
 *   maxTraces: 50,
 *   threadId: 'patient-123-consult',
 * });
 *
 * store.set('zones.sidebar', { ... });
 * store.subscribe(() => console.log('State changed'));
 * const snapshot = store.snapshot();
 * ```
 *
 * @see Design Choices S1–S15, P3
 * @see Bible §3.8
 */

import type {
    EnterstellarStore,
    SerializedState,
    ZoneState,
    SessionState,
    MigrationConfig,
} from '@enterstellar-ai/types';
import type { ZodType } from 'zod';
import { STATE_SCHEMA_VERSION } from './version.js';
import type {
    EnterstellarStoreConfig,
    InternalState,
    ExtensionRegistry,
    MigrationRegistry,
    PersistenceAdapter,
} from './types.js';
import { shallowEqual } from './equality.js';
import { createPersistenceAdapter } from './persistence/index.js';
import { createMigrationRegistry } from './migrations/index.js';
import { createSnapshot, createEmptyState, applyRestore } from './snapshot.js';
import {
    extensionAlreadyRegisteredError,
    extensionValidationError,
    invalidKeyError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default write-behind debounce interval in milliseconds (S8). */
const DEFAULT_DEBOUNCE_MS = 200;

/** Default maximum trace IDs before FIFO eviction (S14). */
const DEFAULT_MAX_TRACES = 100;

/**
 * Fixed top-level keys in the store schema.
 * These are always available without calling `extend()`.
 */
const FIXED_KEYS = new Set(['zones', 'traceIds', 'session']);

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Converts `InternalState` (Map-based) to `SerializedState` (Record-based).
 * This conversion is needed for `snapshot()`, `getSnapshot()`, and persistence.
 *
 * @param state - The internal mutable state.
 * @param schemaVersion - The current schema version string.
 * @returns A serializable `SerializedState`.
 * @internal
 */
function serializeState(state: InternalState, schemaVersion: string): SerializedState {
    const zones: Record<string, ZoneState> = {};
    for (const [name, zone] of state.zones) {
        zones[name] = zone;
    }

    const extensions: Record<string, unknown> = {};
    for (const [name, value] of state.extensions) {
        extensions[name] = value;
    }

    return {
        schemaVersion,
        zones,
        traceIds: [...state.traceIds],
        session: state.session,
        extensions,
    };
}

/**
 * Hydrates `InternalState` from a `SerializedState`.
 *
 * @param serialized - The serialized state to hydrate from.
 * @returns A mutable `InternalState`.
 * @internal
 */
function hydrateState(serialized: SerializedState): InternalState {
    const zones = new Map<string, ZoneState>();
    for (const [name, zone] of Object.entries(serialized.zones)) {
        zones.set(name, zone);
    }

    const extensions = new Map<string, unknown>();
    for (const [name, value] of Object.entries(serialized.extensions)) {
        extensions.set(name, value);
    }

    return {
        zones,
        traceIds: [...serialized.traceIds],
        session: serialized.session,
        extensions,
    };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarStore` — the framework-agnostic persistent state container.
 *
 * The returned store is a plain object (no class, no prototype) following
 * the closure-based factory pattern. Internal state is held in closure
 * variables and is not directly accessible.
 *
 * **Initialization sequence:**
 * 1. Create persistence adapter from config.
 * 2. Load persisted state (if available).
 * 3. Apply migrations if snapshot version differs.
 * 4. Hydrate internal state.
 * 5. Auto-register built-in migrations.
 * 6. Start write-behind debounce timer.
 *
 * @param config - Optional `EnterstellarStoreConfig`. Defaults to memory persistence.
 * @returns A promise that resolves to an `EnterstellarStore` instance.
 *
 * @see Design Choices S1–S15, P3
 */
export async function createEnterstellarStore(
    config: EnterstellarStoreConfig = {},
): Promise<EnterstellarStore> {
    // -----------------------------------------------------------------------
    // Configuration resolution
    // -----------------------------------------------------------------------
    const maxTraces = config.maxTraces ?? DEFAULT_MAX_TRACES;
    const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const devMode = config.devMode ?? false;

    // -----------------------------------------------------------------------
    // Persistence adapter initialization
    // -----------------------------------------------------------------------
    let adapter: PersistenceAdapter;
    try {
        adapter = await createPersistenceAdapter(config);
    } catch {
        // If adapter creation fails (e.g., encryption key failure),
        // fall back to memory adapter silently. The store's contract
        // is "always start" — persistence failure must never block init.
        // Telemetry integration (M0.5) will add structured logging.
        const { createMemoryAdapter } = await import('./persistence/memory.js');
        adapter = createMemoryAdapter();
    }

    // -----------------------------------------------------------------------
    // Migration registry
    // -----------------------------------------------------------------------
    const migrations: MigrationRegistry = createMigrationRegistry();

    // -----------------------------------------------------------------------
    // Load persisted state
    // -----------------------------------------------------------------------
    const defaultSession: SessionState = {
        id: globalThis.crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        ...(config.threadId !== undefined ? { threadId: config.threadId } : {}),
    };

    let internalState: InternalState;

    try {
        const persisted = await adapter.load();
        if (persisted !== undefined) {
            // Apply migrations if needed
            const restored = applyRestore(persisted, STATE_SCHEMA_VERSION, migrations);
            internalState = hydrateState(restored);

            // Preserve threadId from config if provided (P3)
            if (config.threadId !== undefined) {
                internalState.session = {
                    ...internalState.session,
                    threadId: config.threadId,
                };
            }
        } else {
            internalState = hydrateState(createEmptyState(defaultSession));
        }
    } catch {
        // Persistence load failed — start with empty state.
        internalState = hydrateState(createEmptyState(defaultSession));
    }

    // -----------------------------------------------------------------------
    // Extension schema registry
    // -----------------------------------------------------------------------
    const extensionSchemas: ExtensionRegistry = new Map();

    // -----------------------------------------------------------------------
    // Subscription management
    // -----------------------------------------------------------------------
    const subscribers = new Set<() => void>();

    /**
     * Notify all subscribers of a state change.
     * Called after every `set()` that results in an actual value change.
     */
    function notifySubscribers(): void {
        // Invalidate cached snapshot
        cachedSnapshot = null;

        for (const callback of subscribers) {
            try {
                callback();
            } catch {
                // Subscriber errors must not crash the store.
                // In production, these would be silently swallowed.
                // In dev mode, they'd ideally be logged to console.
            }
        }
    }

    // -----------------------------------------------------------------------
    // Write-behind persistence (S8)
    // -----------------------------------------------------------------------
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    /**
     * Schedules a debounced persist of the current state.
     * If `immediate` is true (for locked zones), persists immediately.
     *
     * @param immediate - Whether to skip debounce and persist immediately.
     */
    function schedulePersist(immediate: boolean): void {
        if (destroyed) return;

        if (immediate) {
            // Write-through for locked/compliance zones (determinism: 0.0)
            if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            void persistNow();
            return;
        }

        // Write-behind — debounce subsequent writes
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void persistNow();
        }, debounceMs);
    }

    /**
     * Persists the current state to the configured adapter.
     * Errors are caught and logged — persistence failures must not crash the store.
     */
    async function persistNow(): Promise<void> {
        if (destroyed) return;

        try {
            const serialized = serializeState(internalState, STATE_SCHEMA_VERSION);
            await adapter.save(serialized);
        } catch {
            // Persistence errors are recoverable (ENS-4005).
            // The store continues operating from memory.
            // Errors are silently swallowed here — the store's contract is
            // "never crash on persistence failure". Telemetry integration
            // (M0.5) will add structured logging for these events.
        }
    }

    // -----------------------------------------------------------------------
    // Snapshot cache for getSnapshot() (useSyncExternalStore)
    // -----------------------------------------------------------------------
    let cachedSnapshot: SerializedState | null = null;

    // -----------------------------------------------------------------------
    // Key resolution helpers
    // -----------------------------------------------------------------------

    /**
     * Resolves a store key to its value from internal state.
     *
     * @param key - The dot-separated key (e.g., `'zones'`, `'session'`, or extension name).
     * @returns The value, or `undefined` if not found.
     * @internal
     */
    function resolveKey(key: string): unknown {
        switch (key) {
            case 'zones': {
                // Convert Map to plain object for consumer access
                const result: Record<string, ZoneState> = {};
                for (const [name, zone] of internalState.zones) {
                    result[name] = zone;
                }
                return result;
            }
            case 'traceIds':
                return [...internalState.traceIds];
            case 'session':
                return internalState.session;
            default: {
                // Check extensions
                if (internalState.extensions.has(key)) {
                    return internalState.extensions.get(key);
                }
                return undefined;
            }
        }
    }

    /**
     * Checks if a key is valid (fixed schema key or registered extension).
     *
     * @param key - The key to check.
     * @returns `true` if the key is valid.
     * @internal
     */
    function isValidKey(key: string): boolean {
        return FIXED_KEYS.has(key) || extensionSchemas.has(key);
    }

    // -----------------------------------------------------------------------
    // EnterstellarStore implementation
    // -----------------------------------------------------------------------

    const store: EnterstellarStore = {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Deliberate: consumer-facing generic for type-safe reads (e.g., store.get<ZoneState>('zones'))
        get<T = unknown>(key: string): T | undefined {
            if (!isValidKey(key)) {
                throw invalidKeyError(key);
            }

            const value = resolveKey(key);

            // Dev-mode validation against registered schema (S3)
            if (devMode && extensionSchemas.has(key) && value !== undefined) {
                const schema = extensionSchemas.get(key);
                if (schema !== undefined) {
                    const result = schema.safeParse(value);
                    if (!result.success) {
                        // console.warn is intentional here — only reachable when
                        // devMode is explicitly enabled by the consumer. Production
                        // builds with devMode: false never execute this branch.
                        console.warn(
                            `[EnterstellarStore] Dev-mode validation failed for key "${key}":`,
                            result.error.message,
                        );
                    }
                }
            }

            return value as T | undefined;
        },

        set(key: string, value: unknown): void {
            if (destroyed) return;

            if (!isValidKey(key)) {
                throw invalidKeyError(key);
            }

            const previous = resolveKey(key);

            // Shallow equality check — skip update if unchanged (S4)
            if (shallowEqual(previous, value)) {
                return;
            }

            // Validate extension values against registered schema
            if (extensionSchemas.has(key)) {
                const schema = extensionSchemas.get(key);
                if (schema !== undefined) {
                    const result = schema.safeParse(value);
                    if (!result.success) {
                        throw extensionValidationError(key, result.error.message);
                    }
                }
            }

            // Apply the update — fixed keys are runtime-validated before casting
            // to prevent silent corruption (e.g., `store.set('zones', 42)`).
            switch (key) {
                case 'zones': {
                    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                        throw invalidKeyError(`zones (expected plain object, got ${typeof value})`);
                    }
                    internalState.zones = new Map(
                        Object.entries(value as Record<string, ZoneState>),
                    );
                    break;
                }
                case 'traceIds': {
                    if (!Array.isArray(value)) {
                        throw invalidKeyError(`traceIds (expected array, got ${typeof value})`);
                    }
                    const ids = value as string[];
                    // Enforce FIFO eviction (S14)
                    internalState.traceIds = ids.length > maxTraces
                        ? ids.slice(0, maxTraces)
                        : [...ids];
                    break;
                }
                case 'session': {
                    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                        throw invalidKeyError(`session (expected plain object, got ${typeof value})`);
                    }
                    internalState.session = value as SessionState;
                    break;
                }
                default: {
                    // Extension key — already Zod-validated above
                    internalState.extensions.set(key, value);
                    break;
                }
            }

            // Determine if any zone has determinism 0.0 (write-through per S8)
            let isWriteThrough = false;
            if (key === 'zones' || key.startsWith('zones.')) {
                for (const zone of internalState.zones.values()) {
                    if (zone.determinism === 0) {
                        isWriteThrough = true;
                        break;
                    }
                }
            }

            notifySubscribers();
            schedulePersist(isWriteThrough);
        },

        subscribe(callback: () => void): () => void {
            subscribers.add(callback);

            return () => {
                subscribers.delete(callback);
            };
        },

        extend(name: string, schema: ZodType): void {
            if (extensionSchemas.has(name)) {
                throw extensionAlreadyRegisteredError(name);
            }

            extensionSchemas.set(name, schema);

            // Initialize extension with undefined if not already set
            // (e.g., from a restored snapshot that included this extension)
            if (!internalState.extensions.has(name)) {
                // Don't set a default — the consumer must explicitly set() it.
                // But register the key so isValidKey() recognizes it.
            }
        },

        /**
         * Checks whether a named extension has been registered via `extend()`.
         * Returns `true` only for extension keys — fixed schema keys are excluded.
         *
         * @param name - Extension name to check.
         * @returns `true` if `extend(name, schema)` was previously called.
         *
         * @see Design Choice S2 — typed extension point.
         */
        hasExtension(name: string): boolean {
            return extensionSchemas.has(name);
        },

        snapshot(): SerializedState {
            const serialized = serializeState(internalState, STATE_SCHEMA_VERSION);
            return createSnapshot(serialized);
        },

        restore(state: SerializedState): void {
            const restored = applyRestore(state, STATE_SCHEMA_VERSION, migrations);
            internalState = hydrateState(restored);

            // Preserve threadId from config if provided (P3)
            if (config.threadId !== undefined) {
                internalState.session = {
                    ...internalState.session,
                    threadId: config.threadId,
                };
            }

            // Full overwrite — fire all subscriptions (S10)
            notifySubscribers();

            // Persist the restored state immediately
            schedulePersist(true);
        },

        registerMigration(migrationConfig: MigrationConfig): void {
            migrations.set(migrationConfig.from, migrationConfig);
        },

        getSnapshot(): SerializedState {
            cachedSnapshot ??= serializeState(internalState, STATE_SCHEMA_VERSION);
            return cachedSnapshot;
        },

        destroy(): void {
            destroyed = true;

            // Cancel any pending debounced persist
            if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }

            // Clear all subscriptions
            subscribers.clear();

            // Clear internal state
            internalState.zones.clear();
            internalState.traceIds.length = 0;
            internalState.extensions.clear();

            // Reset cached snapshot
            cachedSnapshot = null;
        },
    };

    return store;
}
