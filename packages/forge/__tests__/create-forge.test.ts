/**
 * @module @enterstellar-ai/forge/__tests__/create-forge
 * @description Unit tests for `createComponentForge()` — the main factory.
 *
 * Verifies the full `ComponentForge` interface: `forge()` routing chain,
 * `registerTemplate()` delegation, `getStats()` tracking, and
 * `getTraceHistory()` Cold Path recording.
 *
 * Uses mock `EnterstellarCompiler` and `EnterstellarRegistry` instances injected via config.
 *
 * @see Design Choice R1 — factory pattern, plain object.
 * @see Design Choice F8 — routing chain.
 * @see Design Choice F9 — never hard-fail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ComponentIntent, CompilationResult } from '@enterstellar-ai/types';
import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

import { createComponentForge } from '../src/create-forge.js';

import type { ComponentForge, ForgeConfig, CloudForgeCallback } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `CompilationResult` that passes.
 */
function createPassResult(): CompilationResult {
    return {
        componentName: '__forged_test_00000000',
        props: {},
        status: 'pass',
        provenance: {
            agent: 'forge',
            registry: 'default',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: [],
        selfCorrectionAttempts: 0,
    };
}

/**
 * Creates a mock `CompilationResult` that fails.
 */
function createFailResult(): CompilationResult {
    return {
        ...createPassResult(),
        status: 'fail',
        errors: [{ code: 'ENS-2001', path: 'props', message: 'Schema failure' }],
    };
}

/**
 * Creates a mock `EnterstellarCompiler` that always passes compilation.
 */
function createMockCompiler(result?: CompilationResult): EnterstellarCompiler {
    return {
        compile: vi.fn().mockResolvedValue(result ?? createPassResult()),
        lint: vi.fn().mockResolvedValue([]),
        use: vi.fn(),
    } as unknown as EnterstellarCompiler;
}

/**
 * Creates a mock `EnterstellarRegistry`.
 */
function createMockRegistry(): EnterstellarRegistry {
    return {
        get: vi.fn(),
        list: vi.fn().mockReturnValue([]),
        register: vi.fn(),
        getManifest: vi.fn().mockReturnValue([]),
        getSchema: vi.fn(),
        validate: vi.fn(),
        publish: vi.fn(),
        on: vi.fn(),
        getDesignTokens: vi.fn().mockReturnValue({}),
    } as unknown as EnterstellarRegistry;
}

/**
 * Creates a minimal `ComponentIntent` for testing.
 */
function createIntent(overrides: Partial<ComponentIntent> = {}): ComponentIntent {
    return {
        component: 'PatientVitals',
        props: {},
        confidence: 0.5,
        ...overrides,
    };
}

/**
 * Creates a default `ForgeConfig`.
 */
function createConfig(overrides: Partial<ForgeConfig> = {}): ForgeConfig {
    return {
        routing: 'auto',
        constraints: {
            designTokens: {},
            componentPatterns: ['card', 'list', 'table', 'chart', 'form', 'detail', 'badge'],
            maxComplexity: 5,
            requiredStates: ['loading', 'error', 'empty', 'ready'],
            accessibility: 'WCAG-AA',
        },
        coldPath: { enabled: true, clusterThreshold: 5, autoPromote: false },
        compiler: createMockCompiler(),
        registry: createMockRegistry(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createComponentForge', () => {
    let forge: ComponentForge;
    let config: ForgeConfig;

    beforeEach(() => {
        config = createConfig();
        forge = createComponentForge(config);
    });

    // -----------------------------------------------------------------------
    // Factory shape (R1)
    // -----------------------------------------------------------------------

    describe('factory shape', () => {
        it('returns a frozen object', () => {
            expect(Object.isFrozen(forge)).toBe(true);
        });

        it('has forge, registerTemplate, getStats, getTraceHistory methods', () => {
            expect(typeof forge.forge).toBe('function');
            expect(typeof forge.registerTemplate).toBe('function');
            expect(typeof forge.getStats).toBe('function');
            expect(typeof forge.getTraceHistory).toBe('function');
        });
    });

    // -----------------------------------------------------------------------
    // forge() — routing: auto (F8)
    // -----------------------------------------------------------------------

    describe('forge() with routing: auto', () => {
        it('returns a ForgeResult on successful LocalForge match', async () => {
            const result = await forge.forge(createIntent());

            // LocalForge should match 'data-display' → 'card' template
            expect(result).toBeDefined();
            expect(result.forgeMode).toBe('local');
        });

        it('calls the compiler with the forged contract (L3)', async () => {
            await forge.forge(createIntent());

            const compileFn = config.compiler.compile as ReturnType<typeof vi.fn>;
            expect(compileFn).toHaveBeenCalledOnce();
        });

        it('returns success: true when compiler passes', async () => {
            const result = await forge.forge(createIntent());

            expect(result.success).toBe(true);
            expect(result.contract).not.toBeNull();
            expect(result.fallbackUsed).toBe(false);
        });

        it('returns fallback when compiler fails', async () => {
            const failCompiler = createMockCompiler(createFailResult());
            forge = createComponentForge(createConfig({ compiler: failCompiler }));

            const result = await forge.forge(createIntent());

            expect(result.success).toBe(false);
            expect(result.fallbackUsed).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // forge() — routing: local-only
    // -----------------------------------------------------------------------

    describe('forge() with routing: local-only', () => {
        it('never calls CloudForge even if LocalForge returns null', async () => {
            const cloudCallback: CloudForgeCallback = vi.fn();
            forge = createComponentForge(createConfig({
                routing: 'local-only',
                onCloudForge: cloudCallback,
            }));

            // Use a category that doesn't match any template
            await forge.forge(createIntent({ interaction: 'read-only' }));

            expect(cloudCallback).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // forge() — routing: cloud-only
    // -----------------------------------------------------------------------

    describe('forge() with routing: cloud-only', () => {
        it('returns fallback when onCloudForge is not provided', async () => {
            forge = createComponentForge(createConfig({ routing: 'cloud-only' }));

            const result = await forge.forge(createIntent());

            expect(result.success).toBe(false);
            expect(result.fallbackUsed).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // forge() — fallback safety (F9)
    // -----------------------------------------------------------------------

    describe('fallback safety (F9)', () => {
        it('never throws — always returns a ForgeResult', async () => {
            forge = createComponentForge(createConfig({
                routing: 'cloud-only',
                // No onCloudForge → guaranteed fallback
            }));

            await expect(forge.forge(createIntent())).resolves.toBeDefined();
        });

        it('fallback result has success: false and fallbackUsed: true', async () => {
            forge = createComponentForge(createConfig({ routing: 'cloud-only' }));

            const result = await forge.forge(createIntent());

            expect(result.success).toBe(false);
            expect(result.fallbackUsed).toBe(true);
            expect(result.contract).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // registerTemplate
    // -----------------------------------------------------------------------

    describe('registerTemplate', () => {
        it('delegates to internal template registry', () => {
            const template = {
                name: 'timeline',
                categories: ['custom:timeline'] as const,
                description: 'Custom timeline template.',
                slots: [{ name: 'title', type: 'string' as const, required: true, description: 'Title.' }],
                tokens: { background: 'token:surface' },
                states: { loading: 'L', error: 'E', empty: 'Em', ready: 'R' },
                accessibility: { role: 'region', ariaLabel: '{name} timeline', announceOnUpdate: false },
            };

            // Should not throw for a valid custom template
            expect(() => forge.registerTemplate('timeline', template)).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // getStats
    // -----------------------------------------------------------------------

    describe('getStats', () => {
        it('returns zeroed stats initially', () => {
            const stats = forge.getStats();

            expect(stats.totalForged).toBe(0);
            expect(stats.successCount).toBe(0);
            expect(stats.failureCount).toBe(0);
            expect(stats.localCount).toBe(0);
            expect(stats.cloudCount).toBe(0);
            expect(stats.topIntents).toEqual([]);
        });

        it('tracks totalForged across multiple invocations', async () => {
            await forge.forge(createIntent());
            await forge.forge(createIntent({ component: 'TreatmentPlan' }));

            const stats = forge.getStats();
            expect(stats.totalForged).toBe(2);
        });

        it('tracks success and failure counts', async () => {
            // 1st call: passes
            await forge.forge(createIntent());

            // 2nd call: fails (switch to failing compiler)
            const failCompiler = createMockCompiler(createFailResult());
            forge = createComponentForge(createConfig({ compiler: failCompiler }));
            await forge.forge(createIntent());

            const stats = forge.getStats();
            // Each forge instance has its own stats, so this tests
            // the 2nd instance's single failed call
            expect(stats.failureCount).toBe(1);
        });

        it('tracks topIntents by frequency', async () => {
            await forge.forge(createIntent({ component: 'PatientVitals' }));
            await forge.forge(createIntent({ component: 'PatientVitals' }));
            await forge.forge(createIntent({ component: 'TreatmentPlan' }));

            const stats = forge.getStats();
            expect(stats.topIntents.length).toBeGreaterThanOrEqual(1);
            expect(stats.topIntents[0]?.intent).toBe('patientvitals');
            expect(stats.topIntents[0]?.count).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // getTraceHistory (Cold Path, L12)
    // -----------------------------------------------------------------------

    describe('getTraceHistory', () => {
        it('returns empty array initially', () => {
            expect(forge.getTraceHistory()).toEqual([]);
        });

        it('records traces after forge invocations', async () => {
            await forge.forge(createIntent());

            const history = forge.getTraceHistory();
            expect(history.length).toBeGreaterThanOrEqual(1);
        });

        it('does not record traces when coldPath.enabled is false', async () => {
            forge = createComponentForge(createConfig({
                coldPath: { enabled: false, clusterThreshold: 5, autoPromote: false },
            }));

            await forge.forge(createIntent());

            expect(forge.getTraceHistory()).toEqual([]);
        });
    });
});
