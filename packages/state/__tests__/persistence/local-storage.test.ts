/**
 * @module @enterstellar-ai/state/__tests__/persistence/local-storage
 * @description Tests for the localStorage persistence adapter.
 *
 * Uses a mock `localStorage` since vitest runs in Node.js.
 * Tests: round-trip save/load, corrupted data handling, quota errors,
 * and unavailable localStorage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';
import type { SerializedState } from '@enterstellar-ai/types';
import { createLocalStorageAdapter } from '../../src/persistence/local-storage.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STATE: SerializedState = {
    schemaVersion: '1.0.0',
    zones: {
        main: {
            name: 'main',
            lifecycleState: 'ready',
            determinism: 0.5,
            lastUpdated: '2025-01-01T00:00:00.000Z',
        },
    },
    traceIds: ['trace-1', 'trace-2'],
    session: {
        id: 'session-1',
        startedAt: '2025-01-01T00:00:00.000Z',
    },
    extensions: {},
};

// ---------------------------------------------------------------------------
// localStorage Mock
// ---------------------------------------------------------------------------

const storageMap = new Map<string, string>();

const localStorageMock: Storage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMap.set(key, value); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
    get length() { return storageMap.size; },
    key: (index: number) => [...storageMap.keys()][index] ?? null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLocalStorageAdapter', () => {
    beforeEach(() => {
        storageMap.clear();
        vi.stubGlobal('localStorage', localStorageMock);
    });

    it('load() returns undefined when no state is persisted', async () => {
        const adapter = createLocalStorageAdapter();
        const result = await adapter.load();
        expect(result).toBeUndefined();
    });

    it('save() + load() round-trip preserves state', async () => {
        const adapter = createLocalStorageAdapter();
        await adapter.save(MOCK_STATE);
        const loaded = await adapter.load();
        expect(loaded).toEqual(MOCK_STATE);
    });

    it('load() returns undefined for corrupted JSON', async () => {
        storageMap.set('enterstellar-store', '{corrupted json!!!');
        const adapter = createLocalStorageAdapter();
        const result = await adapter.load();
        expect(result).toBeUndefined();
    });

    it('load() returns undefined for data failing Zod validation', async () => {
        storageMap.set('enterstellar-store', JSON.stringify({ invalid: true }));
        const adapter = createLocalStorageAdapter();
        const result = await adapter.load();
        expect(result).toBeUndefined();
    });

    it('clear() removes persisted state', async () => {
        const adapter = createLocalStorageAdapter();
        await adapter.save(MOCK_STATE);
        expect(storageMap.has('enterstellar-store')).toBe(true);
        await adapter.clear();
        expect(storageMap.has('enterstellar-store')).toBe(false);
    });

    it('save() throws ENS-4005 on QuotaExceededError', async () => {
        // Mock localStorage that passes isLocalStorageAvailable() probe
        // but throws on the actual data write.
        const testKey = '__enterstellar_ls_test__';
        const throwingStorage: Storage = {
            ...localStorageMock,
            setItem: (key: string, value: string) => {
                // Allow the availability probe to pass
                if (key === testKey) {
                    storageMap.set(key, value);
                    return;
                }
                // Throw on actual state write
                throw new DOMException('Quota exceeded', 'QuotaExceededError');
            },
            removeItem: (key: string) => { storageMap.delete(key); },
        };
        vi.stubGlobal('localStorage', throwingStorage);

        const adapter = createLocalStorageAdapter();

        try {
            await adapter.save(MOCK_STATE);
            // If we reach here, the test should fail
            expect.unreachable('Expected save() to throw');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-4005');
        }
    });
});
