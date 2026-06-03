/**
 * @module @enterstellar-ai/telemetry/__tests__/queue/memory-queue
 * @description Tests for the in-memory signal queue.
 *
 * Verifies FIFO ordering, enqueue/dequeue/requeue, empty-queue edge cases,
 * and clear semantics.
 */

import { describe, expect, it } from 'vitest';

import type { ForgeSignal } from '@enterstellar-ai/types';

import { createMemoryQueue } from '../../src/queue/memory-queue.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/** Creates a minimal ForgeSignal stub for testing. */
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMemoryQueue', () => {
    // -------------------------------------------------------------------------
    // Basic operations
    // -------------------------------------------------------------------------

    it('starts empty with size 0', async () => {
        const queue = createMemoryQueue();

        expect(await queue.size()).toBe(0);
    });

    it('enqueues signals and increases size', async () => {
        const queue = createMemoryQueue();

        await queue.enqueue(createStubSignal('aaa'));
        await queue.enqueue(createStubSignal('bbb'));

        expect(await queue.size()).toBe(2);
    });

    // -------------------------------------------------------------------------
    // FIFO ordering
    // -------------------------------------------------------------------------

    it('dequeues signals in FIFO order', async () => {
        const queue = createMemoryQueue();

        await queue.enqueue(createStubSignal('first'));
        await queue.enqueue(createStubSignal('second'));
        await queue.enqueue(createStubSignal('third'));

        const batch = await queue.dequeue(2);

        expect(batch).toHaveLength(2);
        expect(batch[0]?.intentHash).toBe('first');
        expect(batch[1]?.intentHash).toBe('second');
        expect(await queue.size()).toBe(1);
    });

    it('dequeues all when count exceeds queue size', async () => {
        const queue = createMemoryQueue();

        await queue.enqueue(createStubSignal('only'));

        const batch = await queue.dequeue(100);

        expect(batch).toHaveLength(1);
        expect(batch[0]?.intentHash).toBe('only');
        expect(await queue.size()).toBe(0);
    });

    it('returns empty array when dequeuing from empty queue', async () => {
        const queue = createMemoryQueue();

        const batch = await queue.dequeue(10);

        expect(batch).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // Requeue (retry fairness)
    // -------------------------------------------------------------------------

    it('requeues signals to the front of the queue', async () => {
        const queue = createMemoryQueue();

        await queue.enqueue(createStubSignal('new-1'));
        await queue.enqueue(createStubSignal('new-2'));

        // Simulate a failed batch being requeued.
        const failedBatch = [createStubSignal('retry-1'), createStubSignal('retry-2')];
        await queue.requeue(failedBatch);

        // Retry signals should come first.
        const batch = await queue.dequeue(4);

        expect(batch).toHaveLength(4);
        expect(batch[0]?.intentHash).toBe('retry-1');
        expect(batch[1]?.intentHash).toBe('retry-2');
        expect(batch[2]?.intentHash).toBe('new-1');
        expect(batch[3]?.intentHash).toBe('new-2');
    });

    // -------------------------------------------------------------------------
    // Clear
    // -------------------------------------------------------------------------

    it('clears all signals from the queue', async () => {
        const queue = createMemoryQueue();

        await queue.enqueue(createStubSignal('a'));
        await queue.enqueue(createStubSignal('b'));
        await queue.clear();

        expect(await queue.size()).toBe(0);
        expect(await queue.dequeue(10)).toHaveLength(0);
    });
});
