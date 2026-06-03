/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/forge-component
 * @description Unit tests for `executeForgeComponent()`.
 *
 * Verifies the `enterstellar_forge_component` MCP tool:
 * - Forge dependency validation (missing → ENS-8002).
 * - Delegation to `ComponentForge.forge()`.
 * - Intent construction from natural-language string.
 * - Constraint passthrough as props.
 * - Unexpected forge errors wrapped in ENS-8002.
 *
 * Uses a mock `AgentSDKForge` injected as a parameter.
 *
 * @see Design Choice F9 — never hard-fail.
 * @see Error ENS-8002 — forge failures.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { ForgeResult, ComponentContract, CompilationResult } from '@enterstellar-ai/types';

import type { AgentSDKForge } from '../../src/types.js';
import { executeForgeComponent } from '../../src/tools/forge-component.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `ForgeResult` for successful forge operations.
 */
function createForgeResult(overrides: Partial<ForgeResult> = {}): ForgeResult {
    return {
        success: true,
        contract: {
            name: '__forged_test_a1b2c3d4',
            category: 'data-display',
            description: 'Forged test component',
            tags: ['forged'],
            props: {},
            examples: [],
            tokens: {},
            states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'Ready' },
            accessibility: { role: 'region', ariaLabel: 'Forged', announceOnUpdate: false },
            id: '__forged_test_a1b2c3d4',
            _meta: { forged: true, version: '0.0.0', createdAt: new Date().toISOString() },
        } as unknown as ComponentContract,
        compilationResult: {
            componentName: '__forged_test_a1b2c3d4',
            props: {},
            status: 'pass',
            provenance: {
                agent: 'agent-sdk',
                registry: 'default',
                compiledAt: new Date().toISOString(),
                compilerVersion: '0.0.0',
            },
            errors: [],
            selfCorrectionAttempts: 0,
        } as CompilationResult,
        fallbackUsed: false,
        forgeMode: 'local',
        ...overrides,
    };
}

/**
 * Creates a mock `AgentSDKForge` that returns a specified result.
 */
function createMockForge(result: ForgeResult): AgentSDKForge {
    return {
        forge: vi.fn().mockResolvedValue(result),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeForgeComponent', () => {
    // -----------------------------------------------------------------------
    // Dependency validation
    // -----------------------------------------------------------------------

    describe('dependency validation', () => {
        it('throws ENS-8002 when forge is undefined', async () => {
            try {
                await executeForgeComponent(undefined, 'patient timeline');
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8002');
                expect(enterstellarError.module).toBe('agent-sdk');
                expect(enterstellarError.recoverable).toBe(true);
                expect(enterstellarError.message).toContain('ComponentForge');
                expect(enterstellarError.message).toContain('not configured');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Successful forge
    // -----------------------------------------------------------------------

    describe('successful forge', () => {
        it('returns ForgeResult from the forge', async () => {
            const expectedResult = createForgeResult();
            const forge = createMockForge(expectedResult);

            const result = await executeForgeComponent(forge, 'patient timeline');

            expect(result).toEqual(expectedResult);
            expect(result.success).toBe(true);
        });

        it('delegates to forge.forge() with correct intent', async () => {
            const forge = createMockForge(createForgeResult());

            await executeForgeComponent(forge, 'patient timeline');

            expect(forge.forge).toHaveBeenCalledOnce();
            expect(forge.forge).toHaveBeenCalledWith({
                component: 'patient timeline',
                props: {},
                confidence: 0.5,
            });
        });
    });

    // -----------------------------------------------------------------------
    // Constraint passthrough
    // -----------------------------------------------------------------------

    describe('constraint passthrough', () => {
        it('passes constraints as props on the intent', async () => {
            const forge = createMockForge(createForgeResult());
            const constraints = { maxFields: 5, layout: 'compact' };

            await executeForgeComponent(forge, 'patient timeline', constraints);

            expect(forge.forge).toHaveBeenCalledWith({
                component: 'patient timeline',
                props: constraints,
                confidence: 0.5,
            });
        });

        it('uses empty props when no constraints provided', async () => {
            const forge = createMockForge(createForgeResult());

            await executeForgeComponent(forge, 'patient timeline');

            expect(forge.forge).toHaveBeenCalledWith(
                expect.objectContaining({ props: {} }),
            );
        });
    });

    // -----------------------------------------------------------------------
    // Error wrapping (F9 violation safety net)
    // -----------------------------------------------------------------------

    describe('unexpected forge errors', () => {
        it('wraps unexpected forge throws in ENS-8002', async () => {
            const forge: AgentSDKForge = {
                forge: vi.fn().mockRejectedValue(new Error('Unexpected forge crash')),
            };

            try {
                await executeForgeComponent(forge, 'patient timeline');
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8002');
                expect(enterstellarError.recoverable).toBe(true);
                expect(enterstellarError.message).toContain('patient timeline');
                expect(enterstellarError.message).toContain('Unexpected forge crash');
            }
        });
    });
});
