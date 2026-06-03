/**
 * @module @enterstellar-ai/adapter-firebase/__tests__/create-firebase-data-adapter
 * @description Unit tests for `createFirebaseDataAdapter()`.
 *
 * Tests run against **mock Firestore** (`vi.fn()` stubs — no real Firebase project).
 * All Firestore functions (`collection`, `getDocs`, `addDoc`, `updateDoc`,
 * `deleteDoc`, `doc`, `onSnapshot`, `query`, `where`) are mocked at the module
 * level via `vi.mock('firebase/firestore')`.
 *
 * Coverage:
 * - Valid creation → frozen adapter with all 3 methods
 * - `query()` delegation → `getDocs(collection(...))`, returns `{ id, ...data() }`
 * - `query()` with params → `where()` constraints + `firestoreQuery()` applied
 * - `query()` without params → no constraints, direct collection ref
 * - `mutate('create')` → `addDoc()`, returns `{ id, ...payload }` (strips input id)
 * - `mutate('update')` → `updateDoc()` with `doc()` ref, strips id from payload
 * - `mutate('delete')` → `deleteDoc()` with `doc()` ref, returns `null`
 * - `subscribe()` → `onSnapshot()`, callback receives mapped docs, returns unsubscribe
 * - AD5 error wrapping → Firestore errors become `EnterstellarError` (ENS-7003/7004)
 *
 * @see src/create-firebase-data-adapter.ts
 * @see Design Choice AD3, AD5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createFirebaseDataAdapter } from '../src/create-firebase-data-adapter.js';

// ---------------------------------------------------------------------------
// Module Mock — firebase/firestore
// ---------------------------------------------------------------------------
// vi.mock() factories are hoisted above all other declarations by Vitest.
// vi.hoisted() ensures sentinels, mutable state, and helpers are initialized
// BEFORE the mock factory executes. See: https://vitest.dev/api/vi.html#vi-hoisted
// ---------------------------------------------------------------------------

/**
 * All state shared between the vi.mock factory and test bodies must live
 * inside vi.hoisted() to avoid "Cannot access before initialization" errors.
 */
const {
    COLLECTION_REF,
    DOC_REF,
    QUERY_REF,
    WHERE_CONSTRAINT,
    onSnapshotUnsubscribeSpy,
    createMockSnapshot,
    state,
} = vi.hoisted(() => {
    /** Sentinel objects returned by mocked Firestore functions for identity checks. */
    const COLLECTION_REF = Symbol('collectionRef');
    const DOC_REF = Symbol('docRef');
    const QUERY_REF = Symbol('queryRef');
    const WHERE_CONSTRAINT = Symbol('whereConstraint');

    /** Spy for the unsubscribe function returned by `onSnapshot`. */
    const onSnapshotUnsubscribeSpy = vi.fn();

    /**
     * Mock snapshot factory for `getDocs` and `onSnapshot` results.
     * Each doc has `id` and `data()` matching Firestore's `QueryDocumentSnapshot`.
     */
    function createMockSnapshot(docs: { id: string; fields: Record<string, unknown> }[]) {
        return {
            docs: docs.map((d) => ({
                id: d.id,
                data: () => d.fields,
            })),
        };
    }

    /**
     * Mutable state container — shared between vi.mock factory and test bodies.
     * Wrapped in an object so the reference is stable across hoisting boundaries.
     */
    const state = {
        /** Captured `onSnapshot` callback — call it to simulate realtime events. */
        capturedSnapshotCallback: null as ((snapshot: unknown) => void) | null,
        /** Default snapshot returned by `getDocs`. */
        mockGetDocsResult: createMockSnapshot([
            { id: 'doc-1', fields: { name: 'Patient A', status: 'active' } },
        ]),
        /** Controls whether `getDocs` should throw instead of resolving. */
        mockGetDocsError: null as Error | null,
        /** Controls whether `addDoc` should throw instead of resolving. */
        mockAddDocError: null as Error | null,
        /** Controls whether `updateDoc` should throw instead of resolving. */
        mockUpdateDocError: null as Error | null,
        /** Controls whether `deleteDoc` should throw instead of resolving. */
        mockDeleteDocError: null as Error | null,
    };

    return {
        COLLECTION_REF,
        DOC_REF,
        QUERY_REF,
        WHERE_CONSTRAINT,
        onSnapshotUnsubscribeSpy,
        createMockSnapshot,
        state,
    };
});

