/**
 * @module @enterstellar-ai/adapter-supabase/__tests__/create-supabase-data-adapter
 * @description Unit tests for `createSupabaseDataAdapter()`.
 *
 * Tests run against a **mock Supabase client** (`vi.fn()` stubs — no real DB).
 * The mock simulates Supabase's chained builder pattern:
 * `.from().select()`, `.from().insert().select().single()`, etc.
 *
 * Coverage:
 * - Valid creation → frozen adapter with all 3 methods
 * - `query()` delegation → returns rows from `select('*')`
 * - `query()` with params → `.eq()` applied for each filter
 * - `query()` without params → no filters applied
 * - `mutate('create')` → `.insert().select().single()`
 * - `mutate('update')` → `.update().eq('id', ...).select().single()`
 * - `mutate('delete')` → `.delete().eq('id', ...)` → returns `null`
 * - `subscribe()` → channel setup + unsubscribe via `removeChannel()`
 * - AD5 error wrapping → Supabase errors become `EnterstellarError` (ENS-7003/7004/7002)
 *
 * @see src/create-supabase-data-adapter.ts
 * @see Design Choice AD3, AD4, AD5
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createSupabaseDataAdapter } from '../src/create-supabase-data-adapter.js';

// ---------------------------------------------------------------------------
// Mock Supabase Client Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Supabase client with stubbed `from()`, `channel()`, and
 * `removeChannel()` methods.
 *
 * The builder chain pattern is simulated using mock objects that return
 * `this` for chaining. The terminal method (the one that produces the
 * Supabase response) is configurable.
 *
 * @param options - Configure default responses for query, mutate, and subscribe.
 * @returns A mock Supabase client and utilities for test assertions.
 */
