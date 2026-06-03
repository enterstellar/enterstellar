/**
 * @module @enterstellar-ai/adapter-firebase/__tests__/create-firebase-auth-adapter
 * @description Unit tests for `createFirebaseAuthAdapter()`.
 *
 * Tests run against **mock Firebase Auth** (`vi.fn()` stubs — no real Firebase project).
 * The `onAuthStateChanged` function from `firebase/auth` is mocked at the module level
 * via `vi.mock()` to capture subscription callbacks.
 *
 * Coverage:
 * - Valid creation → frozen adapter with all 3 methods
 * - `getSession()` delegation → maps `auth.currentUser` to Enterstellar shape
 * - `getSession()` null safety → `null` when `currentUser` is null
 * - `getSession()` default role extraction → async `getIdTokenResult().claims`
 * - `getSession()` custom roleExtractor → synchronous extraction
 * - `hasRole()` → `true`/`false` based on role presence
 * - `hasRole()` → `false` when `currentUser` is null
 * - `onAuthChange()` → callback receives user, returns unsubscribe
 * - `onAuthChange()` without custom extractor → roles default to `[]`
 * - `onAuthChange()` with custom extractor → roles extracted synchronously
 * - AD5 error wrapping → Firebase errors become `EnterstellarError` (ENS-7005/ENS-7002)
 *
 * @see src/create-firebase-auth-adapter.ts
 * @see Design Choice AD1, AD5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createFirebaseAuthAdapter } from '../src/create-firebase-auth-adapter.js';

// ---------------------------------------------------------------------------
// Module Mock — firebase/auth
// ---------------------------------------------------------------------------
// vi.mock() factories are hoisted above all other declarations by Vitest.
// vi.hoisted() ensures shared state is initialized BEFORE the mock factory.
// ---------------------------------------------------------------------------

const { authState, unsubscribeSpy } = vi.hoisted(() => {
    return {
        /** Mutable state container for the auth mock. */
        authState: {
            /** Captured callback from `onAuthStateChanged()`. */
            capturedAuthCallback: null as ((user: unknown) => void) | null,
        },
        /** Spy for the unsubscribe function returned by `onAuthStateChanged`. */
        unsubscribeSpy: vi.fn(),
    };
});

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: vi.fn().mockImplementation(
        (_auth: unknown, cb: (user: unknown) => void) => {
            authState.capturedAuthCallback = cb;
            return unsubscribeSpy;
        },
    ),
}));

// ---------------------------------------------------------------------------
// Mock Firebase User Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Firebase `User` object for testing.
 *
 * @param overrides - Optional property overrides.
 * @returns A mock User with `uid` and `getIdTokenResult()`.
 */
function createMockUser(overrides?: {
    uid?: string;
    claimRoles?: unknown[];
    customData?: Record<string, unknown>;
}) {
    return {
        uid: overrides?.uid ?? 'firebase-user-123',
        getIdTokenResult: vi.fn().mockResolvedValue({
            claims: {
                roles: overrides?.claimRoles ?? ['clinician'],
                ...overrides?.customData,
            },
        }),
        ...overrides?.customData,
    };
}

/**
 * Creates a mock Firebase `Auth` instance for testing.
 *
 * @param currentUser - The user to return from `auth.currentUser` (or null).
 * @returns A mock Auth instance.
 */
