/**
 * @module @enterstellar-ai/agent-sdk/__tests__/errors
 * @description Unit tests for all Agent SDK error factory functions.
 *
 * Verifies that each factory creates a well-typed `EnterstellarError` with:
 * - Correct error code (`ENS-8001`–`ENS-8005`).
 * - Module identifier `'agent-sdk'`.
 * - Correct `recoverable` flag.
 * - Descriptive message containing context (dep name, query, component, reason).
 * - Proper inheritance chain (`EnterstellarError extends Error`).
 *
 * @see Coding Rules — Error Taxonomy (ENS-8xxx range).
 */

import { describe, it, expect } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import {
    sdkNotInitializedError,
    searchFailedError,
    composeFailedError,
    componentSchemaNotFoundError,
    traceAnalysisInvalidError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent SDK error factories', () => {
    // -----------------------------------------------------------------------
    // ENS-8001: sdkNotInitializedError
    // -----------------------------------------------------------------------

    describe('sdkNotInitializedError (ENS-8001)', () => {
        it('creates an EnterstellarError with code ENS-8001', () => {
            const error = sdkNotInitializedError('registry');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error).toBeInstanceOf(Error);
            expect(error.code).toBe('ENS-8001');
            expect(error.module).toBe('agent-sdk');
            expect(error.recoverable).toBe(false);
        });

        it('includes the missing dependency name in the message', () => {
            const error = sdkNotInitializedError('semanticIndex');

            expect(error.message).toContain('semanticIndex');
            expect(error.message).toContain('createAgentSDK');
        });
    });

    // -----------------------------------------------------------------------
    // ENS-8002: searchFailedError
    // -----------------------------------------------------------------------

    describe('searchFailedError (ENS-8002)', () => {
        it('creates a recoverable EnterstellarError with code ENS-8002', () => {
            const cause = new Error('Embedding model unavailable');
            const error = searchFailedError('patient vitals', cause);

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-8002');
            expect(error.module).toBe('agent-sdk');
            expect(error.recoverable).toBe(true);
        });

        it('includes query and cause message in the error message', () => {
            const cause = new Error('Timeout');
            const error = searchFailedError('patient vitals', cause);

            expect(error.message).toContain('patient vitals');
            expect(error.message).toContain('Timeout');
        });

        it('chains the original Error as cause', () => {
            const cause = new Error('Original cause');
            const error = searchFailedError('test', cause);

            expect(error.cause).toBe(cause);
        });

        it('handles non-Error cause gracefully', () => {
            const error = searchFailedError('test', 'string error');

            expect(error.code).toBe('ENS-8002');
            expect(error.message).toContain('string error');
        });
    });

    // -----------------------------------------------------------------------
    // ENS-8003: composeFailedError
    // -----------------------------------------------------------------------

    describe('composeFailedError (ENS-8003)', () => {
        it('creates a recoverable EnterstellarError with code ENS-8003', () => {
            const error = composeFailedError('Unknown component');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-8003');
            expect(error.module).toBe('agent-sdk');
            expect(error.recoverable).toBe(true);
        });

        it('includes the reason in the error message', () => {
            const error = composeFailedError("Zone 'main' references unknown component 'Foo'");

            expect(error.message).toContain('main');
            expect(error.message).toContain('Foo');
        });
    });

    // -----------------------------------------------------------------------
    // ENS-8004: componentSchemaNotFoundError
    // -----------------------------------------------------------------------

    describe('componentSchemaNotFoundError (ENS-8004)', () => {
        it('creates a recoverable EnterstellarError with code ENS-8004', () => {
            const error = componentSchemaNotFoundError('NonExistentWidget');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-8004');
            expect(error.module).toBe('agent-sdk');
            expect(error.recoverable).toBe(true);
        });

        it('includes the component name and guidance in the message', () => {
            const error = componentSchemaNotFoundError('PatientTimeline');

            expect(error.message).toContain('PatientTimeline');
            expect(error.message).toContain('not found');
            expect(error.message).toContain('enterstellar_search_components');
        });
    });

    // -----------------------------------------------------------------------
    // ENS-8005: traceAnalysisInvalidError
    // -----------------------------------------------------------------------

    describe('traceAnalysisInvalidError (ENS-8005)', () => {
        it('creates a recoverable EnterstellarError with code ENS-8005', () => {
            const error = traceAnalysisInvalidError('Invalid groupBy');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-8005');
            expect(error.module).toBe('agent-sdk');
            expect(error.recoverable).toBe(true);
        });

        it('includes the reason and valid groupBy values in the message', () => {
            const error = traceAnalysisInvalidError("Invalid groupBy value 'foo'");

            expect(error.message).toContain('foo');
            expect(error.message).toContain('component');
            expect(error.message).toContain('zone');
            expect(error.message).toContain('status');
            expect(error.message).toContain('strategy');
        });
    });

    // -----------------------------------------------------------------------
    // Cross-cutting: all errors have timestamp
    // -----------------------------------------------------------------------

    describe('cross-cutting properties', () => {
        it('all error factories produce errors with a timestamp', () => {
            const errors = [
                sdkNotInitializedError('registry'),
                searchFailedError('query', new Error('cause')),
                composeFailedError('reason'),
                componentSchemaNotFoundError('Component'),
                traceAnalysisInvalidError('reason'),
            ];

            for (const error of errors) {
                expect(error.timestamp).toBeDefined();
                expect(typeof error.timestamp).toBe('string');
                // Verify it's a valid ISO 8601 timestamp
                expect(Number.isNaN(Date.parse(error.timestamp))).toBe(false);
            }
        });
    });
});
