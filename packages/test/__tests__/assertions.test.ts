/**
 * @module @enterstellar-ai/test/__tests__/assertions
 * @description Unit tests for the 6 framework-agnostic assertion helpers.
 *
 * Each assertion is tested for:
 * - Pass path (returns void, no throw)
 * - Fail path (throws EnterstellarError with correct code and descriptive message)
 * - Boundary conditions (e.g., exactly-at-threshold fails)
 */

import { describe, it, expect } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';
import type { AgentTrace, CompilationResult } from '@enterstellar-ai/types';

import {
    componentToBe,
    confidenceAbove,
    compilationToPass,
    tokenCompliant,
    latencyBelow,
    accessibilityToPass,
} from '../src/assertions.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock `AgentTrace` for assertion testing.
 * Only fields used by assertions are populated.
 */
function mockTrace(overrides: {
    resolvedComponent?: string;
    confidence?: number;
    totalMs?: number;
} = {}): AgentTrace {
    return {
        id: 'test-trace-001' as AgentTrace['id'],
        timestamp: new Date().toISOString(),
        intent: {
            raw: 'test intent',
            component: overrides.resolvedComponent ?? 'TestCard',
            confidence: overrides.confidence ?? 1.0,
        },
        resolution: {
            strategy: 'exact',
            resolvedComponent: overrides.resolvedComponent ?? 'TestCard',
            candidatesConsidered: 1,
        },
        compilation: {
            status: 'pass',
            errorCount: 0,
            selfCorrectionAttempts: 0,
            tokensValidated: true,
            accessibilityInjected: false,
        },
        determinism: {
            level: 1.0,
            cacheHit: false,
            zone: 'test-zone',
        },
        metrics: {
            totalMs: overrides.totalMs ?? 10,
            resolutionMs: 1,
            compilationMs: 9,
            renderMs: 0,
        },
        consent: {
            anonymizedAggregation: false,
        },
    };
}

/**
 * Creates a minimal mock `CompilationResult` for assertion testing.
 */
function mockResult(overrides: {
    status?: 'pass' | 'fail' | 'corrected';
    errors?: CompilationResult['errors'];
} = {}): CompilationResult {
    return {
        componentName: 'TestCard',
        props: { title: 'Test' },
        status: overrides.status ?? 'pass',
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: overrides.errors ?? [],
        selfCorrectionAttempts: 0,
    };
}

// ---------------------------------------------------------------------------
// componentToBe (ENS-5001)
// ---------------------------------------------------------------------------

