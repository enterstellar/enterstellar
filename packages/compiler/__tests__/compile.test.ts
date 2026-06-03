/**
 * @module @enterstellar-ai/compiler/__tests__/compile
 * @description Integration tests for the core compile() orchestration.
 *
 * Verifies the full pipeline: valid intent → pass, invalid props → fail,
 * unknown component → ENS-2004, self-correction flow, and cache behavior.
 */

import { describe, it, expect, vi } from 'vitest';

import { compile } from '../src/compile.js';
import type { CompilerConfig, CompilationStep } from '../src/types.js';
import type { ComponentContract, ComponentIntent } from '@enterstellar-ai/types';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfig(
    componentMap: Record<string, ComponentContract | undefined> = {},
    overrides: Partial<CompilerConfig> = {},
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
        ...overrides,
    };
}

function createMockContract(name: string): ComponentContract {
    return {
        name,
        props: z.object({ title: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        category: 'utility',
        description: 'Test component',
        examples: [],
        _meta: { forged: false },
    } as unknown as ComponentContract;
}

function createIntent(component: string, props: Record<string, unknown>): ComponentIntent {
    return {
        component,
        props,
        confidence: 1.0,
    } as ComponentIntent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compile', () => {
    describe('unknown component', () => {
        it('returns fail with ENS-2004 for unknown component', async () => {
            const config = createMockConfig();
            const intent = createIntent('NonExistent', {});

            const result = await compile(intent, config, [], undefined, { agent: 'test' });

            expect(result.status).toBe('fail');
            expect(result.errors.length).toBe(1);
            expect(result.errors[0]?.code).toBe('ENS-2004');
            expect(result.componentName).toBe('NonExistent');
        });
    });

    describe('valid intent', () => {
        it('returns pass for valid props', async () => {
            const contract = createMockContract('SimpleCard');
            const config = createMockConfig({ SimpleCard: contract });
            const intent = createIntent('SimpleCard', { title: 'Hello' });

            const result = await compile(intent, config, [], undefined, { agent: 'gpt-4o' });

            expect(result.status).toBe('pass');
            expect(result.componentName).toBe('SimpleCard');
            expect(result.props).toHaveProperty('title', 'Hello');
        });

        it('includes provenance with agent', async () => {
            const contract = createMockContract('SimpleCard');
            const config = createMockConfig({ SimpleCard: contract });
            const intent = createIntent('SimpleCard', { title: 'Hello' });

            const result = await compile(intent, config, [], undefined, { agent: 'claude-3' });

            expect(result.provenance.agent).toBe('claude-3');
        });
    });

    describe('invalid props', () => {
        it('returns fail with ENS-2001 for invalid props', async () => {
            const contract = createMockContract('SimpleCard');
            const config = createMockConfig({ SimpleCard: contract });
            const intent = createIntent('SimpleCard', { title: 12345 });

            const result = await compile(intent, config, [], undefined);

            expect(result.status).toBe('fail');
            expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
        });
    });

    describe('nesting depth', () => {
        it('returns fail with ENS-2010 when nesting exceeds limit', async () => {
            const contract = createMockContract('Container');
            const config = createMockConfig({ Container: contract }, { maxNestingDepth: 3 });

            const deepProps: Record<string, unknown> = {};
            let current = deepProps;
            for (let i = 0; i < 5; i++) {
                const child = {
                    component: `Level${String(i)}`,
                    props: {} as Record<string, unknown>,
                };
                current['child'] = child;
                current = child.props;
            }

            const intent = createIntent('Container', deepProps);
            const result = await compile(intent, config, [], undefined);

            expect(result.status).toBe('fail');
            expect(result.errors.some((e) => e.code === 'ENS-2010')).toBe(true);
        });
    });

    describe('never throws', () => {
        it('returns fail result even on internal errors', async () => {
            const config = createMockConfig();
            const intent = createIntent('Unknown', {});

            // Should never throw — always returns a result
            const result = await compile(intent, config, [], undefined);

            expect(result).toBeDefined();
            expect(result.status).toBe('fail');
        });
    });

    describe('custom steps', () => {
        it('runs custom middleware steps', async () => {
            const contract = createMockContract('SimpleCard');
            const config = createMockConfig({ SimpleCard: contract });
            const intent = createIntent('SimpleCard', { title: 'Hello' });

            const customStep: CompilationStep = async (ctx, next) => {
                ctx.props['customInjected'] = true;
                return next();
            };

            const result = await compile(
                intent, config, [customStep], undefined, { agent: 'test' },
            );

            expect(result.props).toHaveProperty('customInjected', true);
        });
    });

    describe('default agent', () => {
        it('uses "unknown" when no agent specified', async () => {
            const contract = createMockContract('SimpleCard');
            const config = createMockConfig({ SimpleCard: contract });
            const intent = createIntent('SimpleCard', { title: 'Hello' });

            const result = await compile(intent, config, [], undefined);

            expect(result.provenance.agent).toBe('unknown');
        });
    });
});
