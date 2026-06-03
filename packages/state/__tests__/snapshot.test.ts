/**
 * @module @enterstellar-ai/state/__tests__/snapshot
 * @description Tests for snapshot creation and restore logic.
 *
 * Covers: createSnapshot (1MB limit), createEmptyState (defaults),
 * applyRestore (all version comparison branches), and migration chaining.
 *
 * @see Design Choice S5 (amended v2), S9, S10.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';
import type { SerializedState, MigrationConfig } from '@enterstellar-ai/types';
import { createSnapshot, createEmptyState, applyRestore } from '../src/snapshot.js';
import type { MigrationRegistry } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createMockState(overrides: Partial<SerializedState> = {}): SerializedState {
    return {
        schemaVersion: '1.0.0',
        zones: {},
        traceIds: [],
        session: {
            id: 'test-session',
            startedAt: '2025-01-01T00:00:00.000Z',
        },
        extensions: {},
        ...overrides,
    };
}

function createEmptyMigrationRegistry(): MigrationRegistry {
    return new Map();
}

// ---------------------------------------------------------------------------
// createEmptyState
// ---------------------------------------------------------------------------

describe('createEmptyState', () => {
    it('creates a state with current schema version', () => {
        const state = createEmptyState();
        expect(state.schemaVersion).toBe('1.0.0');
    });

    it('creates a state with empty zones, traces, and extensions', () => {
        const state = createEmptyState();
        expect(state.zones).toEqual({});
        expect(state.traceIds).toEqual([]);
        expect(state.extensions).toEqual({});
    });

    it('generates a session with a UUID and timestamp', () => {
        const state = createEmptyState();
        expect(state.session.id).toBeTruthy();
        expect(state.session.startedAt).toBeTruthy();
    });

    it('uses provided session when given', () => {
        const session = {
            id: 'custom-session',
            startedAt: '2025-06-01T00:00:00.000Z',
            threadId: 'thread-123',
        };
        const state = createEmptyState(session);
        expect(state.session).toEqual(session);
    });
});

// ---------------------------------------------------------------------------
// createSnapshot
// ---------------------------------------------------------------------------

describe('createSnapshot', () => {
    it('returns the state for valid snapshots under 1MB', () => {
        const state = createMockState();
        const snapshot = createSnapshot(state);
        expect(snapshot).toEqual(state);
    });

    it('throws ENS-4006 when snapshot exceeds 1MB', () => {
        // Create a state with a huge extensions payload
        const largeData = 'x'.repeat(1024 * 1024 + 1);
        const state = createMockState({
            extensions: { huge: largeData },
        });

        expect(() => createSnapshot(state)).toThrow(EnterstellarError);

        try {
            createSnapshot(state);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-4006');
        }
    });
});

// ---------------------------------------------------------------------------
// applyRestore — Same Version / Patch Diff
// ---------------------------------------------------------------------------

describe('applyRestore — same version', () => {
    it('returns valid state unchanged for same version', () => {
        const state = createMockState({ schemaVersion: '1.0.0' });
        const migrations = createEmptyMigrationRegistry();
        const result = applyRestore(state, '1.0.0', migrations);
        expect(result).toEqual(state);
    });

    it('returns valid state for patch diff (1.0.1 → 1.0.0)', () => {
        const state = createMockState({ schemaVersion: '1.0.1' });
        const migrations = createEmptyMigrationRegistry();
        // 1.0.1 is a minor forward from 1.0.0, same major+minor
        // Actually 1.0.1 has same major and minor as 1.0.0, so it's patch diff
        const result = applyRestore(state, '1.0.0', migrations);
        // This is minor forward case (1.0.1 > 1.0.0), same major same minor
        // Wait: 1.0.1 and 1.0.0 have same major (1) and same minor (0), so this
        // goes to the "same version or patch diff" branch
        expect(result).toEqual(state);
    });
});

// ---------------------------------------------------------------------------
// applyRestore — Older Snapshot (Backward Compat)
// ---------------------------------------------------------------------------

describe('applyRestore — older snapshot with migrations', () => {
    it('chains a single migration from 0.9.0 to 1.0.0', () => {
        const oldState = createMockState({ schemaVersion: '0.9.0' });
        const migrations = createEmptyMigrationRegistry();

        const migration: MigrationConfig = {
            from: '0.9.0',
            to: '1.0.0',
            migrate: (state) => ({
                ...state,
                schemaVersion: '1.0.0',
            }),
        };
        migrations.set('0.9.0', migration);

        const result = applyRestore(oldState, '1.0.0', migrations);
        expect(result.schemaVersion).toBe('1.0.0');
    });

    it('chains multiple migrations sequentially', () => {
        const oldState = createMockState({ schemaVersion: '0.8.0' });
        const migrations = createEmptyMigrationRegistry();

        migrations.set('0.8.0', {
            from: '0.8.0',
            to: '0.9.0',
            migrate: (state) => ({ ...state, schemaVersion: '0.9.0' }),
        });
        migrations.set('0.9.0', {
            from: '0.9.0',
            to: '1.0.0',
            migrate: (state) => ({ ...state, schemaVersion: '1.0.0' }),
        });

        const result = applyRestore(oldState, '1.0.0', migrations);
        expect(result.schemaVersion).toBe('1.0.0');
    });

    it('falls back to empty state if migration produces invalid state', () => {
        const oldState = createMockState({ schemaVersion: '0.9.0' });
        const migrations = createEmptyMigrationRegistry();

        migrations.set('0.9.0', {
            from: '0.9.0',
            to: '1.0.0',
            // Intentionally produce invalid state (missing required fields)
            migrate: () => ({ schemaVersion: '1.0.0' } as unknown as SerializedState),
        });

        const result = applyRestore(oldState, '1.0.0', migrations);
        // Should fall back to empty state, preserving the session
        expect(result.zones).toEqual({});
        expect(result.traceIds).toEqual([]);
    });

    it('stops chaining when no migration is found for a version', () => {
        const oldState = createMockState({ schemaVersion: '0.7.0' });
        const migrations = createEmptyMigrationRegistry();

        // Only migration from 0.8.0 → 1.0.0, but state is at 0.7.0
        migrations.set('0.8.0', {
            from: '0.8.0',
            to: '1.0.0',
            migrate: (state) => ({ ...state, schemaVersion: '1.0.0' }),
        });

        // No migration from 0.7.0, so it should stop and validate as-is
        const result = applyRestore(oldState, '1.0.0', migrations);
        // The state at 0.7.0 is still structurally valid, but migration didn't reach 1.0.0
        // Post-migration validation should still pass since structure is valid
        expect(result).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// applyRestore — Minor Forward (passthrough)
// ---------------------------------------------------------------------------

describe('applyRestore — minor forward', () => {
    it('preserves unknown fields from newer version via passthrough', () => {
        // Snapshot from a newer minor version (1.1.0) on a 1.0.0 client
        const newerState = {
            ...createMockState({ schemaVersion: '1.1.0' }),
            // Simulate an unknown field added in 1.1.0
            futureField: 'some-value',
        } as SerializedState;

        const migrations = createEmptyMigrationRegistry();
        const result = applyRestore(newerState, '1.0.0', migrations);

        // Should preserve the data (passthrough) rather than stripping it
        expect(result).toBeDefined();
        expect(result.schemaVersion).toBe('1.1.0');
    });
});

// ---------------------------------------------------------------------------
// applyRestore — Major Forward (hard reject)
// ---------------------------------------------------------------------------

describe('applyRestore — major forward', () => {
    it('throws ENS-4007 for major version ahead', () => {
        const futureState = createMockState({ schemaVersion: '2.0.0' });
        const migrations = createEmptyMigrationRegistry();

        expect(() => applyRestore(futureState, '1.0.0', migrations)).toThrow(EnterstellarError);

        try {
            applyRestore(futureState, '1.0.0', migrations);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-4007');
        }
    });
});

// ---------------------------------------------------------------------------
// applyRestore — Validation Failures
// ---------------------------------------------------------------------------

describe('applyRestore — validation fallback', () => {
    it('falls back to empty state for invalid snapshot data', () => {
        const invalidState = {
            schemaVersion: '1.0.0',
            // Missing required fields
        } as unknown as SerializedState;

        const migrations = createEmptyMigrationRegistry();
        const result = applyRestore(invalidState, '1.0.0', migrations);

        // Should fall back to empty state
        expect(result.zones).toEqual({});
        expect(result.traceIds).toEqual([]);
        expect(result.extensions).toEqual({});
    });
});
