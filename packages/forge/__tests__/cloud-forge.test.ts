/**
 * @module @enterstellar-ai/forge/__tests__/cloud-forge
 * @description Unit tests for CloudForge — LLM-powered contract generation.
 *
 * Verifies callback invocation, 3-layer guardrails (system prompt, Zod
 * validation, token allowlist), naming override, metadata injection,
 * and graceful null returns on all failure paths.
 *
 * @see Design Choice F5 — system prompt with constraints.
 * @see Design Choice F7 — 3-layer guardrails.
 * @see Design Choice F9 — never hard-fail.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createComponentId } from '@enterstellar-ai/types';

import type { ComponentContract, ComponentIntent } from '@enterstellar-ai/types';

import { forgeCloud } from '../src/cloud-forge.js';

import type { CloudForgeCallback, ForgeConstraints } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `ComponentIntent` for testing.
 */
function createIntent(overrides: Partial<ComponentIntent> = {}): ComponentIntent {
    return {
        component: 'PatientVitals',
        props: { patientId: '123' },
        confidence: 0.5,
        ...overrides,
    };
}

/**
 * Creates default `ForgeConstraints` for testing.
 */
function createConstraints(): ForgeConstraints {
    return {
        designTokens: {
            'colors-primary': '#000',
            'colors-danger': '#ff0000',
        },
        componentPatterns: ['card', 'list', 'table', 'chart', 'form', 'detail', 'badge'],
        maxComplexity: 5,
        requiredStates: ['loading', 'error', 'empty', 'ready'],
        accessibility: 'WCAG-AA',
    };
}

/**
 * Creates a valid `ComponentContract` that passes `ComponentContractSchema`.
 * All token values start with `token:` (R6).
 */
function createValidContract(overrides: Partial<ComponentContract> = {}): ComponentContract {
    return {
        name: 'CloudGenerated',
        id: createComponentId('CloudGenerated'),
        description: 'A cloud-generated component contract.',
        category: 'data-display',
        tags: ['cloud', 'generated'],
        props: z.object({ title: z.string() }),
        tokens: {
            background: 'token:surface',
            textColor: 'token:text-primary',
        },
        accessibility: {
            role: 'region',
            ariaLabel: 'Cloud generated component',
            announceOnUpdate: false,
        },
        states: {
            loading: 'Loading',
            error: 'Error',
            empty: 'Empty',
            ready: 'Ready',
        },
        examples: [
            { intent: 'show data', props: { title: 'hello' } },
        ],
        _meta: {
            forged: false,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
        },
        ...overrides,
    } as ComponentContract;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('forgeCloud', () => {
    const intent = createIntent();
    const constraints = createConstraints();

    // -----------------------------------------------------------------------
    // Successful generation
    // -----------------------------------------------------------------------

    describe('successful generation', () => {
        it('returns a ComponentContract on successful callback', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).not.toBeNull();
            expect(result?.name).toMatch(/^__forged_/);
        });

        it('invokes the callback with the intent and system prompt', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            await forgeCloud(intent, constraints, callback);

            expect(callback).toHaveBeenCalledOnce();
            const [receivedIntent, receivedPrompt] = (callback as ReturnType<typeof vi.fn>).mock.calls[0] as [ComponentIntent, string];
            expect(receivedIntent).toBe(intent);
            expect(typeof receivedPrompt).toBe('string');
            expect(receivedPrompt.length).toBeGreaterThan(0);
        });

        it('overrides name to __forged_ convention (F13)', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            const result = await forgeCloud(intent, constraints, callback);

            expect(result?.name).toMatch(/^__forged_[a-z0-9-]+_[0-9a-f]{8}$/);
        });

        it('sets _meta.forged to true', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            const result = await forgeCloud(intent, constraints, callback);

            expect(result?._meta?.forged).toBe(true);
        });

        it('returns a frozen contract', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).not.toBeNull();
            if (result !== null) {
                expect(Object.isFrozen(result)).toBe(true);
            }
        });
    });

    // -----------------------------------------------------------------------
    // System prompt (F5)
    // -----------------------------------------------------------------------

    describe('system prompt (F5)', () => {
        it('includes constraint information in the prompt', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            await forgeCloud(intent, constraints, callback);

            const prompt = ((callback as ReturnType<typeof vi.fn>).mock.calls[0] as [ComponentIntent, string])[1];
            expect(prompt).toContain('WCAG-AA');
            expect(prompt).toContain('5');
        });

        it('includes intent component name in the prompt', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            await forgeCloud(intent, constraints, callback);

            const prompt = ((callback as ReturnType<typeof vi.fn>).mock.calls[0] as [ComponentIntent, string])[1];
            expect(prompt).toContain('PatientVitals');
        });

        it('includes no-advertising rule (L13)', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(createValidContract());

            await forgeCloud(intent, constraints, callback);

            const prompt = ((callback as ReturnType<typeof vi.fn>).mock.calls[0] as [ComponentIntent, string])[1];
            expect(prompt.toLowerCase()).toContain('promotional');
        });
    });

    // -----------------------------------------------------------------------
    // Callback failure → null (F9)
    // -----------------------------------------------------------------------

    describe('callback failure handling (F9)', () => {
        it('returns null when callback throws', async () => {
            const callback: CloudForgeCallback = vi.fn().mockRejectedValue(new Error('Network error'));

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).toBeNull();
        });

        it('returns null when callback returns null', async () => {
            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(null);

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).toBeNull();
        });

        it('does NOT throw on callback failure', async () => {
            const callback: CloudForgeCallback = vi.fn().mockRejectedValue(new Error('Timeout'));

            await expect(
                forgeCloud(intent, constraints, callback),
            ).resolves.toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Zod validation — guardrail layer 2 (F7)
    // -----------------------------------------------------------------------

    describe('Zod validation guardrail (F7)', () => {
        it('returns null when callback returns invalid contract shape', async () => {
            const invalidContract = {
                name: 'Bad',
                // Missing required fields: id, description, category, tags, etc.
            } as unknown as ComponentContract;

            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(invalidContract);

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).toBeNull();
        });

        it('returns null when contract has empty name', async () => {
            const invalidContract = createValidContract({ name: '' });

            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(invalidContract);

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Token allowlist — guardrail layer 3 (F7)
    // -----------------------------------------------------------------------

    describe('token allowlist guardrail (F7)', () => {
        it('returns null when contract has raw CSS token values', async () => {
            const contractWithRawCSS = createValidContract({
                tokens: {
                    background: '#ff0000', // Raw CSS — rejected
                    textColor: 'token:text-primary',
                },
            });

            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(contractWithRawCSS);

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).toBeNull();
        });

        it('accepts contract with all token: prefixed values', async () => {
            const validContract = createValidContract({
                tokens: {
                    background: 'token:surface',
                    text: 'token:text-primary',
                    border: 'token:border',
                },
            });

            const callback: CloudForgeCallback = vi.fn().mockResolvedValue(validContract);

            const result = await forgeCloud(intent, constraints, callback);

            expect(result).not.toBeNull();
        });
    });
});
