/**
 * @module @enterstellar-ai/connection/transports/polling-transport
 * @description HTTP long-polling implementation of the internal `Transport` interface.
 *
 * This is the **last resort** fallback in the 3-tier transport hierarchy:
 * WebSocket → SSE → polling (30s interval). It uses the Web `fetch()` API
 * for both inbound (periodic `GET`) and outbound (`POST`) communication.
 *
 * Polling is intentionally simple and robust — it works in any environment
 * that supports `fetch`, including restrictive corporate proxies that block
 * WebSocket upgrades and SSE connections.
 *
 * Inbound: `GET {url}` every `intervalMs` → parse JSON array → invoke handlers.
 * Outbound: `POST {url}/dispatch` with JSON body.
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice S11 — polling is "last resort, 30s interval"
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
 * Creates an HTTP long-polling `Transport` instance.
 *
 * @param url - The endpoint URL for polling (e.g., `'https://agent.example.com/poll'`).
 *              Outbound dispatch uses `'{url}/dispatch'` as the POST endpoint.
 * @param intervalMs - Polling interval in milliseconds. Default: 30_000 (30s per S11).
 * @returns A `Transport` backed by periodic HTTP polling.
 *
 * @example
 * ```ts
 * const poll = createPollingTransport('https://agent.example.com/poll', 30_000);
 * poll.onMessage((data) => console.log('Received:', data));
 * await poll.connect();
 * poll.send(JSON.stringify({ type: 'ping' }));
 * poll.disconnect();
 * ```
 */
export function createPollingTransport(
    url: string,
    intervalMs: number = 30_000,
): Transport {
    // Internal state
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let isConnected = false;

    // Companion POST endpoint for outbound messages.
    const dispatchUrl = `${url}/dispatch`;

    /**
     * Maximum consecutive poll failures before firing `onClose` handlers.
     * After this threshold, the transport is considered "connection lost" —
     * close handlers notify the reconnect scheduler (if wired).
     */
    const MAX_CONSECUTIVE_FAILURES = 3;
    let consecutiveFailures = 0;

    // Handler registries — accumulate, not overwrite.
    const messageHandlers: TransportMessageHandler[] = [];
    const errorHandlers: TransportErrorHandler[] = [];
    const closeHandlers: TransportCloseHandler[] = [];

    // -----------------------------------------------------------------------
    // Internal: single poll cycle
    // -----------------------------------------------------------------------

    /**
     * Executes one poll cycle: `GET {url}` → parse response → route messages.
     *
     * The endpoint MUST return a JSON array of messages. Each element is
     * individually routed to message handlers. An empty array `[]` is valid
     * and means "no new messages."
     *
     * Fetch errors are routed to error handlers but do NOT terminate the
     * polling loop — transient network failures are expected and recoverable.
     */
    async function poll(): Promise<void> {
        try {
            const response = await fetch(url);

            if (!response.ok) {
                handlePollFailure(
                    new EnterstellarError(
                        'ENS-3003',
                        'connection',
                        `Polling GET to "${url}" returned HTTP ${String(response.status)}.`,
                        true,
                    ),
                );
                return;
            }

            // Parse the response body as JSON.
            let body: unknown;
            try {
                body = (await response.json()) as unknown;
            } catch (parseError: unknown) {
                handlePollFailure(
                    new EnterstellarError(
                        'ENS-3005',
                        'connection',
                        'Failed to parse polling response as JSON.',
                        true,
                        parseError,
                    ),
                );
                return;
            }

            // Successful poll — reset consecutive failure counter.
            consecutiveFailures = 0;

            // The endpoint returns an array of messages.
            // If it returns a single object, wrap it in an array for uniform handling.
            const messages: unknown[] = Array.isArray(body) ? body : [body];

            for (const message of messages) {
                for (const handler of messageHandlers) {
                    handler(message);
                }
            }
        } catch (fetchError: unknown) {
            // Network-level failure (DNS, timeout, CORS, etc.).
            handlePollFailure(
                new EnterstellarError(
                    'ENS-3003',
                    'connection',
                    `Polling GET to "${url}" failed.`,
                    true,
                    fetchError,
                ),
            );
        }
    }

    /**
     * Handles a poll failure: routes error to handlers, increments the
     * consecutive failure counter, and fires `onClose` handlers if the
     * threshold is breached (signalling connection loss).
     *
     * After `MAX_CONSECUTIVE_FAILURES` (3), the transport is considered
     * "connection lost". Close handlers notify the reconnect scheduler.
     * The polling interval is cleared since the connection is dead.
     */
    function handlePollFailure(error: EnterstellarError): void {
        for (const handler of errorHandlers) {
            handler(error);
        }

        consecutiveFailures += 1;

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && isConnected) {
            // Connection considered lost — stop polling and notify.
            isConnected = false;

            if (pollTimer !== null) {
                clearInterval(pollTimer);
                pollTimer = null;
            }

            for (const handler of closeHandlers) {
                handler();
            }
        }
    }

    // -----------------------------------------------------------------------
    // Transport Implementation
    // -----------------------------------------------------------------------

    const transport: Transport = {
        connect(): Promise<void> {
            return new Promise<void>((resolve, reject) => {
                // Verify endpoint reachability with an initial GET.
                void fetch(url)
                    .then((response) => {
                        if (!response.ok) {
                            reject(
                                new EnterstellarError(
                                    'ENS-3003',
                                    'connection',
                                    `Polling endpoint "${url}" returned HTTP ${String(response.status)} on initial connect.`,
                                    true,
                                ),
                            );
                            return;
                        }

                        isConnected = true;

                        // Start the polling interval.
                        pollTimer = setInterval(() => {
                            void poll();
                        }, intervalMs);

                        resolve();
                    })
                    .catch((error: unknown) => {
                        reject(
                            new EnterstellarError(
                                'ENS-3003',
                                'connection',
                                `Polling endpoint "${url}" is unreachable.`,
                                true,
                                error,
                            ),
                        );
                    });
            });
        },

        send(data: string): void {
            if (!isConnected) {
                throw new EnterstellarError(
                    'ENS-3004',
                    'connection',
                    'Cannot send: polling transport is not connected.',
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
            isConnected = false;

            if (pollTimer !== null) {
                clearInterval(pollTimer);
                pollTimer = null;
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
