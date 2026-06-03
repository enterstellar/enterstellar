/**
 * @module @enterstellar-ai/adapters/__tests__/create-data-adapter
 * @description Unit tests for `createDataAdapter()` and `createNoopDataAdapter()`.
 *
 * Tests:
 * - Valid config → working adapter with all methods
 * - AD5 error wrapping: `query` → ENS-7003, `mutate` → ENS-7004, `subscribe` → ENS-7002
 * - Invalid config → ENS-7001 delegation to validateAdapterConfig
 * - Returned adapter is frozen (Object.freeze — R4 pattern)
 * - Noop adapter: query → [], mutate → null, subscribe → noop unsub
 *
 * @see src/create-data-adapter.ts
 * @see Design Choice AD3 — convention-based dot-notation resolver
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createDataAdapter, createNoopDataAdapter } from '../src/create-data-adapter.js';
import type { DataAdapterConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid DataAdapterConfig with spy functions. */
function createValidConfig(
    overrides?: Partial<DataAdapterConfig>,
): DataAdapterConfig {
    return {
        name: 'test-data',
        query: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
        mutate: vi.fn().mockResolvedValue({ id: '1', name: 'Created' }),
        subscribe: vi.fn().mockReturnValue(() => { }),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createDataAdapter — valid creation', () => {
    it('creates an adapter from valid config', () => {
        const adapter = createDataAdapter(createValidConfig());

        expect(adapter).toBeDefined();
        expect(typeof adapter.query).toBe('function');
        expect(typeof adapter.mutate).toBe('function');
        expect(typeof adapter.subscribe).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const adapter = createDataAdapter(createValidConfig());

        expect(Object.isFrozen(adapter)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — query
// ---------------------------------------------------------------------------

describe('createDataAdapter — method delegation (query)', () => {
    it('query() delegates to config and returns results', async () => {
        const records = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
        const config = createValidConfig({
            query: vi.fn().mockResolvedValue(records),
        });
        const adapter = createDataAdapter(config);

        const result = await adapter.query('patients');

        expect(config.query).toHaveBeenCalledWith('patients', undefined);
        expect(result).toEqual(records);
    });

    it('query() passes params to config', async () => {
        const config = createValidConfig({
            query: vi.fn().mockResolvedValue([]),
        });
        const adapter = createDataAdapter(config);
        const params = { status: 'active', limit: 10 };

        await adapter.query('patients.vitals', params);

        expect(config.query).toHaveBeenCalledWith('patients.vitals', params);
    });

    it('query() returns empty array when config returns empty', async () => {
        const config = createValidConfig({
            query: vi.fn().mockResolvedValue([]),
        });
        const adapter = createDataAdapter(config);

        const result = await adapter.query('empty_table');

        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — mutate
// ---------------------------------------------------------------------------

describe('createDataAdapter — method delegation (mutate)', () => {
    it('mutate() delegates create action to config', async () => {
        const created = { id: '42', name: 'New Patient' };
        const config = createValidConfig({
            mutate: vi.fn().mockResolvedValue(created),
        });
        const adapter = createDataAdapter(config);
        const payload = { name: 'New Patient' };

        const result = await adapter.mutate('patients', 'create', payload);

        expect(config.mutate).toHaveBeenCalledWith('patients', 'create', payload);
        expect(result).toEqual(created);
    });

    it('mutate() returns null for delete action', async () => {
        const config = createValidConfig({
            mutate: vi.fn().mockResolvedValue(null),
        });
        const adapter = createDataAdapter(config);

        const result = await adapter.mutate('patients', 'delete', { id: '42' });

        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — subscribe
// ---------------------------------------------------------------------------

describe('createDataAdapter — method delegation (subscribe)', () => {
    it('subscribe() delegates to config and returns unsubscribe function', () => {
        const unsubscribe = vi.fn();
        const config = createValidConfig({
            subscribe: vi.fn().mockReturnValue(unsubscribe),
        });
        const adapter = createDataAdapter(config);
        const callback = vi.fn();

        const unsub = adapter.subscribe('patients', callback);

        expect(config.subscribe).toHaveBeenCalledWith('patients', callback);
        expect(typeof unsub).toBe('function');
    });

    it('returned unsubscribe function is callable', () => {
        const unsubscribe = vi.fn();
        const config = createValidConfig({
            subscribe: vi.fn().mockReturnValue(unsubscribe),
        });
        const adapter = createDataAdapter(config);

        const unsub = adapter.subscribe('patients', vi.fn());
        unsub();

        expect(unsubscribe).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — query (ENS-7003)
// ---------------------------------------------------------------------------

describe('createDataAdapter — AD5 error wrapping (query → ENS-7003)', () => {
    it('wraps query() errors in ENS-7003', async () => {
        const originalError = new Error('connection refused');
        const config = createValidConfig({
            query: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createDataAdapter(config);

        try {
            await adapter.query('patients.vitals');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7003');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and resource in ENS-7003 message', async () => {
        const config = createValidConfig({
            name: 'supabase-data',
            query: vi.fn().mockRejectedValue(new Error('timeout')),
        });
        const adapter = createDataAdapter(config);

        try {
            await adapter.query('patients.vitals');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('supabase-data');
            expect(error.message).toContain('patients.vitals');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — mutate (ENS-7004)
// ---------------------------------------------------------------------------

describe('createDataAdapter — AD5 error wrapping (mutate → ENS-7004)', () => {
    it('wraps mutate() errors in ENS-7004', async () => {
        const originalError = new Error('unique constraint violation');
        const config = createValidConfig({
            mutate: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createDataAdapter(config);

        try {
            await adapter.mutate('patients', 'create', { name: 'Test' });
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7004');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name, resource, and action in ENS-7004 message', async () => {
        const config = createValidConfig({
            name: 'prisma-data',
            mutate: vi.fn().mockRejectedValue(new Error('fail')),
        });
        const adapter = createDataAdapter(config);

        try {
            await adapter.mutate('medications', 'update', { dose: 100 });
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('prisma-data');
            expect(error.message).toContain('medications');
            expect(error.message).toContain('update');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — subscribe (ENS-7002)
// ---------------------------------------------------------------------------

describe('createDataAdapter — AD5 error wrapping (subscribe → ENS-7002)', () => {
    it('wraps subscribe() errors in ENS-7002', () => {
        const originalError = new Error('channel unavailable');
        const config = createValidConfig({
            subscribe: vi.fn().mockImplementation(() => {
                throw originalError;
            }),
        });
        const adapter = createDataAdapter(config);

        try {
            adapter.subscribe('patients', vi.fn());
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and method name in ENS-7002 message', () => {
        const config = createValidConfig({
            name: 'firebase-data',
            subscribe: vi.fn().mockImplementation(() => {
                throw new Error('fail');
            }),
        });
        const adapter = createDataAdapter(config);

        try {
            adapter.subscribe('users', vi.fn());
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('firebase-data');
            expect(error.message).toContain('subscribe');
        }
    });
});

// ---------------------------------------------------------------------------
// Config Validation Delegation (ENS-7001)
// ---------------------------------------------------------------------------

describe('createDataAdapter — config validation (ENS-7001)', () => {
    it('throws ENS-7001 when name is empty', () => {
        expect(() => {
            createDataAdapter(createValidConfig({ name: '' }));
        }).toThrow(EnterstellarError);

        try {
            createDataAdapter(createValidConfig({ name: '' }));
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
        }
    });

    it('throws ENS-7001 when a required method is missing', () => {
        const config = {
            name: 'test-data',
            mutate: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockReturnValue(() => { }),
            // query intentionally omitted
        } as unknown as DataAdapterConfig;

        expect(() => createDataAdapter(config)).toThrow(EnterstellarError);
        try {
            createDataAdapter(config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('query');
        }
    });
});

// ---------------------------------------------------------------------------
// Noop Factory
// ---------------------------------------------------------------------------

describe('createNoopDataAdapter', () => {
    it('creates a frozen adapter', () => {
        const adapter = createNoopDataAdapter();

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('query() returns empty array', async () => {
        const adapter = createNoopDataAdapter();

        const result = await adapter.query('patients');

        expect(result).toEqual([]);
    });

    it('mutate() returns null', async () => {
        const adapter = createNoopDataAdapter();

        const result = await adapter.mutate('patients', 'create', { name: 'Test' });

        expect(result).toBeNull();
    });

    it('subscribe() returns a callable unsubscribe function', () => {
        const adapter = createNoopDataAdapter();
        const callback = vi.fn();

        const unsub = adapter.subscribe('patients', callback);

        expect(typeof unsub).toBe('function');
        // Should not throw when called
        expect(() => unsub()).not.toThrow();
    });

    it('subscribe callback is never invoked in noop mode', () => {
        const adapter = createNoopDataAdapter();
        const callback = vi.fn();

        adapter.subscribe('patients', callback);

        expect(callback).not.toHaveBeenCalled();
    });
});
