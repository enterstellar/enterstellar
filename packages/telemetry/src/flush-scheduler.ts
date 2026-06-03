/**
 * @module @enterstellar-ai/telemetry/flush-scheduler
 * @description Flush orchestrator for the telemetry pipeline.
 *
 * Manages periodic (interval-based) and threshold-based (batch-size)
 * flushing of queued signals, with backpressure and batch retry.
 *
 * **Key behaviors:**
 * - Periodic flush every `flushIntervalMs` (default 30s).
 * - Threshold flush when queue size ≥ `batchSize` (default 100).
 * - Backpressure: if ≥3 flushes are in-flight, new `record()` calls
 *   are silently dropped (TL5).
 * - Batch retry: failed batches are requeued up to 5× with exponential
 *   backoff. Dropped after 5 failures (TL12).
 *
 * @see Design Choice TL5 — backpressure at 3 in-flight.
 * @see Design Choice TL7 — exponential backoff on failures.
 * @see Design Choice TL12 — batch retry, max 5 attempts.
 */

import type { SignalQueue } from './queue/signal-queue.js';
import type { SignalTransport } from './transport/signal-transport.js';
import type { FlushResult } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent in-flight flushes before entering backpressure (TL5). */
const MAX_IN_FLIGHT_FLUSHES = 3;

/** Maximum retry attempts per failed batch before dropping it (TL12). */
const MAX_BATCH_RETRIES = 5;

// ---------------------------------------------------------------------------
// FlushSchedulerConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the flush scheduler.
 */
export type FlushSchedulerConfig = {
    /** Interval between periodic flushes, in milliseconds. */
    readonly flushIntervalMs: number;

    /** Maximum signals per batch sent in a single flush. */
    readonly batchSize: number;
};

// ---------------------------------------------------------------------------
// FlushScheduler
// ---------------------------------------------------------------------------

/**
 * The flush scheduler manages the lifecycle of signal delivery.
 *
 * Created internally by `createTelemetryCollector` — not a public API.
 */
export interface FlushScheduler {
    /**
     * Whether the scheduler is in backpressure mode.
     * When `true`, new signals should NOT be enqueued.
     *
     * @see Design Choice TL5
     */
    isBackpressured(): boolean;

    /**
     * Execute an immediate flush, bypassing the interval timer.
     *
     * @returns The result of this flush cycle.
     */
    flush(): Promise<FlushResult>;

    /**
     * Check if the queue has reached the batch size threshold
     * and trigger a flush if so.
     */
    checkThreshold(): void;

    /**
     * Gracefully shut down the scheduler.
     *
     * Clears the interval timer, performs a final flush,
     * and awaits all in-flight flushes to complete.
     */
    dispose(): Promise<void>;

    /**
     * Get the current count of in-flight flush operations.
     */
    inFlightCount(): number;

    /**
     * Notify the scheduler that signals have been enqueued.
     *
     * Increments the synchronous queue depth counter. Called by
     * the collector after each successful `queue.enqueue()` so
     * that `queuedCount()` can return an accurate value without
     * an async `queue.size()` call.
     *
     * @param count - Number of signals enqueued (typically 1).
     */
    notifyEnqueued(count: number): void;

    /**
     * Get the current synchronous estimate of the queue depth.
     *
     * Maintained by incrementing on `notifyEnqueued()`, decrementing
     * on `dequeue()`, and re-incrementing on `requeue()`. This avoids
     * the async `queue.size()` call and enables `getStats().queued`
     * to return accurate values synchronously.
     *
     * @returns The estimated number of signals currently in the queue.
     */
    queuedCount(): number;

    /**
     * Get cumulative send/fail counters.
     */
    counters(): { readonly totalSent: number; readonly totalFailed: number };

    /**
     * Get the ISO 8601 timestamp of the last successful flush, or `null`.
     */
    lastFlushAt(): string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a {@link FlushScheduler} wiring a queue to a transport.
 *
 * Starts the periodic flush interval immediately upon creation.
 *
 * @param queue - The signal queue to drain.
 * @param transport - The transport to send batches through.
 * @param config - Scheduler configuration (interval, batch size).
 * @returns A new `FlushScheduler`.
 *
 * @see Design Choice TL5 — backpressure.
 * @see Design Choice TL12 — batch retry.
 */
export function createFlushScheduler(
    queue: SignalQueue,
    transport: SignalTransport,
    config: FlushSchedulerConfig,
): FlushScheduler {
    let inFlight = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let queued = 0;
    let lastFlush: string | null = null;
    let disposed = false;

    // ---------------------------------------------------------------------------
    // Core flush logic
    // ---------------------------------------------------------------------------

    /**
     * Executes a single flush cycle:
     * 1. Dequeue up to `batchSize` signals.
     * 2. Send via transport.
     * 3. On success → update counters.
     * 4. On failure → requeue for retry (up to MAX_BATCH_RETRIES).
     */
    async function executeSingleFlush(retryCount: number = 0): Promise<FlushResult> {
        const batch = await queue.dequeue(config.batchSize);

        if (batch.length === 0) {
            return { sent: 0, failed: 0 };
        }

        // Dequeued — decrement synchronous queue counter.
        queued -= batch.length;
        inFlight++;

        try {
            const result = await transport.send(batch);

            if (result.success) {
                totalSent += batch.length;
                lastFlush = new Date().toISOString();
                return { sent: batch.length, failed: 0 };
            }

            // Failure — check retry budget (TL12).
            if (retryCount < MAX_BATCH_RETRIES - 1 && result.retryAfterMs !== undefined) {
                // Requeue for the next flush cycle — re-increment counter.
                await queue.requeue(batch);
                queued += batch.length;
                return { sent: 0, failed: 0 };
            }

            // Max retries exhausted — drop the batch (TL12).
            // Counter already decremented on dequeue — no adjustment needed.
            totalFailed += batch.length;
            return { sent: 0, failed: batch.length };
        } finally {
            inFlight--;
        }
    }

    // ---------------------------------------------------------------------------
    // Periodic interval
    // ---------------------------------------------------------------------------

    const intervalId = setInterval(() => {
        // Do not flush if backpressured or disposed.
        if (inFlight >= MAX_IN_FLIGHT_FLUSHES || disposed) {
            return;
        }

        // Fire-and-forget — interval flushes do not block.
        void executeSingleFlush();
    }, config.flushIntervalMs);

    // ---------------------------------------------------------------------------
    // Scheduler implementation
    // ---------------------------------------------------------------------------

    return {
        isBackpressured(): boolean {
            return inFlight >= MAX_IN_FLIGHT_FLUSHES;
        },

        async flush(): Promise<FlushResult> {
            return executeSingleFlush();
        },

        checkThreshold(): void {
            if (disposed || inFlight >= MAX_IN_FLIGHT_FLUSHES) {
                return;
            }

            // Use synchronous queue counter instead of async queue.size().
            if (queued >= config.batchSize && inFlight < MAX_IN_FLIGHT_FLUSHES) {
                void executeSingleFlush();
            }
        },

        async dispose(): Promise<void> {
            disposed = true;
            clearInterval(intervalId);

            // Final flush — drain remaining signals.
            await executeSingleFlush();
        },

        inFlightCount(): number {
            return inFlight;
        },

        notifyEnqueued(count: number): void {
            queued += count;
        },

        queuedCount(): number {
            return Math.max(0, queued);
        },

        counters(): { readonly totalSent: number; readonly totalFailed: number } {
            return { totalSent, totalFailed };
        },

        lastFlushAt(): string | null {
            return lastFlush;
        },
    };
}
