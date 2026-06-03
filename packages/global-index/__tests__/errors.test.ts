/**
 * @module @enterstellar-ai/global-index/errors.test
 * @description Unit tests for all 6 error factory functions in `@enterstellar-ai/global-index`.
 *
 * Verifies:
 * - Error code correctness (ENS-5030–ENS-5035)
 * - Module is always `'global-index'`
 * - Recoverability semantics (fatal vs recoverable)
 * - Message formatting with interpolated arguments
 * - Cause chaining for network/infra errors
 * - `toJSON()` serialization
 * - `instanceof EnterstellarError` and `instanceof Error` checks
 */

import { describe, expect, it } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import {
    createConfigError,
    createDisposedError,
    createNotFoundError,
    createRegistrationError,
    createSearchError,
    createValidationError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// ENS-5030 — createConfigError
// ---------------------------------------------------------------------------

describe('createConfigError (ENS-5030)', () => {
    it('returns an EnterstellarError with code ENS-5030', () => {
        const error = createConfigError('cloudClient is required.');
        expect(error.code).toBe('ENS-5030');
    });

    it('sets module to global-index', () => {
        const error = createConfigError('cloudClient is required.');
        expect(error.module).toBe('global-index');
    });

    it('is NOT recoverable (fatal dev error)', () => {
        const error = createConfigError('cloudClient is required.');
        expect(error.recoverable).toBe(false);
    });

    it('includes detail in the error message', () => {
        const error = createConfigError('cloudClient is required.');
        expect(error.message).toContain('cloudClient is required.');
        expect(error.message).toContain('Global Index configuration error');
    });

    it('is an instance of EnterstellarError and Error', () => {
        const error = createConfigError('test');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error).toBeInstanceOf(Error);
    });

    it('serializes to JSON with all fields', () => {
        const error = createConfigError('missing field');
        const json = error.toJSON();
        expect(json.code).toBe('ENS-5030');
        expect(json.module).toBe('global-index');
        expect(json.recoverable).toBe(false);
        expect(json.name).toBe('EnterstellarError');
        expect(typeof json.timestamp).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// ENS-5031 — createDisposedError
// ---------------------------------------------------------------------------

describe('createDisposedError (ENS-5031)', () => {
    it('returns an EnterstellarError with code ENS-5031', () => {
        const error = createDisposedError();
        expect(error.code).toBe('ENS-5031');
    });

    it('sets module to global-index', () => {
        const error = createDisposedError();
        expect(error.module).toBe('global-index');
    });

    it('is NOT recoverable (fatal dev error)', () => {
        const error = createDisposedError();
        expect(error.recoverable).toBe(false);
    });

    it('includes guidance to create a new instance', () => {
        const error = createDisposedError();
        expect(error.message).toContain('disposed');
        expect(error.message).toContain('createGlobalIndex');
    });

    it('takes no arguments', () => {
        // Verify the factory signature accepts zero arguments
        const error = createDisposedError();
        expect(error).toBeInstanceOf(EnterstellarError);
    });
});

// ---------------------------------------------------------------------------
// ENS-5032 — createSearchError
// ---------------------------------------------------------------------------

describe('createSearchError (ENS-5032)', () => {
    it('returns an EnterstellarError with code ENS-5032', () => {
        const error = createSearchError('request timed out');
        expect(error.code).toBe('ENS-5032');
    });

    it('sets module to global-index', () => {
        const error = createSearchError('network failure');
        expect(error.module).toBe('global-index');
    });

    it('IS recoverable (infra/network error)', () => {
        const error = createSearchError('server returned 500');
        expect(error.recoverable).toBe(true);
    });

    it('includes detail in the error message', () => {
        const error = createSearchError('Search request timed out after 10000ms.');
        expect(error.message).toContain('Search request timed out after 10000ms.');
        expect(error.message).toContain('Global Index search failed');
    });

    it('chains the underlying cause', () => {
        const cause = new TypeError('fetch failed');
        const error = createSearchError('network error', cause);
        expect(error.cause).toBe(cause);
    });

    it('works without a cause argument', () => {
        const error = createSearchError('timeout');
        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-5033 — createNotFoundError
// ---------------------------------------------------------------------------

describe('createNotFoundError (ENS-5033)', () => {
    it('returns an EnterstellarError with code ENS-5033', () => {
        const error = createNotFoundError('PatientVitals', 'https://registry.acme.health');
        expect(error.code).toBe('ENS-5033');
    });

    it('sets module to global-index', () => {
        const error = createNotFoundError('Foo', 'https://example.com');
        expect(error.module).toBe('global-index');
    });

    it('IS recoverable (expected case)', () => {
        const error = createNotFoundError('Foo', 'https://example.com');
        expect(error.recoverable).toBe(true);
    });

    it('includes component name and registry URL in message', () => {
        const error = createNotFoundError('PatientVitals', 'https://registry.acme.health');
        expect(error.message).toContain('PatientVitals');
        expect(error.message).toContain('https://registry.acme.health');
    });

    it('formats the message as a quoted string', () => {
        const error = createNotFoundError('LabResults', 'https://r.example.com');
        expect(error.message).toContain('"LabResults"');
        expect(error.message).toContain('"https://r.example.com"');
    });
});

// ---------------------------------------------------------------------------
// ENS-5034 — createRegistrationError
// ---------------------------------------------------------------------------

describe('createRegistrationError (ENS-5034)', () => {
    it('returns an EnterstellarError with code ENS-5034', () => {
        const error = createRegistrationError('Registry URL is unreachable.');
        expect(error.code).toBe('ENS-5034');
    });

    it('sets module to global-index', () => {
        const error = createRegistrationError('server error');
        expect(error.module).toBe('global-index');
    });

    it('IS recoverable (can retry)', () => {
        const error = createRegistrationError('timeout');
        expect(error.recoverable).toBe(true);
    });

    it('includes detail in the error message', () => {
        const error = createRegistrationError('Registry URL is unreachable.');
        expect(error.message).toContain('Registry URL is unreachable.');
        expect(error.message).toContain('Global Index registry operation failed');
    });

    it('chains the underlying cause', () => {
        const cause = new Error('ECONNREFUSED');
        const error = createRegistrationError('connection refused', cause);
        expect(error.cause).toBe(cause);
    });

    it('works without a cause argument', () => {
        const error = createRegistrationError('bad request');
        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-5035 — createValidationError
// ---------------------------------------------------------------------------

describe('createValidationError (ENS-5035)', () => {
    it('returns an EnterstellarError with code ENS-5035', () => {
        const error = createValidationError('Missing "id" field.');
        expect(error.code).toBe('ENS-5035');
    });

    it('sets module to global-index', () => {
        const error = createValidationError('parse failure');
        expect(error.module).toBe('global-index');
    });

    it('IS recoverable (degrade gracefully)', () => {
        const error = createValidationError('unexpected shape');
        expect(error.recoverable).toBe(true);
    });

    it('includes detail in the error message', () => {
        const error = createValidationError('FederatedRegistry response missing "id" field.');
        expect(error.message).toContain('FederatedRegistry response missing "id" field.');
        expect(error.message).toContain('Global Index response validation failed');
    });

    it('chains the underlying Zod error', () => {
        const zodError = new Error('ZodError: invalid_type');
        const error = createValidationError('Zod parse failure', zodError);
        expect(error.cause).toBe(zodError);
    });

    it('works without a cause argument', () => {
        const error = createValidationError('missing field');
        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Cross-cutting assertions
// ---------------------------------------------------------------------------

describe('cross-cutting error factory assertions', () => {
    it('all errors have the name "EnterstellarError"', () => {
        const errors = [
            createConfigError('test'),
            createDisposedError(),
            createSearchError('test'),
            createNotFoundError('X', 'https://x.com'),
            createRegistrationError('test'),
            createValidationError('test'),
        ];

        for (const error of errors) {
            expect(error.name).toBe('EnterstellarError');
        }
    });

    it('all errors have a valid ISO 8601 timestamp', () => {
        const errors = [
            createConfigError('test'),
            createDisposedError(),
            createSearchError('test'),
            createNotFoundError('X', 'https://x.com'),
            createRegistrationError('test'),
            createValidationError('test'),
        ];

        for (const error of errors) {
            // Verify the timestamp is a parseable ISO 8601 date
            const parsed = Date.parse(error.timestamp);
            expect(Number.isNaN(parsed)).toBe(false);
        }
    });

    it('fatal errors (5030, 5031) are not recoverable', () => {
        expect(createConfigError('test').recoverable).toBe(false);
        expect(createDisposedError().recoverable).toBe(false);
    });

    it('operational errors (5032–5035) ARE recoverable', () => {
        expect(createSearchError('test').recoverable).toBe(true);
        expect(createNotFoundError('X', 'https://x.com').recoverable).toBe(true);
        expect(createRegistrationError('test').recoverable).toBe(true);
        expect(createValidationError('test').recoverable).toBe(true);
    });

    it('all errors serialize to JSON via toJSON()', () => {
        const errors = [
            createConfigError('test'),
            createDisposedError(),
            createSearchError('test'),
            createNotFoundError('X', 'https://x.com'),
            createRegistrationError('test'),
            createValidationError('test'),
        ];

        for (const error of errors) {
            const json = error.toJSON();
            expect(typeof json.code).toBe('string');
            expect(json.module).toBe('global-index');
            expect(typeof json.message).toBe('string');
            expect(typeof json.recoverable).toBe('boolean');
            expect(typeof json.timestamp).toBe('string');
        }
    });
});
