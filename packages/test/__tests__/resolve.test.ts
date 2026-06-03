/**
 * @module @enterstellar-ai/test/__tests__/resolve
 * @description Unit tests for `harness.resolve()`.
 *
 * Verifies:
 * - Successful resolution with mock response
 * - Real compilation through the pipeline (L3)
 * - Synthetic AgentTrace shape and field values
 * - Timing metrics (totalMs, resolutionMs, compilationMs)
 * - Error on unmocked intent (ENS-5010)
 * - Context forwarding via options
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createTestHarness } from '../src/create-test-harness.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTestComponent(name: string = 'TestCard') {
    return defineComponent({
        name,
        description: 'A test component for resolve tests.',
        category: 'utility',
        tags: ['test'],
        props: z.object({
            title: z.string(),
            count: z.number().optional(),
        }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: 'Test card', announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [
            { intent: `show ${name.toLowerCase()}`, props: { title: 'Hello' } },
        ],
    });
}

function createTestRegistry() {
    return createRegistry({ components: [createTestComponent()] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('harness.resolve()', () => {
    describe('successful resolution', () => {
        it('resolves a mocked intent and returns an AgentTrace', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Resolved' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace).toBeDefined();
            expect(trace.id).toBeTruthy();
            expect(trace.timestamp).toBeTruthy();
        });

        it('trace.resolution.resolvedComponent matches the compiled component', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Resolved' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.resolution.resolvedComponent).toBe('TestCard');
            expect(trace.resolution.strategy).toBe('exact');
            expect(trace.resolution.candidatesConsidered).toBe(1);
        });

        it('trace.intent captures the raw intent string and component', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Hello' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.intent.raw).toBe('show test card');
            expect(trace.intent.component).toBe('TestCard');
            expect(trace.intent.confidence).toBe(1.0);
        });

        it('trace.compilation reflects real compiler validation', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Valid' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.compilation.status).toBe('pass');
            expect(trace.compilation.errorCount).toBe(0);
            expect(trace.compilation.tokensValidated).toBe(true);
        });
    });

    describe('timing metrics', () => {
        it('trace.metrics contains non-negative timing values', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Timed' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.metrics.totalMs).toBeGreaterThanOrEqual(0);
            expect(trace.metrics.resolutionMs).toBeGreaterThanOrEqual(0);
            expect(trace.metrics.compilationMs).toBeGreaterThanOrEqual(0);
            expect(trace.metrics.renderMs).toBe(0); // No rendering in harness
        });
    });

    describe('unmocked intent', () => {
        it('throws EnterstellarError with code ENS-5010 for unmocked intent', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            await expect(
                harness.resolve('unmocked intent string'),
            ).rejects.toThrow(EnterstellarError);

            try {
                await harness.resolve('unmocked intent string');
            } catch (error: unknown) {
                expect((error as EnterstellarError).code).toBe('ENS-5010');
            }
        });

        it('error message includes the unmocked intent string', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            try {
                await harness.resolve('my custom intent');
                expect.fail('Expected EnterstellarError to be thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarErr = error as EnterstellarError;
                expect(enterstellarErr.message).toContain('my custom intent');
                expect(enterstellarErr.module).toBe('test');
                expect(enterstellarErr.recoverable).toBe(false);
            }
        });
    });

    describe('context forwarding', () => {
        it('trace includes correlationId when context is provided', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Contextualized' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card', {
                context: { sessionId: 'abc-123' },
            });

            expect(trace.correlationId).toBeDefined();
            expect(trace.correlationId).toContain('test-');
        });

        it('trace omits correlationId when context is not provided', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'No Context' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.correlationId).toBeUndefined();
        });
    });

    describe('compilation failure', () => {
        it('trace reflects fail status for invalid props', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        // Missing required 'title' prop — triggers Zod validation failure
                        props: { invalidProp: 42 },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.compilation.status).toBe('fail');
            expect(trace.compilation.errorCount).toBeGreaterThan(0);
        });
    });

    describe('determinism', () => {
        it('trace.determinism uses test defaults', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Deterministic' },
                        confidence: 1.0,
                    },
                },
            });

            const trace = await harness.resolve('show test card');

            expect(trace.determinism.level).toBe(1.0);
            expect(trace.determinism.cacheHit).toBe(false);
            expect(trace.determinism.zone).toBe('test-zone');
        });
    });
});
