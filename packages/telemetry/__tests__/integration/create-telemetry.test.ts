/**
 * @module @enterstellar-ai/telemetry/__tests__/integration/create-telemetry
 * @description Integration tests for `createTelemetryCollector`.
 *
 * Exercises the full pipeline: record → build → queue → flush → transport.
 * Tests disabled mode (TL9), active collector lifecycle, disposal,
 * IndexedDB queue wiring (TL4), and graceful fallback when IndexedDB
 * is unavailable.
 */

// IMPORTANT: `fake-indexeddb/auto` must be imported BEFORE any module that
// references `indexedDB`. It polyfills `globalThis.indexedDB` in Node.js,
// enabling the IndexedDB queue tests to run in the Vitest environment.
import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelemetryCollector } from '../../src/create-telemetry.js';
import type { ForgeSignalInput, TelemetryCollector } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const VALID_INPUT: ForgeSignalInput = {
    rawIntent: 'show patient vitals',
    componentName: 'PatientVitals',
    intentCategory: 'clinical',
    compilationStatus: 'pass',
    forgeMode: 'none',
    forgeUsed: false,
    latencyMs: 12,
    selfCorrectionAttempts: 0,
    correctionTokensUsed: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cleans up the `enterstellar-telemetry` IndexedDB database between tests.
 * Required to prevent state leakage across tests that use IndexedDB queues.
 */
async function cleanupIndexedDB(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (globalThis.indexedDB === undefined) {
        return;
    }

    const deleteRequest = indexedDB.deleteDatabase('enterstellar-telemetry');
    await new Promise<void>((resolve) => {
        deleteRequest.onsuccess = () => { resolve(); };
        deleteRequest.onerror = () => { resolve(); };
        deleteRequest.onblocked = () => { resolve(); };
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTelemetryCollector', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Mock fetch globally for cloud transport.
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(null, { status: 200 })),
        );
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        await cleanupIndexedDB();
    });

    // -------------------------------------------------------------------------
    // TL9: Enterprise opt-out
    // -------------------------------------------------------------------------

    describe('disabled mode (TL9)', () => {
        it('returns a frozen no-op collector', async () => {
            const collector = await createTelemetryCollector({ disabled: true });

            expect(Object.isFrozen(collector)).toBe(true);
        });

        it('record() is a silent no-op', async () => {
            const collector = await createTelemetryCollector({ disabled: true });

            // Should not throw.
            collector.record(VALID_INPUT);
        });

        it('flush() returns zero results', async () => {
            const collector = await createTelemetryCollector({ disabled: true });

            const result = await collector.flush();

            expect(result.sent).toBe(0);
            expect(result.failed).toBe(0);
        });

        it('getStats() returns empty stats', async () => {
            const collector = await createTelemetryCollector({ disabled: true });

            const stats = collector.getStats();

            expect(stats.totalSent).toBe(0);
            expect(stats.totalFailed).toBe(0);
            expect(stats.lastFlushAt).toBeNull();
        });

        it('dispose() resolves without error', async () => {
            const collector = await createTelemetryCollector({ disabled: true });

            await expect(collector.dispose()).resolves.toBeUndefined();
        });

        it('returns the same instance for multiple disabled calls', async () => {
            const collector1 = await createTelemetryCollector({ disabled: true });
            const collector2 = await createTelemetryCollector({ disabled: true });

            expect(collector1).toBe(collector2); // Same frozen singleton.
        });
    });

    // -------------------------------------------------------------------------
    // Active collector (memory queue)
    // -------------------------------------------------------------------------

    describe('active collector (memory queue)', () => {
        let collector: TelemetryCollector;

        afterEach(async () => {
            await collector.dispose();
        });

        it('creates a non-frozen collector with defaults', async () => {
            collector = await createTelemetryCollector({
                queueStrategy: 'memory',
                platform: 'web',
                registrySize: 10,
            });

            expect(Object.isFrozen(collector)).toBe(false);
        });

        it('creates a collector with no config (all defaults)', async () => {
            // Default queueStrategy is 'indexedDB' (Bible §4.12), which requires
            // real timers (fake-indexeddb uses setTimeout internally). Since this
            // test section validates memory queue behavior, we explicitly pass
            // queueStrategy: 'memory' to avoid the timer interaction.
            collector = await createTelemetryCollector({
                queueStrategy: 'memory',
            });
            expect(collector).toBeDefined();
            expect(collector.record).toBeTypeOf('function');
            expect(collector.flush).toBeTypeOf('function');
            expect(collector.getStats).toBeTypeOf('function');
            expect(collector.dispose).toBeTypeOf('function');
        });

        it('records signals and flushes them to the transport', async () => {
            // Use real timers for this test — the fire-and-forget buildSignal
            // chain uses crypto.subtle.digest which is async and does not
            // interact with fake timers.
            vi.useRealTimers();

            const sentBodies: string[] = [];
            vi.stubGlobal(
                'fetch',
                vi.fn(async (_url: string, init: RequestInit) => {
                    sentBodies.push(init.body as string);
                    return new Response(null, { status: 200 });
                }),
            );

            collector = await createTelemetryCollector({
                queueStrategy: 'memory',
                platform: 'web',
                registrySize: 5,
                endpoint: 'https://test.api/v1/signals',
                flushIntervalMs: 60_000, // Long interval to prevent auto-flush.
            });

            collector.record(VALID_INPUT);

            // Wait for the async signal building (hash) to complete.
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 50);
            });

            const result = await collector.flush();

            expect(result.sent).toBe(1);
            expect(sentBodies).toHaveLength(1);

            // Verify the sent payload is a JSON array of ForgeSignals.
            const parsed = JSON.parse(sentBodies[0] as string) as unknown[];
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(1);
        });

        it('tracks totalSent in stats after successful flush', async () => {
            // Use real timers — same reason as above.
            vi.useRealTimers();

            vi.stubGlobal(
                'fetch',
                vi.fn(async () => new Response(null, { status: 200 })),
            );

            collector = await createTelemetryCollector({
                queueStrategy: 'memory',
                platform: 'web',
                registrySize: 5,
                flushIntervalMs: 60_000,
            });

            collector.record(VALID_INPUT);
            collector.record({ ...VALID_INPUT, rawIntent: 'show medication list' });

            // Wait for the async signal building to complete.
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 50);
            });

            await collector.flush();

            const stats = collector.getStats();
            expect(stats.totalSent).toBe(2);
        });

        it('silently drops record() calls after dispose', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn(async () => new Response(null, { status: 200 })),
            );

            collector = await createTelemetryCollector({
                queueStrategy: 'memory',
                platform: 'web',
                registrySize: 5,
            });

            await collector.dispose();

            // Should not throw.
            collector.record(VALID_INPUT);

            await vi.advanceTimersByTimeAsync(50);
            const result = await collector.flush();

            expect(result.sent).toBe(0);
        });

        it('dispose() is safe to call multiple times', async () => {
            collector = await createTelemetryCollector({
                queueStrategy: 'memory',
                platform: 'web',
            });

            await collector.dispose();
            await expect(collector.dispose()).resolves.toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // TL4: IndexedDB queue wiring
    // -------------------------------------------------------------------------

    describe('IndexedDB queue wiring (TL4)', () => {
        let collector: TelemetryCollector;

        afterEach(async () => {
            await collector.dispose();
        });

        it('creates a functional collector with indexedDB queue strategy', async () => {
            // With `fake-indexeddb/auto`, IndexedDB is available in the
            // Node.js test environment. This test verifies end-to-end wiring:
            // factory → IndexedDB queue → record → flush → transport.
            vi.useRealTimers();

            const sentBodies: string[] = [];
            vi.stubGlobal(
                'fetch',
                vi.fn(async (_url: string, init: RequestInit) => {
                    sentBodies.push(init.body as string);
                    return new Response(null, { status: 200 });
                }),
            );

            collector = await createTelemetryCollector({
                queueStrategy: 'indexedDB',
                platform: 'web',
                registrySize: 10,
                endpoint: 'https://test.api/v1/signals',
                flushIntervalMs: 60_000, // Long interval to prevent auto-flush.
            });

            collector.record(VALID_INPUT);

            // Wait for async signal building (SHA-256 hash) + IndexedDB enqueue.
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });

            const result = await collector.flush();

            expect(result.sent).toBe(1);
            expect(sentBodies).toHaveLength(1);

            // Verify the sent payload is a valid JSON array.
            const parsed = JSON.parse(sentBodies[0] as string) as unknown[];
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(1);
        });

        it('falls back to memory queue when IndexedDB is unavailable', async () => {
            // Use real timers — fake-indexeddb uses setTimeout(fn, 0) internally.
            // Even though we're deleting the indexedDB global (so the error path
            // is synchronous), the scheduler cleanup in afterEach requires real
            // timer resolution for the flush interval.
            vi.useRealTimers();
            const originalIndexedDB = globalThis.indexedDB;

            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete (globalThis as Record<string, unknown>)['indexedDB'];

            try {
                // Factory should NOT throw — it falls back to memory silently.
                collector = await createTelemetryCollector({
                    queueStrategy: 'indexedDB',
                    platform: 'web',
                    registrySize: 5,
                });

                expect(collector).toBeDefined();
                expect(collector.record).toBeTypeOf('function');
                expect(collector.flush).toBeTypeOf('function');
            } finally {
                // Restore the IndexedDB global for other tests.
                globalThis.indexedDB = originalIndexedDB;
            }
        });

        it('uses default queueStrategy (indexedDB) when config omits it', async () => {
            // With `fake-indexeddb/auto`, the default `'indexedDB'` strategy
            // should succeed. This test verifies the Bible §4.12 default.
            vi.useRealTimers();

            vi.stubGlobal(
                'fetch',
                vi.fn(async () => new Response(null, { status: 200 })),
            );

            // No queueStrategy specified — should default to 'indexedDB'.
            collector = await createTelemetryCollector({
                platform: 'web',
                registrySize: 5,
                flushIntervalMs: 60_000,
            });

            collector.record(VALID_INPUT);

            // Wait for async signal building + IndexedDB enqueue.
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });

            const result = await collector.flush();

            // If IndexedDB queue was used (and not memory), the signal
            // should have been enqueued, dequeued, and sent successfully.
            expect(result.sent).toBe(1);
        });
    });
});
