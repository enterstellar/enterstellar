/**
 * @module @enterstellar-ai/test/__tests__/compile-raw
 * @description Unit tests for `harness.compileRaw()`.
 *
 * Verifies:
 * - Valid props produce pass result
 * - Invalid props produce fail result with errors
 * - Unknown component produces fail result (ENS-2004)
 * - CompilationResult shape (componentName, props, status, provenance, errors)
 * - No mock lookup required (direct compilation path)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createRegistry, defineComponent } from '@enterstellar-ai/registry';

import { createTestHarness } from '../src/create-test-harness.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTestComponent(name: string = 'AlertBanner') {
    return defineComponent({
        name,
        description: 'A test alert banner component.',
        category: 'feedback',
        tags: ['alert', 'notification'],
        props: z.object({
            severity: z.enum(['low', 'medium', 'high', 'critical']),
            message: z.string(),
            dismissible: z.boolean().optional(),
        }),
        tokens: { bgColor: 'token:danger' },
        accessibility: { role: 'alert', ariaLabel: 'Alert banner', announceOnUpdate: true },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [
            { intent: 'show alert', props: { severity: 'high', message: 'System failure' } },
        ],
    });
}

function createTestRegistry() {
    return createRegistry({ components: [createTestComponent()] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('harness.compileRaw()', () => {
    describe('valid compilation', () => {
        it('compiles valid props and returns pass status', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'high', message: 'Test alert' },
            });

            expect(result.status).toBe('pass');
            expect(result.componentName).toBe('AlertBanner');
            expect(result.errors).toHaveLength(0);
        });

        it('returns compiled props in the result', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'critical', message: 'Urgent!' },
            });

            expect(result.props).toBeDefined();
            expect(result.status).toBe('pass');
        });

        it('includes provenance metadata in the result', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'low', message: 'Info message' },
            });

            expect(result.provenance).toBeDefined();
            expect(result.provenance.agent).toBe('enterstellar-test-harness');
            expect(result.provenance.compiledAt).toBeTruthy();
            expect(result.provenance.compilerVersion).toBeTruthy();
        });

        it('includes optional props when provided', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'medium', message: 'Warning', dismissible: true },
            });

            expect(result.status).toBe('pass');
        });
    });

    describe('invalid compilation', () => {
        it('returns fail status for invalid prop types', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                // severity expects an enum, not a number
                props: { severity: 999, message: 'Bad type' },
            });

            expect(result.status).toBe('fail');
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('returns fail status for missing required props', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                // Missing both required props
                props: {},
            });

            expect(result.status).toBe('fail');
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('returns fail status for invalid enum value', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'invalid-level', message: 'Bad enum' },
            });

            expect(result.status).toBe('fail');
        });
    });

    describe('unknown component', () => {
        it('returns fail status with ENS-2004 for unknown component', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'NonExistentWidget',
                props: { foo: 'bar' },
            });

            expect(result.status).toBe('fail');
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]?.code).toBe('ENS-2004');
        });
    });

    describe('no mock required', () => {
        it('compiles without needing harness.mock() or autoMock()', async () => {
            const registry = createTestRegistry();
            // Create harness with NO mock responses — compileRaw doesn't need them
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'high', message: 'Direct compilation' },
            });

            expect(result.status).toBe('pass');
        });
    });

    describe('selfCorrectionAttempts', () => {
        it('reports zero self-correction attempts (reject strategy)', async () => {
            const registry = createTestRegistry();
            const harness = createTestHarness({ registry });

            const result = await harness.compileRaw({
                component: 'AlertBanner',
                props: { severity: 'high', message: 'No correction' },
            });

            expect(result.selfCorrectionAttempts).toBe(0);
        });
    });
});
