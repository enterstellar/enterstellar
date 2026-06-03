/**
 * @module @enterstellar-ai/compiler/__tests__/pipeline/create-pipeline
 * @description Unit tests for the pipeline middleware chain builder and executor.
 *
 * Verifies step execution order, context propagation, short-circuiting,
 * and the buildPipeline ordering guarantee (built-in → custom → trace).
 */

import { describe, it, expect, vi } from 'vitest';

import { executePipeline, buildPipeline } from '../../src/pipeline/create-pipeline.js';
import type { NamedStep } from '../../src/pipeline/types.js';
import type { CompilationContext } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal CompilationContext stub for testing.
 * Real tests of individual steps use full contexts; pipeline tests only
 * need the shape to be correct.
 */
function createStubContext(overrides: Partial<CompilationContext> = {}): CompilationContext {
    return {
        intent: { component: 'Test', props: {}, confidence: 1.0 } as CompilationContext['intent'],
        contract: { name: 'Test', props: {}, tokens: {}, accessibility: { role: '', ariaLabel: '', announceOnUpdate: false }, category: 'utility', description: '', _meta: { forged: false } } as unknown as CompilationContext['contract'],
        registry: { get: () => undefined, getDesignTokens: () => ({}) } as unknown as CompilationContext['registry'],
        config: {} as CompilationContext['config'],
        designTokens: {},
        agent: 'test',
        props: {},
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

describe('executePipeline', () => {
    it('executes steps in order', async () => {
        const order: string[] = [];

        const step1: NamedStep = {
            name: 'resolve',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => {
                order.push('step1');
                return next();
            },
        };

        const step2: NamedStep = {
            name: 'parse',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => {
                order.push('step2');
                return next();
            },
        };

        const step3: NamedStep = {
            name: 'trace',
            execute: async (ctx: CompilationContext) => {
                order.push('step3');
                return ctx;
            },
        };

        const context = createStubContext();
        await executePipeline([step1, step2, step3], context);

        expect(order).toEqual(['step1', 'step2', 'step3']);
    });

    it('short-circuits when a step does not call next()', async () => {
        const order: string[] = [];

        const step1: NamedStep = {
            name: 'resolve',
            execute: async (ctx: CompilationContext) => {
                order.push('step1');
                // Short-circuit: do not call next()
                return ctx;
            },
        };

        const step2: NamedStep = {
            name: 'parse',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => {
                order.push('step2');
                return next();
            },
        };

        const context = createStubContext();
        await executePipeline([step1, step2], context);

        expect(order).toEqual(['step1']);
    });

    it('propagates context mutations through the chain', async () => {
        const step1: NamedStep = {
            name: 'resolve',
            execute: async (ctx: CompilationContext, next: () => Promise<CompilationContext>) => {
                ctx.props['added'] = true;
                return next();
            },
        };

        const step2: NamedStep = {
            name: 'trace',
            execute: async (ctx: CompilationContext) => {
                return ctx;
            },
        };

        const context = createStubContext();
        const result = await executePipeline([step1, step2], context);

        expect(result.props['added']).toBe(true);
    });

    it('handles empty pipeline', async () => {
        const context = createStubContext();
        const result = await executePipeline([], context);
        expect(result).toBe(context);
    });

    it('supports custom step insertion via use() pattern', async () => {
        const order: string[] = [];

        const builtIn: NamedStep = {
            name: 'resolve',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => {
                order.push('built-in');
                return next();
            },
        };

        const custom: NamedStep = {
            name: 'custom',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => {
                order.push('custom');
                return next();
            },
        };

        const trace: NamedStep = {
            name: 'trace',
            execute: async (ctx: CompilationContext) => {
                order.push('trace');
                return ctx;
            },
        };

        const pipeline = buildPipeline([builtIn], [custom], trace);
        const context = createStubContext();
        await executePipeline(pipeline, context);

        expect(order).toEqual(['built-in', 'custom', 'trace']);
    });
});

describe('buildPipeline', () => {
    it('orders steps as built-in → custom → trace', () => {
        const builtIn: NamedStep = {
            name: 'resolve',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next(),
        };

        const custom: NamedStep = {
            name: 'custom',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next(),
        };

        const trace: NamedStep = {
            name: 'trace',
            execute: async (ctx: CompilationContext) => ctx,
        };

        const pipeline = buildPipeline([builtIn], [custom], trace);
        expect(pipeline).toHaveLength(3);
        expect(pipeline[0]?.name).toBe('resolve');
        expect(pipeline[1]?.name).toBe('custom');
        expect(pipeline[2]?.name).toBe('trace');
    });

    it('works with no custom steps', () => {
        const builtIn: NamedStep = {
            name: 'resolve',
            execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next(),
        };

        const trace: NamedStep = {
            name: 'trace',
            execute: async (ctx: CompilationContext) => ctx,
        };

        const pipeline = buildPipeline([builtIn], [], trace);
        expect(pipeline).toHaveLength(2);
        expect(pipeline[0]?.name).toBe('resolve');
        expect(pipeline[1]?.name).toBe('trace');
    });

    it('supports multiple built-in and custom steps', () => {
        const b1: NamedStep = { name: 'resolve', execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next() };
        const b2: NamedStep = { name: 'parse', execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next() };
        const c1: NamedStep = { name: 'custom', execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next() };
        const c2: NamedStep = { name: 'custom', execute: async (_ctx: CompilationContext, next: () => Promise<CompilationContext>) => next() };
        const trace: NamedStep = { name: 'trace', execute: async (ctx: CompilationContext) => ctx };

        const pipeline = buildPipeline([b1, b2], [c1, c2], trace);
        expect(pipeline).toHaveLength(5);
        expect(pipeline.map((s) => s.name)).toEqual(['resolve', 'parse', 'custom', 'custom', 'trace']);
    });
});
