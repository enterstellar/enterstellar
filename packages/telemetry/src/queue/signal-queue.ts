/**
 * @module @enterstellar-ai/telemetry/queue/signal-queue
 * @description Interface for signal queue implementations.
 *
 * The `SignalQueue` abstracts over different persistence strategies:
 * - {@link MemoryQueue} — in-memory, for SSR / Node / tests.
 * - {@link IndexedDBQueue} — browser-persistent, survives page refresh.
 *
 * All methods are async to support both synchronous (memory) and
 * asynchronous (IndexedDB) backends uniformly.
 *
 * @see Design Choice TL4 — queue strategy selection.
 */

import type { ForgeSignal } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// SignalQueue Interface
// ---------------------------------------------------------------------------

/**
 * Abstracts signal persistence for the telemetry flush pipeline.
 *
 * Implementations must be FIFO-ordered: signals dequeued in the
 * order they were enqueued. `requeue()` prepends signals to the
 * front of the queue for retry fairness (failed batches get
 * priority on the next flush cycle).
 */
export interface SignalQueue {
    /**
     * Add a signal to the end of the queue.
     *
     * @param signal - A fully-formed `ForgeSignal` to enqueue.
     */
    enqueue(signal: ForgeSignal): Promise<void>;

    /**
     * Remove and return up to `count` signals from the front of the queue.
     *
     * Returns fewer than `count` if the queue has fewer signals.
     * Returns an empty array if the queue is empty.
     *
     * @param count - Maximum number of signals to dequeue.
     * @returns The dequeued signals, in FIFO order.
     */
    dequeue(count: number): Promise<readonly ForgeSignal[]>;

    /**
     * Re-enqueue signals that failed to send.
     *
     * Prepends the signals to the **front** of the queue so they are
     * retried before newer signals on the next flush cycle.
     *
     * @param signals - The failed signals to requeue.
     */
    requeue(signals: readonly ForgeSignal[]): Promise<void>;

    /**
     * Get the current number of signals in the queue.
     *
     * @returns The queue depth.
     */
    size(): Promise<number>;

    /**
     * Remove all signals from the queue.
     *
     * Used during `dispose()` cleanup or testing.
     */
    clear(): Promise<void>;

    /**
     * Release any underlying resources (e.g. close an IndexedDB connection).
     *
     * Optional — memory queues have no resources to release.
     * Must be called before deleting the backing store in tests.
     */
    close?(): void;
}
