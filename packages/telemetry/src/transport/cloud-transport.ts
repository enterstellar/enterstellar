/**
 * @module @enterstellar-ai/telemetry/transport/cloud-transport
 * @description HTTP transport for uploading ForgeSignal batches to the cloud.
 *
 * Uses the `fetch()` API (available in browsers, Cloudflare Workers,
 * and Node 18+). Sends signal batches as JSON arrays via
 * `POST {endpoint}` with `Content-Type: application/json`.
 *
 * **Retry semantics:**
 * - `429` → uses `Retry-After` header (seconds) or exponential backoff.
 * - `5xx` → exponential backoff.
 * - Network error → exponential backoff.
 * - `2xx` → success.
 * - `4xx` (non-429) → permanent failure, no retry.
 *
 * @see Design Choice TL6 — POST /v1/signals, JSON array body.
 * @see Design Choice TL7 — exponential backoff, never drop signals.
 * @see Principle L15 — zero framework imports.
 */

import type { ForgeSignal } from '@enterstellar-ai/types';

import type { SignalTransport, TransportResult } from './signal-transport.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Exponential backoff schedule for retries (in milliseconds).
 * 1s → 2s → 4s → 8s → 16s → 60s cap (TL7).
 */
const BACKOFF_SCHEDULE_MS: readonly number[] = [
    1_000, 2_000, 4_000, 8_000, 16_000, 60_000,
];

// ---------------------------------------------------------------------------
// CloudTransportConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the cloud transport.
 */
export type CloudTransportConfig = {
    /** Full URL of the signal ingestion endpoint (e.g., `'https://api.enterstellar.dev/v1/signals'`). */
    readonly endpoint: string;

    /**
     * Request timeout in milliseconds.
     * @default 10_000
     */
    readonly timeoutMs?: number | undefined;
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the backoff delay for a given retry attempt.
 *
 * @param attempt - Zero-based retry attempt index.
 * @returns Delay in milliseconds.
 */
function getBackoffMs(attempt: number): number {
    const index = Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1);
    // Safe access: index is clamped to valid range.
    return BACKOFF_SCHEDULE_MS[index] as number;
}

/**
 * Parses the `Retry-After` header value.
 * Supports integer seconds only (not HTTP-date format).
 *
 * @param headerValue - Raw header value, or `null` if absent.
 * @returns Delay in milliseconds, or `undefined` if unparseable.
 */
function parseRetryAfterMs(headerValue: string | null): number | undefined {
    if (headerValue === null) {
        return undefined;
    }

    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1_000;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a cloud {@link SignalTransport} that uploads signal batches
 * via HTTP POST.
 *
 * @param config - Transport configuration (endpoint URL, optional timeout).
 * @returns A `SignalTransport` that sends batches to the cloud.
 *
 * @example
 * ```ts
 * const transport = createCloudTransport({
 *   endpoint: 'https://api.enterstellar.dev/v1/signals',
 * });
 * const result = await transport.send(signals);
 * ```
 *
 * @see Design Choice TL6
 * @see Design Choice TL7
 */
export function createCloudTransport(config: CloudTransportConfig): SignalTransport {
    const { endpoint, timeoutMs = REQUEST_TIMEOUT_MS } = config;

    /** Tracks the current retry attempt for backoff computation. */
    let currentRetryAttempt = 0;

    return {
        async send(signals: readonly ForgeSignal[]): Promise<TransportResult> {
            // Empty batch — nothing to send.
            if (signals.length === 0) {
                return { success: true };
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, timeoutMs);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(signals),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // 2xx — success. Reset retry counter.
                if (response.ok) {
                    currentRetryAttempt = 0;
                    return {
                        success: true,
                        statusCode: response.status,
                    };
                }

                // 429 — rate limited. Use Retry-After header or exponential backoff (TL7).
                if (response.status === 429) {
                    const retryAfterMs =
                        parseRetryAfterMs(response.headers.get('Retry-After')) ??
                        getBackoffMs(currentRetryAttempt);

                    currentRetryAttempt++;

                    return {
                        success: false,
                        statusCode: response.status,
                        retryAfterMs,
                    };
                }

                // 5xx — server error. Exponential backoff.
                if (response.status >= 500) {
                    const retryAfterMs = getBackoffMs(currentRetryAttempt);
                    currentRetryAttempt++;

                    return {
                        success: false,
                        statusCode: response.status,
                        retryAfterMs,
                    };
                }

                // 4xx (non-429) — client error. Permanent failure, no retry.
                currentRetryAttempt = 0;
                return {
                    success: false,
                    statusCode: response.status,
                };
            } catch (error: unknown) {
                clearTimeout(timeoutId);

                // Network error or timeout — exponential backoff.
                const retryAfterMs = getBackoffMs(currentRetryAttempt);
                currentRetryAttempt++;

                // Distinguish timeout from network error for observability.
                const isTimeout =
                    error instanceof DOMException && error.name === 'AbortError';
                const statusCode = isTimeout ? 408 : undefined;

                return {
                    success: false,
                    statusCode,
                    retryAfterMs,
                };
            }
        },
    };
}
