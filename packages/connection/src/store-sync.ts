/**
 * @module @enterstellar-ai/connection/store-sync
 * @description Runtime wiring for cross-device `EnterstellarStore` synchronization.
 *
 * This module implements the sync layer deferred from `@enterstellar-ai/state` (M0.4):
 * the `createEnterstellarStore()` factory accepts `SyncConfig` in its config, but
 * the actual push/pull sync loop lives here — where transport infrastructure
 * (WebSocket, SSE, polling) exists.
 *
 * **Protocol (S11):**
 * 1. Initial state fetch: `GET {syncConfig.endpoint}` → `store.restore()`.
 * 2. Outbound push: on store change → debounced `POST {endpoint}` with `store.snapshot()`.
 * 3. Inbound pull: subscribe to transport messages → `store.restore()` on received state.
 *
 * The sync endpoint is a REST API for initial fetch; WebSocket/SSE for
 * incremental updates (per S11 locked decision). Auto transport selection
 * uses the same 3-tier fallback: WS → SSE → polling.
 *
 * **Feedback loop prevention:** When an inbound snapshot triggers `store.restore()`,
 * the resulting `store.subscribe()` callback is suppressed to prevent
 * re-pushing the same state back to the server.
 *
 * @see Design Choices S9–S12 (cross-device sync)
 * @see Design Choice S10 (restore = full overwrite)
 * @see Design Choice S11 (3-tier transport, REST initial, WS/SSE incremental)
 * @see L15 — Zero framework imports
 */

import type { EnterstellarStore, SyncConfig, SerializedState } from '@enterstellar-ai/types';
import { EnterstellarError, SerializedStateSchema } from '@enterstellar-ai/types';

import type { Transport } from './transports/transport.js';
import { createWebSocketTransport } from './transports/websocket-transport.js';
import { createSSETransport } from './transports/sse-transport.js';
import { createPollingTransport } from './transports/polling-transport.js';
import {
    AUTO_WS_TIMEOUT_MS,
    POLLING_INTERVAL_MS,
} from './types.js';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/**
 * Return type of `createStoreSyncRuntime()`.
 *
 * Provides a `destroy()` method to tear down the sync loop, and a
 * `connected` getter for observability.
 */
export type StoreSyncRuntime = {
    /** Whether the sync transport is currently connected. */
    readonly connected: boolean;

    /**
     * Tears down the sync runtime: disconnects the transport, unsubscribes
     * from store changes, and cancels any pending debounce timers.
     */
    readonly destroy: () => void;
};

// ---------------------------------------------------------------------------
// Internal: Transport Creation
// ---------------------------------------------------------------------------

/**
 * Creates a transport to the sync endpoint using 3-tier auto fallback.
 * The sync endpoint URL may be HTTP(S) or WS(S).
 */