vi.mock('firebase/firestore', () => ({
    collection: vi.fn().mockReturnValue(COLLECTION_REF),
    doc: vi.fn().mockReturnValue(DOC_REF),
    where: vi.fn().mockReturnValue(WHERE_CONSTRAINT),
    query: vi.fn().mockReturnValue(QUERY_REF),

    getDocs: vi.fn().mockImplementation(async () => {
        if (state.mockGetDocsError) throw state.mockGetDocsError;
        return state.mockGetDocsResult;
    }),

    addDoc: vi.fn().mockImplementation(async () => {
        if (state.mockAddDocError) throw state.mockAddDocError;
        return { id: 'new-doc-id' };
    }),

    updateDoc: vi.fn().mockImplementation(async () => {
        if (state.mockUpdateDocError) throw state.mockUpdateDocError;
    }),

    deleteDoc: vi.fn().mockImplementation(async () => {
        if (state.mockDeleteDocError) throw state.mockDeleteDocError;
    }),

    onSnapshot: vi.fn().mockImplementation(
        (_ref: unknown, cb: (snapshot: unknown) => void) => {
            state.capturedSnapshotCallback = cb;
            return onSnapshotUnsubscribeSpy;
        },
    ),
}));

// ---------------------------------------------------------------------------
// Mock Firestore Instance
// ---------------------------------------------------------------------------

/**
 * Creates a mock Firestore instance for testing.
 * The actual Firestore functions are mocked at the module level,
 * so this is just a sentinel object passed to the factory.
 */
