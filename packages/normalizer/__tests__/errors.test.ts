/**
 * @module @enterstellar-ai/normalizer/__tests__/errors
 * @description Unit tests for all 3 normalizer error factory functions (ENS-6001–6003).
 *
 * Verifies each factory produces an `EnterstellarError` with the correct code,
 * module attribution, recoverability flag, and descriptive message.
 *
 * @see Coding Rules — Error Taxonomy
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import {
    createUnknownProtocolError,
    createNormalizationFailedError,
    createInvalidIntentError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// ENS-6001: Unknown Protocol
// ---------------------------------------------------------------------------

describe('createUnknownProtocolError (ENS-6001)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createUnknownProtocolError({ type: 'unknown_event' });
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-6001');
    });

    it('attributes to normalizer module', () => {
        const error = createUnknownProtocolError({ type: 'unknown_event' });
        expect(error.module).toBe('normalizer');
    });

    it('is NOT recoverable (developer misconfiguration)', () => {
        const error = createUnknownProtocolError({ type: 'unknown_event' });
        expect(error.recoverable).toBe(false);
    });

    it('includes event type in message when event has a type field', () => {
        const error = createUnknownProtocolError({ type: 'some_custom_type' });
        expect(error.message).toContain('some_custom_type');
    });

    it('includes typeof in message for non-object events', () => {
        const error = createUnknownProtocolError('raw-string-event');
        expect(error.message).toContain('string');
    });

    it('includes typeof in message for null events', () => {
        const error = createUnknownProtocolError(null);
        expect(error.message).toContain('object');
    });

    it('handles undefined events gracefully', () => {
        const error = createUnknownProtocolError(undefined);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.message).toContain('undefined');
    });

    it('has a valid ISO timestamp', () => {
        const error = createUnknownProtocolError({});
        expect(() => new Date(error.timestamp)).not.toThrow();
        expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);
    });
});

// ---------------------------------------------------------------------------
// ENS-6002: Normalization Failed
// ---------------------------------------------------------------------------

describe('createNormalizationFailedError (ENS-6002)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createNormalizationFailedError('ag-ui');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-6002');
    });

    it('attributes to normalizer module', () => {
        const error = createNormalizationFailedError('ag-ui');
        expect(error.module).toBe('normalizer');
    });

    it('is recoverable (next event may succeed)', () => {
        const error = createNormalizationFailedError('ag-ui');
        expect(error.recoverable).toBe(true);
    });

    it('includes protocol name in message', () => {
        const error = createNormalizationFailedError('custom');
        expect(error.message).toContain('custom');
    });

    it('preserves the original cause when provided', () => {
        const originalError = new TypeError('missing required field');
        const error = createNormalizationFailedError('ag-ui', originalError);
        expect(error.cause).toBe(originalError);
    });

    it('works without a cause', () => {
        const error = createNormalizationFailedError('ag-ui');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-6003: Invalid Intent
// ---------------------------------------------------------------------------

describe('createInvalidIntentError (ENS-6003)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createInvalidIntentError('component: Required');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-6003');
    });

    it('attributes to normalizer module', () => {
        const error = createInvalidIntentError('component: Required');
        expect(error.module).toBe('normalizer');
    });

    it('is recoverable (malformed agent output)', () => {
        const error = createInvalidIntentError('component: Required');
        expect(error.recoverable).toBe(true);
    });

    it('includes Zod error details in message', () => {
        const zodErrors = 'component: Required; confidence: Expected number, received string';
        const error = createInvalidIntentError(zodErrors);
        expect(error.message).toContain('component: Required');
        expect(error.message).toContain('confidence: Expected number');
    });

    it('includes "ComponentIntentSchema" in message for clarity', () => {
        const error = createInvalidIntentError('some error');
        expect(error.message).toContain('ComponentIntentSchema');
    });
});