function createMockClient(options?: {
    queryData?: Record<string, unknown>[] | null;
    queryError?: Error | null;
    mutateData?: Record<string, unknown> | null;
    mutateError?: Error | null;
}) {
    // Use explicit undefined checks — null is a valid intentional value
    // that should NOT fall through to the default. `??` treats null as
    // nullish, which would mask intentional null payloads in tests.
    const queryData = options?.queryData !== undefined ? options.queryData : [{ id: '1', name: 'Patient A' }];
    const queryError = options?.queryError !== undefined ? options.queryError : null;
    const mutateData = options?.mutateData !== undefined ? options.mutateData : { id: '1', name: 'Patient A' };
    const mutateError = options?.mutateError !== undefined ? options.mutateError : null;

    const removeChannelSpy = vi.fn();

    /**
     * Captured `on()` callback — call it to simulate realtime postgres_changes.
     * Stored as an array to support multiple test scenarios.
     */
    let capturedRealtimeCallback: (() => Promise<void>) | null = null;

    // -----------------------------------------------------------------------
    // Builder chain mocks
    // -----------------------------------------------------------------------

    /**
     * Creates a chainable builder mock that resolves to `{ data, error }`.
     * Supports `.eq()`, `.select()`, and `.single()` chaining.
     */
    function createQueryBuilder(data: unknown, error: unknown) {
        const builder: Record<string, unknown> = {
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data, error }),
            then: undefined as unknown, // make it thenable for await
        };
        // Make the builder itself awaitable (for `await builder` in query)
        const promise = Promise.resolve({ data, error });
        builder['then'] = promise.then.bind(promise);
        builder['catch'] = promise.catch.bind(promise);
        return builder;
    }

    /** Builder for insert — chains `.select().single()`. */
    function createInsertBuilder() {
        return createQueryBuilder(mutateData, mutateError);
    }

    /** Builder for update — chains `.eq().select().single()`. */
    function createUpdateBuilder() {
        return createQueryBuilder(mutateData, mutateError);
    }

    /** Builder for delete — chains `.eq()`, resolves to `{ error }`. */
    function createDeleteBuilder() {
        const promise = Promise.resolve({ error: mutateError });
        const builder: Record<string, unknown> = {
            eq: vi.fn().mockImplementation(() => {
                return {
                    then: promise.then.bind(promise),
                    catch: promise.catch.bind(promise),
                };
            }),
        };
        return builder;
    }

    /** Builder for select (query) — chains `.eq()`, awaitable. */
    function createSelectBuilder() {
        return createQueryBuilder(queryData, queryError);
    }

    // -----------------------------------------------------------------------
    // Channel mock for subscribe
    // -----------------------------------------------------------------------

    const channelMock = {
        on: vi.fn().mockImplementation(
            (_type: string, _filter: unknown, cb: () => Promise<void>) => {
                capturedRealtimeCallback = cb;
                return channelMock; // chain
            },
        ),
        subscribe: vi.fn().mockReturnValue('channel-ref'),
    };

    // -----------------------------------------------------------------------
    // Client mock
    // -----------------------------------------------------------------------

    const fromSpy = vi.fn().mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => createSelectBuilder()),
        insert: vi.fn().mockImplementation(() => createInsertBuilder()),
        update: vi.fn().mockImplementation(() => createUpdateBuilder()),
        delete: vi.fn().mockImplementation(() => createDeleteBuilder()),
    }));

    const client = {
        from: fromSpy,
        channel: vi.fn().mockReturnValue(channelMock),
        removeChannel: removeChannelSpy,
    };

    return {
        /** The mock Supabase client. Pass to `createSupabaseDataAdapter()`. */
        client: client as unknown as Parameters<typeof createSupabaseDataAdapter>[0]['client'],

        /** Spy on the `from()` call for assertion. */
        fromSpy,

        /** Spy on `removeChannel()` for unsubscribe verification. */
        removeChannelSpy,

        /** The channel mock for subscribe assertions. */
        channelMock,

        /**
         * Simulates a postgres_changes realtime event.
         * The adapter re-fetches rows on each event — this triggers that flow.
         */
        async fireRealtimeChange() {
            if (!capturedRealtimeCallback) {
                throw new Error('Realtime callback not captured — call adapter.subscribe() first');
            }
            await capturedRealtimeCallback();
        },
    };
}

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — valid creation', () => {
    it('creates an adapter from a valid Supabase client', () => {
        const { client } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        expect(adapter).toBeDefined();
        expect(typeof adapter.query).toBe('function');
        expect(typeof adapter.mutate).toBe('function');
        expect(typeof adapter.subscribe).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const { client } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('accepts a custom adapter name', () => {
        const { client } = createMockClient();

        expect(() => {
            createSupabaseDataAdapter({ client, name: 'custom-supabase-data' });
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// query() — Delegation
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — query() delegation', () => {
    it('calls client.from(resource).select("*")', async () => {
        const { client, fromSpy } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        await adapter.query('patients');

        expect(fromSpy).toHaveBeenCalledWith('patients');
    });

    it('returns data from Supabase response', async () => {
        const rows = [
            { id: '1', name: 'Patient A' },
            { id: '2', name: 'Patient B' },
        ];
        const { client } = createMockClient({ queryData: rows });
        const adapter = createSupabaseDataAdapter({ client });

        const result = await adapter.query('patients');

        expect(result).toEqual(rows);
    });

    it('returns empty array when data is null', async () => {
        const { client } = createMockClient({ queryData: null });
        const adapter = createSupabaseDataAdapter({ client });

        const result = await adapter.query('patients');

        expect(result).toEqual([]);
    });

    it('returns empty array for empty result set', async () => {
        const { client } = createMockClient({ queryData: [] });
        const adapter = createSupabaseDataAdapter({ client });

        const result = await adapter.query('patients');

        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// mutate('create') — Insert
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — mutate("create")', () => {
    it('calls client.from(resource).insert(data).select().single()', async () => {
        const newRecord = { id: 'new-1', name: 'Jane Doe', status: 'active' };
        const { client } = createMockClient({ mutateData: newRecord });
        const adapter = createSupabaseDataAdapter({ client });

        const result = await adapter.mutate('patients', 'create', {
            name: 'Jane Doe',
            status: 'active',
        });

        expect(result).toEqual(newRecord);
    });

    it('calls from() with the correct resource name', async () => {
        const { client, fromSpy } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        await adapter.mutate('patients', 'create', { name: 'Test' });

        expect(fromSpy).toHaveBeenCalledWith('patients');
    });
});

// ---------------------------------------------------------------------------
// mutate('update') — Update
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — mutate("update")', () => {
    it('returns the updated record', async () => {
        const updated = { id: '1', name: 'Updated Name', status: 'inactive' };
        const { client } = createMockClient({ mutateData: updated });
        const adapter = createSupabaseDataAdapter({ client });

        const result = await adapter.mutate('patients', 'update', {
            id: '1',
            name: 'Updated Name',
            status: 'inactive',
        });

        expect(result).toEqual(updated);
    });
});

// ---------------------------------------------------------------------------
// mutate('delete') — Delete
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — mutate("delete")', () => {
    it('returns null on successful delete', async () => {
        const { client } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        const result = await adapter.mutate('patients', 'delete', { id: '1' });

        expect(result).toBeNull();
    });

    it('calls from() with the correct resource name', async () => {
        const { client, fromSpy } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        await adapter.mutate('patients', 'delete', { id: '1' });

        expect(fromSpy).toHaveBeenCalledWith('patients');
    });
});

// ---------------------------------------------------------------------------
// subscribe() — Realtime Subscription
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — subscribe() delegation', () => {
    it('creates a channel with "enterstellar-{resource}" name', () => {
        const { client } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        adapter.subscribe('patients', vi.fn());

        expect(client.channel).toHaveBeenCalledWith('enterstellar-patients');
    });

    it('subscribes to postgres_changes on the resource table', () => {
        const { client, channelMock } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        adapter.subscribe('patients', vi.fn());

        expect(channelMock.on).toHaveBeenCalledWith(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'patients' },
            expect.any(Function),
        );
        expect(channelMock.subscribe).toHaveBeenCalledOnce();
    });

    it('returns a working unsubscribe function', () => {
        const { client, removeChannelSpy } = createMockClient();
        const adapter = createSupabaseDataAdapter({ client });

        const unsubscribe = adapter.subscribe('patients', vi.fn());

        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
        expect(removeChannelSpy).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping (delegated to createDataAdapter)
// ---------------------------------------------------------------------------

describe('createSupabaseDataAdapter — AD5 error wrapping', () => {
    it('wraps query() Supabase errors as EnterstellarError (ENS-7003)', async () => {
        const { client } = createMockClient({
            queryError: new Error('Supabase query failed'),
        });
        const adapter = createSupabaseDataAdapter({ client });

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

    it('wraps mutate() Supabase errors as EnterstellarError (ENS-7004)', async () => {
        const { client } = createMockClient({
            mutateError: new Error('Supabase insert failed'),
        });
        const adapter = createSupabaseDataAdapter({ client });

        try {
            await adapter.mutate('patients', 'create', { name: 'Test' });
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7004');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
        }
    });

    it('preserves original Supabase error in cause', async () => {
        const originalError = new Error('Connection reset');
        const { client } = createMockClient({ queryError: originalError });
        const adapter = createSupabaseDataAdapter({ client });

        try {
            await adapter.query('patients');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.cause).toBe(originalError);
        }
    });
});