async function createSyncTransport(endpoint: string): Promise<Transport> {
    // Tier 1: WebSocket (1s timeout).
    try {
        const ws = createWebSocketTransport(endpoint, AUTO_WS_TIMEOUT_MS);
        await ws.connect();
        return ws;
    } catch {
        // Tier 2: SSE.
        try {
            const sse = createSSETransport(endpoint);
            await sse.connect();
            return sse;
        } catch {
            // Tier 3: Polling (30s interval).
            const poll = createPollingTransport(endpoint, POLLING_INTERVAL_MS);
            await poll.connect();
            return poll;
        }
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a sync runtime that wires an `EnterstellarStore` to a remote sync endpoint.
 *
 * **Lifecycle:**
 * 1. Fetches initial state from `syncConfig.endpoint` via REST GET.
 * 2. Opens a transport connection for incremental updates.
 * 3. On store change → debounced POST to `syncConfig.endpoint`.
 * 4. On inbound message → `store.restore()` (full overwrite per S10).
 *
 * **Feedback loop prevention:** Inbound restores set a flag that suppresses
 * the next outbound push, preventing ping-pong.
 *
 * @param store - The `EnterstellarStore` instance to synchronize.
 * @param syncConfig - The `SyncConfig` from the store's configuration.
 * @returns A `StoreSyncRuntime` with `connected` and `destroy()`.
 *
 * @throws {EnterstellarError} `ENS-3003` if the sync endpoint is unreachable.
 *
 * @example
 * ```ts
 * import { createStoreSyncRuntime } from '@enterstellar-ai/connection';
 * import { createEnterstellarStore } from '@enterstellar-ai/state';
 *
 * const store = createEnterstellarStore({
 *   persistence: 'indexed-db',
 *   sync: { enabled: true, endpoint: 'https://sync.example.com/state', debounceMs: 100 },
 * });
 *
 * const syncRuntime = await createStoreSyncRuntime(store, store.config.sync!);
 * // Store is now synchronized — changes push/pull automatically.
 *
 * // On app teardown:
 * syncRuntime.destroy();
 * ```
 */
export async function createStoreSyncRuntime(
    store: EnterstellarStore,
    syncConfig: SyncConfig,
): Promise<StoreSyncRuntime> {
    // 1. Validate config.
    if (!syncConfig.enabled) {
        throw new EnterstellarError(
            'ENS-3001',
            'connection',
            'Cannot create sync runtime: sync is not enabled in SyncConfig.',
            false,
        );
    }

    if (syncConfig.endpoint.length === 0) {
        throw new EnterstellarError(
            'ENS-3001',
            'connection',
            'Cannot create sync runtime: sync endpoint URL is empty.',
            false,
        );
    }

    // 2. Fetch initial state via REST GET.
    try {
        const response = await fetch(syncConfig.endpoint);
        if (response.ok) {
            const body: unknown = (await response.json()) as unknown;
            // Validate against SerializedStateSchema before restoring.
            // Cast via `as SerializedState` post-safeParse to reconcile
            // Zod-inferred optional types with `exactOptionalPropertyTypes`.
            // (Established pattern: see @enterstellar-ai/state/snapshot.ts lines 242, 256.)
            const parsed = SerializedStateSchema.safeParse(body);
            if (parsed.success) {
                store.restore(parsed.data as SerializedState);
            }
            // Invalid shape is silently ignored — the store starts with
            // its current local state and syncs when valid data arrives.
        }
        // Non-OK responses on initial fetch are non-fatal — the store
        // starts with its current local state and syncs when possible.
    } catch {
        // Initial fetch failure is non-fatal — local state is authoritative
        // until a sync connection is established.
    }

    // 3. Open transport for incremental updates.
    const transport = await createSyncTransport(syncConfig.endpoint);

    // 4. Feedback loop guard.
    let isRestoringFromRemote = false;

    // 5. Inbound: on transport message → validate and restore store.
    transport.onMessage((data: unknown) => {
        // Validate inbound data against SerializedStateSchema.
        // Cast via `as SerializedState` post-safeParse to reconcile
        // Zod-inferred optional types with `exactOptionalPropertyTypes`.
        const parsed = SerializedStateSchema.safeParse(data);
        if (parsed.success) {
            isRestoringFromRemote = true;
            try {
                store.restore(parsed.data as SerializedState);
            } finally {
                // Reset after restore to allow the store.subscribe()
                // callback to fire (and be suppressed) synchronously.
                isRestoringFromRemote = false;
            }
        }
        // Invalid messages are silently ignored — only validated state
        // snapshots trigger restores.
    });

    // 6. Outbound: on store change → debounced POST.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = store.subscribe(() => {
        // Suppress pushes caused by inbound restores.
        if (isRestoringFromRemote) {
            return;
        }

        // Debounce outbound pushes.
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            debounceTimer = null;

            const snapshot = store.snapshot();

            // Fire-and-forget POST — errors are logged, not thrown.
            void fetch(syncConfig.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshot),
            }).catch((error: unknown) => {
                console.error(
                    '[@enterstellar-ai/connection] Sync push failed:',
                    error,
                );
            });
        }, syncConfig.debounceMs);
    });

    // 7. Handle transport close — could log or attempt reconnect.
    transport.onClose(() => {
        console.warn(
            '[@enterstellar-ai/connection] Sync transport disconnected. State changes will accumulate locally.',
        );
    });

    // 8. Build runtime.
    const runtime: StoreSyncRuntime = {
        get connected(): boolean {
            return transport.connected;
        },

        destroy(): void {
            // Unsubscribe from store changes.
            unsubscribe();

            // Clear debounce timer.
            if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }

            // Disconnect transport.
            transport.disconnect();
        },
    };

    return runtime;
}
