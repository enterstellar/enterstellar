/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/validate-spec
 * @description Unit tests for `executeValidateSpec()`.
 *
 * Verifies the `enterstellar_validate_spec` MCP tool and its **L3 enforcement**:
 * - Compiler called for every zone (never bypassed).
 * - Multi-zone aggregation: ALL pass → pass, ANY fail → fail, some corrected → corrected.
 * - Empty spec → synthetic pass.
 * - Agent identifier `'agent-sdk'` passed to compiler (C12).
 *
 * Uses a mock `AgentSDKCompiler` injected as a parameter.
 *
 * @see Principle L3 — compiler never bypassed.
 * @see Design Choice C20 — no layout compilation at v1.
 * @see Design Choice C12 — agent parameter.
 */

import { describe, it, expect, vi } from 'vitest';

import type { CompilationResult } from '@enterstellar-ai/types';

import type { AgentSDKCompiler, UISpec } from '../../src/types.js';
import { executeValidateSpec } from '../../src/tools/validate-spec.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `CompilationResult` with the given status.
 */
function createResult(
    status: 'pass' | 'fail' | 'corrected',
    overrides: Partial<CompilationResult> = {},
): CompilationResult {
    return {
        componentName: 'TestComponent',
        props: {},
        status,
        provenance: {
            agent: 'agent-sdk',
            registry: 'default',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: status === 'fail'
            ? [{ code: 'ENS-2001', path: 'props', message: 'Validation failed' }]
            : [],
        selfCorrectionAttempts: status === 'corrected' ? 1 : 0,
        ...overrides,
    };
}

/**
 * Creates a mock `AgentSDKCompiler` that returns specific results per call.
 */
function createMockCompiler(results: CompilationResult[]): AgentSDKCompiler {
    const compileFn = vi.fn();

    for (const result of results) {
        compileFn.mockResolvedValueOnce(result);
    }

    return {
        compile: compileFn,
        lint: vi.fn().mockResolvedValue([]),
    };
}

/**
 * Creates a `UISpec` with the given zone count and component names.
 */
function createSpec(
    zones: Array<{ name: string; component: string }>,
): UISpec {
    return {
        zones: zones.map((z) => ({
            name: z.name,
            component: z.component,
            props: {},
            determinism: 0.5,
        })),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeValidateSpec', () => {
    // -----------------------------------------------------------------------
    // Single zone
    // -----------------------------------------------------------------------

    describe('single zone', () => {
        it('returns pass when the compiler passes', async () => {
            const compiler = createMockCompiler([createResult('pass')]);
            const spec = createSpec([{ name: 'main', component: 'PatientVitals' }]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('pass');
            expect(result.errors).toHaveLength(0);
        });

        it('returns fail when the compiler fails', async () => {
            const compiler = createMockCompiler([createResult('fail')]);
            const spec = createSpec([{ name: 'main', component: 'PatientVitals' }]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('fail');
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('returns corrected when the compiler self-corrects', async () => {
            const compiler = createMockCompiler([createResult('corrected')]);
            const spec = createSpec([{ name: 'main', component: 'PatientVitals' }]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('corrected');
            expect(result.selfCorrectionAttempts).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Empty spec
    // -----------------------------------------------------------------------

    describe('empty spec', () => {
        it('returns synthetic pass for empty zones array', async () => {
            const compiler = createMockCompiler([]);
            const spec: UISpec = { zones: [] };

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('pass');
            expect(result.errors).toHaveLength(0);
            expect(compiler.compile).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Multi-zone aggregation
    // -----------------------------------------------------------------------

    describe('multi-zone aggregation', () => {
        it('returns pass when all zones pass', async () => {
            const compiler = createMockCompiler([
                createResult('pass'),
                createResult('pass'),
                createResult('pass'),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
                { name: 'footer', component: 'C' },
            ]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('pass');
        });

        it('returns fail when any zone fails (even if others pass)', async () => {
            const compiler = createMockCompiler([
                createResult('pass'),
                createResult('fail'),
                createResult('pass'),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
                { name: 'footer', component: 'C' },
            ]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('fail');
        });

        it('returns corrected when some corrected and none failed', async () => {
            const compiler = createMockCompiler([
                createResult('pass'),
                createResult('corrected'),
                createResult('pass'),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
                { name: 'footer', component: 'C' },
            ]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('corrected');
        });

        it('returns fail over corrected (fail takes precedence)', async () => {
            const compiler = createMockCompiler([
                createResult('corrected'),
                createResult('fail'),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
            ]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.status).toBe('fail');
        });

        it('merges errors from all zones', async () => {
            const compiler = createMockCompiler([
                createResult('fail', {
                    errors: [{ code: 'ENS-2001', path: 'a', message: 'Error in A' }],
                }),
                createResult('fail', {
                    errors: [{ code: 'ENS-2002', path: 'b', message: 'Error in B' }],
                }),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
            ]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.errors).toHaveLength(2);
        });

        it('sums selfCorrectionAttempts across zones', async () => {
            const compiler = createMockCompiler([
                createResult('corrected', { selfCorrectionAttempts: 2 }),
                createResult('corrected', { selfCorrectionAttempts: 3 }),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
            ]);

            const result = await executeValidateSpec(compiler, spec);

            expect(result.selfCorrectionAttempts).toBe(5);
        });
    });

    // -----------------------------------------------------------------------
    // L3 enforcement — compiler called for every zone
    // -----------------------------------------------------------------------

    describe('L3 enforcement', () => {
        it('calls compiler.compile() once per zone', async () => {
            const compiler = createMockCompiler([
                createResult('pass'),
                createResult('pass'),
            ]);
            const spec = createSpec([
                { name: 'main', component: 'A' },
                { name: 'sidebar', component: 'B' },
            ]);

            await executeValidateSpec(compiler, spec);

            expect(compiler.compile).toHaveBeenCalledTimes(2);
        });

        it('passes agent identifier to compiler options (C12)', async () => {
            const compiler = createMockCompiler([createResult('pass')]);
            const spec = createSpec([{ name: 'main', component: 'PatientVitals' }]);

            await executeValidateSpec(compiler, spec);

            expect(compiler.compile).toHaveBeenCalledWith(
                expect.objectContaining({ component: 'PatientVitals' }),
                expect.objectContaining({ agent: 'agent-sdk' }),
            );
        });

        it('constructs correct intent from zone spec', async () => {
            const compiler = createMockCompiler([createResult('pass')]);
            const spec: UISpec = {
                zones: [{
                    name: 'main',
                    component: 'PatientVitals',
                    props: { patientId: '123' },
                    determinism: 0.5,
                }],
            };

            await executeValidateSpec(compiler, spec);

            expect(compiler.compile).toHaveBeenCalledWith(
                {
                    component: 'PatientVitals',
                    props: { patientId: '123' },
                    confidence: 1.0,
                },
                { agent: 'agent-sdk' },
            );
        });
    });
});
