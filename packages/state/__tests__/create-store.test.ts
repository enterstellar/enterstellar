/**
 * @module @enterstellar-ai/state/__tests__/create-store
 * @description Tests for `createEnterstellarStore()` — the main factory function.
 *
 * Covers: factory initialization, get/set for fixed keys and extensions,
 * subscribe with shallow equality, extend with Zod validation,
 * snapshot/restore, getSnapshot caching, destroy cleanup,
 * trace FIFO eviction, and invalid key errors.
 *
 * @see Design Choices S1–S15
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';
import type { SerializedState, ZoneState, SessionState } from '@enterstellar-ai/types';
import { z } from 'zod';
import { createEnterstellarStore } from '../src/create-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a store with memory persistence (default) for testing.
 * Shorthand to avoid repeating config in every test.
 */
async function createTestStore(overrides: Parameters<typeof createEnterstellarStore>[0] = {}) {
    return createEnterstellarStore({ persistence: 'memory', ...overrides });
}

// ---------------------------------------------------------------------------
// Factory Initialization
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — factory', () => {
    it('creates a store with all required methods', async () => {
        const store = await createTestStore();
        expect(typeof store.get).toBe('function');
        expect(typeof store.set).toBe('function');
        expect(typeof store.subscribe).toBe('function');
        expect(typeof store.extend).toBe('function');
        expect(typeof store.snapshot).toBe('function');
        expect(typeof store.restore).toBe('function');
        expect(typeof store.registerMigration).toBe('function');
        expect(typeof store.getSnapshot).toBe('function');
        expect(typeof store.destroy).toBe('function');
    });

    it('initializes with empty zones, traces, and extensions', async () => {
        const store = await createTestStore();
        const snap = store.getSnapshot();
        expect(snap.zones).toEqual({});
        expect(snap.traceIds).toEqual([]);
        expect(snap.extensions).toEqual({});
    });

    it('generates a session with UUID on creation', async () => {
        const store = await createTestStore();
        const snap = store.getSnapshot();
        expect(snap.session.id).toBeTruthy();
        expect(snap.session.startedAt).toBeTruthy();
    });

    it('uses provided threadId in session', async () => {
        const store = await createTestStore({ threadId: 'patient-123' });
        const snap = store.getSnapshot();
        expect(snap.session.threadId).toBe('patient-123');
    });
});

// ---------------------------------------------------------------------------
// get() / set() — Fixed Keys
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — get/set fixed keys', () => {
    it('get("zones") returns empty object initially', async () => {
        const store = await createTestStore();
        const zones = store.get<Record<string, ZoneState>>('zones');
        expect(zones).toEqual({});
    });

    it('set("zones") + get("zones") round-trip', async () => {
        const store = await createTestStore();
        const zoneData: Record<string, ZoneState> = {
            main: {
                name: 'main',
                lifecycleState: 'ready',
                determinism: 0.5,
                lastUpdated: new Date().toISOString(),
            },
        };
        store.set('zones', zoneData);
        const result = store.get<Record<string, ZoneState>>('zones');
        expect(result).toEqual(zoneData);
    });

    it('get("traceIds") returns empty array initially', async () => {
        const store = await createTestStore();
        const traces = store.get<string[]>('traceIds');
        expect(traces).toEqual([]);
    });

    it('set("traceIds") + get("traceIds") round-trip', async () => {
        const store = await createTestStore();
        store.set('traceIds', ['t1', 't2']);
        const result = store.get<string[]>('traceIds');
        expect(result).toEqual(['t1', 't2']);
    });

    it('get("session") returns session with id', async () => {
        const store = await createTestStore();
        const session = store.get<SessionState>('session');
        expect(session?.id).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// get() / set() — Invalid Keys
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — invalid keys', () => {
    it('get() throws ENS-4004 for unknown key', async () => {
        const store = await createTestStore();
        expect(() => store.get('nonexistent')).toThrow(EnterstellarError);

        try {
            store.get('nonexistent');
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-4004');
        }
    });

    it('set() throws ENS-4004 for unknown key', async () => {
        const store = await createTestStore();
        expect(() => store.set('nonexistent', 'value')).toThrow(EnterstellarError);
    });
});

