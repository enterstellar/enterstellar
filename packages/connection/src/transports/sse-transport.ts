/**
 * @module @enterstellar-ai/connection/transports/sse-transport
 * @description SSE (Server-Sent Events) implementation of the internal `Transport` interface.
 *
 * Uses the Web `EventSource` API for the receive channel (server → client).
 * Outbound messages (`send()`) use a companion `POST` endpoint at `{url}/dispatch`
 * via the Web `fetch()` API, since SSE is unidirectional.
 *
 * This transport is the fallback when WebSocket fails in `'auto'` mode (S11).
 * `EventSource` has built-in reconnection, but we disable it by closing the
 * source on error and delegating reconnect to the factory's reconnect scheduler.
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice S11 — SSE as second-tier fallback
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
 * Creates an SSE-based `Transport` instance.
 *
 * @param url - The SSE endpoint URL (e.g., `'https://agent.example.com/events'`).
 *              Outbound dispatch uses `'{url}/dispatch'` as the POST endpoint.
 * @param timeoutMs - Maximum time in ms to wait for the SSE connection to open.
 *                    Default: 5000.
 * @returns A `Transport` backed by EventSource (receive) and fetch (send).
 *
 * @example
 * ```ts
 * const sse = createSSETransport('https://agent.example.com/events');
 * sse.onMessage((data) => console.log('Received:', data));
 * await sse.connect();
 * sse.send(JSON.stringify({ type: 'user-signal', payload: { ... } }));
 * sse.disconnect();
 * ```
 */
export function createSSETransport(
    url: string,
    timeoutMs: number = 5_000,
): Transport {
    // Internal state
    let source: EventSource | null = null;
    let isConnected = false;
    let isIntentionalClose = false;

    // Companion POST endpoint for outbound messages.
    const dispatchUrl = `${url}/dispatch`;

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
                    source = new EventSource(url);
                } catch (error: unknown) {
                    reject(
                        new EnterstellarError(
                            'ENS-3003',
                            'connection',
                            `Failed to create EventSource for URL "${url}".`,
                            true,
                            error,
                        ),
                    );
                    return;
                }

                // Timeout guard — EventSource may silently fail to connect.
                const timer = setTimeout(() => {
                    if (source !== null && source.readyState !== EventSource.OPEN) {
                        source.close();
                        source = null;
                        reject(
                            new EnterstellarError(
                                'ENS-3003',
                                'connection',
                                `SSE connection to "${url}" timed out after ${String(timeoutMs)}ms.`,
                                true,
                            ),
                        );
                    }
                }, timeoutMs);

                source.onopen = (): void => {
                    clearTimeout(timer);
                    isConnected = true;
                    resolve();
                };

                source.onerror = (): void => {
                    // EventSource fires `onerror` on connection loss AND on failed
                    // reconnect attempts. We close the source and delegate reconnect
                    // to the factory's reconnect scheduler for consistent backoff.
                    if (source !== null && !isIntentionalClose) {
                        isConnected = false;
                        source.close();
                        source = null;

                        // Notify error handlers.
                        const error = new EnterstellarError(
                            'ENS-3003',
                            'connection',
                            `SSE connection to "${url}" encountered an error.`,
                            true,
                        );
                        for (const handler of errorHandlers) {
                            handler(error);
                        }

                        // Notify close handlers (unexpected closure).
                        for (const handler of closeHandlers) {
                            handler();
                        }
                    }
                };

                source.onmessage = (event: MessageEvent<unknown>): void => {
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(String(event.data)) as unknown;
                    } catch (error: unknown) {
                        // Malformed JSON — route to error handlers.
                        for (const handler of errorHandlers) {
                            handler(
                                new EnterstellarError(
                                    'ENS-3005',
                                    'connection',
                                    'Failed to parse inbound SSE message as JSON.',
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
            });
        },

        send(data: string): void {
            if (!isConnected) {
                throw new EnterstellarError(
                    'ENS-3004',
                    'connection',
                    'Cannot send: SSE transport is not connected.',
                    false,
                );
            }

            // Fire-and-forget POST to the companion dispatch endpoint.
            // Errors are routed to error handlers, not thrown — the caller
            // already resolved (fire-and-forget per P1).
            void fetch(dispatchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: data,
            }).catch((error: unknown) => {
                for (const handler of errorHandlers) {
                    handler(
                        new EnterstellarError(
                            'ENS-3004',
                            'connection',
                            `Failed to dispatch message via POST to "${dispatchUrl}".`,
                            true,
                            error,
                        ),
                    );
                }
            });
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

            if (source !== null) {
                source.close();
                source = null;
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
