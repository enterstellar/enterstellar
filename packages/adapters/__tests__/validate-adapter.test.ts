/**
 * @module @enterstellar-ai/adapters/__tests__/validate-adapter
 * @description Unit tests for `validateAdapterConfig()` — shared validation utility.
 *
 * Tests the two validation steps:
 * 1. **Name check:** `name` must be a non-empty string.
 * 2. **Method check:** All required methods must be present and be functions.
 *
 * Error conditions:
 * - `ENS-7001` — invalid name (empty, non-string)
 * - `ENS-7001` — missing method
 * - `ENS-7001` — non-function method
 *
 * @see src/validate-adapter.ts
 * @see Coding Rules — Error Taxonomy (developer errors → fatal throw)
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { validateAdapterConfig } from '../src/validate-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid auth config for testing. */
function createValidAuthConfig(): Readonly<Record<string, unknown>> {
    return {
        name: 'test-auth',
        getSession: () => Promise.resolve(null),
        hasRole: () => Promise.resolve(false),
        onAuthChange: () => () => { /* noop unsubscribe */ },
    };
}

/** Minimal valid data config for testing. */
function createValidDataConfig(): Readonly<Record<string, unknown>> {
    return {
        name: 'test-data',
        query: () => Promise.resolve([]),
        mutate: () => Promise.resolve(null),
        subscribe: () => () => { },
    };
}

/** Minimal valid error config for testing. */
function createValidErrorConfig(): Readonly<Record<string, unknown>> {
    return {
        name: 'test-error',
        report: () => Promise.resolve(),
        shouldRetry: () => Promise.resolve(false),
        sanitize: (e: Error) => Promise.resolve(e),
    };
}

/** Minimal valid analytics config for testing. */
function createValidAnalyticsConfig(): Readonly<Record<string, unknown>> {
    return {
        name: 'test-analytics',
        track: () => { },
        identify: () => { },
    };
}

// ---------------------------------------------------------------------------
// Valid Configs — Pass Silently
// ---------------------------------------------------------------------------

describe('validateAdapterConfig — valid configs', () => {
    it('passes silently for a valid auth config', () => {
        expect(() => {
            validateAdapterConfig('auth', createValidAuthConfig());
        }).not.toThrow();
    });

    it('passes silently for a valid data config', () => {
        expect(() => {
            validateAdapterConfig('data', createValidDataConfig());
        }).not.toThrow();
    });

    it('passes silently for a valid error config', () => {
        expect(() => {
            validateAdapterConfig('error', createValidErrorConfig());
        }).not.toThrow();
    });

    it('passes silently for a valid analytics config', () => {
        expect(() => {
            validateAdapterConfig('analytics', createValidAnalyticsConfig());
        }).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// ENS-7001: Invalid Name
// ---------------------------------------------------------------------------

describe('validateAdapterConfig — ENS-7001 (invalid name)', () => {
    it('throws ENS-7001 when name is an empty string', () => {
        const config = { ...createValidAuthConfig(), name: '' };

        expect(() => validateAdapterConfig('auth', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('auth', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(false);
            expect(error.message).toContain('name');
        }
    });

    it('throws ENS-7001 when name is a number', () => {
        const config = { ...createValidDataConfig(), name: 42 };

        expect(() => validateAdapterConfig('data', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('data', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('name');
        }
    });

    it('throws ENS-7001 when name is undefined', () => {
        const config = { ...createValidErrorConfig(), name: undefined };

        expect(() => validateAdapterConfig('error', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('error', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
        }
    });

    it('throws ENS-7001 when name is null', () => {
        const config = { ...createValidAnalyticsConfig(), name: null };

        expect(() => validateAdapterConfig('analytics', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('analytics', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
        }
    });

    it('includes the adapter type in the error message', () => {
        const config = { ...createValidAuthConfig(), name: '' };

        try {
            validateAdapterConfig('auth', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('auth');
        }
    });
});

// ---------------------------------------------------------------------------
// ENS-7001: Missing Methods
// ---------------------------------------------------------------------------

describe('validateAdapterConfig — ENS-7001 (missing methods)', () => {
    it('throws ENS-7001 when auth config is missing getSession', () => {
        const config: Record<string, unknown> = {
            name: 'test-auth',
            hasRole: () => Promise.resolve(false),
            onAuthChange: () => () => { },
        };

        expect(() => validateAdapterConfig('auth', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('auth', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('getSession');
        }
    });

    it('throws ENS-7001 when auth config is missing hasRole', () => {
        const config: Record<string, unknown> = {
            name: 'test-auth',
            getSession: () => Promise.resolve(null),
            onAuthChange: () => () => { },
        };

        expect(() => validateAdapterConfig('auth', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('auth', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('hasRole');
        }
    });

    it('throws ENS-7001 when data config is missing query', () => {
        const config: Record<string, unknown> = {
            name: 'test-data',
            mutate: () => Promise.resolve(null),
            subscribe: () => () => { },
        };

        expect(() => validateAdapterConfig('data', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('data', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('query');
        }
    });

    it('throws ENS-7001 when error config is missing shouldRetry', () => {
        const config: Record<string, unknown> = {
            name: 'test-error',
            report: () => Promise.resolve(),
            sanitize: (e: Error) => e,
        };

        expect(() => validateAdapterConfig('error', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('error', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('shouldRetry');
        }
    });

    it('throws ENS-7001 when analytics config is missing track', () => {
        const config: Record<string, unknown> = {
            name: 'test-analytics',
            identify: () => { },
        };

        expect(() => validateAdapterConfig('analytics', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('analytics', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('track');
        }
    });

    it('throws ENS-7001 when analytics config is missing identify', () => {
        const config: Record<string, unknown> = {
            name: 'test-analytics',
            track: () => { },
        };

        expect(() => validateAdapterConfig('analytics', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('analytics', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('identify');
        }
    });
});

// ---------------------------------------------------------------------------
// ENS-7001: Non-Function Methods
// ---------------------------------------------------------------------------

describe('validateAdapterConfig — ENS-7001 (non-function methods)', () => {
    it('throws ENS-7001 when a method is a string instead of a function', () => {
        const config = { ...createValidAuthConfig(), getSession: 'not a function' };

        expect(() => validateAdapterConfig('auth', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('auth', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('getSession');
            expect(error.message).toContain('string');
        }
    });

    it('throws ENS-7001 when a method is null', () => {
        const config = { ...createValidDataConfig(), query: null };

        expect(() => validateAdapterConfig('data', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('data', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('query');
            expect(error.message).toContain('null');
        }
    });

    it('throws ENS-7001 when a method is a number', () => {
        const config = { ...createValidErrorConfig(), report: 123 };

        expect(() => validateAdapterConfig('error', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('error', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('report');
            expect(error.message).toContain('number');
        }
    });

    it('throws ENS-7001 when a method is a boolean', () => {
        const config = { ...createValidAnalyticsConfig(), track: true };

        expect(() => validateAdapterConfig('analytics', config)).toThrow(EnterstellarError);
        try {
            validateAdapterConfig('analytics', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('track');
            expect(error.message).toContain('boolean');
        }
    });

    it('includes expected type "function" and received type in the message', () => {
        const config = { ...createValidAuthConfig(), onAuthChange: { not: 'a function' } };

        try {
            validateAdapterConfig('auth', config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('Expected function');
            expect(error.message).toContain('object');
        }
    });
});
