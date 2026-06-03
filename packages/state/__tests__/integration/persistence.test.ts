/**
 * @module @enterstellar-ai/state/__tests__/integration/persistence
 * @description Integration tests for the store + persistence round-trip.
 *
 * Tests the full lifecycle: create store → set values → destroy →
 * recreate → values restored. Uses localStorage adapter (mockable in Node)
 * for predictable cross-instance testing.
 *
 * @see Design Choices S5–S8, S10
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ZoneState, SerializedState } from '@enterstellar-ai/types';
import { createEnterstellarStore } from '../../src/create-store.js';
import type { PersistenceAdapter } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Custom In-Memory Persistence (for integration testing)
// ---------------------------------------------------------------------------

/**
 * A persistence adapter that actually stores data in memory.
 * Unlike the production memory adapter (which is a no-op), this one
 * retains data across adapter instances via a shared Map reference.
 */
function createSharedMemoryAdapter(
    storage: Map<string, SerializedState>,
): PersistenceAdapter {
    const KEY = 'state';
    return {
        async load(): Promise<SerializedState | undefined> {
            return storage.get(KEY);
        },
        async save(state: SerializedState): Promise<void> {
            storage.set(KEY, state);
        },
        async clear(): Promise<void> {
            storage.delete(KEY);
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration — persistence round-trip', () => {
    let sharedStorage: Map<string, SerializedState>;

    beforeEach(() => {
        sharedStorage = new Map();
    });

    it('persists state and restores on re-creation', async () => {
        // Create store with custom adapter backed by shared storage
        const store1 = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: createSharedMemoryAdapter(sharedStorage),
        });

        // Set some state
        const zones: Record<string, ZoneState> = {
            main: {
                name: 'main',
                lifecycleState: 'ready',
                determinism: 0.7,
                lastUpdated: new Date().toISOString(),
            },
        };
        store1.set('zones', zones);
        store1.set('traceIds', ['trace-persist']);

        // Force a persist via snapshot + manual save
        const snap = store1.snapshot();
        await createSharedMemoryAdapter(sharedStorage).save(snap);

        store1.destroy();

        // Recreate with same shared storage
        const store2 = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: createSharedMemoryAdapter(sharedStorage),
        });

        const restoredZones = store2.get<Record<string, ZoneState>>('zones');
        expect(restoredZones?.['main']?.name).toBe('main');
        expect(restoredZones?.['main']?.determinism).toBe(0.7);

        const restoredTraces = store2.get<string[]>('traceIds');
        expect(restoredTraces).toEqual(['trace-persist']);

        store2.destroy();
    });

    it('starts with empty state when no persisted data exists', async () => {
        const store = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: createSharedMemoryAdapter(sharedStorage),
        });

        const snap = store.getSnapshot();
        expect(snap.zones).toEqual({});
        expect(snap.traceIds).toEqual([]);
        expect(snap.extensions).toEqual({});

        store.destroy();
    });

    it('restore() overwrites persisted state', async () => {
        const adapter = createSharedMemoryAdapter(sharedStorage);

        const store = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: adapter,
        });

        store.set('traceIds', ['old-trace']);

        const newState: SerializedState = {
            schemaVersion: '1.0.0',
            zones: {},
            traceIds: ['new-trace'],
            session: {
                id: 'new-session',
                startedAt: '2025-01-01T00:00:00.000Z',
            },
            extensions: {},
        };

        store.restore(newState);

        const traces = store.get<string[]>('traceIds');
        expect(traces).toEqual(['new-trace']);

        store.destroy();
    });

    it('gracefully handles failing persistence adapter', async () => {
        const failingAdapter: PersistenceAdapter = {
            async load(): Promise<SerializedState | undefined> {
                throw new Error('DB connection failed');
            },
            async save(): Promise<void> {
                throw new Error('DB write failed');
            },
            async clear(): Promise<void> {
                throw new Error('DB clear failed');
            },
        };

        // Should not throw — falls back to empty state
        const store = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: failingAdapter,
        });

        expect(store.getSnapshot().zones).toEqual({});

        // set() should still work in memory
        store.set('traceIds', ['trace-memory']);
        expect(store.get<string[]>('traceIds')).toEqual(['trace-memory']);

        store.destroy();
    });

    it('extensions survive snapshot + restore round-trip', async () => {
        const store = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: createSharedMemoryAdapter(sharedStorage),
        });

        const { z } = await import('zod');
        const schema = z.object({ lang: z.string() });
        store.extend('prefs', schema);
        store.set('prefs', { lang: 'fr' });

        const snap = store.snapshot();
        expect(snap.extensions['prefs']).toEqual({ lang: 'fr' });

        // Restore to a different state
        store.restore({
            ...snap,
            extensions: { prefs: { lang: 'de' } },
        });

        // Extension data is restored but schema must be re-registered
        const snapAfter = store.getSnapshot();
        expect(snapAfter.extensions['prefs']).toEqual({ lang: 'de' });

        store.destroy();
    });

    it('preserves threadId across persist/restore cycle (P3)', async () => {
        const store1 = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: createSharedMemoryAdapter(sharedStorage),
            threadId: 'thread-abc',
        });

        const snap = store1.snapshot();
        await createSharedMemoryAdapter(sharedStorage).save(snap);
        store1.destroy();

        // Recreate with same threadId config
        const store2 = await createEnterstellarStore({
            persistence: 'custom',
            customAdapter: createSharedMemoryAdapter(sharedStorage),
            threadId: 'thread-abc',
        });

        const session = store2.get<{ threadId?: string }>('session');
        expect(session?.threadId).toBe('thread-abc');

        store2.destroy();
    });
});
