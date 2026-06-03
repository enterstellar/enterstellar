/**
 * @module @enterstellar-ai/connection/backpressure
 * @description Inbound intent buffer with configurable drop strategy.
 *
 * Enforces per-connection capacity limits on pending `ComponentIntent` messages
 * from the agent. When the buffer reaches `maxBuffer`, the configured
 * `dropStrategy` determines which intent is discarded.
 *
 * **Critical invariant:** Intents with `interaction: 'actionable'` ALWAYS bypass
 * the buffer entirely — they are never buffered, never dropped. This guarantees
 * that user-initiated actions (button clicks, form submissions) are never lost
 * due to backpressure.
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice P5 — Backpressure on connection, not provider
 * @see Design Choice R1 — Plain objects with closures
 */

import type { ComponentIntent } from '@enterstellar-ai/types';

import type { BackpressureConfig } from './types.js';

// ---------------------------------------------------------------------------
// Drop Result
// ---------------------------------------------------------------------------

/**
 * Result of a `push()` operation on the intent buffer.
 *
 * - `dropped: null` — intent was buffered successfully, nothing dropped.
 * - `dropped: ComponentIntent` — an intent was dropped to make room.
 * - `bypassed: true` — intent had `interaction: 'actionable'` and skipped the buffer.
 */
export type PushResult = {
    /** The intent that was dropped to make room, or `null` if none was dropped. */
    readonly dropped: ComponentIntent | null;
    /** Whether the intent bypassed the buffer entirely (actionable). */
    readonly bypassed: boolean;
};

// ---------------------------------------------------------------------------
// IntentBuffer Interface
// ---------------------------------------------------------------------------

/**
 * Inbound intent buffer with capacity limits and drop policy.
 *
 * The buffer is a FIFO queue backed by an array. When `size >= maxBuffer`,
 * the `dropStrategy` determines the eviction target:
 * - `'oldest'` — removes the head (index 0).
 * - `'newest'` — rejects the incoming intent (does not enqueue).
 */
export type IntentBuffer = {
    /**
     * Pushes an intent into the buffer.
     *
     * If the intent has `interaction: 'actionable'`, it bypasses the buffer
     * entirely — returned via `bypassed: true` in the result. The caller
     * should process it immediately.
     *
     * If the buffer is full:
     * - `'oldest'`: the oldest buffered intent is evicted and returned in `dropped`.
     * - `'newest'`: the incoming intent is rejected and returned in `dropped`.
     *
     * @param intent - The `ComponentIntent` to buffer.
     * @returns A `PushResult` describing what happened.
     */
    readonly push: (intent: ComponentIntent) => PushResult;

    /**
     * Drains all buffered intents and returns them in FIFO order.
     * The buffer is empty after this call.
     *
     * @returns An array of buffered intents, oldest first.
     */
    readonly drain: () => readonly ComponentIntent[];

    /**
     * Returns the intent at the head of the buffer without removing it.
     *
     * @returns The oldest buffered intent, or `null` if the buffer is empty.
     */
    readonly peek: () => ComponentIntent | null;

    /** Current number of buffered intents. */
    readonly size: number;

    /** Whether the buffer is at maximum capacity. */
    readonly full: boolean;

    /** The maximum capacity of this buffer. */
    readonly maxBuffer: number;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an intent buffer with the specified backpressure configuration.
 *
 * @param config - Backpressure settings (`maxBuffer`, `dropStrategy`).
 * @returns An `IntentBuffer` instance.
 *
 * @example
 * ```ts
 * const buffer = createIntentBuffer({ maxBuffer: 50, dropStrategy: 'oldest' });
 *
 * const result = buffer.push(someIntent);
 * if (result.dropped !== null) {
 *   // Log ENS-3010 warning with dropped intent details
 * }
 * if (result.bypassed) {
 *   // Process actionable intent immediately
 * }
 *
 * const all = buffer.drain(); // returns and clears
 * ```
 */
export function createIntentBuffer(config: BackpressureConfig): IntentBuffer {
    // Internal FIFO queue. Array is sufficient for maxBuffer ≤ 50.
    const queue: ComponentIntent[] = [];

    const buffer: IntentBuffer = {
        push(intent: ComponentIntent): PushResult {
            // Actionable intents ALWAYS bypass the buffer (P5).
            if (intent.interaction === 'actionable') {
                return { dropped: null, bypassed: true };
            }

            // Buffer has capacity — enqueue without eviction.
            if (queue.length < config.maxBuffer) {
                queue.push(intent);
                return { dropped: null, bypassed: false };
            }

            // Buffer is full — apply drop strategy.
            if (config.dropStrategy === 'oldest') {
                // Evict the oldest intent (head of queue).
                const evicted = queue.shift();
                queue.push(intent);
                // `evicted` is guaranteed non-null because queue.length >= maxBuffer > 0.
                return { dropped: evicted ?? null, bypassed: false };
            }

            // dropStrategy === 'newest' — reject the incoming intent.
            return { dropped: intent, bypassed: false };
        },

        drain(): readonly ComponentIntent[] {
            // Splice the entire queue and return a frozen snapshot.
            const snapshot = queue.splice(0, queue.length);
            return snapshot;
        },

        peek(): ComponentIntent | null {
            return queue.length > 0 ? queue[0] ?? null : null;
        },

        get size(): number {
            return queue.length;
        },

        get full(): boolean {
            return queue.length >= config.maxBuffer;
        },

        get maxBuffer(): number {
            return config.maxBuffer;
        },
    };

    return buffer;
}
