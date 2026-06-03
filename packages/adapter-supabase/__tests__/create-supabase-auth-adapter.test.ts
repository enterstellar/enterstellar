/**
 * @module @enterstellar-ai/adapter-supabase/__tests__/create-supabase-auth-adapter
 * @description Unit tests for `createSupabaseAuthAdapter()`.
 *
 * Tests run against a **mock Supabase client** (`vi.fn()` stubs — no real DB).
 *
 * Coverage:
 * - Valid creation → frozen adapter with all 3 methods
 * - `getSession()` delegation → maps Supabase session to Enterstellar shape
 * - `getSession()` null safety → `null` when unauthenticated
 * - `hasRole()` → `true`/`false` based on role presence
 * - `hasRole()` → `false` when no session
 * - `onAuthChange()` → callback receives translated session, returns unsubscribe
 * - Custom `roleExtractor` → overrides default `user_metadata.roles` extraction
 * - Default `roleExtractor` → extracts from `user_metadata.roles`, filters non-strings
 * - AD5 error wrapping → Supabase SDK errors become `EnterstellarError` (ENS-7005)
 *
 * @see src/create-supabase-auth-adapter.ts
 * @see Design Choice AD1, AD5
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createSupabaseAuthAdapter } from '../src/create-supabase-auth-adapter.js';

// ---------------------------------------------------------------------------
// Mock Supabase Client Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Supabase session for testing.
 *
 * @param overrides - Optional property overrides for the session.
 * @returns A mock session object that mimics Supabase's `Session` shape.
 */
function createMockSession(overrides?: {
    userId?: string;
    roles?: unknown[];
    appMetadata?: Record<string, unknown>;
}) {
    return {
        user: {
            id: overrides?.userId ?? 'user-123',
            user_metadata: {
                roles: overrides?.roles ?? ['clinician'],
            },
            app_metadata: overrides?.appMetadata ?? {},
        },
    };
}

/**
 * Creates a mock Supabase client with stubbed `auth` methods.
 *
 * Methods:
 * - `auth.getSession()` → resolves to `{ data: { session } }` (configurable)
 * - `auth.onAuthStateChange(cb)` → captures the callback, returns mock subscription
 *
 * @param session - The session to return from `getSession()` (default: valid session).
 * @returns A mock Supabase client and utilities for test assertions.
 */
