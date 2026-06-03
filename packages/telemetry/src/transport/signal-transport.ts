/**
 * @module @enterstellar-ai/telemetry/transport/signal-transport
 * @description Interface for signal transport implementations.
 *
 * The `SignalTransport` abstracts over different delivery strategies:
 * - {@link CloudTransport} — HTTP POST to the cloud endpoint.
 * - {@link NoopTransport} — silent no-op for enterprise opt-out (TL9).
 *
 * @see Design Choice TL6 — REST JSON transport.
 * @see Design Choice TL9 — enterprise opt-out.
 */

import type { ForgeSignal } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// TransportResult
// ---------------------------------------------------------------------------

/**
 * The outcome of a transport `send()` operation.
 */
export type TransportResult = {
    /** Whether the batch was accepted by the endpoint. */
    readonly success: boolean;

    /** HTTP status code from the endpoint, if applicable. */
    readonly statusCode?: number | undefined;

    /**
     * Suggested delay (in milliseconds) before retrying.
     * Derived from the `Retry-After` header on 429 responses,
     * or computed via exponential backoff on 5xx errors.
     *
     * `undefined` if no retry is needed (success or permanent failure).
     */
    readonly retryAfterMs?: number | undefined;
};

// ---------------------------------------------------------------------------
// SignalTransport Interface
// ---------------------------------------------------------------------------

/**
 * Abstracts signal delivery for the telemetry flush pipeline.
 *
 * Implementations handle the specifics of how signal batches
 * are transmitted (HTTP, no-op, custom). The flush scheduler
 * calls `send()` with each batch and uses the `TransportResult`
 * to decide on retries.
 */
export interface SignalTransport {
    /**
     * Send a batch of signals to the endpoint.
     *
     * @param signals - The batch of `ForgeSignal`s to transmit.
     * @returns The outcome of the transmission attempt.
     */
    send(signals: readonly ForgeSignal[]): Promise<TransportResult>;
}
