/**
 * @module @enterstellar-ai/connection/transports/transport
 * @description Internal transport interface — the abstraction over WebSocket, SSE,
 * and any future transport implementations.
 *
 * This interface is the seam that enables the `'auto'` transport selection
 * strategy: the factory tries a `WebSocketTransport`, and if it fails within
 * the 1s timeout, falls back to `SSETransport` — all behind this single interface.
 *
 * Design Choice T1: This is an **interface** (not a type) because it has methods.
 * No `Enterstellar` prefix — internal only (T2).
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice S11 — 3-tier transport fallback
 * @see Design Choice P11 — Separate package
 */

// ---------------------------------------------------------------------------
// Callback Types
// ---------------------------------------------------------------------------

/**
 * Handler for inbound messages from the transport.
 * Receives the raw parsed data (already JSON-deserialized by the transport).
 */
export type TransportMessageHandler = (data: unknown) => void;

/**
 * Handler for transport-level errors.
 * Receives the raw error value (typed `unknown` per L8 catch clause rules).
 */
export type TransportErrorHandler = (error: unknown) => void;

/** Handler for transport close events. */
export type TransportCloseHandler = () => void;

// ---------------------------------------------------------------------------
// Transport Interface
// ---------------------------------------------------------------------------

/**
 * Internal transport abstraction for bidirectional agent communication.
 *
 * Implementations:
 * - `WebSocketTransport` — full-duplex via Web `WebSocket` API.
 * - `SSETransport` — receive via `EventSource`, send via companion `POST` endpoint.
 *
 * Lifecycle:
 * 1. Create transport via factory function.
 * 2. Register `onMessage`, `onError`, `onClose` handlers.
 * 3. Call `connect()` — resolves when the transport is ready.
 * 4. Use `send()` for outbound messages.
 * 5. Call `disconnect()` to tear down cleanly.
 *
 * **Invariant:** `send()` MUST throw if called when `connected === false`.
 */
export interface Transport {
    /**
     * Establishes the transport connection.
     * Resolves when the transport is ready to send/receive.
     * Rejects on connection failure or timeout.
     *
     * @throws {EnterstellarError} On connection failure with code `ENS-3003`.
     */
    connect(): Promise<void>;

    /**
     * Sends a serialized message through the transport.
     *
     * @param data - JSON-serialized string to send.
     * @throws {EnterstellarError} If `connected === false`, with code `ENS-3004`.
     */
    send(data: string): void;

    /**
     * Registers a handler for inbound messages.
     * The transport deserializes JSON before calling the handler.
     *
     * @param handler - Called for each inbound message with the parsed data.
     */
    onMessage(handler: TransportMessageHandler): void;

    /**
     * Registers a handler for transport-level errors.
     *
     * @param handler - Called on transport errors.
     */
    onError(handler: TransportErrorHandler): void;

    /**
     * Registers a handler for transport close events.
     * Fired when the connection is lost (network failure, server close).
     * NOT fired on intentional `disconnect()`.
     *
     * @param handler - Called when the transport closes unexpectedly.
     */
    onClose(handler: TransportCloseHandler): void;

    /**
     * Disconnects the transport and releases all resources.
     * After this call, `connected` is `false` and `send()` will throw.
     * Does NOT fire the `onClose` handler (intentional teardown).
     */
    disconnect(): void;

    /** Whether the transport is currently connected and ready to send/receive. */
    readonly connected: boolean;
}