// ---------------------------------------------------------------------------
// subscribe() — Shallow Equality (S4)
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — subscribe', () => {
    it('fires callback on value change', async () => {
        const store = await createTestStore();
        const callback = vi.fn();
        store.subscribe(callback);

        store.set('traceIds', ['new-trace']);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire callback when value is unchanged (shallow equality)', async () => {
        const store = await createTestStore();
        store.set('traceIds', ['trace-1']);

        const callback = vi.fn();
        store.subscribe(callback);

        // Set to same value — should not fire
        store.set('traceIds', ['trace-1']);
        expect(callback).toHaveBeenCalledTimes(0);
    });

    it('returns an unsubscribe function', async () => {
        const store = await createTestStore();
        const callback = vi.fn();
        const unsubscribe = store.subscribe(callback);

        store.set('traceIds', ['trace-1']);
        expect(callback).toHaveBeenCalledTimes(1);

        unsubscribe();

        store.set('traceIds', ['trace-2']);
        expect(callback).toHaveBeenCalledTimes(1); // Still 1 — unsubscribed
    });

    it('supports multiple subscribers', async () => {
        const store = await createTestStore();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        store.subscribe(cb1);
        store.subscribe(cb2);

        store.set('traceIds', ['trace-1']);
        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('subscriber errors do not crash the store', async () => {
        const store = await createTestStore();
        const badCallback = vi.fn(() => { throw new Error('subscriber error'); });
        const goodCallback = vi.fn();

        store.subscribe(badCallback);
        store.subscribe(goodCallback);

        // Should not throw, and good callback should still fire
        expect(() => store.set('traceIds', ['trace-1'])).not.toThrow();
        expect(goodCallback).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// extend() — Typed Extensions (S2)
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — extend', () => {
    it('registers a new extension', async () => {
        const store = await createTestStore();
        const schema = z.object({ theme: z.string() });

        store.extend('preferences', schema);
        store.set('preferences', { theme: 'dark' });
        const result = store.get<{ theme: string }>('preferences');
        expect(result).toEqual({ theme: 'dark' });
    });

    it('throws ENS-4002 for duplicate extension name', async () => {
        const store = await createTestStore();
        const schema = z.object({ x: z.number() });

        store.extend('myExt', schema);
        expect(() => store.extend('myExt', schema)).toThrow(EnterstellarError);

        try {
            store.extend('myExt', schema);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-4002');
        }
    });

    it('validates extension values on set()', async () => {
        const store = await createTestStore();
        const schema = z.object({ count: z.number() });

        store.extend('counter', schema);

        // Valid value
        expect(() => store.set('counter', { count: 5 })).not.toThrow();

        // Invalid value — should throw ENS-4003
        expect(() => store.set('counter', { count: 'not a number' })).toThrow(EnterstellarError);

        try {
            store.set('counter', { count: 'not a number' });
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-4003');
        }
    });
});

// ---------------------------------------------------------------------------
// snapshot() — 1MB Limit (S9)
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — snapshot', () => {
    it('returns a valid SerializedState', async () => {
        const store = await createTestStore();
        const snap = store.snapshot();
        expect(snap.schemaVersion).toBe('1.0.0');
        expect(snap.zones).toEqual({});
        expect(snap.traceIds).toEqual([]);
        expect(snap.session.id).toBeTruthy();
    });

    it('includes extension data in snapshot', async () => {
        const store = await createTestStore();
        const schema = z.object({ level: z.number() });
        store.extend('settings', schema);
        store.set('settings', { level: 42 });

        const snap = store.snapshot();
        expect(snap.extensions['settings']).toEqual({ level: 42 });
    });
});

