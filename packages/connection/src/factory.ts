/**
 * @module @enterstellar-ai/connection/factory
 * @description Core factory: `createAgentConnection()`.
 *
 * Orchestrates transport creation, reconnect scheduling, backpressure,
 * event routing, and dispatch into a single `EnterstellarAgentConnection` object.
 *
 * The returned object is a frozen plain object with closures (R1) —
 * NOT a class instance. It implements the `EnterstellarAgentConnection` interface
 * from `@enterstellar-ai/types`.
 *
 * @see Bible §4.3b
 * @see Design Choices R1, P1, P5, P7, P11, P12, S11, RE3
 */

import type {
    EnterstellarAgentConnection,
    AgentEventType,
    UserSignal,
    ComponentIntent,
} from '@enterstellar-ai/types';
import { EnterstellarError, UserSignalSchema } from '@enterstellar-ai/types';

import { createEventEmitter } from './event-emitter.js';
import { createReconnectScheduler } from './reconnect.js';
import { createIntentBuffer } from './backpressure.js';
import type { Transport } from './transports/transport.js';
import { createWebSocketTransport } from './transports/websocket-transport.js';
import { createSSETransport } from './transports/sse-transport.js';
import { createPollingTransport } from './transports/polling-transport.js';
import {
    backpressureDropWarning,
    configValidationError,
} from './errors.js';
import type { ConnectionInput } from './types.js';
import {
    ConnectionInputSchema,
    BACKPRESSURE_DEFAULTS,
    RECONNECT_DEFAULTS,
    TRANSPORT_DEFAULT,
    AUTO_WS_TIMEOUT_MS,
    POLLING_INTERVAL_MS,
} from './types.js';

// ---------------------------------------------------------------------------
// Agent Event Map
// ---------------------------------------------------------------------------

/**
 * Maps `AgentEventType` to the payload type for each event channel.
 * Used to type the internal event emitter.
 */
