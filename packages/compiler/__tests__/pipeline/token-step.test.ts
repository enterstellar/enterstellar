/**
 * @module @enterstellar-ai/compiler/__tests__/pipeline/token-step
 * @description Unit tests for the token enforcement step.
 */

import { describe, it, expect, vi } from 'vitest';

import { tokenStep } from '../../src/pipeline/token-step.js';
import type { CompilationContext } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubContext(
    props: Record<string, unknown>,
    contractTokens: Record<string, string>,
    designTokens: Record<string, unknown>,
    strictDesignTokens: boolean = true,
): CompilationContext {
    return {
        intent: { component: 'Test', props, confidence: 1.0 } as CompilationContext['intent'],
        contract: {
            name: 'Test',
            props: {},
            tokens: contractTokens,
            accessibility: { role: '', ariaLabel: '', announceOnUpdate: false },
            category: 'clinical',
            description: '',
            _meta: { forged: false },
        } as unknown as CompilationContext['contract'],
        registry: {} as CompilationContext['registry'],
        config: { strictDesignTokens } as CompilationContext['config'],
        designTokens: designTokens as CompilationContext['designTokens'],
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

describe('tokenStep', () => {
    it('passes when all token references are valid', async () => {
        const context = createStubContext(
            { color: 'token:danger' },
            { color: 'token:danger' },
            { danger: '#ff0000' },
        );
        const next = vi.fn().mockResolvedValue(context);

        await tokenStep(context, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(context.errors).toHaveLength(0);
    });

    it('skips validation when contract has no token fields', async () => {
        const context = createStubContext(
            { color: '#ff0000' },
            {}, // no token fields declared
            {},
        );
        const next = vi.fn().mockResolvedValue(context);

        await tokenStep(context, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(context.errors).toHaveLength(0);
    });

    it('emits ENS-2002 in strict mode for non-token value', async () => {
        const context = createStubContext(
            { color: '#ff0000' },
            { color: 'token:danger' },
            { danger: '#ff0000' },
            true, // strict
        );
        const next = vi.fn().mockResolvedValue(context);

        await tokenStep(context, next);

        expect(context.errors).toHaveLength(1);
        expect(context.errors[0]?.code).toBe('ENS-2002');
    });

    it('coerces to expected token in non-strict mode', async () => {
        const context = createStubContext(
            { color: '#ff0000' },
            { color: 'token:danger' },
            { danger: '#ff0000' },
            false, // non-strict
        );
        const next = vi.fn().mockResolvedValue(context);

        await tokenStep(context, next);

        expect(context.errors).toHaveLength(0);
        expect(context.props['color']).toBe('token:danger');
        expect(context.tokenCoercions).toBe(1);
        expect(context.warnings).toHaveLength(1);
        expect(context.warnings[0]?.code).toBe('ENS-2007');
    });

    it('emits ENS-2002 for hallucinated token not in design token set', async () => {
        const context = createStubContext(
            { color: 'token:nonexistent' },
            { color: 'token:danger' },
            { danger: '#ff0000', primary: '#0000ff' },
            true,
        );
        const next = vi.fn().mockResolvedValue(context);

        await tokenStep(context, next);

        expect(context.errors).toHaveLength(1);
        expect(context.errors[0]?.code).toBe('ENS-2002');
    });

    it('skips props that were already stripped', async () => {
        const context = createStubContext(
            {}, // color prop not present
            { color: 'token:danger' },
            { danger: '#ff0000' },
        );
        const next = vi.fn().mockResolvedValue(context);

        await tokenStep(context, next);

        expect(context.errors).toHaveLength(0);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
