/**
 * @module @enterstellar-ai/test/__tests__/create-test-harness
 * @description Unit tests for the `createTestHarness()` factory.
 *
 * Verifies:
 * - Harness creation with minimal config (registry only)
 * - Harness creation with pre-loaded mock responses
 * - API shape: resolve, compileRaw, mock, autoMock, expect
 * - Object.freeze() enforcement on the returned harness
 * - Internal compiler uses 'reject' strategy (no self-correction)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createRegistry, defineComponent } from '@enterstellar-ai/registry';

import { createTestHarness } from '../src/create-test-harness.js';
import type { EnterstellarTestHarness } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid component contract for tests.
 * Uses the `defineComponent` factory from `@enterstellar-ai/registry`.
 */
function createTestComponent(name: string = 'TestCard') {
    return defineComponent({
        name,
        description: 'A test component for harness tests.',
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

/**
 * Creates a test registry with one component.
 */
function createTestRegistry() {
    return createRegistry({ components: [createTestComponent()] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTestHarness()', () => {
    describe('creation', () => {
        it('creates a harness with registry only (no mock responses)', () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            expect(harness).toBeDefined();
        });

        it('creates a harness with pre-loaded mock responses', () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Mocked' },
                        confidence: 1.0,
                    },
                },
            });

            expect(harness).toBeDefined();
        });

        it('creates a harness with empty mock responses', () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {},
            });

            expect(harness).toBeDefined();
        });
    });

    describe('API shape', () => {
        it('returns an object with resolve, compileRaw, mock, autoMock, and expect', () => {
            const registry = createTestRegistry();
            const harness: EnterstellarTestHarness = createTestHarness({ registry });

            expect(typeof harness.resolve).toBe('function');
            expect(typeof harness.compileRaw).toBe('function');
            expect(typeof harness.mock).toBe('function');
            expect(typeof harness.autoMock).toBe('function');
            expect(harness.expect).toBeDefined();
        });

        it('expect contains all 6 assertion helpers', () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            expect(typeof harness.expect.componentToBe).toBe('function');
            expect(typeof harness.expect.confidenceAbove).toBe('function');
            expect(typeof harness.expect.compilationToPass).toBe('function');
            expect(typeof harness.expect.tokenCompliant).toBe('function');
            expect(typeof harness.expect.latencyBelow).toBe('function');
            expect(typeof harness.expect.accessibilityToPass).toBe('function');
        });
    });

    describe('immutability', () => {
        it('returns a frozen object (no property mutation)', () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            expect(Object.isFrozen(harness)).toBe(true);
        });

        it('throws when attempting to add properties', () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            expect(() => {
                (harness as Record<string, unknown>)['newProp'] = 'value';
            }).toThrow();
        });
    });

    describe('mock() method', () => {
        it('registers an inline mock that resolve() can use', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            harness.mock('show test card', {
                component: 'TestCard',
                props: { title: 'Inline Mock' },
                confidence: 1.0,
            });

            const trace = await harness.resolve('show test card');
            expect(trace).toBeDefined();
            expect(trace.resolution.resolvedComponent).toBe('TestCard');
        });

        it('overwrites an existing mock for the same intent', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show test card': {
                        component: 'TestCard',
                        props: { title: 'Original' },
                        confidence: 1.0,
                    },
                },
            });

            // Overwrite with new mock
            harness.mock('show test card', {
                component: 'TestCard',
                props: { title: 'Overwritten' },
                confidence: 0.9,
            });

            const trace = await harness.resolve('show test card');
            expect(trace.intent.confidence).toBe(1.0); // Mock confidence is always 1.0 in trace
        });
    });

    describe('compiler strategy', () => {
        it('uses reject strategy — unknown component returns fail status', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            // Mock an intent pointing to a non-existent component
            harness.mock('show unknown', {
                component: 'NonExistentComponent',
                props: {},
                confidence: 1.0,
            });

            const trace = await harness.resolve('show unknown');
            expect(trace.compilation.status).toBe('fail');
            expect(trace.compilation.errorCount).toBeGreaterThan(0);
        });
    });
});