function createMockAuth(currentUser: ReturnType<typeof createMockUser> | null = createMockUser()) {
    return {
        currentUser,
    } as unknown as Parameters<typeof createFirebaseAuthAdapter>[0]['auth'];
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    authState.capturedAuthCallback = null;
    unsubscribeSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createFirebaseAuthAdapter — valid creation', () => {
    it('creates an adapter from a valid Firebase Auth instance', () => {
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({ auth });

        expect(adapter).toBeDefined();
        expect(typeof adapter.getSession).toBe('function');
        expect(typeof adapter.hasRole).toBe('function');
        expect(typeof adapter.onAuthChange).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({ auth });

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('accepts a custom adapter name', () => {
        const auth = createMockAuth();

        expect(() => {
            createFirebaseAuthAdapter({ auth, name: 'custom-firebase-auth' });
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// getSession() — Session Mapping
// ---------------------------------------------------------------------------

describe('createFirebaseAuthAdapter — getSession() delegation', () => {
    it('returns Enterstellar session shape from valid Firebase user (default extractor)', async () => {
        const user = createMockUser({
            uid: 'user-456',
            claimRoles: ['clinician', 'admin'],
        });
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        const session = await adapter.getSession();

        expect(session).toEqual({
            userId: 'user-456',
            roles: ['clinician', 'admin'],
        });
    });

    it('calls getIdTokenResult() to extract roles (default extractor)', async () => {
        const user = createMockUser();
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        await adapter.getSession();

        expect(user.getIdTokenResult).toHaveBeenCalledOnce();
    });

    it('returns null when currentUser is null (unauthenticated)', async () => {
        const auth = createMockAuth(null);
        const adapter = createFirebaseAuthAdapter({ auth });

        const session = await adapter.getSession();

        expect(session).toBeNull();
    });

    it('returns empty roles when claims.roles is missing', async () => {
        const user = createMockUser({ claimRoles: undefined as unknown as unknown[] });
        (user.getIdTokenResult as ReturnType<typeof vi.fn>).mockResolvedValue({
            claims: {},
        });
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        const session = await adapter.getSession();

        expect(session?.roles).toEqual([]);
    });

    it('filters non-string values from claims.roles', async () => {
        const user = createMockUser({
            claimRoles: ['clinician', 42, null, 'admin', undefined],
        });
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        const session = await adapter.getSession();

        expect(session?.roles).toEqual(['clinician', 'admin']);
    });
});

// ---------------------------------------------------------------------------
// getSession() — Custom roleExtractor
// ---------------------------------------------------------------------------

describe('createFirebaseAuthAdapter — custom roleExtractor in getSession()', () => {
    it('uses custom roleExtractor instead of getIdTokenResult()', async () => {
        const user = createMockUser({ uid: 'user-custom' });
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({
            auth,
            roleExtractor: () => ['custom-role'],
        });

        const session = await adapter.getSession();

        expect(session).toEqual({
            userId: 'user-custom',
            roles: ['custom-role'],
        });
        // Should NOT call getIdTokenResult when custom extractor is provided
        expect(user.getIdTokenResult).not.toHaveBeenCalled();
    });

    it('passes the raw Firebase user to the custom extractor', async () => {
        const user = createMockUser({ uid: 'user-789' });
        const auth = createMockAuth(user);
        const extractorSpy = vi.fn().mockReturnValue(['admin']);
        const adapter = createFirebaseAuthAdapter({
            auth,
            roleExtractor: extractorSpy,
        });

        await adapter.getSession();

        expect(extractorSpy).toHaveBeenCalledWith(user);
    });
});

// ---------------------------------------------------------------------------
// hasRole() — Role Checking
// ---------------------------------------------------------------------------

describe('createFirebaseAuthAdapter — hasRole() delegation', () => {
    it('returns true when user has the requested role (default extractor)', async () => {
        const user = createMockUser({ claimRoles: ['clinician', 'admin'] });
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        expect(await adapter.hasRole('clinician')).toBe(true);
        expect(await adapter.hasRole('admin')).toBe(true);
    });

    it('returns false when user does not have the requested role', async () => {
        const user = createMockUser({ claimRoles: ['clinician'] });
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        expect(await adapter.hasRole('admin')).toBe(false);
    });

    it('returns false when currentUser is null (unauthenticated)', async () => {
        const auth = createMockAuth(null);
        const adapter = createFirebaseAuthAdapter({ auth });

        expect(await adapter.hasRole('clinician')).toBe(false);
    });

    it('uses custom roleExtractor for hasRole() when provided', async () => {
        const user = createMockUser();
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({
            auth,
            roleExtractor: () => ['injected-role'],
        });

        expect(await adapter.hasRole('injected-role')).toBe(true);
        expect(await adapter.hasRole('other-role')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// onAuthChange() — Subscription
// ---------------------------------------------------------------------------

describe('createFirebaseAuthAdapter — onAuthChange() delegation', () => {
    it('registers via onAuthStateChanged from firebase/auth', async () => {
        const { onAuthStateChanged } = await import('firebase/auth');
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({ auth });

        adapter.onAuthChange(vi.fn());

        expect(onAuthStateChanged).toHaveBeenCalled();
    });

    it('returns a working unsubscribe function', () => {
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({ auth });

        const unsubscribe = adapter.onAuthChange(vi.fn());

        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
        expect(unsubscribeSpy).toHaveBeenCalledOnce();
    });

    it('calls callback with null on sign-out (no custom extractor)', () => {
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({ auth });
        const callback = vi.fn();

        adapter.onAuthChange(callback);
        // Simulate sign-out: user is null
        authState.capturedAuthCallback?.(null);

        expect(callback).toHaveBeenCalledWith(null);
    });

    it('calls callback with userId and empty roles when no custom extractor', () => {
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({ auth });
        const callback = vi.fn();

        adapter.onAuthChange(callback);

        // Simulate sign-in with a user (no custom extractor → roles = [])
        authState.capturedAuthCallback?.({ uid: 'user-new' });

        expect(callback).toHaveBeenCalledWith({
            userId: 'user-new',
            roles: [], // documented tradeoff — async getIdTokenResult cannot be called here
        });
    });

    it('calls callback with roles from custom extractor when provided', () => {
        const auth = createMockAuth();
        const adapter = createFirebaseAuthAdapter({
            auth,
            roleExtractor: () => ['custom-role-from-extractor'],
        });
        const callback = vi.fn();

        adapter.onAuthChange(callback);
        authState.capturedAuthCallback?.({ uid: 'user-sync' });

        expect(callback).toHaveBeenCalledWith({
            userId: 'user-sync',
            roles: ['custom-role-from-extractor'],
        });
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping (delegated to createAuthAdapter)
// ---------------------------------------------------------------------------

describe('createFirebaseAuthAdapter — AD5 error wrapping', () => {
    it('wraps getSession() errors as EnterstellarError (ENS-7005)', async () => {
        const user = createMockUser();
        (user.getIdTokenResult as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Firebase token error'),
        );
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

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

    it('wraps hasRole() errors as EnterstellarError (ENS-7005)', async () => {
        const user = createMockUser();
        (user.getIdTokenResult as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Firebase network error'),
        );
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        try {
            await adapter.hasRole('admin');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7005');
        }
    });

    it('preserves original error in cause', async () => {
        const originalError = new TypeError('Firebase auth not initialized');
        const user = createMockUser();
        (user.getIdTokenResult as ReturnType<typeof vi.fn>).mockRejectedValue(originalError);
        const auth = createMockAuth(user);
        const adapter = createFirebaseAuthAdapter({ auth });

        try {
            await adapter.getSession();
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.cause).toBe(originalError);
        }
    });
});
