/**
 * @module @enterstellar-ai/forge/__tests__/integration/forge-pipeline
 * @description Integration tests for the full forge pipeline.
 *
 * Exercises the complete flow: intent → routing → LocalForge/CloudForge →
 * compiler verification → ForgeResult → Cold Path recording.
 *
 * These tests use mock compiler and registry instances but exercise the
 * real LocalForge/CloudForge/ColdPath subsystems (no internal mocking).
 *
 * @see Design Choice F8 — routing chain.
 * @see Design Choice F9 — fallback chain.
 * @see Principle L3 — compiler never bypassed.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createComponentId } from '@enterstellar-ai/types';

import type { ComponentContract, ComponentIntent, CompilationResult } from '@enterstellar-ai/types';
import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

import { createComponentForge } from '../../src/create-forge.js';

import type { CloudForgeCallback, ForgeConfig } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

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

function createFailResult(): CompilationResult {
    return {
        ...createPassResult(),
        status: 'fail',
        errors: [{ code: 'ENS-2001', path: 'props', message: 'Validation failure' }],
    };
}

function createMockCompiler(result?: CompilationResult): EnterstellarCompiler {
    return {
        compile: vi.fn().mockResolvedValue(result ?? createPassResult()),
        lint: vi.fn().mockResolvedValue([]),
        use: vi.fn(),
    } as unknown as EnterstellarCompiler;
}

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

function createCloudContract(): ComponentContract {
    return {
        name: 'CloudGenerated',
        id: createComponentId('CloudGenerated'),
        description: 'A cloud-generated component.',
        category: 'data-display',
        tags: ['cloud'],
        props: z.object({ title: z.string() }),
        tokens: { background: 'token:surface' },
        accessibility: { role: 'region', ariaLabel: 'Cloud component', announceOnUpdate: false },
        states: { loading: 'L', error: 'E', empty: 'Em', ready: 'R' },
        examples: [{ intent: 'show data', props: { title: 'test' } }],
        _meta: { forged: false, version: '1.0.0', createdAt: new Date().toISOString() },
    } as ComponentContract;
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Forge Pipeline Integration', () => {
    // -----------------------------------------------------------------------
    // Happy path: LocalForge → compiler pass → success
    // -----------------------------------------------------------------------

    describe('full happy path (auto routing)', () => {
        it('generates a valid ForgeResult via LocalForge', async () => {
            const forge = createComponentForge(createConfig());
            const intent: ComponentIntent = { component: 'PatientCard', props: {}, confidence: 0.5 };

            const result = await forge.forge(intent);

            expect(result.success).toBe(true);
            expect(result.contract).not.toBeNull();
            expect(result.forgeMode).toBe('local');
            expect(result.fallbackUsed).toBe(false);
            expect(result.compilationResult).not.toBeNull();
        });

        it('forged contract has __forged_ prefix', async () => {
            const forge = createComponentForge(createConfig());

            const result = await forge.forge({
                component: 'ShowTreatmentPlan',
                props: { patientId: '123' },
                confidence: 0.5,
            });

            expect(result.contract?.name).toMatch(/^__forged_/);
        });

        it('forged contract has _meta.forged = true', async () => {
            const forge = createComponentForge(createConfig());

            const result = await forge.forge({ component: 'PatientVitals', props: {}, confidence: 0.5 });

            expect(result.contract?._meta?.forged).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Fallback path: no match → no cloud → fallback
    // -----------------------------------------------------------------------

    describe('full fallback path', () => {
        it('returns fallback when no template matches and no CloudForge', async () => {
            const forge = createComponentForge(createConfig({
                constraints: {
                    designTokens: {},
                    componentPatterns: [], // No patterns allowed → LocalForge returns null
                    maxComplexity: 5,
                    requiredStates: ['loading', 'error', 'empty', 'ready'],
                    accessibility: 'WCAG-AA',
                },
            }));

            const result = await forge.forge({ component: 'UnknownWidget', props: {}, confidence: 0.5 });

            expect(result.success).toBe(false);
            expect(result.fallbackUsed).toBe(true);
            expect(result.contract).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // CloudForge fallback: LocalForge null → CloudForge succeeds
    // -----------------------------------------------------------------------

    describe('CloudForge fallback chain', () => {
        it('escalates to CloudForge when LocalForge returns null', async () => {
            const cloudCallback: CloudForgeCallback = vi.fn().mockResolvedValue(createCloudContract());

            const forge = createComponentForge(createConfig({
                routing: 'cloud-only',
                onCloudForge: cloudCallback,
            }));

            const result = await forge.forge({ component: 'NovelWidget', props: {}, confidence: 0.5 });

            expect(cloudCallback).toHaveBeenCalled();
            // Result depends on ComponentContractSchema validation of the cloud contract
        });
    });

    // -----------------------------------------------------------------------
    // Compiler rejection path
    // -----------------------------------------------------------------------

    describe('compiler rejection', () => {
        it('returns fallback when compiler rejects forged contract', async () => {
            const failCompiler = createMockCompiler(createFailResult());
            const forge = createComponentForge(createConfig({ compiler: failCompiler }));

            const result = await forge.forge({ component: 'PatientVitals', props: {}, confidence: 0.5 });

            expect(result.success).toBe(false);
            expect(result.fallbackUsed).toBe(true);
        });

        it('compiler is always called — never bypassed (L3)', async () => {
            const compiler = createMockCompiler();
            const forge = createComponentForge(createConfig({ compiler }));

            await forge.forge({ component: 'PatientVitals', props: {}, confidence: 0.5 });

            expect(compiler.compile).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // Cold Path recording
    // -----------------------------------------------------------------------

    describe('Cold Path recording', () => {
        it('records trace after successful forge', async () => {
            const forge = createComponentForge(createConfig());

            await forge.forge({ component: 'PatientVitals', props: {}, confidence: 0.5 });

            const history = forge.getTraceHistory();
            expect(history.length).toBe(1);
            expect(history[0]?.success).toBe(true);
            expect(history[0]?.forgeMode).toBe('local');
        });

        it('records trace after failed forge', async () => {
            const failCompiler = createMockCompiler(createFailResult());
            const forge = createComponentForge(createConfig({ compiler: failCompiler }));

            await forge.forge({ component: 'PatientVitals', props: {}, confidence: 0.5 });

            const history = forge.getTraceHistory();
            expect(history.length).toBe(1);
            expect(history[0]?.success).toBe(false);
        });

        it('accumulates traces across multiple invocations', async () => {
            const forge = createComponentForge(createConfig());

            await forge.forge({ component: 'PatientVitals', props: {}, confidence: 0.5 });
            await forge.forge({ component: 'TreatmentPlan', props: {}, confidence: 0.5 });
            await forge.forge({ component: 'LabResults', props: {}, confidence: 0.5 });

            const history = forge.getTraceHistory();
            expect(history.length).toBe(3);
        });
    });

    // -----------------------------------------------------------------------
    // Stats tracking across pipeline
    // -----------------------------------------------------------------------

    describe('stats tracking', () => {
        it('tracks success and failure across multiple calls', async () => {
            const passCompiler = createMockCompiler(createPassResult());
            const forge = createComponentForge(createConfig({ compiler: passCompiler }));

            await forge.forge({ component: 'Widget1', props: {}, confidence: 0.5 });
            await forge.forge({ component: 'Widget2', props: {}, confidence: 0.5 });

            const stats = forge.getStats();
            expect(stats.totalForged).toBe(2);
            expect(stats.successCount).toBe(2);
            expect(stats.localCount).toBe(2);
        });
    });
});