function createMockClient(session: ReturnType<typeof createMockSession> | null = createMockSession()) {
    const unsubscribeSpy = vi.fn();

    /** Captured `onAuthStateChange` callback — call it to simulate auth events. */
    let capturedAuthCallback: ((event: string, session: unknown) => void) | null = null;

    const client = {
        auth: {
            getSession: vi.fn().mockResolvedValue({
                data: { session },
            }),

            onAuthStateChange: vi.fn().mockImplementation(
                (cb: (event: string, session: unknown) => void) => {
                    capturedAuthCallback = cb;
                    return {
                        data: {
                            subscription: {
                                unsubscribe: unsubscribeSpy,
                            },
                        },
                    };
                },
            ),
        },
    };

    return {
        /** The mock Supabase client. Pass to `createSupabaseAuthAdapter()`. */
        client: client as unknown as Parameters<typeof createSupabaseAuthAdapter>[0]['client'],

        /** Spy on the unsubscribe function returned by `onAuthStateChange`. */
        unsubscribeSpy,

        /**
         * Simulates a Supabase auth state change event.
         *
         * @param event - The auth event type (e.g., `'SIGNED_IN'`, `'SIGNED_OUT'`).
         * @param newSession - The new session (or `null` for sign-out).
         */
        fireAuthChange(event: string, newSession: ReturnType<typeof createMockSession> | null) {
            if (!capturedAuthCallback) {
                throw new Error('onAuthStateChange callback not captured — call adapter.onAuthChange() first');
            }
            capturedAuthCallback(event, newSession);
        },
    };
}

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — valid creation', () => {
    it('creates an adapter from a valid Supabase client', () => {
        const { client } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });

        expect(adapter).toBeDefined();
        expect(typeof adapter.getSession).toBe('function');
        expect(typeof adapter.hasRole).toBe('function');
        expect(typeof adapter.onAuthChange).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const { client } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('accepts a custom adapter name', () => {
        const { client } = createMockClient();

        // Should not throw — name is used for error messages and DevTools
        expect(() => {
            createSupabaseAuthAdapter({ client, name: 'custom-supabase-auth' });
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// getSession() — Session Mapping
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — getSession() delegation', () => {
    it('returns Enterstellar session shape from valid Supabase session', async () => {
        const { client } = createMockClient(createMockSession({
            userId: 'user-456',
            roles: ['clinician', 'admin'],
        }));
        const adapter = createSupabaseAuthAdapter({ client });

        const session = await adapter.getSession();

        expect(session).toEqual({
            userId: 'user-456',
            roles: ['clinician', 'admin'],
        });
    });

    it('calls client.auth.getSession() under the hood', async () => {
        const { client } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });

        await adapter.getSession();

        expect(client.auth.getSession).toHaveBeenCalledOnce();
    });

    it('returns null when Supabase session is null (unauthenticated)', async () => {
        const { client } = createMockClient(null);
        const adapter = createSupabaseAuthAdapter({ client });

        const session = await adapter.getSession();

        expect(session).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getSession() — Default Role Extraction
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — default role extraction', () => {
    it('extracts roles from user_metadata.roles', async () => {
        const { client } = createMockClient(createMockSession({
            roles: ['clinician', 'researcher'],
        }));
        const adapter = createSupabaseAuthAdapter({ client });

        const session = await adapter.getSession();

        expect(session?.roles).toEqual(['clinician', 'researcher']);
    });

    it('returns empty array when user_metadata.roles is missing', async () => {
        const session = {
            user: {
                id: 'user-789',
                user_metadata: {},
            },
        };
        const { client } = createMockClient(session as ReturnType<typeof createMockSession>);
        const adapter = createSupabaseAuthAdapter({ client });

        const result = await adapter.getSession();

        expect(result?.roles).toEqual([]);
    });

    it('filters non-string values from roles array', async () => {
        const { client } = createMockClient(createMockSession({
            roles: ['clinician', 42, null, 'admin', undefined],
        }));
        const adapter = createSupabaseAuthAdapter({ client });

        const session = await adapter.getSession();

        expect(session?.roles).toEqual(['clinician', 'admin']);
    });

    it('returns empty array when user_metadata is missing', async () => {
        const session = {
            user: {
                id: 'user-no-meta',
            },
        };
        const { client } = createMockClient(session as ReturnType<typeof createMockSession>);
        const adapter = createSupabaseAuthAdapter({ client });

        const result = await adapter.getSession();

        expect(result?.roles).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// hasRole() — Role Checking
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — hasRole() delegation', () => {
    it('returns true when user has the requested role', async () => {
        const { client } = createMockClient(createMockSession({
            roles: ['clinician', 'admin'],
        }));
        const adapter = createSupabaseAuthAdapter({ client });

        expect(await adapter.hasRole('clinician')).toBe(true);
        expect(await adapter.hasRole('admin')).toBe(true);
    });

    it('returns false when user does not have the requested role', async () => {
        const { client } = createMockClient(createMockSession({
            roles: ['clinician'],
        }));
        const adapter = createSupabaseAuthAdapter({ client });

        expect(await adapter.hasRole('admin')).toBe(false);
    });

    it('returns false when session is null (unauthenticated)', async () => {
        const { client } = createMockClient(null);
        const adapter = createSupabaseAuthAdapter({ client });

        expect(await adapter.hasRole('clinician')).toBe(false);
    });

    it('calls client.auth.getSession() under the hood', async () => {
        const { client } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });

        await adapter.hasRole('admin');

        expect(client.auth.getSession).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// onAuthChange() — Subscription
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — onAuthChange() delegation', () => {
    it('subscribes via client.auth.onAuthStateChange()', () => {
        const { client } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });

        adapter.onAuthChange(vi.fn());

        expect(client.auth.onAuthStateChange).toHaveBeenCalledOnce();
    });

    it('translates Supabase session to Enterstellar shape in callback', () => {
        const { client, fireAuthChange } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });
        const callback = vi.fn();

        adapter.onAuthChange(callback);

        const newSession = createMockSession({
            userId: 'user-new',
            roles: ['admin'],
        });
        fireAuthChange('SIGNED_IN', newSession);

        expect(callback).toHaveBeenCalledWith({
            userId: 'user-new',
            roles: ['admin'],
        });
    });

    it('calls callback with null on sign-out', () => {
        const { client, fireAuthChange } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });
        const callback = vi.fn();

        adapter.onAuthChange(callback);
        fireAuthChange('SIGNED_OUT', null);

        expect(callback).toHaveBeenCalledWith(null);
    });

    it('returns a working unsubscribe function', () => {
        const { client, unsubscribeSpy } = createMockClient();
        const adapter = createSupabaseAuthAdapter({ client });

        const unsubscribe = adapter.onAuthChange(vi.fn());

        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
        expect(unsubscribeSpy).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// Custom roleExtractor
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — custom roleExtractor', () => {
    it('uses custom roleExtractor instead of default', async () => {
        const { client } = createMockClient(createMockSession({
            userId: 'user-custom',
            roles: ['from-user-metadata'], // default would use this
        }));
        const adapter = createSupabaseAuthAdapter({
            client,
            roleExtractor: (user) => {
                const u = user as { app_metadata?: { roles?: string[] } };
                return u.app_metadata?.roles ?? ['custom-role'];
            },
        });

        const session = await adapter.getSession();

        // Should use custom extractor, not default user_metadata.roles
        expect(session?.roles).toEqual(['custom-role']);
    });

    it('custom roleExtractor applies to hasRole() as well', async () => {
        const { client } = createMockClient(createMockSession({
            roles: [], // default would return no roles
        }));
        const adapter = createSupabaseAuthAdapter({
            client,
            roleExtractor: () => ['injected-role'],
        });

        expect(await adapter.hasRole('injected-role')).toBe(true);
        expect(await adapter.hasRole('other-role')).toBe(false);
    });

    it('custom roleExtractor applies to onAuthChange() callback', () => {
        const { client, fireAuthChange } = createMockClient();
        const adapter = createSupabaseAuthAdapter({
            client,
            roleExtractor: () => ['custom-from-extractor'],
        });
        const callback = vi.fn();

        adapter.onAuthChange(callback);
        fireAuthChange('SIGNED_IN', createMockSession());

        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['custom-from-extractor'] }),
        );
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping (delegated to createAuthAdapter)
// ---------------------------------------------------------------------------

describe('createSupabaseAuthAdapter — AD5 error wrapping', () => {
    it('wraps getSession() SDK errors as EnterstellarError (ENS-7005)', async () => {
        const { client } = createMockClient();
        (client.auth.getSession as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Supabase network error'),
        );
        const adapter = createSupabaseAuthAdapter({ client });

        try {
            await adapter.getSession();
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7005');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
        }
    });

    it('wraps hasRole() SDK errors as EnterstellarError (ENS-7005)', async () => {
        const { client } = createMockClient();
        (client.auth.getSession as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Supabase timeout'),
        );
        const adapter = createSupabaseAuthAdapter({ client });

        try {
            await adapter.hasRole('admin');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7005');
        }
    });

    it('wraps onAuthChange() registration errors as EnterstellarError (ENS-7002)', () => {
        const { client } = createMockClient();
        (client.auth.onAuthStateChange as ReturnType<typeof vi.fn>).mockImplementation(() => {
            throw new Error('Auth subscription failed');
        });
        const adapter = createSupabaseAuthAdapter({ client });

        try {
            adapter.onAuthChange(vi.fn());
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
        }
    });

    it('preserves original error in cause', async () => {
        const originalError = new TypeError('Supabase client not initialized');
        const { client } = createMockClient();
        (client.auth.getSession as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
        const adapter = createSupabaseAuthAdapter({ client });

        try {
            await adapter.getSession();
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.cause).toBe(originalError);
        }
    });
});
