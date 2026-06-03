/**
 * @module @enterstellar-ai/lifecycle/__tests__/errors
 * @description Unit tests for all 5 lifecycle error factory functions (ENS-3002–3005).
 *
 * Verifies each factory produces an `EnterstellarError` with the correct code,
 * module attribution, recoverability flag, and descriptive message.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import {
    createAgentTimeoutError,
    createInvalidTransitionError,
    createStreamingAssemblyError,
    createDisposedError,
    createMaxRetriesExceededError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// ENS-3002: Agent Timeout
// ---------------------------------------------------------------------------

describe('createAgentTimeoutError (ENS-3002)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createAgentTimeoutError(30_000);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-3002');
    });

    it('attributes to lifecycle module', () => {
        const error = createAgentTimeoutError(30_000);
        expect(error.module).toBe('lifecycle');
    });

    it('is recoverable', () => {
        const error = createAgentTimeoutError(30_000);
        expect(error.recoverable).toBe(true);
    });

    it('includes timeout value in message', () => {
        const error = createAgentTimeoutError(15_000);
        expect(error.message).toContain('15000');
    });

    it('includes remediation guidance in message', () => {
        const error = createAgentTimeoutError(30_000);
        expect(error.message).toContain('timeoutMs');
    });
});

// ---------------------------------------------------------------------------
// ENS-3003: Invalid State Transition
// ---------------------------------------------------------------------------

describe('createInvalidTransitionError (ENS-3003)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createInvalidTransitionError('empty', 'streaming');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-3003');
    });

    it('attributes to lifecycle module', () => {
        const error = createInvalidTransitionError('idle', 'ready');
        expect(error.module).toBe('lifecycle');
    });

    it('is NOT recoverable (developer error)', () => {
        const error = createInvalidTransitionError('idle', 'ready');
        expect(error.recoverable).toBe(false);
    });

    it('includes both states in message', () => {
        const error = createInvalidTransitionError('empty', 'streaming');
        expect(error.message).toContain('empty');
        expect(error.message).toContain('streaming');
    });

    it('includes remediation guidance', () => {
        const error = createInvalidTransitionError('empty', 'loading');
        expect(error.message).toContain('reset()');
    });
});

// ---------------------------------------------------------------------------
// ENS-3004: Streaming Assembly Error
// ---------------------------------------------------------------------------

describe('createStreamingAssemblyError (ENS-3004)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createStreamingAssemblyError('[invalid', 'Unclosed bracket');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-3004');
    });

    it('attributes to lifecycle module', () => {
        const error = createStreamingAssemblyError('bad.path', 'reason');
        expect(error.module).toBe('lifecycle');
    });

    it('is recoverable', () => {
        const error = createStreamingAssemblyError('bad.path', 'reason');
        expect(error.recoverable).toBe(true);
    });

    it('includes path in message', () => {
        const error = createStreamingAssemblyError('metrics[0].value', 'Type mismatch');
        expect(error.message).toContain('metrics[0].value');
    });

    it('includes reason in message', () => {
        const error = createStreamingAssemblyError('path', 'Unclosed bracket in path segment.');
        expect(error.message).toContain('Unclosed bracket in path segment.');
    });
});

// ---------------------------------------------------------------------------
// ENS-3005: Lifecycle Manager Disposed
// ---------------------------------------------------------------------------

describe('createDisposedError (ENS-3005)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createDisposedError();
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-3005');
    });

    it('attributes to lifecycle module', () => {
        const error = createDisposedError();
        expect(error.module).toBe('lifecycle');
    });

    it('is NOT recoverable', () => {
        const error = createDisposedError();
        expect(error.recoverable).toBe(false);
    });

    it('includes remediation guidance', () => {
        const error = createDisposedError();
        expect(error.message).toContain('createLifecycleManager()');
    });
});

// ---------------------------------------------------------------------------
// ENS-3003 variant: Max Retries Exceeded
// ---------------------------------------------------------------------------

describe('createMaxRetriesExceededError (ENS-3003 variant)', () => {
    it('produces an EnterstellarError with correct code', () => {
        const error = createMaxRetriesExceededError(3);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-3003');
    });

    it('attributes to lifecycle module', () => {
        const error = createMaxRetriesExceededError(3);
        expect(error.module).toBe('lifecycle');
    });

    it('is NOT recoverable via retry', () => {
        const error = createMaxRetriesExceededError(3);
        expect(error.recoverable).toBe(false);
    });

    it('includes retry count in message', () => {
        const error = createMaxRetriesExceededError(5);
        expect(error.message).toContain('5');
    });

    it('includes remediation guidance', () => {
        const error = createMaxRetriesExceededError(3);
        expect(error.message).toContain('reset()');
    });
});
