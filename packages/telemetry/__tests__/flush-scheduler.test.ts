/**
 * @module @enterstellar-ai/telemetry/__tests__/flush-scheduler
 * @description Tests for the flush orchestrator.
 *
 * Verifies manual flush, periodic interval, backpressure (TL5),
 * batch retry (TL12), counters (TL11), and graceful dispose.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForgeSignal } from '@enterstellar-ai/types';

import { createMemoryQueue } from '../src/queue/memory-queue.js';
import type { SignalQueue } from '../src/queue/signal-queue.js';
import type { SignalTransport, TransportResult } from '../src/transport/signal-transport.js';
import { createFlushScheduler } from '../src/flush-scheduler.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createStubSignal(intentHash: string): ForgeSignal {
    return {
        intentHash,
        componentName: 'TestComponent',
        intentCategory: 'clinical',
        compilationStatus: 'pass',
        forgeMode: 'none',
        forgeUsed: false,
        latencyMs: 10,
        selfCorrectionAttempts: 0,
        correctionTokensUsed: 0,
        timestamp: new Date().toISOString(),
        sdkVersion: '0.1.0',
        registrySize: 5,
        platform: 'web',
    };
}

function createMockTransport(
    sendFn?: (signals: readonly ForgeSignal[]) => Promise<TransportResult>,
): SignalTransport {
    return {
        send: sendFn ?? (async () => ({ success: true, statusCode: 200 })),
    };
}

const DEFAULT_CONFIG = { flushIntervalMs: 30_000, batchSize: 10 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFlushScheduler', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // -------------------------------------------------------------------------
    // Basic flush
    // -------------------------------------------------------------------------

    it('flushes queued signals via transport on manual flush()', async () => {
        const queue = createMemoryQueue();
        const sentBatches: ForgeSignal[][] = [];
        const transport = createMockTransport(async (signals) => {
            sentBatches.push([...signals]);
            return { success: true, statusCode: 200 };
        });

        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        await queue.enqueue(createStubSignal('a'));
        await queue.enqueue(createStubSignal('b'));

        const result = await scheduler.flush();

        expect(result.sent).toBe(2);
        expect(result.failed).toBe(0);
        expect(sentBatches).toHaveLength(1);
        expect(sentBatches[0]).toHaveLength(2);

        await scheduler.dispose();
    });

    it('returns sent:0 failed:0 when queue is empty', async () => {
        const queue = createMemoryQueue();
        const transport = createMockTransport();
        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        const result = await scheduler.flush();

        expect(result.sent).toBe(0);
        expect(result.failed).toBe(0);

        await scheduler.dispose();
    });

    // -------------------------------------------------------------------------
    // Periodic flush (interval-based)
    // -------------------------------------------------------------------------

    it('flushes automatically at the configured interval', async () => {
        const queue = createMemoryQueue();
        let sendCount = 0;
        const transport = createMockTransport(async () => {
            sendCount++;
            return { success: true, statusCode: 200 };
        });

        const scheduler = createFlushScheduler(queue, transport, {
            flushIntervalMs: 1_000,
            batchSize: 100,
        });

        await queue.enqueue(createStubSignal('a'));

        // Advance time by 1 interval.
        await vi.advanceTimersByTimeAsync(1_000);

        expect(sendCount).toBe(1);

        await scheduler.dispose();
    });

    // -------------------------------------------------------------------------
    // Backpressure (TL5)
    // -------------------------------------------------------------------------

    it('reports backpressure when ≥3 flushes are in-flight', async () => {
        // We create a mock queue that gives us 1 signal per dequeue,
        // and a transport that blocks until we resolve it.
        let signalCount = 3;
        const mockQueue: SignalQueue = {
            async enqueue() {
                signalCount++;
            },
            async dequeue(count: number) {
                if (signalCount <= 0) return [];
                signalCount--;
                return [createStubSignal('s')];
            },
            async requeue() { /* no-op */ },
            async size() { return signalCount; },
            async clear() { signalCount = 0; },
        };

        const transportResolvers: Array<(value: TransportResult) => void> = [];
        const transport = createMockTransport(() => {
            return new Promise<TransportResult>((resolve) => {
                transportResolvers.push(resolve);
            });
        });

        const scheduler = createFlushScheduler(mockQueue, transport, {
            flushIntervalMs: 60_000,
            batchSize: 1,
        });

        // Start 3 flushes — each will dequeue 1 signal and block on transport.
        const f1 = scheduler.flush();
        const f2 = scheduler.flush();
        const f3 = scheduler.flush();

        // Yield to let all 3 start their dequeue→send chains.
        await new Promise<void>((r) => { queueMicrotask(r); });
        await new Promise<void>((r) => { queueMicrotask(r); });

        // All 3 are now blocked on transport.send() → 3 in-flight.
        expect(scheduler.inFlightCount()).toBe(3);
        expect(scheduler.isBackpressured()).toBe(true);

        // Resolve all 3.
        for (const resolve of transportResolvers) {
            resolve({ success: true, statusCode: 200 });
        }

        await f1;
        await f2;
        await f3;

        expect(scheduler.isBackpressured()).toBe(false);
        expect(scheduler.inFlightCount()).toBe(0);

        await scheduler.dispose();
    });

    // -------------------------------------------------------------------------
    // Batch retry (TL12)
    // -------------------------------------------------------------------------

    it('requeues failed batches for retry', async () => {
        const queue = createMemoryQueue();
        let callCount = 0;
        const transport = createMockTransport(async () => {
            callCount++;
            // Fail with retry suggestion.
            return { success: false, statusCode: 500, retryAfterMs: 100 };
        });

        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        await queue.enqueue(createStubSignal('retry-me'));

        // First flush — fails, requeues.
        await scheduler.flush();

        expect(callCount).toBe(1);
        // Signal should be requeued.
        expect(await queue.size()).toBe(1);

        await scheduler.dispose();
    });

    it('drops batch after max retry attempts', async () => {
        const queue = createMemoryQueue();
        let callCount = 0;
        const transport = createMockTransport(async () => {
            callCount++;
            // Permanent failure — no retry suggestion.
            return { success: false, statusCode: 500 };
        });

        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        await queue.enqueue(createStubSignal('drop-me'));

        // Flush 5 times — should exhaust retries and drop.
        for (let i = 0; i < 5; i++) {
            await scheduler.flush();
        }

        const { totalFailed } = scheduler.counters();
        expect(totalFailed).toBeGreaterThan(0);

        await scheduler.dispose();
    });

    // -------------------------------------------------------------------------
    // Counters (TL11)
    // -------------------------------------------------------------------------

    it('tracks totalSent and totalFailed counters', async () => {
        const queue = createMemoryQueue();
        const transport = createMockTransport(async () => ({
            success: true,
            statusCode: 200,
        }));

        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        await queue.enqueue(createStubSignal('a'));
        await queue.enqueue(createStubSignal('b'));
        await scheduler.flush();

        const { totalSent, totalFailed } = scheduler.counters();
        expect(totalSent).toBe(2);
        expect(totalFailed).toBe(0);

        await scheduler.dispose();
    });

    it('tracks lastFlushAt timestamp', async () => {
        const queue = createMemoryQueue();
        const transport = createMockTransport(async () => ({
            success: true,
            statusCode: 200,
        }));

        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        expect(scheduler.lastFlushAt()).toBeNull();

        await queue.enqueue(createStubSignal('a'));
        await scheduler.flush();

        const lastFlush = scheduler.lastFlushAt();
        expect(lastFlush).not.toBeNull();
        expect(new Date(lastFlush as string).toISOString()).toBe(lastFlush);

        await scheduler.dispose();
    });

    // -------------------------------------------------------------------------
    // Threshold-based flush (batchSize)
    // -------------------------------------------------------------------------

    it('triggers a flush when queue size reaches batchSize via checkThreshold()', async () => {
        const queue = createMemoryQueue();
        let sendCount = 0;
        const transport = createMockTransport(async () => {
            sendCount++;
            return { success: true, statusCode: 200 };
        });

        const scheduler = createFlushScheduler(queue, transport, {
            flushIntervalMs: 60_000, // Long interval — threshold should trigger first.
            batchSize: 3,
        });

        // Enqueue exactly batchSize signals.
        // Must call notifyEnqueued() to keep the synchronous counter in sync,
        // since we're bypassing the collector's record() path.
        await queue.enqueue(createStubSignal('a'));
        scheduler.notifyEnqueued(1);
        await queue.enqueue(createStubSignal('b'));
        scheduler.notifyEnqueued(1);
        await queue.enqueue(createStubSignal('c'));
        scheduler.notifyEnqueued(1);

        // Trigger the threshold check.
        scheduler.checkThreshold();

        // checkThreshold() is now synchronous — advance microtask queue for flush.
        await vi.advanceTimersByTimeAsync(0);

        expect(sendCount).toBe(1);
        expect(await queue.size()).toBe(0);

        await scheduler.dispose();
    });

    it('does NOT trigger flush when queue size is below batchSize', async () => {
        const queue = createMemoryQueue();
        let sendCount = 0;
        const transport = createMockTransport(async () => {
            sendCount++;
            return { success: true, statusCode: 200 };
        });

        const scheduler = createFlushScheduler(queue, transport, {
            flushIntervalMs: 60_000,
            batchSize: 5,
        });

        // Enqueue fewer than batchSize signals.
        await queue.enqueue(createStubSignal('a'));
        scheduler.notifyEnqueued(1);
        await queue.enqueue(createStubSignal('b'));
        scheduler.notifyEnqueued(1);

        scheduler.checkThreshold();
        await vi.advanceTimersByTimeAsync(0);

        // Should NOT have flushed.
        expect(sendCount).toBe(0);
        expect(await queue.size()).toBe(2);

        await scheduler.dispose();
    });

    // -------------------------------------------------------------------------
    // Dispose
    // -------------------------------------------------------------------------

    it('performs a final flush on dispose', async () => {
        const queue = createMemoryQueue();
        let sendCount = 0;
        const transport = createMockTransport(async () => {
            sendCount++;
            return { success: true, statusCode: 200 };
        });

        const scheduler = createFlushScheduler(queue, transport, DEFAULT_CONFIG);

        await queue.enqueue(createStubSignal('final'));
        await scheduler.dispose();

        expect(sendCount).toBe(1);
        expect(await queue.size()).toBe(0);
    });
});
