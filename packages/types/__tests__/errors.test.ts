/**
 * @module @enterstellar-ai/types/__tests__/errors
 * @description Unit tests for EnterstellarError class.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '../src/index.js';

describe('EnterstellarError', () => {
    it('should create an error with all required properties', () => {
        const error = new EnterstellarError(
            'ENS-1001',
            'registry',
            'Component is already registered.',
        );

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.name).toBe('EnterstellarError');
        expect(error.code).toBe('ENS-1001');
        expect(error.module).toBe('registry');
        expect(error.message).toBe('Component is already registered.');
        expect(error.recoverable).toBe(false);
        expect(error.timestamp).toBeTruthy();
        expect(error.stack).toBeTruthy();
    });

    it('should accept recoverable flag', () => {
        const error = new EnterstellarError(
            'ENS-2001',
            'compiler',
            'Validation failed.',
            true,
        );

        expect(error.recoverable).toBe(true);
    });

    it('should accept a cause', () => {
        const cause = new Error('underlying issue');
        const error = new EnterstellarError(
            'ENS-3001',
            'lifecycle',
            'Lifecycle transition failed.',
            false,
            cause,
        );

        expect(error.cause).toBe(cause);
    });

    it('should produce a valid ISO 8601 timestamp', () => {
        const error = new EnterstellarError(
            'ENS-1001',
            'registry',
            'test',
        );

        // Verify it's a valid date string
        const parsed = new Date(error.timestamp);
        expect(parsed.getTime()).not.toBeNaN();
    });

    describe('toJSON', () => {
        it('should serialize to a plain object with all fields', () => {
            const error = new EnterstellarError(
                'ENS-4006',
                'state',
                'State exceeds 1MB.',
                true,
            );

            const json = error.toJSON();

            expect(json.name).toBe('EnterstellarError');
            expect(json.code).toBe('ENS-4006');
            expect(json.module).toBe('state');
            expect(json.message).toBe('State exceeds 1MB.');
            expect(json.recoverable).toBe(true);
            expect(json.timestamp).toBe(error.timestamp);
            expect(typeof json.stack).toBe('string');
        });

        it('should be JSON-serializable (no circular references)', () => {
            const error = new EnterstellarError(
                'ENS-5001',
                'cloud',
                'Cloud endpoint unreachable.',
            );

            const serialized = JSON.stringify(error.toJSON());
            expect(serialized).toBeTruthy();

            const parsed = JSON.parse(serialized) as Record<string, unknown>;
            expect(parsed['code']).toBe('ENS-5001');
        });
    });
});
