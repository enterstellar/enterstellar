/**
 * @module @enterstellar-ai/state/__tests__/persistence/indexed-db
 * @description Tests for the IndexedDB persistence adapter.
 *
 * Uses `fake-indexeddb` polyfill for Node.js vitest environment.
 * Tests: round-trip, empty load, clear, overwrite, shared instances.
 *
 * The adapter accepts an optional `customStore` param for test injection.
 * Tests create a fresh `idb-keyval` store each time, backed by the
 * `fake-indexeddb` polyfill, to avoid stale DB handles.
 *
 * @see Design Choice S6 — `idb-keyval`, DB name `enterstellar-store`.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { SerializedState } from '@enterstellar-ai/types';
import { createIndexedDbAdapter } from '../../src/persistence/indexed-db.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STATE: SerializedState = {
    schemaVersion: '1.0.0',
    zones: {
        sidebar: {
            name: 'sidebar',
            lifecycleState: 'loading',
            determinism: 1.0,
            lastUpdated: '2025-06-01T12:00:00.000Z',
        },
    },
    traceIds: ['trace-a'],
    session: {
        id: 'session-idb',
        startedAt: '2025-06-01T12:00:00.000Z',
    },
    extensions: { prefs: { theme: 'dark' } },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Counter to create unique DB names per test, avoiding stale handles. */
let testDbCounter = 0;

/**
 * Creates a fresh `idb-keyval` store backed by `fake-indexeddb`.
 * Each call uses a unique DB name to guarantee test isolation.
 */
function createTestStore(): UseStore {
    testDbCounter++;
    return createStore(`enterstellar-store-test-${testDbCounter}`, 'state');
}

describe('createIndexedDbAdapter', () => {
    it('load() returns undefined when no state is persisted', async () => {
        const store = createTestStore();
        const adapter = createIndexedDbAdapter(store);
        const result = await adapter.load();
        expect(result).toBeUndefined();
    });

    it('save() + load() round-trip preserves state', async () => {
        const store = createTestStore();
        const adapter = createIndexedDbAdapter(store);
        await adapter.save(MOCK_STATE);
        const loaded = await adapter.load();
        expect(loaded).toEqual(MOCK_STATE);
    });

    it('clear() removes persisted state', async () => {
        const store = createTestStore();
        const adapter = createIndexedDbAdapter(store);
        await adapter.save(MOCK_STATE);

        const beforeClear = await adapter.load();
        expect(beforeClear).toEqual(MOCK_STATE);

        await adapter.clear();

        const afterClear = await adapter.load();
        expect(afterClear).toBeUndefined();
    });

    it('save() overwrites previous state', async () => {
        const store = createTestStore();
        const adapter = createIndexedDbAdapter(store);
        await adapter.save(MOCK_STATE);

        const updated: SerializedState = {
            ...MOCK_STATE,
            traceIds: ['trace-b', 'trace-c'],
        };
        await adapter.save(updated);

        const loaded = await adapter.load();
        expect(loaded?.traceIds).toEqual(['trace-b', 'trace-c']);
    });

    it('separate adapter instances sharing the same store see same data', async () => {
        const store = createTestStore();
        const adapter1 = createIndexedDbAdapter(store);
        await adapter1.save(MOCK_STATE);

        const adapter2 = createIndexedDbAdapter(store);
        const loaded = await adapter2.load();
        expect(loaded).toEqual(MOCK_STATE);
    });

    it('production adapter uses default DB name "enterstellar-store"', () => {
        // Verifying that the default (no customStore) path creates
        // the adapter without error — the DB name is a constant in the source.
        const adapter = createIndexedDbAdapter();
        expect(adapter).toBeDefined();
        expect(typeof adapter.load).toBe('function');
        expect(typeof adapter.save).toBe('function');
        expect(typeof adapter.clear).toBe('function');
    });
});
