/**
 * @module @enterstellar-ai/connection/transports/websocket-transport
 * @description WebSocket implementation of the internal `Transport` interface.
 *
 * Uses the Web `WebSocket` API (available in browsers, Deno, Bun, and Node 22+).
 * JSON serialization for outbound messages; JSON deserialization for inbound.
 *
 * Connect timeout is configurable — the `'auto'` mode uses 1s (per S11)
 * to detect WebSocket failures quickly and fall back to SSE.
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice S11 — WebSocket timeout 1s for auto mode
 * @see Design Choice P11 — Separate package
 * @see L15 — Zero framework imports; Web API only
 */

import { EnterstellarError } from '@enterstellar-ai/types';

import type {
    Transport,
    TransportCloseHandler,
    TransportErrorHandler,
    TransportMessageHandler,
} from './transport.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a WebSocket-based `Transport` instance.
 *
 * @param url - The WebSocket endpoint URL (e.g., `'wss://agent.example.com/ws'`).
 * @param timeoutMs - Maximum time in ms to wait for the connection to open.
 *                    Default: 5000. Use `AUTO_WS_TIMEOUT_MS` (1000) for auto mode.
 * @returns A `Transport` backed by a WebSocket connection.
 *
 * @example
 * ```ts
 * const ws = createWebSocketTransport('wss://agent.example.com/ws', 1000);
 * ws.onMessage((data) => console.log('Received:', data));
 * await ws.connect();
 * ws.send(JSON.stringify({ type: 'ping' }));
 * ws.disconnect();
 * ```
 */
export function createWebSocketTransport(
    url: string,
    timeoutMs: number = 5_000,
): Transport {
    // Internal state
    let socket: WebSocket | null = null;
    let isConnected = false;
    let isIntentionalClose = false;

    // Handler registries — accumulate, not overwrite.
    const messageHandlers: TransportMessageHandler[] = [];
    const errorHandlers: TransportErrorHandler[] = [];
    const closeHandlers: TransportCloseHandler[] = [];

    // -----------------------------------------------------------------------
    // Transport Implementation
    // -----------------------------------------------------------------------

    const transport: Transport = {
        connect(): Promise<void> {
            return new Promise<void>((resolve, reject) => {
                isIntentionalClose = false;

                try {
                    socket = new WebSocket(url);
                } catch (error: unknown) {
                    reject(
                        new EnterstellarError(
                            'ENS-3003',
                            'connection',
                            `Failed to create WebSocket for URL "${url}".`,
                            true,
                            error,
                        ),
                    );
                    return;
                }

                // Race: connection open vs timeout.
                const timer = setTimeout(() => {
                    if (socket !== null && socket.readyState !== WebSocket.OPEN) {
                        socket.close();
                        socket = null;
                        reject(
                            new EnterstellarError(
                                'ENS-3003',
                                'connection',
                                `WebSocket connection to "${url}" timed out after ${String(timeoutMs)}ms.`,
                                true,
                            ),
                        );
                    }
                }, timeoutMs);

                socket.onopen = (): void => {
                    clearTimeout(timer);
                    isConnected = true;
                    resolve();
                };

                socket.onerror = (event: Event): void => {
                    // WebSocket error events carry no useful info beyond "error occurred".
                    // Propagate to registered error handlers.
                    for (const handler of errorHandlers) {
                        handler(event);
                    }
                };

                socket.onmessage = (event: MessageEvent<unknown>): void => {
                    let parsed: unknown;
                    try {
                        // MessageEvent.data is typically a string for text frames.
                        parsed = JSON.parse(String(event.data)) as unknown;
                    } catch (error: unknown) {
                        // Malformed JSON — route to error handlers, not message handlers.
                        for (const handler of errorHandlers) {
                            handler(
                                new EnterstellarError(
                                    'ENS-3005',
                                    'connection',
                                    'Failed to parse inbound WebSocket message as JSON.',
                                    true,
                                    error,
                                ),
                            );
                        }
                        return;
                    }

                    for (const handler of messageHandlers) {
                        handler(parsed);
                    }
                };

                socket.onclose = (): void => {
                    isConnected = false;
                    // Only fire close handlers for unexpected closures.
                    // Intentional disconnect() does NOT trigger onClose callbacks.
                    if (!isIntentionalClose) {
                        for (const handler of closeHandlers) {
                            handler();
                        }
                    }
                    socket = null;
                };
            });
        },

        send(data: string): void {
            if (socket === null || !isConnected) {
                throw new EnterstellarError(
                    'ENS-3004',
                    'connection',
                    'Cannot send: WebSocket is not connected.',
                    false,
                );
            }

            socket.send(data);
        },

        onMessage(handler: TransportMessageHandler): void {
            messageHandlers.push(handler);
        },

        onError(handler: TransportErrorHandler): void {
            errorHandlers.push(handler);
        },

        onClose(handler: TransportCloseHandler): void {
            closeHandlers.push(handler);
        },

        disconnect(): void {
            isIntentionalClose = true;
            isConnected = false;

            if (socket !== null) {
                // Close with normal closure code (1000).
                socket.close(1000, 'Enterstellar disconnect');
                socket = null;
            }

            // Clear all handler registries to prevent memory leaks.
            messageHandlers.length = 0;
            errorHandlers.length = 0;
            closeHandlers.length = 0;
        },

        get connected(): boolean {
            return isConnected;
        },
    };

    return transport;
}
