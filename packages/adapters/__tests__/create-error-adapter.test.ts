/**
 * @module @enterstellar-ai/adapters/__tests__/create-error-adapter
 * @description Unit tests for `createErrorAdapter()` and `createNoopErrorAdapter()`.
 *
 * Tests:
 * - Valid config → working adapter with all methods
 * - AD5 error wrapping: all methods → ENS-7002 (generic method error)
 * - Async method handling (report, shouldRetry, sanitize are all async per AD2)
 * - Invalid config → ENS-7001 delegation to validateAdapterConfig
 * - Returned adapter is frozen (Object.freeze — R4 pattern)
 * - Noop adapter: report → void, shouldRetry → false, sanitize → identity
 *
 * @see src/create-error-adapter.ts
 * @see Design Choice AD2 — all methods async
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createErrorAdapter, createNoopErrorAdapter } from '../src/create-error-adapter.js';
import type { ErrorAdapterConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid ErrorAdapterConfig with spy functions. */
function createValidConfig(
    overrides?: Partial<ErrorAdapterConfig>,
): ErrorAdapterConfig {
    return {
        name: 'test-error',
        report: vi.fn().mockResolvedValue(undefined),
        shouldRetry: vi.fn().mockResolvedValue(true),
        sanitize: vi.fn().mockResolvedValue(new Error('sanitized')),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createErrorAdapter — valid creation', () => {
    it('creates an adapter from valid config', () => {
        const adapter = createErrorAdapter(createValidConfig());

        expect(adapter).toBeDefined();
        expect(typeof adapter.report).toBe('function');
        expect(typeof adapter.shouldRetry).toBe('function');
        expect(typeof adapter.sanitize).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const adapter = createErrorAdapter(createValidConfig());

        expect(Object.isFrozen(adapter)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — report
// ---------------------------------------------------------------------------

describe('createErrorAdapter — method delegation (report)', () => {
    it('report() delegates to config', async () => {
        const config = createValidConfig();
        const adapter = createErrorAdapter(config);
        const testError = new Error('test error');
        const context = { zone: 'main', component: 'PatientVitals' };

        await adapter.report(testError, context);

        expect(config.report).toHaveBeenCalledWith(testError, context);
    });

    it('report() delegates without context when not provided', async () => {
        const config = createValidConfig();
        const adapter = createErrorAdapter(config);
        const testError = new Error('test error');

        await adapter.report(testError);

        expect(config.report).toHaveBeenCalledWith(testError, undefined);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — shouldRetry (async per AD2)
// ---------------------------------------------------------------------------

describe('createErrorAdapter — method delegation (shouldRetry)', () => {
    it('shouldRetry() delegates to config and returns true', async () => {
        const config = createValidConfig({
            shouldRetry: vi.fn().mockResolvedValue(true),
        });
        const adapter = createErrorAdapter(config);
        const testError = new Error('transient failure');

        const result = await adapter.shouldRetry(testError, 1);

        expect(config.shouldRetry).toHaveBeenCalledWith(testError, 1);
        expect(result).toBe(true);
    });

    it('shouldRetry() returns false when config resolves to false', async () => {
        const config = createValidConfig({
            shouldRetry: vi.fn().mockResolvedValue(false),
        });
        const adapter = createErrorAdapter(config);

        const result = await adapter.shouldRetry(new Error('fatal'), 3);

        expect(result).toBe(false);
    });

    it('shouldRetry() passes the attempt number correctly', async () => {
        const config = createValidConfig({
            shouldRetry: vi.fn().mockResolvedValue(true),
        });
        const adapter = createErrorAdapter(config);
        const testError = new Error('test');

        await adapter.shouldRetry(testError, 5);

        expect(config.shouldRetry).toHaveBeenCalledWith(testError, 5);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — sanitize (async per AD2)
// ---------------------------------------------------------------------------

describe('createErrorAdapter — method delegation (sanitize)', () => {
    it('sanitize() delegates to config and returns sanitized error', async () => {
        const sanitizedError = new Error('[REDACTED]');
        const config = createValidConfig({
            sanitize: vi.fn().mockResolvedValue(sanitizedError),
        });
        const adapter = createErrorAdapter(config);
        const rawError = new Error('SSN-123-45-6789');

        const result = await adapter.sanitize(rawError);

        expect(config.sanitize).toHaveBeenCalledWith(rawError);
        expect(result).toBe(sanitizedError);
    });

    it('sanitize() returns the original error when config passes through', async () => {
        const config = createValidConfig({
            sanitize: vi.fn().mockImplementation(
                (e: Error) => Promise.resolve(e),
            ),
        });
        const adapter = createErrorAdapter(config);
        const rawError = new Error('safe message');

        const result = await adapter.sanitize(rawError);

        expect(result).toBe(rawError);
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — report (ENS-7002)
// ---------------------------------------------------------------------------

describe('createErrorAdapter — AD5 error wrapping (report → ENS-7002)', () => {
    it('wraps report() errors in ENS-7002', async () => {
        const originalError = new Error('Sentry down');
        const config = createValidConfig({
            report: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createErrorAdapter(config);

        try {
            await adapter.report(new Error('test'));
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and method in ENS-7002 message', async () => {
        const config = createValidConfig({
            name: 'sentry-error',
            report: vi.fn().mockRejectedValue(new Error('fail')),
        });
        const adapter = createErrorAdapter(config);

        try {
            await adapter.report(new Error('test'));
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('sentry-error');
            expect(error.message).toContain('report');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — shouldRetry (ENS-7002, async)
// ---------------------------------------------------------------------------

describe('createErrorAdapter — AD5 error wrapping (shouldRetry → ENS-7002)', () => {
    it('wraps shouldRetry() errors in ENS-7002', async () => {
        const originalError = new TypeError('retry logic broken');
        const config = createValidConfig({
            shouldRetry: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createErrorAdapter(config);

        try {
            await adapter.shouldRetry(new Error('test'), 1);
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes method name in ENS-7002 message', async () => {
        const config = createValidConfig({
            name: 'datadog-error',
            shouldRetry: vi.fn().mockRejectedValue(new Error('fail')),
        });
        const adapter = createErrorAdapter(config);

        try {
            await adapter.shouldRetry(new Error('test'), 1);
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('shouldRetry');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — sanitize (ENS-7002, async)
// ---------------------------------------------------------------------------

describe('createErrorAdapter — AD5 error wrapping (sanitize → ENS-7002)', () => {
    it('wraps sanitize() errors in ENS-7002', async () => {
        const originalError = new RangeError('sanitization failed');
        const config = createValidConfig({
            sanitize: vi.fn().mockRejectedValue(originalError),
        });
        const adapter = createErrorAdapter(config);

        try {
            await adapter.sanitize(new Error('test'));
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes method name in ENS-7002 message', async () => {
        const config = createValidConfig({
            name: 'custom-error',
            sanitize: vi.fn().mockRejectedValue(new Error('fail')),
        });
        const adapter = createErrorAdapter(config);

        try {
            await adapter.sanitize(new Error('test'));
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('sanitize');
        }
    });
});

// ---------------------------------------------------------------------------
// Config Validation Delegation (ENS-7001)
// ---------------------------------------------------------------------------

describe('createErrorAdapter — config validation (ENS-7001)', () => {
    it('throws ENS-7001 when name is empty', () => {
        expect(() => {
            createErrorAdapter(createValidConfig({ name: '' }));
        }).toThrow(EnterstellarError);

        try {
            createErrorAdapter(createValidConfig({ name: '' }));
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
        }
    });

    it('throws ENS-7001 when a required method is missing', () => {
        const config = {
            name: 'test-error',
            report: vi.fn().mockResolvedValue(undefined),
            sanitize: vi.fn().mockResolvedValue(new Error('sanitized')),
            // shouldRetry intentionally omitted
        } as unknown as ErrorAdapterConfig;

        expect(() => createErrorAdapter(config)).toThrow(EnterstellarError);
        try {
            createErrorAdapter(config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('shouldRetry');
        }
    });
});

// ---------------------------------------------------------------------------
// Noop Factory
// ---------------------------------------------------------------------------

describe('createNoopErrorAdapter', () => {
    it('creates a frozen adapter', () => {
        const adapter = createNoopErrorAdapter();

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('report() resolves without error', async () => {
        const adapter = createNoopErrorAdapter();

        await expect(adapter.report(new Error('test'))).resolves.toBeUndefined();
    });

    it('shouldRetry() resolves to false (never retry in noop mode)', async () => {
        const adapter = createNoopErrorAdapter();

        const result = await adapter.shouldRetry(new Error('test'), 1);

        expect(result).toBe(false);
    });

    it('sanitize() resolves to the original error unchanged (identity)', async () => {
        const adapter = createNoopErrorAdapter();
        const original = new Error('test error');

        const result = await adapter.sanitize(original);

        expect(result).toBe(original);
    });
});
