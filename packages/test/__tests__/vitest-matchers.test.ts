/**
 * @module @enterstellar-ai/test/__tests__/vitest-matchers
 * @description Unit tests for the 5 custom Vitest matchers.
 *
 * Verifies:
 * - .toResolveToComponent() — pass and fail
 * - .toPassValidation() — pass and fail
 * - .toBeTokenCompliant() — pass and fail
 * - .toHaveLatencyBelow() — pass and fail
 * - .toPassAccessibility() — pass and fail
 * - .not negation for all matchers
 */

import { describe, it, expect, beforeAll } from 'vitest';

import type { AgentTrace, CompilationResult } from '@enterstellar-ai/types';

import { enterstellarMatchers } from '../src/vitest-matchers.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
    expect.extend(enterstellarMatchers);
});

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

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
// Tests
// ---------------------------------------------------------------------------

describe('toResolveToComponent', () => {
    it('passes when trace resolves to the expected component', () => {
        const trace = mockTrace({ resolvedComponent: 'PatientVitals' });
        expect(trace).toResolveToComponent('PatientVitals');
    });

    it('fails when trace resolves to a different component', () => {
        const trace = mockTrace({ resolvedComponent: 'AlertBanner' });
        expect(() =>
            expect(trace).toResolveToComponent('PatientVitals'),
        ).toThrow();
    });

    it('supports .not negation', () => {
        const trace = mockTrace({ resolvedComponent: 'AlertBanner' });
        expect(trace).not.toResolveToComponent('PatientVitals');
    });
});

describe('toPassValidation', () => {
    it('passes when compilation status is pass', () => {
        const result = mockResult({ status: 'pass' });
        expect(result).toPassValidation();
    });

    it('fails when compilation status is fail', () => {
        const result = mockResult({
            status: 'fail',
            errors: [{ code: 'ENS-2001', path: 'props.x', message: 'Missing' }],
        });
        expect(() => expect(result).toPassValidation()).toThrow();
    });

    it('supports .not negation', () => {
        const result = mockResult({ status: 'fail', errors: [] });
        expect(result).not.toPassValidation();
    });
});

describe('toBeTokenCompliant', () => {
    it('passes when no ENS-2002 errors exist', () => {
        const result = mockResult({ errors: [] });
        expect(result).toBeTokenCompliant();
    });

    it('fails when ENS-2002 errors exist', () => {
        const result = mockResult({
            errors: [{ code: 'ENS-2002', path: 'tokens.bg', message: 'Bad token' }],
        });
        expect(() => expect(result).toBeTokenCompliant()).toThrow();
    });

    it('passes with non-token errors only', () => {
        const result = mockResult({
            errors: [{ code: 'ENS-2001', path: 'props.x', message: 'Missing field' }],
        });
        expect(result).toBeTokenCompliant();
    });

    it('supports .not negation', () => {
        const result = mockResult({
            errors: [{ code: 'ENS-2002', path: 'tokens.fg', message: 'Invalid' }],
        });
        expect(result).not.toBeTokenCompliant();
    });
});

describe('toHaveLatencyBelow', () => {
    it('passes when totalMs is below threshold', () => {
        const trace = mockTrace({ totalMs: 50 });
        expect(trace).toHaveLatencyBelow(100);
    });

    it('fails when totalMs exceeds threshold', () => {
        const trace = mockTrace({ totalMs: 200 });
        expect(() => expect(trace).toHaveLatencyBelow(100)).toThrow();
    });

    it('fails when totalMs equals threshold (strict <)', () => {
        const trace = mockTrace({ totalMs: 100 });
        expect(() => expect(trace).toHaveLatencyBelow(100)).toThrow();
    });

    it('supports .not negation', () => {
        const trace = mockTrace({ totalMs: 200 });
        expect(trace).not.toHaveLatencyBelow(100);
    });
});

describe('toPassAccessibility', () => {
    it('passes when no ENS-2003 errors exist', () => {
        const result = mockResult({ errors: [] });
        expect(result).toPassAccessibility();
    });

    it('fails when ENS-2003 errors exist', () => {
        const result = mockResult({
            errors: [{ code: 'ENS-2003', path: 'a11y.role', message: 'Missing ARIA role' }],
        });
        expect(() => expect(result).toPassAccessibility()).toThrow();
    });

    it('passes with non-a11y errors only', () => {
        const result = mockResult({
            errors: [{ code: 'ENS-2002', path: 'tokens.bg', message: 'Bad token' }],
        });
        expect(result).toPassAccessibility();
    });

    it('supports .not negation', () => {
        const result = mockResult({
            errors: [{ code: 'ENS-2003', path: 'a11y.label', message: 'Missing label' }],
        });
        expect(result).not.toPassAccessibility();
    });
});
