/**
 * @module @enterstellar-ai/compiler/__tests__/pipeline/accessibility-step
 * @description Unit tests for the accessibility validation/injection step.
 *
 * Verifies auto-injection of role, aria-label, aria-live, the C10 tabindex
 * prohibition, and ENS-2003 errors when auto-injection is disabled.
 */

import { describe, it, expect, vi } from 'vitest';

import { accessibilityStep } from '../../src/pipeline/accessibility-step.js';
import type { CompilationContext } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubContext(
    props: Record<string, unknown>,
    contractAccessibility: { role: string; ariaLabel: string; announceOnUpdate: boolean },
    autoAccessibility: boolean = true,
    category: string = 'clinical',
): CompilationContext {
    return {
        intent: { component: 'PatientVitals', props, confidence: 1.0 } as CompilationContext['intent'],
        contract: {
            name: 'PatientVitals',
            props: {},
            tokens: {},
            accessibility: contractAccessibility,
            category,
            description: '',
            _meta: { forged: false },
        } as unknown as CompilationContext['contract'],
        registry: {} as CompilationContext['registry'],
        config: { autoAccessibility } as CompilationContext['config'],
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

describe('accessibilityStep', () => {
    describe('auto-injection enabled', () => {
        it('injects role when missing and contract specifies one', async () => {
            const context = createStubContext(
                {},
                { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: false },
                true,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(context.props['role']).toBe('region');
            expect(context.accessibilityInjections).toContain('role');
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('injects aria-label when missing', async () => {
            const context = createStubContext(
                {},
                { role: 'region', ariaLabel: 'Vitals display', announceOnUpdate: false },
                true,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(context.props['aria-label']).toBe('Vitals display');
            expect(context.accessibilityInjections).toContain('aria-label');
        });

        it('injects aria-live when announceOnUpdate is true', async () => {
            const context = createStubContext(
                {},
                { role: 'region', ariaLabel: 'Vitals', announceOnUpdate: true },
                true,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(context.props['aria-live']).toBe('polite');
            expect(context.accessibilityInjections).toContain('aria-live');
        });

        it('does NOT inject tabindex (C10 — hard constraint)', async () => {
            const context = createStubContext(
                {},
                { role: 'button', ariaLabel: 'Submit', announceOnUpdate: false },
                true,
                'action',
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(context.props).not.toHaveProperty('tabindex');
            expect(context.props).not.toHaveProperty('tabIndex');
        });

        it('preserves existing accessibility props — does not overwrite', async () => {
            const context = createStubContext(
                { role: 'alert', 'aria-label': 'Custom label' },
                { role: 'region', ariaLabel: 'Contract label', announceOnUpdate: false },
                true,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(context.props['role']).toBe('alert');
            expect(context.props['aria-label']).toBe('Custom label');
        });
    });

    describe('auto-injection disabled', () => {
        it('emits ENS-2003 for missing role', async () => {
            const context = createStubContext(
                {},
                { role: 'region', ariaLabel: 'Vitals', announceOnUpdate: false },
                false,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            const a11yErrors = context.errors.filter((e) => e.code === 'ENS-2003');
            expect(a11yErrors.length).toBeGreaterThanOrEqual(1);
        });

        it('passes when all accessibility attrs are already present', async () => {
            const context = createStubContext(
                { role: 'region', 'aria-label': 'Vitals', 'aria-live': 'polite' },
                { role: 'region', ariaLabel: 'Vitals', announceOnUpdate: true },
                false,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(context.errors).toHaveLength(0);
        });
    });

    describe('always calls next()', () => {
        it('does not short-circuit on missing accessibility', async () => {
            const context = createStubContext(
                {},
                { role: 'region', ariaLabel: 'Vitals', announceOnUpdate: false },
                false,
            );
            const next = vi.fn().mockResolvedValue(context);

            await accessibilityStep(context, next);

            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});
