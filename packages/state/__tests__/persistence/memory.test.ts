/**
 * @module @enterstellar-ai/state/__tests__/persistence/memory
 * @description Tests for the in-memory persistence adapter.
 *
 * Verifies the no-op behavior: load returns undefined, save and clear
 * complete without error, and no actual persistence occurs.
 */

import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../src/persistence/memory.js';
import type { SerializedState } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_STATE: SerializedState = {
    schemaVersion: '1.0.0',
    zones: {},
    traceIds: [],
    session: {
        id: 'test-session',
        startedAt: '2025-01-01T00:00:00.000Z',
    },
    extensions: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMemoryAdapter', () => {
    it('load() returns undefined (no persisted state)', async () => {
        const adapter = createMemoryAdapter();
        const result = await adapter.load();
        expect(result).toBeUndefined();
    });

    it('save() completes without error', async () => {
        const adapter = createMemoryAdapter();
        await expect(adapter.save(MOCK_STATE)).resolves.toBeUndefined();
    });

    it('clear() completes without error', async () => {
        const adapter = createMemoryAdapter();
        await expect(adapter.clear()).resolves.toBeUndefined();
    });

    it('load() still returns undefined after save()', async () => {
        const adapter = createMemoryAdapter();
        await adapter.save(MOCK_STATE);
        const result = await adapter.load();
        expect(result).toBeUndefined();
    });
});