// ---------------------------------------------------------------------------
// restore() — Full Overwrite (S10)
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — restore', () => {
    it('restores state from a valid snapshot', async () => {
        const store = await createTestStore();
        const snapshot: SerializedState = {
            schemaVersion: '1.0.0',
            zones: {
                sidebar: {
                    name: 'sidebar',
                    lifecycleState: 'ready',
                    determinism: 0.8,
                    lastUpdated: '2025-01-01T00:00:00.000Z',
                },
            },
            traceIds: ['restored-trace'],
            session: {
                id: 'restored-session',
                startedAt: '2025-01-01T00:00:00.000Z',
            },
            extensions: {},
        };

        store.restore(snapshot);
        const zones = store.get<Record<string, ZoneState>>('zones');
        expect(zones?.['sidebar']?.name).toBe('sidebar');
        expect(store.get<string[]>('traceIds')).toEqual(['restored-trace']);
    });

    it('fires subscriptions after restore (S10)', async () => {
        const store = await createTestStore();
        const callback = vi.fn();
        store.subscribe(callback);

        const snapshot: SerializedState = {
            schemaVersion: '1.0.0',
            zones: {},
            traceIds: ['new-trace'],
            session: {
                id: 'session-2',
                startedAt: '2025-01-01T00:00:00.000Z',
            },
            extensions: {},
        };

        store.restore(snapshot);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('throws ENS-4007 for major version mismatch', async () => {
        const store = await createTestStore();
        const futureSnapshot: SerializedState = {
            schemaVersion: '2.0.0',
            zones: {},
            traceIds: [],
            session: {
                id: 'future-session',
                startedAt: '2025-01-01T00:00:00.000Z',
            },
            extensions: {},
        };

        expect(() => store.restore(futureSnapshot)).toThrow(EnterstellarError);
    });

    it('preserves threadId from config after restore (P3)', async () => {
        const store = await createTestStore({ threadId: 'persistent-thread' });
        const snapshot: SerializedState = {
            schemaVersion: '1.0.0',
            zones: {},
            traceIds: [],
            session: {
                id: 'other-session',
                startedAt: '2025-01-01T00:00:00.000Z',
            },
            extensions: {},
        };

        store.restore(snapshot);
        const session = store.get<SessionState>('session');
        expect(session?.threadId).toBe('persistent-thread');
    });
});

// ---------------------------------------------------------------------------
// getSnapshot() — useSyncExternalStore Compatibility
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — getSnapshot', () => {
    it('returns a referentially stable snapshot when state is unchanged', async () => {
        const store = await createTestStore();
        const snap1 = store.getSnapshot();
        const snap2 = store.getSnapshot();
        expect(snap1).toBe(snap2); // Same reference (cached)
    });

    it('returns a new snapshot reference after state change', async () => {
        const store = await createTestStore();
        const snap1 = store.getSnapshot();

        store.set('traceIds', ['trace-new']);
        const snap2 = store.getSnapshot();

        expect(snap1).not.toBe(snap2); // Different reference (cache invalidated)
    });
});

// ---------------------------------------------------------------------------
// Trace FIFO Eviction (S14)
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — trace FIFO eviction', () => {
    it('evicts oldest traces when maxTraces is exceeded', async () => {
        const store = await createTestStore({ maxTraces: 3 });

        store.set('traceIds', ['t1', 't2', 't3', 't4', 't5']);
        const traces = store.get<string[]>('traceIds');

        // Should keep only the first 3 (FIFO — most recent first per spec)
        expect(traces).toHaveLength(3);
        expect(traces).toEqual(['t1', 't2', 't3']);
    });

    it('does not evict when under maxTraces', async () => {
        const store = await createTestStore({ maxTraces: 10 });

        store.set('traceIds', ['t1', 't2', 't3']);
        const traces = store.get<string[]>('traceIds');
        expect(traces).toHaveLength(3);
    });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('createEnterstellarStore — destroy', () => {
    it('clears all state on destroy', async () => {
        const store = await createTestStore();
        store.set('traceIds', ['trace-1']);
        store.destroy();

        const snap = store.getSnapshot();
        expect(snap.zones).toEqual({});
        expect(snap.traceIds).toEqual([]);
    });

    it('removes all subscriptions on destroy', async () => {
        const store = await createTestStore();
        const callback = vi.fn();
        store.subscribe(callback);

        store.destroy();

        // set() after destroy should be a no-op
        store.set('traceIds', ['trace-1']);
        expect(callback).toHaveBeenCalledTimes(0);
    });
});
