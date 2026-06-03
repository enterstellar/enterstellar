/**
 * @module @enterstellar-ai/connection/__tests__/errors.test
 * @description Unit tests for connection error helper factories.
 *
 * Verifies that each factory produces a correct `EnterstellarError` with the
 * expected code, module, message, and recoverability.
 *
 * @see Coding Rules — Error Taxonomy
 */

import { describe, it, expect } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import {
    connectionFailedError,
    sendDisconnectedError,
    messageParseError,
    backpressureDropWarning,
    configValidationError,
    CONNECTION_ERROR_CODES,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connection error helpers', () => {
    describe('connectionFailedError', () => {
        it('should create ENS-3003 with module "connection"', () => {
            const error = connectionFailedError('WebSocket timeout');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-3003');
            expect(error.module).toBe('connection');
            expect(error.message).toBe('WebSocket timeout');
            expect(error.recoverable).toBe(true);
        });

        it('should include cause when provided', () => {
            const cause = new Error('network unreachable');
            const error = connectionFailedError('Connection failed', cause);

            expect(error.cause).toBe(cause);
        });

        it('should work without a cause', () => {
            const error = connectionFailedError('timeout');

            expect(error.cause).toBeUndefined();
        });
    });

    describe('sendDisconnectedError', () => {
        it('should create ENS-3004 with transport name in message', () => {
            const error = sendDisconnectedError('WebSocket');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-3004');
            expect(error.module).toBe('connection');
            expect(error.message).toContain('WebSocket');
            expect(error.recoverable).toBe(false);
        });

        it('should work with SSE transport name', () => {
            const error = sendDisconnectedError('SSE');

            expect(error.message).toContain('SSE');
        });
    });

    describe('messageParseError', () => {
        it('should create ENS-3005 with transport name and cause', () => {
            const cause = new SyntaxError('Unexpected token');
            const error = messageParseError('WebSocket', cause);

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-3005');
            expect(error.module).toBe('connection');
            expect(error.message).toContain('WebSocket');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(cause);
        });
    });

    describe('backpressureDropWarning', () => {
        it('should create ENS-3010 with component name in message', () => {
            const error = backpressureDropWarning('PatientVitals');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-3010');
            expect(error.module).toBe('connection');
            expect(error.message).toContain('PatientVitals');
            expect(error.recoverable).toBe(true);
        });

        it('should include guidance about maxBuffer', () => {
            const error = backpressureDropWarning('TestComponent');

            expect(error.message).toContain('maxBuffer');
        });
    });

    describe('configValidationError', () => {
        it('should create ENS-3001 as non-recoverable developer error', () => {
            const error = configValidationError('URL is required');

            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-3001');
            expect(error.module).toBe('connection');
            expect(error.message).toBe('URL is required');
            expect(error.recoverable).toBe(false);
        });

        it('should include Zod error as cause', () => {
            const zodError = new Error('Zod validation failed');
            const error = configValidationError('Invalid config', zodError);

            expect(error.cause).toBe(zodError);
        });
    });

    describe('CONNECTION_ERROR_CODES', () => {
        it('should contain all connection error codes', () => {
            expect(CONNECTION_ERROR_CODES).toContain('ENS-3001');
            expect(CONNECTION_ERROR_CODES).toContain('ENS-3003');
            expect(CONNECTION_ERROR_CODES).toContain('ENS-3004');
            expect(CONNECTION_ERROR_CODES).toContain('ENS-3005');
            expect(CONNECTION_ERROR_CODES).toContain('ENS-3010');
        });

        it('should be a readonly array', () => {
            expect(Array.isArray(CONNECTION_ERROR_CODES)).toBe(true);
            expect(CONNECTION_ERROR_CODES).toHaveLength(5);
        });
    });

    describe('EnterstellarError contract', () => {
        it('should serialize to JSON via toJSON()', () => {
            const error = connectionFailedError('test');
            const json = error.toJSON();

            expect(json.name).toBe('EnterstellarError');
            expect(json.code).toBe('ENS-3003');
            expect(json.module).toBe('connection');
            expect(json.message).toBe('test');
            expect(json.recoverable).toBe(true);
            expect(typeof json.timestamp).toBe('string');
        });

        it('should have a valid ISO 8601 timestamp', () => {
            const error = connectionFailedError('test');
            const parsed = Date.parse(error.timestamp);

            expect(Number.isNaN(parsed)).toBe(false);
        });
    });
});
