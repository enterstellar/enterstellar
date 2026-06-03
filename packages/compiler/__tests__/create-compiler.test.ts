/**
 * @module @enterstellar-ai/compiler/__tests__/create-compiler
 * @description Integration tests for the `createCompiler` factory.
 *
 * Verifies config resolution, default application, nesting depth validation,
 * and the overall API shape of the returned `EnterstellarCompiler` instance.
 */

import { describe, it, expect } from 'vitest';

import { createCompiler } from '../src/create-compiler.js';
import type { EnterstellarCompiler } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock registry for testing.
 * The registry provides get(), getDesignTokens(), and on() methods.
 */
function createMockRegistry() {
    return {
        get: (_name: string) => undefined,
        getDesignTokens: () => ({}),
        on: (_event: string, _handler: () => void) => {
            return () => { /* unsubscribe */ };
        },
    } as unknown as Parameters<typeof createCompiler>[0]['registry'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCompiler', () => {
    describe('config resolution', () => {
        it('creates a compiler with only registry (all defaults)', () => {
            const registry = createMockRegistry();
            const compiler = createCompiler({ registry });
            expect(compiler).toBeDefined();
            expect(typeof compiler.compile).toBe('function');
            expect(typeof compiler.lint).toBe('function');
            expect(typeof compiler.use).toBe('function');
        });

        it('creates a compiler with custom config', () => {
            const registry = createMockRegistry();
            const compiler = createCompiler({
                registry,
                strictDesignTokens: false,
                autoAccessibility: false,
                maxNestingDepth: 5,
                includeDiff: false,
                onValidationFailure: {
                    strategy: 'reject',
                    maxRetries: 0,
                    fallbackComponent: 'ErrorCard',
                },
            });
            expect(compiler).toBeDefined();
        });
    });

    describe('config validation', () => {
        it('throws on maxNestingDepth below 3', () => {
            const registry = createMockRegistry();
            expect(() =>
                createCompiler({ registry, maxNestingDepth: 2 }),
            ).toThrow();
        });

        it('throws on maxNestingDepth above 20', () => {
            const registry = createMockRegistry();
            expect(() =>
                createCompiler({ registry, maxNestingDepth: 21 }),
            ).toThrow();
        });

        it('throws on empty fallbackComponent', () => {
            const registry = createMockRegistry();
            expect(() =>
                createCompiler({
                    registry,
                    onValidationFailure: {
                        strategy: 'fallback',
                        maxRetries: 2,
                        fallbackComponent: '',
                    },
                }),
            ).toThrow();
        });

        it('accepts maxNestingDepth at boundary values (3 and 20)', () => {
            const registry = createMockRegistry();
            expect(() =>
                createCompiler({ registry, maxNestingDepth: 3 }),
            ).not.toThrow();
            expect(() =>
                createCompiler({ registry, maxNestingDepth: 20 }),
            ).not.toThrow();
        });
    });

    describe('EnterstellarCompiler API shape', () => {
        it('returns an object with compile, lint, and use methods', () => {
            const registry = createMockRegistry();
            const compiler: EnterstellarCompiler = createCompiler({ registry });

            expect(typeof compiler.compile).toBe('function');
            expect(typeof compiler.lint).toBe('function');
            expect(typeof compiler.use).toBe('function');
        });
    });

    describe('compile — unknown component', () => {
        it('returns fail result for unknown component', async () => {
            const registry = createMockRegistry();
            const compiler = createCompiler({ registry });

            const result = await compiler.compile(
                {
                    component: 'NonExistent',
                    props: {},
                    confidence: 1.0,
                    _source: {},
                } as Parameters<EnterstellarCompiler['compile']>[0],
                { agent: 'test-agent' },
            );

            expect(result.status).toBe('fail');
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]?.code).toBe('ENS-2004');
        });
    });

    describe('lint — unknown component', () => {
        it('returns ENS-2004 error for unknown component', async () => {
            const registry = createMockRegistry();
            const compiler = createCompiler({ registry });

            const { errors } = await compiler.lint({
                component: 'NonExistent',
                props: {},
                confidence: 1.0,
                _source: {},
            } as Parameters<EnterstellarCompiler['lint']>[0]);

            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.code).toBe('ENS-2004');
        });
    });

    describe('use — custom middleware', () => {
        it('accepts custom steps without error', () => {
            const registry = createMockRegistry();
            const compiler = createCompiler({ registry });

            expect(() => {
                compiler.use(async (ctx, next) => next());
            }).not.toThrow();
        });
    });
});