function createMockFirestore() {
    return {} as unknown as Parameters<typeof createFirebaseDataAdapter>[0]['firestore'];
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
    // Reset all module-level mocks — clear call counts AND reset return values.
    // Without mockClear(), call counts accumulate across tests, causing
    // assertions like `not.toHaveBeenCalled()` to fail spuriously.
    const firestore = await import('firebase/firestore');
    vi.mocked(firestore.collection).mockClear().mockReturnValue(COLLECTION_REF as unknown as ReturnType<typeof firestore.collection>);
    vi.mocked(firestore.doc).mockClear().mockReturnValue(DOC_REF as unknown as ReturnType<typeof firestore.doc>);
    vi.mocked(firestore.where).mockClear().mockReturnValue(WHERE_CONSTRAINT as unknown as ReturnType<typeof firestore.where>);
    vi.mocked(firestore.query).mockClear().mockReturnValue(QUERY_REF as unknown as ReturnType<typeof firestore.query>);
    vi.mocked(firestore.getDocs).mockClear();
    vi.mocked(firestore.addDoc).mockClear();
    vi.mocked(firestore.updateDoc).mockClear();
    vi.mocked(firestore.deleteDoc).mockClear();
    vi.mocked(firestore.onSnapshot).mockClear();

    // Reset test-level state
    state.capturedSnapshotCallback = null;
    onSnapshotUnsubscribeSpy.mockClear();
    state.mockGetDocsResult = createMockSnapshot([
        { id: 'doc-1', fields: { name: 'Patient A', status: 'active' } },
    ]);
    state.mockGetDocsError = null;
    state.mockAddDocError = null;
    state.mockUpdateDocError = null;
    state.mockDeleteDocError = null;
});

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — valid creation', () => {
    it('creates an adapter from a valid Firestore instance', () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        expect(adapter).toBeDefined();
        expect(typeof adapter.query).toBe('function');
        expect(typeof adapter.mutate).toBe('function');
        expect(typeof adapter.subscribe).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('accepts a custom adapter name', () => {
        const firestore = createMockFirestore();

        expect(() => {
            createFirebaseDataAdapter({ firestore, name: 'custom-firebase-data' });
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// query() — Delegation
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — query() delegation', () => {
    it('calls collection() with the firestore instance and resource name', async () => {
        const { collection } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.query('patients');

        expect(collection).toHaveBeenCalledWith(firestore, 'patients');
    });

    it('calls getDocs() to fetch documents', async () => {
        const { getDocs } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.query('patients');

        expect(getDocs).toHaveBeenCalled();
    });

    it('returns documents with injected id field', async () => {
        state.mockGetDocsResult = createMockSnapshot([
            { id: 'doc-1', fields: { name: 'Patient A' } },
            { id: 'doc-2', fields: { name: 'Patient B' } },
        ]);
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        const result = await adapter.query('patients');

        expect(result).toEqual([
            { id: 'doc-1', name: 'Patient A' },
            { id: 'doc-2', name: 'Patient B' },
        ]);
    });

    it('returns empty array when collection has no documents', async () => {
        state.mockGetDocsResult = createMockSnapshot([]);
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        const result = await adapter.query('patients');

        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// query() — With Params (where constraints)
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — query() with params', () => {
    it('applies where() equality constraints from params', async () => {
        const { where } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.query('patients', { status: 'active' });

        expect(where).toHaveBeenCalledWith('status', '==', 'active');
    });

    it('applies multiple where() constraints for multiple params', async () => {
        const { where } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.query('patients', { status: 'active', type: 'outpatient' });

        expect(where).toHaveBeenCalledWith('status', '==', 'active');
        expect(where).toHaveBeenCalledWith('type', '==', 'outpatient');
    });

    it('uses firestoreQuery() when params are provided', async () => {
        const { query: firestoreQuery } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.query('patients', { status: 'active' });

        expect(firestoreQuery).toHaveBeenCalled();
    });

    it('does not call firestoreQuery() when no params are provided', async () => {
        const { query: firestoreQuery } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.query('patients');

        expect(firestoreQuery).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// mutate('create') — addDoc
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — mutate("create")', () => {
    it('calls addDoc() with collection ref and payload', async () => {
        const { addDoc, collection } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.mutate('patients', 'create', { name: 'Jane Doe' });

        expect(collection).toHaveBeenCalledWith(firestore, 'patients');
        expect(addDoc).toHaveBeenCalledWith(
            COLLECTION_REF,
            expect.objectContaining({ name: 'Jane Doe' }),
        );
    });

    it('returns the new document with auto-generated id', async () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        const result = await adapter.mutate('patients', 'create', {
            name: 'Jane Doe',
            status: 'active',
        });

        expect(result).toEqual({
            id: 'new-doc-id',
            name: 'Jane Doe',
            status: 'active',
        });
    });

    it('strips id from the payload when creating (Firestore auto-generates)', async () => {
        const { addDoc } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.mutate('patients', 'create', {
            id: 'should-be-stripped',
            name: 'Jane Doe',
        });

        // The payload passed to addDoc should NOT contain `id`
        expect(addDoc).toHaveBeenCalledWith(
            COLLECTION_REF,
            expect.not.objectContaining({ id: 'should-be-stripped' }),
        );
    });
});

// ---------------------------------------------------------------------------
// mutate('update') — updateDoc
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — mutate("update")', () => {
    it('calls doc() and updateDoc() with the correct document reference', async () => {
        const { doc: docFn, updateDoc } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.mutate('patients', 'update', {
            id: 'doc-1',
            name: 'Updated Name',
        });

        expect(docFn).toHaveBeenCalledWith(firestore, 'patients', 'doc-1');
        expect(updateDoc).toHaveBeenCalledWith(
            DOC_REF,
            expect.objectContaining({ name: 'Updated Name' }),
        );
    });

    it('returns updated data with the original id', async () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        const result = await adapter.mutate('patients', 'update', {
            id: 'doc-1',
            name: 'Updated',
            status: 'inactive',
        });

        expect(result).toEqual({
            id: 'doc-1',
            name: 'Updated',
            status: 'inactive',
        });
    });

    it('strips id from the update payload (avoids writing id as a field)', async () => {
        const { updateDoc } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.mutate('patients', 'update', {
            id: 'doc-1',
            name: 'Updated',
        });

        expect(updateDoc).toHaveBeenCalledWith(
            DOC_REF,
            expect.not.objectContaining({ id: 'doc-1' }),
        );
    });
});

// ---------------------------------------------------------------------------
// mutate('delete') — deleteDoc
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — mutate("delete")', () => {
    it('calls doc() and deleteDoc() with the correct document reference', async () => {
        const { doc: docFn, deleteDoc } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        await adapter.mutate('patients', 'delete', { id: 'doc-1' });

        expect(docFn).toHaveBeenCalledWith(firestore, 'patients', 'doc-1');
        expect(deleteDoc).toHaveBeenCalledWith(DOC_REF);
    });

    it('returns null on successful delete', async () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        const result = await adapter.mutate('patients', 'delete', { id: 'doc-1' });

        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// subscribe() — onSnapshot
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — subscribe() delegation', () => {
    it('calls onSnapshot() with the collection reference', async () => {
        const { onSnapshot, collection } = await import('firebase/firestore');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        adapter.subscribe('patients', vi.fn());

        expect(collection).toHaveBeenCalledWith(firestore, 'patients');
        expect(onSnapshot).toHaveBeenCalledWith(
            COLLECTION_REF,
            expect.any(Function),
        );
    });

    it('returns a working unsubscribe function', () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        const unsubscribe = adapter.subscribe('patients', vi.fn());

        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
        expect(onSnapshotUnsubscribeSpy).toHaveBeenCalledOnce();
    });

    it('calls callback with mapped documents when snapshot fires', () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });
        const callback = vi.fn();

        adapter.subscribe('patients', callback);

        // Simulate a snapshot event
        const snapshot = createMockSnapshot([
            { id: 'doc-1', fields: { name: 'Patient A' } },
            { id: 'doc-2', fields: { name: 'Patient B' } },
        ]);
        state.capturedSnapshotCallback?.(snapshot);

        expect(callback).toHaveBeenCalledWith([
            { id: 'doc-1', name: 'Patient A' },
            { id: 'doc-2', name: 'Patient B' },
        ]);
    });

    it('calls callback with empty array when snapshot has no documents', () => {
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });
        const callback = vi.fn();

        adapter.subscribe('patients', callback);
        state.capturedSnapshotCallback?.(createMockSnapshot([]));

        expect(callback).toHaveBeenCalledWith([]);
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping (delegated to createDataAdapter)
// ---------------------------------------------------------------------------

