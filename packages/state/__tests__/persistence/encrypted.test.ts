/**
 * @module @enterstellar-ai/state/__tests__/persistence/encrypted
 * @description Tests for the AES-GCM encrypted persistence adapter.
 *
 * Uses Web Crypto API (available in Node.js 20+) to generate test keys.
 * Tests: round-trip, unique IV, wrong key, unencrypted data migration.
 *
 * @see Design Choice S7 — optional AES-GCM encryption.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SerializedState } from '@enterstellar-ai/types';
import { createEncryptedAdapter } from '../../src/persistence/encrypted.js';
import type { PersistenceAdapter } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STATE: SerializedState = {
    schemaVersion: '1.0.0',
    zones: {},
    traceIds: ['trace-enc-1'],
    session: {
        id: 'session-enc',
        startedAt: '2025-01-01T00:00:00.000Z',
    },
    extensions: {},
};

/**
 * Generates a random AES-GCM CryptoKey for testing.
 */
async function generateTestKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    );
}

/**
 * Creates a simple in-memory adapter for testing the encryption wrapper.
 * Unlike the production memory adapter, this one actually stores data.
 */
function createTestBackend(): PersistenceAdapter & { stored: SerializedState | undefined } {
    const backend = {
        stored: undefined as SerializedState | undefined,
        async load(): Promise<SerializedState | undefined> {
            return backend.stored;
        },
        async save(state: SerializedState): Promise<void> {
            backend.stored = state;
        },
        async clear(): Promise<void> {
            backend.stored = undefined;
        },
    };
    return backend;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEncryptedAdapter', () => {
    let key: CryptoKey;

    beforeEach(async () => {
        key = await generateTestKey();
    });

    it('encrypt/decrypt round-trip preserves state', async () => {
        const backend = createTestBackend();
        const adapter = createEncryptedAdapter(backend, key);

        await adapter.save(MOCK_STATE);
        const loaded = await adapter.load();

        expect(loaded).toEqual(MOCK_STATE);
    });

    it('stored data is encrypted (not plain JSON)', async () => {
        const backend = createTestBackend();
        const adapter = createEncryptedAdapter(backend, key);

        await adapter.save(MOCK_STATE);

        // The backend should store an encrypted payload, not the raw state.
        // The encrypted payload has `iv` and `data` fields (strings).
        const raw = backend.stored as unknown as Record<string, unknown>;
        expect(raw).toBeDefined();
        expect(typeof raw['iv']).toBe('string');
        expect(typeof raw['data']).toBe('string');
        // Should NOT have plain state fields
        expect(raw['schemaVersion']).toBeUndefined();
    });

    it('generates unique IV per write', async () => {
        const backend1 = createTestBackend();
        const backend2 = createTestBackend();
        const adapter1 = createEncryptedAdapter(backend1, key);
        const adapter2 = createEncryptedAdapter(backend2, key);

        await adapter1.save(MOCK_STATE);
        await adapter2.save(MOCK_STATE);

        const raw1 = backend1.stored as unknown as Record<string, string>;
        const raw2 = backend2.stored as unknown as Record<string, string>;

        // IVs should be different (random per write)
        expect(raw1['iv']).not.toBe(raw2['iv']);
    });

    it('load() returns undefined with wrong key', async () => {
        const backend = createTestBackend();
        const adapter = createEncryptedAdapter(backend, key);
        await adapter.save(MOCK_STATE);

        // Try to load with a different key
        const wrongKey = await generateTestKey();
        const wrongAdapter = createEncryptedAdapter(backend, wrongKey);
        const loaded = await wrongAdapter.load();

        expect(loaded).toBeUndefined();
    });

    it('load() returns undefined when no data is stored', async () => {
        const backend = createTestBackend();
        const adapter = createEncryptedAdapter(backend, key);
        const loaded = await adapter.load();

        expect(loaded).toBeUndefined();
    });

    it('clear() delegates to inner adapter', async () => {
        const backend = createTestBackend();
        const adapter = createEncryptedAdapter(backend, key);

        await adapter.save(MOCK_STATE);
        expect(backend.stored).toBeDefined();

        await adapter.clear();
        expect(backend.stored).toBeUndefined();
    });
});
