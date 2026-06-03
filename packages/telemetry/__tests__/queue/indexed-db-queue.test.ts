/**
 * @module @enterstellar-ai/telemetry/__tests__/queue/indexed-db-queue
 * @description Tests for the IndexedDB-backed signal queue.
 *
 * Uses `fake-indexeddb` to provide a standards-compliant IndexedDB
 * implementation in the Node.js test environment.
 */

import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import type { ForgeSignal } from '@enterstellar-ai/types';

import type { SignalQueue } from '../../src/queue/signal-queue.js';
import { createIndexedDBQueue } from '../../src/queue/indexed-db-queue.js';

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

describe('createIndexedDBQueue', () => {
    /** Track the queue so we can close it before cleanup. */
    let queue: SignalQueue | undefined;

    afterEach(async () => {
        // Close the IDBDatabase connection first — `fake-indexeddb` (and real
        // browsers) block `deleteDatabase` while connections remain open.
        queue?.close?.();
        queue = undefined;

        // Now safely delete the database.
        const deleteRequest = indexedDB.deleteDatabase('enterstellar-telemetry');
        await new Promise<void>((resolve) => {
            deleteRequest.onsuccess = () => { resolve(); };
            deleteRequest.onerror = () => { resolve(); };
            deleteRequest.onblocked = () => { resolve(); };
        });
    });

    it('starts empty with size 0', async () => {
        queue = await createIndexedDBQueue();

        expect(await queue.size()).toBe(0);
    });

    it('enqueues signals and increases size', async () => {
        queue = await createIndexedDBQueue();

        await queue.enqueue(createStubSignal('aaa'));
        await queue.enqueue(createStubSignal('bbb'));

        expect(await queue.size()).toBe(2);
    });

    it('dequeues signals in FIFO order', async () => {
        queue = await createIndexedDBQueue();

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
        queue = await createIndexedDBQueue();

        await queue.enqueue(createStubSignal('only'));

        const batch = await queue.dequeue(100);

        expect(batch).toHaveLength(1);
        expect(batch[0]?.intentHash).toBe('only');
        expect(await queue.size()).toBe(0);
    });

    it('returns empty array when dequeuing from empty queue', async () => {
        queue = await createIndexedDBQueue();

        const batch = await queue.dequeue(10);

        expect(batch).toHaveLength(0);
    });

    it('requeues signals back into the store', async () => {
        queue = await createIndexedDBQueue();

        await queue.enqueue(createStubSignal('new-1'));

        const failedBatch = [createStubSignal('retry-1'), createStubSignal('retry-2')];
        await queue.requeue(failedBatch);

        // All 3 signals should be in the queue.
        expect(await queue.size()).toBe(3);
    });

    it('clears all signals from the queue', async () => {
        queue = await createIndexedDBQueue();

        await queue.enqueue(createStubSignal('a'));
        await queue.enqueue(createStubSignal('b'));
        await queue.clear();

        expect(await queue.size()).toBe(0);
        expect(await queue.dequeue(10)).toHaveLength(0);
    });

    it('uses database named "enterstellar-telemetry" (TL4 isolation)', async () => {
        queue = await createIndexedDBQueue();

        // Verify the database exists with the correct name.
        const databases = await indexedDB.databases();
        const telemetryDb = databases.find((db) => db.name === 'enterstellar-telemetry');

        expect(telemetryDb).toBeDefined();
        expect(telemetryDb?.name).toBe('enterstellar-telemetry');
    });
});
