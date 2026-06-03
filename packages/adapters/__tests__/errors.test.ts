/**
 * @module @enterstellar-ai/adapters/__tests__/errors
 * @description Unit tests for all 5 error factory functions.
 *
 * Verifies each factory produces an `EnterstellarError` with:
 * - Correct `code` (`ENS-7001`–`ENS-7005`)
 * - Module `'adapters'`
 * - Correct `recoverable` flag
 * - Descriptive `message` containing relevant identifiers
 * - Preserved `cause` for error chaining
 *
 * @see src/errors.ts
 * @see Coding Rules — Error Taxonomy
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import {
    adapterValidationError,
    adapterMethodError,
    adapterQueryError,
    adapterMutationError,
    adapterAuthError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// ENS-7001: adapterValidationError
// ---------------------------------------------------------------------------

describe('adapterValidationError (ENS-7001)', () => {
    it('returns an EnterstellarError with code ENS-7001', () => {
        const error = adapterValidationError('auth', 'Missing method: getSession');

        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-7001');
    });

    it('sets module to "adapters"', () => {
        const error = adapterValidationError('data', 'Invalid name');

        expect(error.module).toBe('adapters');
    });

    it('is non-recoverable (developer misconfiguration)', () => {
        const error = adapterValidationError('error', 'Missing method: report');

        expect(error.recoverable).toBe(false);
    });

    it('includes the adapter type in the message', () => {
        const error = adapterValidationError('analytics', 'Missing method: track');

        expect(error.message).toContain('analytics');
    });

    it('includes the reason in the message', () => {
        const reason = 'Missing required method: getSession';
        const error = adapterValidationError('auth', reason);

        expect(error.message).toContain(reason);
    });

    it('has no cause (validation errors are config-level, no underlying error)', () => {
        const error = adapterValidationError('auth', 'bad config');

        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-7002: adapterMethodError
// ---------------------------------------------------------------------------

describe('adapterMethodError (ENS-7002)', () => {
    it('returns an EnterstellarError with code ENS-7002', () => {
        const error = adapterMethodError('supabase-auth', 'onAuthChange');

        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-7002');
    });

    it('sets module to "adapters"', () => {
        const error = adapterMethodError('clerk-auth', 'onAuthChange');

        expect(error.module).toBe('adapters');
    });

    it('is recoverable (transient infrastructure failure)', () => {
        const error = adapterMethodError('sentry-error', 'report');

        expect(error.recoverable).toBe(true);
    });

    it('includes the adapter name in the message', () => {
        const error = adapterMethodError('mixpanel-analytics', 'track');

        expect(error.message).toContain('mixpanel-analytics');
    });

    it('includes the method name in the message', () => {
        const error = adapterMethodError('supabase-auth', 'onAuthChange');

        expect(error.message).toContain('onAuthChange');
    });

    it('preserves the original cause when provided', () => {
        const originalError = new TypeError('network timeout');
        const error = adapterMethodError('supabase-auth', 'onAuthChange', originalError);

        expect(error.cause).toBe(originalError);
    });

    it('has undefined cause when not provided', () => {
        const error = adapterMethodError('supabase-auth', 'onAuthChange');

        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-7003: adapterQueryError
// ---------------------------------------------------------------------------

describe('adapterQueryError (ENS-7003)', () => {
    it('returns an EnterstellarError with code ENS-7003', () => {
        const error = adapterQueryError('supabase-data', 'patients.vitals');

        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-7003');
    });

    it('sets module to "adapters"', () => {
        const error = adapterQueryError('supabase-data', 'patients');

        expect(error.module).toBe('adapters');
    });

    it('is recoverable (transient data source failure)', () => {
        const error = adapterQueryError('supabase-data', 'patients');

        expect(error.recoverable).toBe(true);
    });

    it('includes the adapter name in the message', () => {
        const error = adapterQueryError('prisma-data', 'users');

        expect(error.message).toContain('prisma-data');
    });

    it('includes the resource name in the message', () => {
        const error = adapterQueryError('supabase-data', 'patients.vitals');

        expect(error.message).toContain('patients.vitals');
    });

    it('preserves the original cause when provided', () => {
        const pgError = new Error('connection refused');
        const error = adapterQueryError('supabase-data', 'patients', pgError);

        expect(error.cause).toBe(pgError);
    });

    it('has undefined cause when not provided', () => {
        const error = adapterQueryError('supabase-data', 'patients');

        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-7004: adapterMutationError
// ---------------------------------------------------------------------------

describe('adapterMutationError (ENS-7004)', () => {
    it('returns an EnterstellarError with code ENS-7004', () => {
        const error = adapterMutationError('supabase-data', 'patients', 'create');

        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-7004');
    });

    it('sets module to "adapters"', () => {
        const error = adapterMutationError('supabase-data', 'patients', 'update');

        expect(error.module).toBe('adapters');
    });

    it('is recoverable (transient data source failure)', () => {
        const error = adapterMutationError('supabase-data', 'patients', 'delete');

        expect(error.recoverable).toBe(true);
    });

    it('includes the adapter name in the message', () => {
        const error = adapterMutationError('firebase-data', 'users', 'create');

        expect(error.message).toContain('firebase-data');
    });

    it('includes the resource name in the message', () => {
        const error = adapterMutationError('supabase-data', 'medications', 'update');

        expect(error.message).toContain('medications');
    });

    it('includes the action in the message', () => {
        const error = adapterMutationError('supabase-data', 'patients', 'delete');

        expect(error.message).toContain('delete');
    });

    it('preserves the original cause when provided', () => {
        const constraintError = new Error('unique constraint violation');
        const error = adapterMutationError('supabase-data', 'patients', 'create', constraintError);

        expect(error.cause).toBe(constraintError);
    });

    it('has undefined cause when not provided', () => {
        const error = adapterMutationError('supabase-data', 'patients', 'create');

        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-7005: adapterAuthError
// ---------------------------------------------------------------------------

describe('adapterAuthError (ENS-7005)', () => {
    it('returns an EnterstellarError with code ENS-7005', () => {
        const error = adapterAuthError('clerk-auth', 'getSession');

        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-7005');
    });

    it('sets module to "adapters"', () => {
        const error = adapterAuthError('supabase-auth', 'hasRole');

        expect(error.module).toBe('adapters');
    });

    it('is recoverable (auth provider may be temporarily unavailable)', () => {
        const error = adapterAuthError('clerk-auth', 'getSession');

        expect(error.recoverable).toBe(true);
    });

    it('includes the adapter name in the message', () => {
        const error = adapterAuthError('firebase-auth', 'getSession');

        expect(error.message).toContain('firebase-auth');
    });

    it('includes the operation name in the message', () => {
        const error = adapterAuthError('clerk-auth', 'hasRole');

        expect(error.message).toContain('hasRole');
    });

    it('preserves the original cause when provided', () => {
        const sessionExpired = new Error('session expired');
        const error = adapterAuthError('supabase-auth', 'getSession', sessionExpired);

        expect(error.cause).toBe(sessionExpired);
    });

    it('has undefined cause when not provided', () => {
        const error = adapterAuthError('supabase-auth', 'getSession');

        expect(error.cause).toBeUndefined();
    });
});