describe('createFirebaseDataAdapter — AD5 error wrapping', () => {
    it('wraps query() Firestore errors as EnterstellarError (ENS-7003)', async () => {
        state.mockGetDocsError = new Error('Firestore permission denied');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        try {
            await adapter.query('patients');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7003');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
        }
    });

    it('wraps mutate("create") Firestore errors as EnterstellarError (ENS-7004)', async () => {
        state.mockAddDocError = new Error('Firestore write denied');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        try {
            await adapter.mutate('patients', 'create', { name: 'Test' });
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7004');
        }
    });

    it('wraps mutate("update") Firestore errors as EnterstellarError (ENS-7004)', async () => {
        state.mockUpdateDocError = new Error('Firestore update failed');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        try {
            await adapter.mutate('patients', 'update', { id: 'doc-1', name: 'Updated' });
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7004');
        }
    });

    it('wraps mutate("delete") Firestore errors as EnterstellarError (ENS-7004)', async () => {
        state.mockDeleteDocError = new Error('Firestore delete failed');
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        try {
            await adapter.mutate('patients', 'delete', { id: 'doc-1' });
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7004');
        }
    });

    it('preserves original Firestore error in cause', async () => {
        const originalError = new Error('Firestore unavailable');
        state.mockGetDocsError = originalError;
        const firestore = createMockFirestore();
        const adapter = createFirebaseDataAdapter({ firestore });

        try {
            await adapter.query('patients');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.cause).toBe(originalError);
        }
    });
});
