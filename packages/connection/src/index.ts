/**
 * @module @enterstellar-ai/connection
 * @description Transport convenience layer for Enterstellar agent connections.
 *
 * Provides `createAgentConnection()` — the default implementation of the
 * `EnterstellarAgentConnection` interface from `@enterstellar-ai/types`. Manages 3-tier
 * transport selection (WebSocket → SSE → polling), automatic reconnect with
 * exponential backoff, and inbound intent backpressure.
 *
 * Also provides `createStoreSyncRuntime()` — the cross-device state sync
 * wiring that connects an `EnterstellarStore` to a remote sync endpoint (S11).
 *
 * This package is a **convenience factory** (Design Choice P11). Consumers
 * who need full control over transport can implement `EnterstellarAgentConnection`
 * directly (RE3).
 *
 * @example
 * ```ts
 * import { createAgentConnection } from '@enterstellar-ai/connection';
 *
 * const connection = createAgentConnection({
 *   url: 'wss://agent.example.com/ws',
 * });
 *
 * connection.on('intent', (intent) => {
 *   console.log('Received intent:', intent);
 * });
 *
 * await connection.disconnect();
 * ```
 *
 * @see Bible §4.3b
 * @see Design Choices P5, P11, P12, S11, RE3
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Public API — Agent Connection Factory
// ---------------------------------------------------------------------------

export { createAgentConnection } from './factory.js';

// ---------------------------------------------------------------------------
// Public API — Store Sync Runtime
// ---------------------------------------------------------------------------

export { createStoreSyncRuntime } from './store-sync.js';
export type { StoreSyncRuntime } from './store-sync.js';

// ---------------------------------------------------------------------------
// Public API — Type Re-exports from @enterstellar-ai/types
//
// These re-exports provide consumer convenience: import everything needed
// for agent connections from a single package. The canonical definitions
// remain in @enterstellar-ai/types.
// ---------------------------------------------------------------------------

export type {
    EnterstellarAgentConnection,
    UserSignal,
    UserSignalType,
    AgentEventType,
    SyncConfig,
} from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Public API — Configuration Types
//
// Exported so consumers can type their config objects when building
// dynamic connection configurations.
// ---------------------------------------------------------------------------

export type {
    ConnectionInput,
    TransportType,
    BackpressureConfig,
    ReconnectConfig,
    DropStrategy,
} from './types.js';
