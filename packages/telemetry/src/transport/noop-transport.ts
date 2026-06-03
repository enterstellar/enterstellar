/**
 * @module @enterstellar-ai/telemetry/transport/noop-transport
 * @description No-op transport for enterprise opt-out.
 *
 * When `disabled: true` is set in `TelemetryConfig`, all transport
 * operations are replaced with this silent no-op. `send()` resolves
 * immediately with `{ success: true }` — zero network, zero disk,
 * zero overhead.
 *
 * @see Design Choice TL9 — enterprise opt-out.
 */

import type { SignalTransport, TransportResult } from './signal-transport.js';

// ---------------------------------------------------------------------------
// Singleton Result
// ---------------------------------------------------------------------------

/**
 * Pre-allocated success result. Reused across all calls to avoid
 * allocating a new object on every no-op send.
 */
const NOOP_RESULT: TransportResult = Object.freeze({
    success: true,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a no-op {@link SignalTransport}.
 *
 * All calls to `send()` resolve immediately with `{ success: true }`.
 * No network requests, no disk writes, no side effects.
 *
 * @returns A frozen, stateless `SignalTransport`.
 *
 * @example
 * ```ts
 * const transport = createNoopTransport();
 * const result = await transport.send(signals);
 * // → { success: true }
 * ```
 *
 * @see Design Choice TL9
 */
export function createNoopTransport(): SignalTransport {
    return Object.freeze({
        send(): Promise<TransportResult> {
            return Promise.resolve(NOOP_RESULT);
        },
    });
}
