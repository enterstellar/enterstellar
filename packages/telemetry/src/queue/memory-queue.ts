/**
 * @module @enterstellar-ai/telemetry/queue/memory-queue
 * @description In-memory `SignalQueue` implementation.
 *
 * Backed by a plain array. FIFO ordering guaranteed.
 * Suitable for SSR, Node.js, tests, and environments where
 * persistence across page refreshes is not required.
 *
 * @see {@link SignalQueue} for the interface contract.
 * @see Design Choice TL4 — `queueStrategy: 'memory'`.
 */

import type { ForgeSignal } from '@enterstellar-ai/types';

import type { SignalQueue } from './signal-queue.js';

// ---------------------------------------------------------------------------
// MemoryQueue
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory {@link SignalQueue}.
 *
 * Signals are stored in a plain array and lost on process exit.
 * Use `'indexedDB'` strategy for browser persistence.
 *
 * @returns A new `SignalQueue` backed by an in-memory array.
 *
 * @example
 * ```ts
 * const queue = createMemoryQueue();
 * await queue.enqueue(signal);
 * const batch = await queue.dequeue(10);
 * ```
 */
export function createMemoryQueue(): SignalQueue {
    /** Internal FIFO buffer. Front = index 0, back = index length-1. */
    let buffer: ForgeSignal[] = [];

    return {
        enqueue(signal: ForgeSignal): Promise<void> {
            buffer.push(signal);
            return Promise.resolve();
        },

        dequeue(count: number): Promise<readonly ForgeSignal[]> {
            // Clamp to available signals.
            const batch = buffer.splice(0, count);
            return Promise.resolve(batch);
        },

        requeue(signals: readonly ForgeSignal[]): Promise<void> {
            // Prepend to front — failed signals get retry priority.
            buffer = [...signals, ...buffer];
            return Promise.resolve();
        },

        size(): Promise<number> {
            return Promise.resolve(buffer.length);
        },

        clear(): Promise<void> {
            buffer = [];
            return Promise.resolve();
        },
    };
}
