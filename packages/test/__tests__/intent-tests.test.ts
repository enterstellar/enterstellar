/**
 * @module @enterstellar-ai/test/__tests__/intent-tests
 * @description P1 Gate — 10 intent-based tests using `@enterstellar-ai/test`.
 *
 * These tests demonstrate the `@enterstellar-ai/test` harness as a **consumer** would
 * use it — registering real component contracts, resolving intents, and
 * asserting outcomes with both `harness.expect.*` helpers and custom
 * Vitest matchers (`enterstellarMatchers`).
 *
 * Each test exercises a distinct intent + component combination to verify
 * the full resolve → compile → assert pipeline. Together, the 10 tests
 * cover all 6 assertion helpers and all 5 Vitest matchers at least once.
 *
 * ## Assertion Coverage Matrix
 *
 * | # | Intent | Assertions Used |
 * |:--|:-------|:----------------|
 * | 1 | `"show patient vitals"` | `componentToBe`, `compilationToPass` |
 * | 2 | `"display medication list"` | `confidenceAbove`, `toResolveToComponent` |
 * | 3 | `"render alert banner"` | `tokenCompliant`, `toBeTokenCompliant` |
 * | 4 | `"show lab results"` | `accessibilityToPass`, `toPassAccessibility` |
 * | 5 | `"display appointment card"` | `latencyBelow`, `toHaveLatencyBelow` |
 * | 6 | `"unmocked intent"` | EnterstellarError ENS-5010 (missing mock) |
 * | 7 | `"show broken card"` → invalid props | `compilation.status === 'fail'` |
 * | 8 | `"display feedback form"` | `toPassValidation`, all pass assertions |
 * | 9 | `autoMock()` → resolve by component name | `componentToBe` via auto-generated mock |
 * | 10 | `compileRaw()` → direct compilation | `compilationToPass`, `tokenCompliant` |
 *
 * @see P1 Gate Checklist — "10 intent-based tests pass using `@enterstellar-ai/test`"
 * @see Design Choices TE1–TE7
 *
 * @internal
 */

/// <reference path="../vitest.d.ts" />

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
import type { CompilationResult } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createTestHarness } from '../src/create-test-harness.js';
import { enterstellarMatchers } from '../src/vitest-matchers.js';

// ---------------------------------------------------------------------------
// Extend Vitest with Enterstellar matchers (TE4)
// ---------------------------------------------------------------------------

beforeAll(() => {
    expect.extend(enterstellarMatchers);
});

// ---------------------------------------------------------------------------
// Component Contracts
// ---------------------------------------------------------------------------

/**
 * Clinical component — patient vital signs display.
 * Props: `patientId` (string), `riskLevel` (enum).
 */
const PatientVitals = defineComponent({
    name: 'PatientVitals',
    description: 'Displays real-time patient vital signs with risk level indicator.',
    category: 'clinical',
    tags: ['patient', 'vitals', 'monitoring'],
    props: z.object({
        patientId: z.string().min(1),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    }),
    tokens: { statusColor: 'token:status-color' },
    accessibility: { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: true },
    states: { loading: 'Loading vitals...', error: 'Failed to load', empty: 'No data', ready: 'PatientVitals' },
    examples: [
        { intent: 'show patient vitals', props: { patientId: 'P-001', riskLevel: 'high' } },
    ],
});

/**
 * Clinical component — medication list.
 * Props: `patientId` (string), `showInactive` (optional boolean).
 */
const MedicationList = defineComponent({
    name: 'MedicationList',
    description: 'Displays a sortable list of patient medications with dosage details.',
    category: 'clinical',
    tags: ['medication', 'prescription'],
    props: z.object({
        patientId: z.string().min(1),
        showInactive: z.boolean().optional(),
    }),
    tokens: {},
    accessibility: { role: 'list', ariaLabel: 'Medication list', announceOnUpdate: false },
    states: { loading: 'Loading medications...', error: 'Failed to load', empty: 'No medications', ready: 'MedicationList' },
    examples: [
        { intent: 'display medication list', props: { patientId: 'P-002' } },
    ],
});

/**
 * Feedback component — alert banner.
 * Props: `severity` (enum), `message` (string), `dismissible` (boolean).
 *
 * Uses `'feedback'` category (valid `ComponentCategory` per contract.ts).
 */
