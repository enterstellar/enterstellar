/**
 * @module @enterstellar-ai/state/__tests__/types
 * @description Type-level tests for `@enterstellar-ai/state` public API.
 *
 * Uses `vitest` `expectTypeOf` for compile-time type assertions.
 * These tests verify that the public API types are correctly
 * assignable and that the type contracts match expectations.
 *
 * @see Coding Rules — type-level tests for all exported types.
 */

import { describe, it, expectTypeOf } from 'vitest';
import type {
    EnterstellarStoreConfig,
    PersistenceAdapter,
    EncryptionConfig,
} from '../src/types.js';
import type {
    EnterstellarStore,
    SerializedState,
    ZoneState,
    SessionState,
    MigrationConfig,
    PersistenceStrategy,
    SyncConfig,
} from '@enterstellar-ai/types';
import { createEnterstellarStore } from '../src/create-store.js';
import { STATE_SCHEMA_VERSION } from '../src/version.js';
import { createEmptyState } from '../src/snapshot.js';

// ---------------------------------------------------------------------------
// Factory Return Type
// ---------------------------------------------------------------------------

describe('type-level — createEnterstellarStore', () => {
    it('returns Promise<EnterstellarStore>', () => {
        expectTypeOf(createEnterstellarStore).returns.toEqualTypeOf<Promise<EnterstellarStore>>();
    });

    it('accepts EnterstellarStoreConfig parameter', () => {
        expectTypeOf(createEnterstellarStore).parameter(0).toEqualTypeOf<EnterstellarStoreConfig | undefined>();
    });
});

// ---------------------------------------------------------------------------
// State Version
// ---------------------------------------------------------------------------

describe('type-level — STATE_SCHEMA_VERSION', () => {
    it('is a string', () => {
        expectTypeOf(STATE_SCHEMA_VERSION).toBeString();
    });
});

// ---------------------------------------------------------------------------
// createEmptyState Return Type
// ---------------------------------------------------------------------------

describe('type-level — createEmptyState', () => {
    it('returns SerializedState', () => {
        expectTypeOf(createEmptyState).returns.toEqualTypeOf<SerializedState>();
    });
});

// ---------------------------------------------------------------------------
// EnterstellarStoreConfig Shape
// ---------------------------------------------------------------------------

describe('type-level — EnterstellarStoreConfig', () => {
    it('has optional persistence field of type PersistenceStrategy', () => {
        expectTypeOf<EnterstellarStoreConfig['persistence']>().toEqualTypeOf<PersistenceStrategy | undefined>();
    });

    it('has optional encryption field', () => {
        expectTypeOf<EnterstellarStoreConfig['encryption']>().toEqualTypeOf<EncryptionConfig | undefined>();
    });

    it('has optional sync field of type SyncConfig', () => {
        expectTypeOf<EnterstellarStoreConfig['sync']>().toEqualTypeOf<SyncConfig | undefined>();
    });

    it('has optional maxTraces as number', () => {
        expectTypeOf<EnterstellarStoreConfig['maxTraces']>().toEqualTypeOf<number | undefined>();
    });

    it('has optional devMode as boolean', () => {
        expectTypeOf<EnterstellarStoreConfig['devMode']>().toEqualTypeOf<boolean | undefined>();
    });
});

// ---------------------------------------------------------------------------
// PersistenceAdapter Shape
// ---------------------------------------------------------------------------

describe('type-level — PersistenceAdapter', () => {
    it('load returns Promise<SerializedState | undefined>', () => {
        expectTypeOf<PersistenceAdapter['load']>().returns.toEqualTypeOf<Promise<SerializedState | undefined>>();
    });

    it('save accepts SerializedState and returns Promise<void>', () => {
        expectTypeOf<PersistenceAdapter['save']>().returns.toEqualTypeOf<Promise<void>>();
    });

    it('clear returns Promise<void>', () => {
        expectTypeOf<PersistenceAdapter['clear']>().returns.toEqualTypeOf<Promise<void>>();
    });
});

// ---------------------------------------------------------------------------
// EnterstellarStore Method Types
// ---------------------------------------------------------------------------

describe('type-level — EnterstellarStore methods', () => {
    it('get() returns T | undefined', () => {
        expectTypeOf<EnterstellarStore['get']>().returns.toEqualTypeOf<unknown>();
    });

    it('set() returns void', () => {
        expectTypeOf<EnterstellarStore['set']>().returns.toBeVoid();
    });

    it('subscribe() returns unsubscribe function', () => {
        expectTypeOf<EnterstellarStore['subscribe']>().returns.toEqualTypeOf<() => void>();
    });

    it('snapshot() returns SerializedState', () => {
        expectTypeOf<EnterstellarStore['snapshot']>().returns.toEqualTypeOf<SerializedState>();
    });

    it('restore() returns void', () => {
        expectTypeOf<EnterstellarStore['restore']>().returns.toBeVoid();
    });

    it('getSnapshot() returns SerializedState', () => {
        expectTypeOf<EnterstellarStore['getSnapshot']>().returns.toEqualTypeOf<SerializedState>();
    });

    it('destroy() returns void', () => {
        expectTypeOf<EnterstellarStore['destroy']>().returns.toBeVoid();
    });
});
