/**
 * @module @enterstellar-ai/compiler/__tests__/pipeline/parse-step
 * @description Unit tests for the parse step — Zod schema validation + strip.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { parseStep } from '../../src/pipeline/parse-step.js';
import type { CompilationContext } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testSchema = z.object({
    riskLevel: z.number().min(1).max(5),
    patientId: z.string(),
});

function createStubContext(
    props: Record<string, unknown>,
    schema: z.ZodType = testSchema,
): CompilationContext {
    return {
        intent: {
            component: 'PatientVitals',
            props,
            confidence: 1.0,
        } as CompilationContext['intent'],
        contract: {
            name: 'PatientVitals',
            props: schema,
            tokens: {},
            accessibility: { role: '', ariaLabel: '', announceOnUpdate: false },
            category: 'clinical',
            description: '',
            _meta: { forged: false },
        } as unknown as CompilationContext['contract'],
        registry: {} as CompilationContext['registry'],
        config: {} as CompilationContext['config'],
        designTokens: {},
        agent: 'test',
        props: { ...props },
        errors: [],
        warnings: [],
        strippedProps: [],
        tokenCoercions: 0,
        accessibilityInjections: [],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseStep', () => {
    it('passes valid props through to next()', async () => {
        const context = createStubContext({ riskLevel: 3, patientId: 'p-123' });
        const next = vi.fn().mockResolvedValue(context);

        await parseStep(context, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(context.errors).toHaveLength(0);
        expect(context.props).toEqual({ riskLevel: 3, patientId: 'p-123' });
    });

    it('strips unknown props and logs warning (P10)', async () => {
        const context = createStubContext({
            riskLevel: 3,
            patientId: 'p-123',
            hallucinated: true,
            bogus: 'value',
        });
        const next = vi.fn().mockResolvedValue(context);

        await parseStep(context, next);

        expect(context.props).not.toHaveProperty('hallucinated');
        expect(context.props).not.toHaveProperty('bogus');
        expect(context.strippedProps).toContain('hallucinated');
        expect(context.strippedProps).toContain('bogus');
        expect(context.warnings).toHaveLength(1);
        expect(context.warnings[0]?.code).toBe('ENS-2008');
    });

    it('adds ENS-2001 errors on schema validation failure', async () => {
        const context = createStubContext({
            riskLevel: 'invalid',
            patientId: 123,
        });
        const next = vi.fn().mockResolvedValue(context);

        await parseStep(context, next);

        expect(context.errors.length).toBeGreaterThan(0);
        expect(context.errors.every((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('does not short-circuit on failure — calls next()', async () => {
        const context = createStubContext({ riskLevel: 'bad' });
        const next = vi.fn().mockResolvedValue(context);

        await parseStep(context, next);

        // Parse step does NOT short-circuit — allows downstream steps to accumulate errors
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('handles empty props with required fields', async () => {
        const context = createStubContext({});
        const next = vi.fn().mockResolvedValue(context);

        await parseStep(context, next);

        expect(context.errors.length).toBeGreaterThan(0);
    });
});