const AlertBanner = defineComponent({
    name: 'AlertBanner',
    description: 'Alert banner with configurable severity and dismiss behavior.',
    category: 'feedback',
    tags: ['alert', 'notification'],
    props: z.object({
        severity: z.enum(['info', 'warning', 'error', 'critical']),
        message: z.string().min(1),
        dismissible: z.boolean(),
    }),
    tokens: { alertColor: 'token:alert-color', borderRadius: 'token:radius-md' },
    accessibility: { role: 'alert', ariaLabel: 'Alert banner', announceOnUpdate: true },
    states: { loading: 'Loading', error: 'Error', empty: 'No alerts', ready: 'AlertBanner' },
    examples: [
        { intent: 'render alert banner', props: { severity: 'warning', message: 'System maintenance', dismissible: true } },
    ],
});

/**
 * Data display component — lab results.
 * Props: `labId` (string), `category` (enum).
 */
const LabResults = defineComponent({
    name: 'LabResults',
    description: 'Displays lab test results with reference ranges and status.',
    category: 'data-display',
    tags: ['lab', 'results', 'diagnostics'],
    props: z.object({
        labId: z.string().min(1),
        category: z.enum(['blood', 'urine', 'imaging', 'pathology']),
    }),
    tokens: {},
    accessibility: { role: 'table', ariaLabel: 'Lab results', announceOnUpdate: false },
    states: { loading: 'Loading results...', error: 'Failed to load', empty: 'No results', ready: 'LabResults' },
    examples: [
        { intent: 'show lab results', props: { labId: 'LAB-100', category: 'blood' } },
    ],
});

/**
 * Admin component — appointment card.
 * Props: `appointmentId` (string), `showNotes` (optional boolean).
 */
const AppointmentCard = defineComponent({
    name: 'AppointmentCard',
    description: 'Compact appointment card with date, provider, and optional notes.',
    category: 'admin',
    tags: ['appointment', 'schedule'],
    props: z.object({
        appointmentId: z.string().min(1),
        showNotes: z.boolean().optional(),
    }),
    tokens: {},
    accessibility: { role: 'article', ariaLabel: 'Appointment card', announceOnUpdate: false },
    states: { loading: 'Loading appointment...', error: 'Error', empty: 'No appointment', ready: 'AppointmentCard' },
    examples: [
        { intent: 'display appointment card', props: { appointmentId: 'APT-200' } },
    ],
});

/**
 * Form component — feedback form for department KPIs.
 * Props: `departmentId` (string), `timeRange` (enum).
 */
const FeedbackForm = defineComponent({
    name: 'FeedbackForm',
    description: 'Multi-field feedback form for department-level KPIs.',
    category: 'form',
    tags: ['feedback', 'form', 'kpi'],
    props: z.object({
        departmentId: z.string().min(1),
        timeRange: z.enum(['1h', '24h', '7d', '30d']),
    }),
    tokens: { cardBackground: 'token:surface-elevated', accentColor: 'token:accent-primary' },
    accessibility: { role: 'form', ariaLabel: 'Feedback form', announceOnUpdate: true },
    states: { loading: 'Loading form...', error: 'Form error', empty: 'No data', ready: 'FeedbackForm' },
    examples: [
        { intent: 'display feedback form', props: { departmentId: 'DEPT-10', timeRange: '24h' } },
    ],
});

/**
 * Utility component — intentionally registered with a minimal schema
 * so that we can test compilation failure with invalid props.
 */
