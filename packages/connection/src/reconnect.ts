/**
 * @module @enterstellar-ai/connection/reconnect
 * @description Exponential backoff scheduler for automatic reconnection.
 *
 * Produces a delay sequence: `1s → 2s → 4s → 8s → 16s → maxDelay → maxDelay → ...`
 * The caller is responsible for scheduling timers — this module only computes delays.
 *
 * Design: plain object with closures (R1). Stateful — tracks attempt count
 * internally. Call `reset()` on successful reconnect to restart the sequence.
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice S11 — 3-tier transport fallback with exponential backoff
 * @see Design Choice P12 — Keep-last + re-request on reconnect
 */

import type { ReconnectConfig } from './types.js';
import { INITIAL_BACKOFF_MS } from './types.js';

// ---------------------------------------------------------------------------
// ReconnectScheduler Interface
// ---------------------------------------------------------------------------

/**
 * Exponential backoff scheduler for reconnection attempts.
 *
 * Computes progressively longer delays between reconnect attempts,
 * capped at `maxDelay`. Does NOT manage timers — the consumer calls
 * `nextDelay()` and schedules `setTimeout` / `setInterval` externally.
 */
export type ReconnectScheduler = {
    /**
     * Computes and returns the next delay in milliseconds.
     * Each call increments the internal attempt counter.
     *
     * Sequence with default maxDelay (30_000ms):
     * `1000 → 2000 → 4000 → 8000 → 16000 → 30000 → 30000 → ...`
     *
     * @returns The delay in milliseconds before the next reconnect attempt.
     */
    readonly nextDelay: () => number;

    /**
     * Resets the backoff counter to zero.
     * Call this on successful reconnect to restart the sequence.
     */
    readonly reset: () => void;

    /** Current attempt number (0-indexed, incremented by `nextDelay()`). */
    readonly attempt: number;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a reconnect scheduler with exponential backoff.
 *
 * The delay formula is:
 * ```
 * delay = min(INITIAL_BACKOFF_MS * 2^attempt, maxDelay)
 * ```
 *
 * @param config - Reconnect configuration with `maxDelay`.
 * @returns A `ReconnectScheduler` instance.
 *
 * @example
 * ```ts
 * const scheduler = createReconnectScheduler({ maxDelay: 30_000 });
 *
 * scheduler.nextDelay(); // 1000
 * scheduler.nextDelay(); // 2000
 * scheduler.nextDelay(); // 4000
 * // ...
 * scheduler.nextDelay(); // 30000 (capped)
 *
 * scheduler.reset();
 * scheduler.nextDelay(); // 1000 (restarted)
 * ```
 */
export function createReconnectScheduler(
    config: ReconnectConfig,
): ReconnectScheduler {
    let currentAttempt = 0;

    const scheduler: ReconnectScheduler = {
        nextDelay(): number {
            // Compute delay: initialBackoff * 2^attempt, capped at maxDelay.
            // Math.min guarantees we never exceed the configured ceiling.
            // Bit-shift (1 << attempt) is safe for attempt < 31 — at that point
            // the delay would be ~2 billion ms which is far beyond maxDelay anyway.
            const uncapped =
                currentAttempt < 31
                    ? INITIAL_BACKOFF_MS * (1 << currentAttempt)
                    : config.maxDelay;

            const delay = Math.min(uncapped, config.maxDelay);
            currentAttempt += 1;
            return delay;
        },

        reset(): void {
            currentAttempt = 0;
        },

        get attempt(): number {
            return currentAttempt;
        },
    };

    return scheduler;
}
