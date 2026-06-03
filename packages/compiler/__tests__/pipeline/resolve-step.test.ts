/**
 * @module @enterstellar-ai/compiler/__tests__/pipeline/resolve-step
 * @description Unit tests for the resolve step — registry component lookup.
 */

import { describe, it, expect, vi } from 'vitest';

import { resolveStep } from '../../src/pipeline/resolve-step.js';
import type { CompilationContext } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubContext(
    overrides: Partial<CompilationContext> = {},
): CompilationContext {
    return {
        intent: {
            component: 'PatientVitals',
            props: { riskLevel: 3 },
            confidence: 1.0,
        } as CompilationContext['intent'],
        contract: {
            name: 'PatientVitals',
            props: {},
            tokens: {},
            accessibility: { role: 'region', ariaLabel: '', announceOnUpdate: false },
            category: 'clinical',
            description: 'Test',
            _meta: { forged: false },
        } as unknown as CompilationContext['contract'],
        registry: {
            get: vi.fn().mockReturnValue(undefined),
            getDesignTokens: () => ({}),
        } as unknown as CompilationContext['registry'],
        config: {} as CompilationContext['config'],
        designTokens: {},
        agent: 'test',
        props: { riskLevel: 3 },
        errors: [],
        warnings: [],
        strippedProps: [],
        tokenCoercions: 0,
        accessibilityInjections: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveStep', () => {
    it('calls next() when component is found in registry', async () => {
        const contract = { name: 'PatientVitals', props: {} };
        const context = createStubContext({
            registry: {
                get: vi.fn().mockReturnValue(contract),
                getDesignTokens: () => ({}),
            } as unknown as CompilationContext['registry'],
        });

        const next = vi.fn().mockResolvedValue(context);
        await resolveStep(context, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(context.errors).toHaveLength(0);
    });

    it('short-circuits with ENS-2004 when component not found', async () => {
        const context = createStubContext({
            registry: {
                get: vi.fn().mockReturnValue(undefined),
                getDesignTokens: () => ({}),
            } as unknown as CompilationContext['registry'],
        });

        const next = vi.fn().mockResolvedValue(context);
        await resolveStep(context, next);

        expect(next).not.toHaveBeenCalled();
        expect(context.errors).toHaveLength(1);
        expect(context.errors[0]?.code).toBe('ENS-2004');
    });

    it('error includes the unknown component name', async () => {
        const context = createStubContext({
            intent: {
                component: 'NonExistent',
                props: {},
                confidence: 1.0,
            } as CompilationContext['intent'],
            registry: {
                get: vi.fn().mockReturnValue(undefined),
                getDesignTokens: () => ({}),
            } as unknown as CompilationContext['registry'],
        });

        const next = vi.fn().mockResolvedValue(context);
        await resolveStep(context, next);

        expect(context.errors[0]?.message).toContain('NonExistent');
    });
});