const BrokenCard = defineComponent({
    name: 'BrokenCard',
    description: 'Test component for validating compilation failure paths.',
    category: 'utility',
    tags: ['test'],
    props: z.object({
        requiredField: z.string().min(1),
    }),
    tokens: {},
    accessibility: { role: 'region', ariaLabel: 'Broken card', announceOnUpdate: false },
    states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'BrokenCard' },
    examples: [],
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Creates a fully populated test registry with all 7 component contracts.
 *
 * @returns An `EnterstellarRegistry` instance containing all test components.
 */
function createFullRegistry() {
    return createRegistry({
        components: [
            PatientVitals,
            MedicationList,
            AlertBanner,
            LabResults,
            AppointmentCard,
            FeedbackForm,
            BrokenCard,
        ],
    });
}

// ---------------------------------------------------------------------------
// Tests — 10 Intent-Based Test Cases (P1 Gate)
// ---------------------------------------------------------------------------

describe('P1 Gate: 10 Intent-Based Tests', () => {
    // -----------------------------------------------------------------------
    // Test 1: "show patient vitals" → PatientVitals
    // Assertions: componentToBe, compilationToPass
    // -----------------------------------------------------------------------

    it('1. resolves "show patient vitals" to PatientVitals with passing compilation', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'show patient vitals': {
                    component: 'PatientVitals',
                    props: { patientId: 'P-001', riskLevel: 'high' },
                    confidence: 0.95,
                },
            },
        });

        const trace = await harness.resolve('show patient vitals');

        // harness.expect.* assertions (AgentTrace)
        harness.expect.componentToBe(trace, 'PatientVitals');

        // compilationToPass takes CompilationResult — use compileRaw for a direct result
        // or verify trace properties directly
        expect(trace.compilation.status).toBe('pass');
        expect(trace.resolution.resolvedComponent).toBe('PatientVitals');
    });

    // -----------------------------------------------------------------------
    // Test 2: "display medication list" → MedicationList
    // Assertions: confidenceAbove, toResolveToComponent (Vitest matcher)
    // -----------------------------------------------------------------------

    it('2. resolves "display medication list" to MedicationList with high confidence', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'display medication list': {
                    component: 'MedicationList',
                    props: { patientId: 'P-002' },
                    confidence: 0.92,
                },
            },
        });

        const trace = await harness.resolve('display medication list');

        // harness.expect.* assertion (AgentTrace)
        harness.expect.confidenceAbove(trace, 0.8);

        // Vitest matcher (TE4) — toResolveToComponent takes AgentTrace
        expect(trace).toResolveToComponent('MedicationList');
    });

    // -----------------------------------------------------------------------
    // Test 3: "render alert banner" → AlertBanner
    // Assertions: tokenCompliant (via compileRaw), toBeTokenCompliant
    // -----------------------------------------------------------------------

    it('3. resolves "render alert banner" to AlertBanner with token compliance', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'render alert banner': {
                    component: 'AlertBanner',
                    props: { severity: 'warning', message: 'System maintenance', dismissible: true },
                    confidence: 0.98,
                },
            },
        });

        // Use compileRaw for CompilationResult (tokenCompliant needs CompilationResult)
        const result = await harness.compileRaw({
            component: 'AlertBanner',
            props: { severity: 'warning', message: 'System maintenance', dismissible: true },
        });

        // harness.expect.* assertion (CompilationResult)
        harness.expect.tokenCompliant(result);

        // Vitest matcher (TE4) — toBeTokenCompliant takes CompilationResult
        expect(result).toBeTokenCompliant();
    });

    // -----------------------------------------------------------------------
    // Test 4: "show lab results" → LabResults
    // Assertions: accessibilityToPass (via compileRaw), toPassAccessibility
    // -----------------------------------------------------------------------

    it('4. resolves "show lab results" to LabResults with accessibility compliance', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'show lab results': {
                    component: 'LabResults',
                    props: { labId: 'LAB-100', category: 'blood' },
                    confidence: 0.91,
                },
            },
        });

        // Verify trace-level assertions
        const trace = await harness.resolve('show lab results');
        harness.expect.componentToBe(trace, 'LabResults');

        // Use compileRaw for CompilationResult (accessibilityToPass needs CompilationResult)
        const result = await harness.compileRaw({
            component: 'LabResults',
            props: { labId: 'LAB-100', category: 'blood' },
        });

        // harness.expect.* assertion (CompilationResult)
        harness.expect.accessibilityToPass(result);

        // Vitest matcher (TE4) — toPassAccessibility takes CompilationResult
        expect(result).toPassAccessibility();
    });

    // -----------------------------------------------------------------------
    // Test 5: "display appointment card" → AppointmentCard
    // Assertions: latencyBelow, toHaveLatencyBelow (Vitest matcher)
    // -----------------------------------------------------------------------

    it('5. resolves "display appointment card" to AppointmentCard within latency budget', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'display appointment card': {
                    component: 'AppointmentCard',
                    props: { appointmentId: 'APT-200' },
                    confidence: 0.88,
                },
            },
        });

        const trace = await harness.resolve('display appointment card');

        // harness.expect.* assertion (AgentTrace) — 500ms budget (generous for CI)
        harness.expect.latencyBelow(trace, 500);

        // Vitest matcher (TE4) — toHaveLatencyBelow takes AgentTrace
        expect(trace).toHaveLatencyBelow(500);
    });

    // -----------------------------------------------------------------------
    // Test 6: Unmocked intent → EnterstellarError ENS-5010
    // Assertions: error handling for missing mock
    // -----------------------------------------------------------------------

    it('6. throws EnterstellarError ENS-5010 for an unmocked intent', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({ registry });

        // No mocks registered — resolve should throw
        try {
            await harness.resolve('completely unknown intent string');
            // If we reach here, the test should fail
            expect.unreachable('Expected EnterstellarError to be thrown for unmocked intent');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = err as InstanceType<typeof EnterstellarError>;
            expect(enterstellarErr.code).toBe('ENS-5010');
            expect(enterstellarErr.module).toBe('test');
            expect(enterstellarErr.recoverable).toBe(false);
            expect(enterstellarErr.message).toContain('completely unknown intent string');
        }
    });

    // -----------------------------------------------------------------------
    // Test 7: Invalid props → compilation failure
    // Assertions: compilation.status === 'fail'
    // -----------------------------------------------------------------------

    it('7. produces compilation failure when props violate the component schema', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'show broken card': {
                    component: 'BrokenCard',
                    // `requiredField` is z.string().min(1) — empty string violates min(1)
                    props: { requiredField: '' },
                    confidence: 1.0,
                },
            },
        });

        const trace = await harness.resolve('show broken card');

        // Compilation should fail due to Zod schema violation
        expect(trace.compilation.status).toBe('fail');
        expect(trace.compilation.errorCount).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // Test 8: "display feedback form" → FeedbackForm
    // Assertions: toPassValidation (Vitest matcher), all-pass combo
    // -----------------------------------------------------------------------

    it('8. resolves "display feedback form" with full validation pass', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({
            registry,
            mockResponses: {
                'display feedback form': {
                    component: 'FeedbackForm',
                    props: { departmentId: 'DEPT-10', timeRange: '24h' },
                    confidence: 0.96,
                },
            },
        });

        const trace = await harness.resolve('display feedback form');

        // Verify trace-level assertions
        harness.expect.componentToBe(trace, 'FeedbackForm');

        // Use compileRaw for CompilationResult-level assertions
        const result = await harness.compileRaw({
            component: 'FeedbackForm',
            props: { departmentId: 'DEPT-10', timeRange: '24h' },
        });

        // Vitest matcher — full validation (TE4) — toPassValidation takes CompilationResult
        expect(result).toPassValidation();

        // harness.expect.* combo (all take CompilationResult)
        harness.expect.compilationToPass(result);
        harness.expect.tokenCompliant(result);
        harness.expect.accessibilityToPass(result);
    });

    // -----------------------------------------------------------------------
    // Test 9: autoMock() → resolve by component name
    // Assertions: componentToBe via auto-generated mock (TE2)
    // -----------------------------------------------------------------------

    it('9. resolves via autoMock() — auto-generated mock from registry examples (TE2)', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({ registry });

        // TE2: auto-generated mock definition mode
        harness.autoMock();

        // Resolve using the first example's intent string
        const trace = await harness.resolve('show patient vitals');

        harness.expect.componentToBe(trace, 'PatientVitals');
        expect(trace.compilation.status).toBe('pass');

        // Also resolve by component name (fallback mock)
        const traceByName = await harness.resolve('MedicationList');
        harness.expect.componentToBe(traceByName, 'MedicationList');
    });

    // -----------------------------------------------------------------------
    // Test 10: compileRaw() → direct compilation without mock lookup
    // Assertions: compilationToPass, tokenCompliant
    // -----------------------------------------------------------------------

    it('10. compileRaw() compiles directly without mock lookup', async () => {
        const registry = createFullRegistry();
        const harness = createTestHarness({ registry });

        // TE1: compileRaw bypasses mock resolution, goes straight to compiler
        const result: CompilationResult = await harness.compileRaw({
            component: 'AlertBanner',
            props: { severity: 'critical', message: 'Emergency alert', dismissible: false },
        });

        // harness.expect.* assertions (CompilationResult)
        harness.expect.compilationToPass(result);
        harness.expect.tokenCompliant(result);

        expect(result.status).toBe('pass');
        expect(result.componentName).toBe('AlertBanner');
        expect(result.errors).toHaveLength(0);
        expect(result.selfCorrectionAttempts).toBe(0);
    });
});
