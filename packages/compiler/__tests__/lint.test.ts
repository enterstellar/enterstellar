/**
 * @module @enterstellar-ai/compiler/__tests__/lint
 * @description Unit tests for the lint mode — validate without CompilationResult.
 *
 * Verifies lint returns only errors, same validation logic as compile,
 * no self-correction, and no provenance/trace emission.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { lint } from '../src/lint.js';
import type { CompilerConfig, CompilationStep } from '../src/types.js';
import type { ComponentContract, ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfig(
    componentMap: Record<string, ComponentContract | undefined> = {},
): CompilerConfig {
    return {
        registry: {
            get: vi.fn((name: string) => componentMap[name]),
            getDesignTokens: () => ({}),
            on: vi.fn(() => () => { }),
        } as unknown as CompilerConfig['registry'],
        strictDesignTokens: true,
        autoAccessibility: true,
        maxNestingDepth: 10,
        includeDiff: true,
        onValidationFailure: {
            strategy: 'reject',
            maxRetries: 0,
            fallbackComponent: 'GenericCard',
        },
    };
}

function createMockContract(name: string): ComponentContract {
    return {
        name,
        props: z.object({ title: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: '', announceOnUpdate: false },
        category: 'utility',
        description: 'Test',
        _meta: { forged: false },
    } as unknown as ComponentContract;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lint', () => {
    it('returns ENS-2004 for unknown component', async () => {
        const config = createMockConfig();
        const intent: ComponentIntent = {
            component: 'NonExistent',
            props: {},
            confidence: 1.0,
        } as ComponentIntent;

        const { errors } = await lint(intent, config, []);

        expect(errors.length).toBe(1);
        expect(errors[0]?.code).toBe('ENS-2004');
    });

    it('returns empty array for valid intent', async () => {
        const contract = createMockContract('SimpleCard');
        const config = createMockConfig({ SimpleCard: contract });
        const intent: ComponentIntent = {
            component: 'SimpleCard',
            props: { title: 'Hello' },
            confidence: 1.0,
        } as ComponentIntent;

        const { errors } = await lint(intent, config, []);

        expect(errors).toHaveLength(0);
    });

    it('returns schema errors for invalid props', async () => {
        const contract = createMockContract('SimpleCard');
        const config = createMockConfig({ SimpleCard: contract });
        const intent: ComponentIntent = {
            component: 'SimpleCard',
            props: { title: 12345 }, // wrong type
            confidence: 1.0,
        } as ComponentIntent;

        const { errors } = await lint(intent, config, []);

        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('runs custom steps', async () => {
        const contract = createMockContract('SimpleCard');
        const config = createMockConfig({ SimpleCard: contract });
        const intent: ComponentIntent = {
            component: 'SimpleCard',
            props: { title: 'Hello' },
            confidence: 1.0,
        } as ComponentIntent;

        const customStep: CompilationStep = async (ctx, next) => {
            ctx.errors.push({
                code: 'CUSTOM-001',
                path: 'custom',
                message: 'Custom validation failed',
            });
            return next();
        };

        const { errors } = await lint(intent, config, [customStep]);

        expect(errors.some((e) => e.code === 'CUSTOM-001')).toBe(true);
    });

    it('validates nesting depth', async () => {
        const contract = createMockContract('Container');
        const config = createMockConfig({ Container: contract });
        const deepProps: Record<string, unknown> = {};
        let current = deepProps;
        for (let i = 0; i < 15; i++) {
            const child = { component: `Level${String(i)}`, props: {} as Record<string, unknown> };
            current['child'] = child;
            current = child.props;
        }

        const intent: ComponentIntent = {
            component: 'Container',
            props: deepProps,
            confidence: 1.0,
        } as ComponentIntent;

        const configWithLowDepth = { ...config, maxNestingDepth: 5 };
        const { errors } = await lint(intent, configWithLowDepth, []);

        expect(errors.some((e) => e.code === 'ENS-2010')).toBe(true);
    });
});
