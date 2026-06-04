/**
 * @module @enterstellar-ai/test/create-test-harness
 * @description Factory function for creating the Enterstellar test harness.
 *
 * `createTestHarness()` wires together:
 * - A real `EnterstellarCompiler` (from `@enterstellar-ai/compiler`) with `strategy: 'reject'`
 *   so tests see raw validation results without self-correction.
 * - A mutable `Map<string, ComponentIntent>` for mock responses.
 * - The `resolve()` and `compileRaw()` pipeline methods.
 * - Framework-agnostic assertion helpers.
 *
 * The returned `EnterstellarTestHarness` is frozen (no mutation of the public API).
 *
 * @see Implementation Bible §4.5 — `createTestHarness()` specification.
 * @see Design Choice TE1 — mocks for unit tests.
 * @see Design Choice TE2 — inline mock, JSON fixtures, auto-generated modes.
 */

import { createCompiler } from '@enterstellar-ai/compiler';
import type { ComponentIntent } from '@enterstellar-ai/types';

import {
    componentToBe,
    confidenceAbove,
    compilationToPass,
    tokenCompliant,
    latencyBelow,
    accessibilityToPass,
} from './assertions.js';
import { compileRaw } from './harness-compile-raw.js';
import { resolve } from './harness-resolve.js';
import { autoMock } from './harness-auto-mock.js';
import type { EnterstellarTestHarness, TestHarnessConfig } from './types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarTestHarness` for deterministic intent-based testing.
 *
 * The harness uses the real `@enterstellar-ai/compiler` for validation but replaces
 * intent resolution with deterministic mock responses. This means:
 * - Zod schema validation runs against real contracts
 * - Design token enforcement is real
 * - Accessibility auditing is real
 * - Only the "which component to render" step is mocked
 *
 * The compiler is configured with `strategy: 'reject'` — validation failures
 * surface immediately as `status: 'fail'` without self-correction retries.
 * This makes test results deterministic and fast.
 *
 * @param config - Harness configuration (registry + optional mock responses).
 * @returns A frozen `EnterstellarTestHarness` instance.
 *
 * @example
 * ```ts
 * import { createTestHarness } from '@enterstellar-ai/test';
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 *
 * const registry = createRegistry({ components: [PatientVitals] });
 * const harness = createTestHarness({ registry });
 *
 * harness.mock('show patient vitals', {
 *   component: 'PatientVitals',
 *   props: { patientId: 'P-001', displayMode: 'compact' },
 * });
 *
 * const trace = await harness.resolve('show patient vitals');
 * harness.expect.compilationToPass(trace.compilation); // uses AgentTrace
 * ```
 *
 * @see Design Choice TE1 — mocks for unit tests.
 * @see Design Choice TE2 — inline, JSON fixture, and auto-generated modes.
 */
export function createTestHarness(config: TestHarnessConfig): EnterstellarTestHarness {
    // -----------------------------------------------------------------------
    // Create the real compiler with 'reject' strategy (no self-correction).
    // This ensures test results reflect raw validation outcomes without
    // LLM retry loops clouding the failure signal.
    // -----------------------------------------------------------------------
    const compiler = createCompiler({
        registry: config.registry,
        onValidationFailure: {
            strategy: 'reject',
            maxRetries: 0,
            // Compiler validates this is non-empty even for 'reject' strategy.
            // Sentinel value — never used since strategy is 'reject'.
            fallbackComponent: '__test-harness-reject__',
        },
        strictDesignTokens: true,
        autoAccessibility: true,
        includeDiff: true,
        // Disable deterministic self-correction (Tier 1 + Tier 2) so that
        // validation failures surface immediately as `status: 'fail'` with
        // raw Zod errors — the harness's core invariant (SC-08).
        // Without this, Tier 2 template correction can fill missing fields
        // from contract examples, silently masking failures the test is
        // designed to surface.
        selfCorrection: { deterministic: false },
    });

    // -----------------------------------------------------------------------
    // Build the mutable mock response map.
    // Initial entries come from config.mockResponses (if provided).
    // Additional entries are added via harness.mock() and harness.autoMock().
    // -----------------------------------------------------------------------
    const mockResponses = new Map<string, ComponentIntent>();

    // Populate initial mocks from config (if provided)
    if (config.mockResponses !== undefined) {
        for (const [intent, response] of Object.entries(config.mockResponses)) {
            mockResponses.set(intent, response);
        }
    }

    // -----------------------------------------------------------------------
    // Wire the public API
    // -----------------------------------------------------------------------
    const harness: EnterstellarTestHarness = {
        resolve(intent, options) {
            return resolve(intent, mockResponses, compiler, options);
        },

        compileRaw(raw) {
            return compileRaw(raw, compiler);
        },

        mock(intent: string, response: ComponentIntent): void {
            mockResponses.set(intent, response);
        },

        autoMock(): void {
            autoMock(config.registry, mockResponses);
        },

        expect: {
            componentToBe,
            confidenceAbove,
            compilationToPass,
            tokenCompliant,
            latencyBelow,
            accessibilityToPass,
        },
    };

    // Freeze the public API — no mutation of the harness shape.
    // (The internal mockResponses Map is still mutable via mock()/autoMock().)
    return Object.freeze(harness);
}
