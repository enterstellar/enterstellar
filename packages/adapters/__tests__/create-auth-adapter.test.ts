/**
 * @module @enterstellar-ai/adapters/__tests__/create-auth-adapter
 * @description Unit tests for `createAuthAdapter()` and `createNoopAuthAdapter()`.
 *
 * Tests:
 * - Valid config → working adapter with all methods
 * - AD5 error wrapping: `getSession` → ENS-7005, `hasRole` → ENS-7005, `onAuthChange` → ENS-7002
 * - Invalid config → ENS-7001 delegation to validateAdapterConfig
 * - Returned adapter is frozen (Object.freeze — R4 pattern)
 * - Noop adapter: getSession → null, hasRole → false, onAuthChange → noop unsubscribe
 *
 * @see src/create-auth-adapter.ts
 * @see Design Choice AD1 — minimal but complete: getSession, hasRole, onAuthChange
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createAuthAdapter, createNoopAuthAdapter } from '../src/create-auth-adapter.js';
import type { AuthAdapterConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid AuthAdapterConfig with spy functions. */
function createValidConfig(
    overrides?: Partial<AuthAdapterConfig>,
): AuthAdapterConfig {
    return {
        name: 'test-auth',
        getSession: vi.fn().mockResolvedValue({ userId: 'user-1', roles: ['clinician'] }),
        hasRole: vi.fn().mockResolvedValue(true),
        onAuthChange: vi.fn().mockReturnValue(() => { /* noop unsubscribe */ }),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createAuthAdapter — valid creation', () => {
    it('creates an adapter from valid config', () => {
        const adapter = createAuthAdapter(createValidConfig());

        expect(adapter).toBeDefined();
        expect(typeof adapter.getSession).toBe('function');
        expect(typeof adapter.hasRole).toBe('function');
        expect(typeof adapter.onAuthChange).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const adapter = createAuthAdapter(createValidConfig());

        expect(Object.isFrozen(adapter)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation
// ---------------------------------------------------------------------------

describe('createAuthAdapter — method delegation', () => {
    it('getSession() delegates to config and returns result', async () => {
        const session = { userId: 'user-42', roles: ['admin', 'clinician'] };
        const config = createValidConfig({
            getSession: vi.fn().mockResolvedValue(session),
        });
        const adapter = createAuthAdapter(config);

        const result = await adapter.getSession();

        expect(config.getSession).toHaveBeenCalledOnce();
        expect(result).toEqual(session);
    });

    it('getSession() returns null when config returns null', async () => {
        const config = createValidConfig({
            getSession: vi.fn().mockResolvedValue(null),
        });
        const adapter = createAuthAdapter(config);

        const result = await adapter.getSession();

        expect(result).toBeNull();
    });

    it('hasRole() delegates to config with the role argument', async () => {
        const config = createValidConfig({
            hasRole: vi.fn().mockResolvedValue(true),
        });
        const adapter = createAuthAdapter(config);

        const result = await adapter.hasRole('admin');

        expect(config.hasRole).toHaveBeenCalledWith('admin');
        expect(result).toBe(true);
    });

    it('hasRole() returns false when config returns false', async () => {
        const config = createValidConfig({
            hasRole: vi.fn().mockResolvedValue(false),
        });
        const adapter = createAuthAdapter(config);

        const result = await adapter.hasRole('superadmin');

        expect(result).toBe(false);
    });

    it('onAuthChange() delegates to config with the callback', () => {
        const mockUnsubscribe = vi.fn();
        const config = createValidConfig({
            onAuthChange: vi.fn().mockReturnValue(mockUnsubscribe),
        });
        const adapter = createAuthAdapter(config);
        const callback = vi.fn();

        const unsubscribe = adapter.onAuthChange(callback);

        expect(config.onAuthChange).toHaveBeenCalledWith(callback);
        expect(typeof unsubscribe).toBe('function');
    });

    it('onAuthChange() returns a working unsubscribe function', () => {
        const mockUnsubscribe = vi.fn();
        const config = createValidConfig({
            onAuthChange: vi.fn().mockReturnValue(mockUnsubscribe),
        });
        const adapter = createAuthAdapter(config);
        const callback = vi.fn();

        const unsubscribe = adapter.onAuthChange(callback);
        unsubscribe();

        expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — getSession (ENS-7005)
// ---------------------------------------------------------------------------

describe('createAuthAdapter — AD5 error wrapping (getSession → ENS-7005)', () => {
    it('wraps getSession() errors in ENS-7005', async () => {
        const originalError = new Error('network timeout');
        const config = createValidConfig({
            getSession: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createAuthAdapter(config);

        try {
            await adapter.getSession();
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7005');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and operation in ENS-7005 message', async () => {
        const config = createValidConfig({
            name: 'supabase-auth',
            getSession: vi.fn().mockRejectedValue(new Error('fail')),
        });
        const adapter = createAuthAdapter(config);

        try {
            await adapter.getSession();
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('supabase-auth');
            expect(error.message).toContain('getSession');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — hasRole (ENS-7005)
// ---------------------------------------------------------------------------

describe('createAuthAdapter — AD5 error wrapping (hasRole → ENS-7005)', () => {
    it('wraps hasRole() errors in ENS-7005', async () => {
        const originalError = new TypeError('invalid token');
        const config = createValidConfig({
            hasRole: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createAuthAdapter(config);

        try {
            await adapter.hasRole('admin');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7005');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and operation in ENS-7005 message', async () => {
        const config = createValidConfig({
            name: 'clerk-auth',
            hasRole: vi.fn().mockRejectedValue(new Error('expired')),
        });
        const adapter = createAuthAdapter(config);

        try {
            await adapter.hasRole('clinician');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('clerk-auth');
            expect(error.message).toContain('hasRole');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — onAuthChange (ENS-7002)
// ---------------------------------------------------------------------------

describe('createAuthAdapter — AD5 error wrapping (onAuthChange → ENS-7002)', () => {
    it('wraps onAuthChange() subscription setup errors in ENS-7002', () => {
        const originalError = new Error('subscription setup failed');
        const config = createValidConfig({
            onAuthChange: vi.fn().mockImplementation(() => {
                throw originalError;
            }),
        });
        const adapter = createAuthAdapter(config);

        try {
            adapter.onAuthChange(vi.fn());
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
            name: 'firebase-auth',
            onAuthChange: vi.fn().mockImplementation(() => {
                throw new Error('fail');
            }),
        });
        const adapter = createAuthAdapter(config);

        try {
            adapter.onAuthChange(vi.fn());
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('firebase-auth');
            expect(error.message).toContain('onAuthChange');
        }
    });
});

// ---------------------------------------------------------------------------
// Config Validation Delegation (ENS-7001)
// ---------------------------------------------------------------------------

describe('createAuthAdapter — config validation (ENS-7001)', () => {
    it('throws ENS-7001 when name is empty', () => {
        expect(() => {
            createAuthAdapter(createValidConfig({ name: '' }));
        }).toThrow(EnterstellarError);

        try {
            createAuthAdapter(createValidConfig({ name: '' }));
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
        }
    });

    it('throws ENS-7001 when a required method is missing', () => {
        const config = {
            name: 'test-auth',
            hasRole: vi.fn().mockResolvedValue(false),
            onAuthChange: vi.fn().mockReturnValue(() => {}),
            // getSession intentionally omitted
        } as unknown as AuthAdapterConfig;

        expect(() => createAuthAdapter(config)).toThrow(EnterstellarError);
        try {
            createAuthAdapter(config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('getSession');
        }
    });

    it('throws ENS-7001 when onAuthChange is missing', () => {
        const config = {
            name: 'test-auth',
            getSession: vi.fn().mockResolvedValue(null),
            hasRole: vi.fn().mockResolvedValue(false),
            // onAuthChange intentionally omitted
        } as unknown as AuthAdapterConfig;

        expect(() => createAuthAdapter(config)).toThrow(EnterstellarError);
        try {
            createAuthAdapter(config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('onAuthChange');
        }
    });
});

// ---------------------------------------------------------------------------
// Noop Factory
// ---------------------------------------------------------------------------

describe('createNoopAuthAdapter', () => {
    it('creates a frozen adapter', () => {
        const adapter = createNoopAuthAdapter();

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('getSession() returns null (unauthenticated)', async () => {
        const adapter = createNoopAuthAdapter();

        const result = await adapter.getSession();

        expect(result).toBeNull();
    });

    it('hasRole() returns false (no permissions)', async () => {
        const adapter = createNoopAuthAdapter();

        const result = await adapter.hasRole('admin');

        expect(result).toBe(false);
    });

    it('onAuthChange() returns an unsubscribe function', () => {
        const adapter = createNoopAuthAdapter();
        const callback = vi.fn();

        const unsubscribe = adapter.onAuthChange(callback);

        expect(typeof unsubscribe).toBe('function');
    });

    it('onAuthChange() unsubscribe is callable without error', () => {
        const adapter = createNoopAuthAdapter();

        const unsubscribe = adapter.onAuthChange(vi.fn());

        expect(() => unsubscribe()).not.toThrow();
    });

    it('onAuthChange() never fires the callback in noop mode', () => {
        const adapter = createNoopAuthAdapter();
        const callback = vi.fn();

        adapter.onAuthChange(callback);

        expect(callback).not.toHaveBeenCalled();
    });
});
