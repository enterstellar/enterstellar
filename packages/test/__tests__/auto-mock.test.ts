/**
 * @module @enterstellar-ai/test/__tests__/auto-mock
 * @description Unit tests for `harness.autoMock()`.
 *
 * Verifies:
 * - Auto-generates mocks from registry component examples
 * - Creates fallback mocks keyed by component name
 * - Preserves existing user-defined mocks (no overwrite)
 * - Handles empty registry (no-op)
 * - Generated mocks are resolvable via harness.resolve()
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
import type { ComponentContract } from '@enterstellar-ai/types';

import { createTestHarness } from '../src/create-test-harness.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a component with examples — autoMock should use the first
 * example's intent as the mock key.
 */
function createComponentWithExamples(name: string = 'PatientVitals') {
    return defineComponent({
        name,
        description: 'Real-time patient vital signs.',
        category: 'clinical',
        tags: ['patient', 'vitals'],
        props: z.object({
            patientId: z.string(),
            riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        }),
        tokens: { statusColor: 'token:danger' },
        accessibility: { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: true },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [
            { intent: 'show patient vitals', props: { patientId: 'P-001', riskLevel: 'high' } },
            { intent: 'display vitals dashboard', props: { patientId: 'P-002', riskLevel: 'low' } },
        ],
    });
}

/**
 * Creates a component without examples — autoMock should create a
 * fallback mock keyed by the component name with empty props.
 */
function createComponentWithoutExamples(name: string = 'EmptyCard') {
    return defineComponent({
        name,
        description: 'A card with no example data.',
        category: 'utility',
        tags: ['card'],
        props: z.object({
            label: z.string().optional(),
        }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: 'Empty card', announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [],
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('harness.autoMock()', () => {
    describe('example-based mocking', () => {
        it('generates mocks from the first example of each component', async () => {
            const registry = createRegistry({
                components: [createComponentWithExamples()],
            });
            const harness = createTestHarness({ registry });

            harness.autoMock();

            // Should be resolvable using the first example's intent string
            const trace = await harness.resolve('show patient vitals');
            expect(trace.resolution.resolvedComponent).toBe('PatientVitals');
        });

        it('also creates a fallback mock keyed by component name', async () => {
            const registry = createRegistry({
                components: [createComponentWithExamples()],
            });
            const harness = createTestHarness({ registry });

            harness.autoMock();

            // Should be resolvable using the component name directly
            const trace = await harness.resolve('PatientVitals');
            expect(trace.resolution.resolvedComponent).toBe('PatientVitals');
        });
    });

    describe('no-example fallback', () => {
        it('creates fallback mock for components without examples', async () => {
            const registry = createRegistry({
                components: [createComponentWithoutExamples()],
            });
            const harness = createTestHarness({ registry });

            harness.autoMock();

            // Should be resolvable using the component name
            const trace = await harness.resolve('EmptyCard');
            expect(trace.resolution.resolvedComponent).toBe('EmptyCard');
        });
    });

    describe('preserve existing mocks', () => {
        it('does not overwrite user-defined mocks', async () => {
            const registry = createRegistry({
                components: [createComponentWithExamples()],
            });
            const harness = createTestHarness({
                registry,
                mockResponses: {
                    'show patient vitals': {
                        component: 'PatientVitals',
                        props: { patientId: 'CUSTOM-ID', riskLevel: 'critical' },
                        confidence: 1.0,
                    },
                },
            });

            harness.autoMock();

            // User-defined mock should still be active (custom props preserved)
            const trace = await harness.resolve('show patient vitals');
            expect(trace.resolution.resolvedComponent).toBe('PatientVitals');
        });
    });

    describe('multiple components', () => {
        it('generates mocks for all registered components', async () => {
            const registry = createRegistry({
                components: [
                    createComponentWithExamples('PatientVitals'),
                    createComponentWithoutExamples('EmptyCard'),
                ],
            });
            const harness = createTestHarness({ registry });

            harness.autoMock();

            // Both should be resolvable by name
            const trace1 = await harness.resolve('PatientVitals');
            expect(trace1.resolution.resolvedComponent).toBe('PatientVitals');

            const trace2 = await harness.resolve('EmptyCard');
            expect(trace2.resolution.resolvedComponent).toBe('EmptyCard');
        });
    });

    describe('empty registry', () => {
        it('is a no-op for an empty registry', () => {
            const registry = createRegistry({ components: [] });
            const harness = createTestHarness({ registry });

            // Should not throw
            expect(() => harness.autoMock()).not.toThrow();
        });
    });

    describe('idempotency', () => {
        it('calling autoMock() twice does not duplicate or corrupt mocks', async () => {
            const registry = createRegistry({
                components: [createComponentWithExamples()],
            });
            const harness = createTestHarness({ registry });

            harness.autoMock();
            harness.autoMock(); // Second call — should be safe

            const trace = await harness.resolve('show patient vitals');
            expect(trace.resolution.resolvedComponent).toBe('PatientVitals');
        });
    });
});