type AgentEventMap = {
    intent: ComponentIntent;
    lifecycle: 'loading' | 'ready' | 'error';
    data: Readonly<Record<string, unknown>>;
    message: string;
    reconnect: undefined;
    raw: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates and resolves the user-provided config against defaults.
 *
 * @throws {EnterstellarError} `ENS-3001` if config is invalid (developer error, fatal).
 */
function resolveConfig(input: ConnectionInput): {
    url: string;
    transport: 'websocket' | 'sse' | 'polling' | 'auto';
    backpressure: { maxBuffer: number; dropStrategy: 'oldest' | 'newest' };
    reconnect: { maxDelay: number };
} {
    const parsed = ConnectionInputSchema.safeParse(input);
    if (!parsed.success) {
        throw configValidationError(
            `Invalid connection config: ${parsed.error.message}`,
            parsed.error,
        );
    }

    return {
        url: parsed.data.url,
        transport: parsed.data.transport ?? TRANSPORT_DEFAULT,
        backpressure: {
            maxBuffer: parsed.data.backpressure?.maxBuffer ?? BACKPRESSURE_DEFAULTS.maxBuffer,
            dropStrategy: parsed.data.backpressure?.dropStrategy ?? BACKPRESSURE_DEFAULTS.dropStrategy,
        },
        reconnect: {
            maxDelay: parsed.data.reconnect?.maxDelay ?? RECONNECT_DEFAULTS.maxDelay,
        },
    };
}

/**
 * Classifies a raw inbound message into an `AgentEventType`.
 *
 * The agent sends messages with a `type` field that maps to one of the
 * whitelisted event types (P7). Unknown types are ignored (not surfaced).
 *
 * Expected message shape: `{ type: AgentEventType, payload: unknown }`.
 */
function classifyEvent(
    data: unknown,
): { event: AgentEventType; payload: unknown } | null {
    if (typeof data !== 'object' || data === null) {
        return null;
    }

    // Safe property access under `noUncheckedIndexedAccess`.
    const record = data as Readonly<Record<string, unknown>>;
    const type = record['type'];

    if (typeof type !== 'string') {
        return null;
    }

    // Whitelist check (P7).
    const whitelist: readonly AgentEventType[] = [
        'intent',
        'lifecycle',
        'data',
        'message',
        'reconnect',
    ] as const;

    if (!whitelist.includes(type as AgentEventType)) {
        return null;
    }

    return {
        event: type as AgentEventType,
        payload: record['payload'],
    };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarAgentConnection` — the default transport-managed
 * implementation for bidirectional agent communication.
 *
 * This is a **convenience factory** (P11). Consumers who need full control
 * over transport can implement `EnterstellarAgentConnection` directly (RE3).
 *
 * @param input - Connection configuration. Only `url` is required.
 * @returns A frozen `EnterstellarAgentConnection` with managed transport, reconnect,
 *          backpressure, and event routing.
 *
 * @throws {EnterstellarError} `ENS-3001` if config is invalid (developer error).
 *
 * @example
 * ```ts
 * import { createAgentConnection } from '@enterstellar-ai/connection';
 *
 * const connection = createAgentConnection({
 *   url: 'wss://agent.example.com/ws',
 *   transport: 'auto', // default
 *   backpressure: { maxBuffer: 50, dropStrategy: 'oldest' },
 *   reconnect: { maxDelay: 30_000 },
 * });
 *
 * // Subscribe to events
 * const unsub = connection.on('intent', (intent) => {
 *   console.log('Received intent:', intent);
 * });
 *
 * // Dispatch user signals
 * await connection.dispatch({
 *   type: 'click',
 *   zone: 'main-dashboard',
 *   component: 'PatientVitals',
 *   payload: { action: 'refresh' },
 *   timestamp: new Date().toISOString(),
 * });
 *
 * // Cleanup
 * unsub();
 * await connection.disconnect();
 * ```
 */
export function createAgentConnection(
    input: ConnectionInput,
): EnterstellarAgentConnection {
    // 1. Validate and resolve defaults.
    const config = resolveConfig(input);

    // 2. Create internal components.
    const emitter = createEventEmitter<AgentEventMap>();
    const scheduler = createReconnectScheduler(config.reconnect);
    const buffer = createIntentBuffer(config.backpressure);

    // 3. Transport state.
    let transport: Transport | null = null;
    let isConnected = false;
    let isDisconnecting = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // -----------------------------------------------------------------------
    // Transport Wiring
    // -----------------------------------------------------------------------

    /**
     * Wires a transport's event handlers to the internal event emitter
     * and backpressure buffer.
     */
    function wireTransport(t: Transport): void {
        t.onMessage((data: unknown) => {
            // Always emit on the raw channel for `onRawEvent()` escape hatch.
            emitter.emit('raw', data);

            // Classify into whitelisted event type.
            const classified = classifyEvent(data);
            if (classified === null) {
                return; // Unknown event type — silently ignore (P7).
            }

            // Intent events go through the backpressure buffer.
            if (classified.event === 'intent') {
                const intent = classified.payload as ComponentIntent;
                const result = buffer.push(intent);

                if (result.dropped !== null) {
                    // Log ENS-3010 warning. Emit on error handlers for trace capture.
                    const warning = backpressureDropWarning(result.dropped.component);
                    console.warn(`[@enterstellar-ai/connection] ${warning.message}`);
                }

                if (result.bypassed) {
                    // Actionable intent — emit immediately without buffering.
                    emitter.emit('intent', intent);
                } else if (result.dropped !== intent) {
                    // Intent was buffered (or an older one was dropped to make room).
                    emitter.emit('intent', intent);
                }
                // If result.dropped === intent (newest strategy), the intent was
                // rejected — do NOT emit it.
                return;
            }

            // Non-intent events: emit directly on the typed channel.
            switch (classified.event) {
                case 'lifecycle': {
                    emitter.emit('lifecycle', classified.payload as 'loading' | 'ready' | 'error');
                    break;
                }
                case 'data': {
                    emitter.emit('data', classified.payload as Readonly<Record<string, unknown>>);
                    break;
                }
                case 'message': {
                    emitter.emit('message', classified.payload as string);
                    break;
                }
                case 'reconnect': {
                    emitter.emit('reconnect', undefined);
                    break;
                }
                default: {
                    // Exhaustive check — TS will error if a case is missing.
                    const _exhaustive: never = classified.event;
                    void _exhaustive;
                }
            }
        });

        t.onClose(() => {
            if (isDisconnecting) {
                return; // Intentional teardown — do not reconnect.
            }

            isConnected = false;
            scheduleReconnect();
        });

        t.onError((error: unknown) => {
            // Transport errors are non-fatal — log and continue.
            console.error('[@enterstellar-ai/connection] Transport error:', error);
        });
    }

    // -----------------------------------------------------------------------
    // Transport Creation
    // -----------------------------------------------------------------------

    /**
     * Creates the appropriate transport based on the configured strategy.
     * For `'auto'`, tries WebSocket first (1s timeout), then SSE, then polling (S11).
     */
    async function createTransport(): Promise<Transport> {
        if (config.transport === 'websocket') {
            const ws = createWebSocketTransport(config.url);
            wireTransport(ws);
            await ws.connect();
            return ws;
        }

        if (config.transport === 'sse') {
            const sse = createSSETransport(config.url);
            wireTransport(sse);
            await sse.connect();
            return sse;
        }

        if (config.transport === 'polling') {
            const poll = createPollingTransport(config.url, POLLING_INTERVAL_MS);
            wireTransport(poll);
            await poll.connect();
            return poll;
        }

        // 'auto' mode: 3-tier fallback — WebSocket (1s timeout) → SSE → polling.
        try {
            const ws = createWebSocketTransport(config.url, AUTO_WS_TIMEOUT_MS);
            wireTransport(ws);
            await ws.connect();
            return ws;
        } catch {
            // WebSocket failed — try SSE.
            try {
                const sse = createSSETransport(config.url);
                wireTransport(sse);
                await sse.connect();
                return sse;
            } catch {
                // SSE failed — last resort: polling (30s interval).
                const poll = createPollingTransport(config.url, POLLING_INTERVAL_MS);
                wireTransport(poll);
                await poll.connect();
                return poll;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Reconnect Logic
    // -----------------------------------------------------------------------

    /**
     * Schedules a reconnect attempt using exponential backoff.
     * On success: resets the scheduler and emits `'reconnect'`.
     * On failure: schedules the next attempt.
     */
    function scheduleReconnect(): void {
        if (isDisconnecting) {
            return;
        }

        const delay = scheduler.nextDelay();
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;

            void (async (): Promise<void> => {
                try {
                    transport = await createTransport();
                    isConnected = true;
                    scheduler.reset();
                    emitter.emit('reconnect', undefined);
                } catch {
                    // Reconnect failed — try again.
                    if (!isDisconnecting) {
                        scheduleReconnect();
                    }
                }
            })();
        }, delay);
    }

    // -----------------------------------------------------------------------
    // Initial Connection
    // -----------------------------------------------------------------------

    // Start the connection asynchronously. The factory returns immediately;
    // the connection establishes in the background. Consumers subscribe to
    // events before the connection is ready — handlers queue up safely.
    void (async (): Promise<void> => {
        try {
            transport = await createTransport();
            isConnected = true;
        } catch {
            // Initial connection failed — enter reconnect loop.
            scheduleReconnect();
        }
    })();

    // -----------------------------------------------------------------------
    // EnterstellarAgentConnection Implementation
    // -----------------------------------------------------------------------

    const connection: EnterstellarAgentConnection = {
        dispatch(
            signal: UserSignal,
            options?: { readonly immediate?: boolean },
        ): Promise<void> {
            // Validate the signal at runtime (L8 — Zod for unknown data).
            const parsed = UserSignalSchema.safeParse(signal);
            if (!parsed.success) {
                return Promise.reject(
                    new EnterstellarError(
                        'ENS-3001',
                        'connection',
                        `Invalid UserSignal: ${parsed.error.message}`,
                        false,
                        parsed.error,
                    ),
                );
            }

            // Serialize and send. Fire-and-forget: resolve when enqueued (P1).
            const serialized = JSON.stringify(parsed.data);
            if (transport?.connected) {
                transport.send(serialized);
            }
            // If transport is not connected, the signal is silently dropped.
            // This is acceptable per P1: fire-and-forget with enqueue guarantee
            // means the promise resolves, but delivery is best-effort.

            // Consume `options` to satisfy `noUnusedParameters`.
            void options;
            return Promise.resolve();
        },

        on(
            event: AgentEventType,
            callback: (data: unknown) => void,
        ): () => void {
            // Delegate to the typed internal emitter.
            // The `callback` accepts `unknown`, which is contravariant-safe for
            // all `AgentEventMap` payload types. We cast to bridge the generic.
            return emitter.on(event, callback);
        },

        onRawEvent(callback: (event: unknown) => void): () => void {
            return emitter.on('raw', callback);
        },

        get connected(): boolean {
            return isConnected;
        },

        disconnect(): Promise<void> {
            isDisconnecting = true;

            // Cancel any pending reconnect timer.
            if (reconnectTimer !== null) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            // Disconnect the transport.
            if (transport !== null) {
                transport.disconnect();
                transport = null;
            }

            isConnected = false;

            // Clean up all event listeners.
            emitter.removeAll();

            return Promise.resolve();
        },
    };

    return connection;
}
