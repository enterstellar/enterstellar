/**
 * @module @enterstellar-ai/state/__tests__/errors
 * @description Tests for state error factory functions.
 *
 * Verifies each factory produces an `EnterstellarError` with the correct:
 * - Error code (`ENS-4xxx`)
 * - Module (`'state'`)
 * - Message prefix (for grep-ability)
 * - Recoverability flag
 *
 * @see Coding Rules — Error Handling
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';
import {
    extensionAlreadyRegisteredError,
    extensionValidationError,
    invalidKeyError,
    persistenceError,
    snapshotSizeLimitError,
    majorVersionMismatchError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// Shared Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that the given error is a properly formed `EnterstellarError` from the
 * `state` module with the expected code and recoverability.
 */
function assertStateError(
    error: EnterstellarError,
    code: string,
    recoverable: boolean,
): void {
    expect(error).toBeInstanceOf(EnterstellarError);
    expect(error.code).toBe(code);
    expect(error.module).toBe('state');
    expect(error.recoverable).toBe(recoverable);
    expect(error.message).toContain(`[${code}]`);
    expect(error.timestamp).toBeDefined();
}

// ---------------------------------------------------------------------------
// ENS-4002 — Extension Already Registered
// ---------------------------------------------------------------------------

describe('extensionAlreadyRegisteredError', () => {
    it('creates an EnterstellarError with code ENS-4002', () => {
        const error = extensionAlreadyRegisteredError('preferences');
        assertStateError(error, 'ENS-4002', false);
        expect(error.message).toContain('preferences');
    });
});

// ---------------------------------------------------------------------------
// ENS-4003 — Extension Validation Error
// ---------------------------------------------------------------------------

describe('extensionValidationError', () => {
    it('creates an EnterstellarError with code ENS-4003', () => {
        const error = extensionValidationError('preferences', 'Expected string, got number');
        assertStateError(error, 'ENS-4003', false);
        expect(error.message).toContain('preferences');
        expect(error.message).toContain('Expected string, got number');
    });
});

// ---------------------------------------------------------------------------
// ENS-4004 — Invalid Store Key
// ---------------------------------------------------------------------------

describe('invalidKeyError', () => {
    it('creates an EnterstellarError with code ENS-4004', () => {
        const error = invalidKeyError('unknownKey');
        assertStateError(error, 'ENS-4004', false);
        expect(error.message).toContain('unknownKey');
    });
});

// ---------------------------------------------------------------------------
// ENS-4005 — Persistence Error (Recoverable)
// ---------------------------------------------------------------------------

describe('persistenceError', () => {
    it('creates a recoverable EnterstellarError with code ENS-4005', () => {
        const cause = new Error('disk full');
        const error = persistenceError('indexed-db', cause);
        assertStateError(error, 'ENS-4005', true);
        expect(error.message).toContain('indexed-db');
        expect(error.cause).toBe(cause);
    });

    it('preserves non-Error cause values', () => {
        const error = persistenceError('local-storage', 'string cause');
        expect(error.cause).toBe('string cause');
    });
});

// ---------------------------------------------------------------------------
// ENS-4006 — Snapshot Size Limit Exceeded
// ---------------------------------------------------------------------------

describe('snapshotSizeLimitError', () => {
    it('creates an EnterstellarError with code ENS-4006', () => {
        const sizeBytes = 2 * 1024 * 1024; // 2 MB
        const error = snapshotSizeLimitError(sizeBytes);
        assertStateError(error, 'ENS-4006', false);
        expect(error.message).toContain('2.00 MB');
    });
});

// ---------------------------------------------------------------------------
// ENS-4007 — Major Version Mismatch
// ---------------------------------------------------------------------------

describe('majorVersionMismatchError', () => {
    it('creates an EnterstellarError with code ENS-4007', () => {
        const error = majorVersionMismatchError('2.0.0', '1.0.0');
        assertStateError(error, 'ENS-4007', false);
        expect(error.message).toContain('2.0.0');
        expect(error.message).toContain('1.0.0');
    });
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('error serialization', () => {
    it('toJSON() produces a valid plain object', () => {
        const error = extensionAlreadyRegisteredError('test');
        const json = error.toJSON();
        expect(json.name).toBe('EnterstellarError');
        expect(json.code).toBe('ENS-4002');
        expect(json.module).toBe('state');
        expect(json.recoverable).toBe(false);
        expect(typeof json.timestamp).toBe('string');
        expect(typeof json.message).toBe('string');
    });
});