describe('componentToBe', () => {
    it('passes when resolved component matches expected', () => {
        const trace = mockTrace({ resolvedComponent: 'PatientVitals' });
        expect(() => componentToBe(trace, 'PatientVitals')).not.toThrow();
    });

    it('throws EnterstellarError ENS-5001 when component does not match', () => {
        const trace = mockTrace({ resolvedComponent: 'AlertBanner' });

        expect(() => componentToBe(trace, 'PatientVitals')).toThrow(EnterstellarError);

        try {
            componentToBe(trace, 'PatientVitals');
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5001');
        }
    });

    it('error message includes both expected and actual component names', () => {
        const trace = mockTrace({ resolvedComponent: 'AlertBanner' });

        try {
            componentToBe(trace, 'PatientVitals');
            expect.fail('Expected EnterstellarError');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.message).toContain('PatientVitals');
            expect(enterstellarErr.message).toContain('AlertBanner');
            expect(enterstellarErr.module).toBe('test');
            expect(enterstellarErr.recoverable).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// confidenceAbove (ENS-5002)
// ---------------------------------------------------------------------------

describe('confidenceAbove', () => {
    it('passes when confidence exceeds threshold', () => {
        const trace = mockTrace({ confidence: 0.95 });
        expect(() => confidenceAbove(trace, 0.9)).not.toThrow();
    });

    it('throws ENS-5002 when confidence is below threshold', () => {
        const trace = mockTrace({ confidence: 0.5 });

        expect(() => confidenceAbove(trace, 0.8)).toThrow(EnterstellarError);

        try {
            confidenceAbove(trace, 0.8);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5002');
        }
    });

    it('throws when confidence equals threshold exactly (strict >)', () => {
        const trace = mockTrace({ confidence: 0.9 });

        expect(() => confidenceAbove(trace, 0.9)).toThrow(EnterstellarError);
    });

    it('passes with confidence of 1.0 and threshold 0.99', () => {
        const trace = mockTrace({ confidence: 1.0 });
        expect(() => confidenceAbove(trace, 0.99)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// compilationToPass (ENS-5003)
// ---------------------------------------------------------------------------

describe('compilationToPass', () => {
    it('passes when status is pass', () => {
        const result = mockResult({ status: 'pass' });
        expect(() => compilationToPass(result)).not.toThrow();
    });

    it('throws ENS-5003 when status is fail', () => {
        const result = mockResult({
            status: 'fail',
            errors: [{ code: 'ENS-2001', path: 'props.title', message: 'Required field missing' }],
        });

        expect(() => compilationToPass(result)).toThrow(EnterstellarError);

        try {
            compilationToPass(result);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5003');
        }
    });

    it('throws ENS-5003 when status is corrected (strict pass only)', () => {
        const result = mockResult({ status: 'corrected' });

        expect(() => compilationToPass(result)).toThrow(EnterstellarError);
    });

    it('error message includes error details from the compilation', () => {
        const result = mockResult({
            status: 'fail',
            errors: [
                { code: 'ENS-2001', path: 'props.severity', message: 'Invalid enum value' },
                { code: 'ENS-2002', path: 'props.color', message: 'Hallucinated token' },
            ],
        });

        try {
            compilationToPass(result);
            expect.fail('Expected EnterstellarError');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.message).toContain('ENS-2001');
            expect(enterstellarErr.message).toContain('ENS-2002');
            expect(enterstellarErr.message).toContain('2'); // error count
        }
    });
});

// ---------------------------------------------------------------------------
// tokenCompliant (ENS-5004)
// ---------------------------------------------------------------------------

describe('tokenCompliant', () => {
    it('passes when no ENS-2002 errors exist', () => {
        const result = mockResult({ errors: [] });
        expect(() => tokenCompliant(result)).not.toThrow();
    });

    it('passes when errors exist but none are ENS-2002', () => {
        const result = mockResult({
            errors: [
                { code: 'ENS-2001', path: 'props.title', message: 'Missing required field' },
                { code: 'ENS-2003', path: 'accessibility', message: 'Missing ARIA label' },
            ],
        });
        expect(() => tokenCompliant(result)).not.toThrow();
    });

    it('throws ENS-5004 when ENS-2002 errors exist', () => {
        const result = mockResult({
            errors: [
                { code: 'ENS-2002', path: 'tokens.color', message: 'Hallucinated token: #ff0000' },
            ],
        });

        expect(() => tokenCompliant(result)).toThrow(EnterstellarError);

        try {
            tokenCompliant(result);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5004');
        }
    });

    it('counts multiple token violations in error message', () => {
        const result = mockResult({
            errors: [
                { code: 'ENS-2002', path: 'tokens.bg', message: 'Invalid: blue' },
                { code: 'ENS-2002', path: 'tokens.fg', message: 'Invalid: green' },
            ],
        });

        try {
            tokenCompliant(result);
            expect.fail('Expected EnterstellarError');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.message).toContain('2 violation');
        }
    });
});

// ---------------------------------------------------------------------------
// latencyBelow (ENS-5005)
// ---------------------------------------------------------------------------

describe('latencyBelow', () => {
    it('passes when totalMs is below threshold', () => {
        const trace = mockTrace({ totalMs: 50 });
        expect(() => latencyBelow(trace, 100)).not.toThrow();
    });

    it('throws ENS-5005 when totalMs exceeds threshold', () => {
        const trace = mockTrace({ totalMs: 150 });

        expect(() => latencyBelow(trace, 100)).toThrow(EnterstellarError);

        try {
            latencyBelow(trace, 100);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5005');
        }
    });

    it('throws when totalMs equals threshold exactly (strict <)', () => {
        const trace = mockTrace({ totalMs: 100 });

        expect(() => latencyBelow(trace, 100)).toThrow(EnterstellarError);
    });

    it('passes with very low latency', () => {
        const trace = mockTrace({ totalMs: 0.01 });
        expect(() => latencyBelow(trace, 1)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// accessibilityToPass (ENS-5006)
// ---------------------------------------------------------------------------

describe('accessibilityToPass', () => {
    it('passes when no ENS-2003 errors exist', () => {
        const result = mockResult({ errors: [] });
        expect(() => accessibilityToPass(result)).not.toThrow();
    });

    it('passes when errors exist but none are ENS-2003', () => {
        const result = mockResult({
            errors: [
                { code: 'ENS-2001', path: 'props.title', message: 'Missing field' },
                { code: 'ENS-2002', path: 'tokens.bg', message: 'Bad token' },
            ],
        });
        expect(() => accessibilityToPass(result)).not.toThrow();
    });

    it('throws ENS-5006 when ENS-2003 errors exist', () => {
        const result = mockResult({
            errors: [
                { code: 'ENS-2003', path: 'accessibility.role', message: 'Missing ARIA role' },
            ],
        });

        expect(() => accessibilityToPass(result)).toThrow(EnterstellarError);

        try {
            accessibilityToPass(result);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5006');
        }
    });

    it('error message includes violation details', () => {
        const result = mockResult({
            errors: [
                { code: 'ENS-2003', path: 'accessibility.ariaLabel', message: 'Missing ariaLabel' },
            ],
        });

        try {
            accessibilityToPass(result);
            expect.fail('Expected EnterstellarError');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.message).toContain('1 violation');
            expect(enterstellarErr.message).toContain('ENS-2003');
            expect(enterstellarErr.module).toBe('test');
        }
    });
});
