/**
 * @module @enterstellar-ai/test
 * @description Intent-based testing framework for Enterstellar GenUI.
 *
 * Provides a deterministic test harness that exercises the real Enterstellar compiler
 * pipeline with mock intent responses. Use it to verify:
 *
 * - Component resolution correctness
 * - Zod schema validation
 * - Design token compliance
 * - Accessibility attribute enforcement
 * - Pipeline latency budgets
 *
 * ## Quick Start
 *
 * ```ts
 * import { createTestHarness } from '@enterstellar-ai/test';
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 *
 * const registry = createRegistry({ components: [PatientVitals] });
 * const harness = createTestHarness({ registry });
 *
 * harness.mock('show vitals', {
 *   component: 'PatientVitals',
 *   props: { patientId: 'P-001' },
 *   confidence: 1.0,
 * });
 *
 * const trace = await harness.resolve('show vitals');
 * harness.expect.componentToBe(trace, 'PatientVitals');
 * harness.expect.compilationToPass(trace.compilation); // compile result
 * ```
 *
 * @see Implementation Bible §4.5
 * @see Design Choices TE1–TE7
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export { createTestHarness } from './create-test-harness.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    EnterstellarTestHarness,
    TestHarnessConfig,
    ResolveOptions,
    CompileRawInput,
    TestAssertions,
    IntentCoverageResult,
    TestResultRecord,
    RegressionEntry,
    FixtureEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Assertion Helpers (framework-agnostic)
// ---------------------------------------------------------------------------
export {
    componentToBe,
    confidenceAbove,
    compilationToPass,
    tokenCompliant,
    latencyBelow,
    accessibilityToPass,
} from './assertions.js';

// ---------------------------------------------------------------------------
// Vitest Matchers (TE4)
// ---------------------------------------------------------------------------
export { enterstellarMatchers } from './vitest-matchers.js';

// ---------------------------------------------------------------------------
// VCR Fixture Utilities (TE1)
// ---------------------------------------------------------------------------
export { saveFixtures, loadFixtures, listFixtureFiles } from './fixtures.js';

// ---------------------------------------------------------------------------
// Coverage Analysis (TE5)
// ---------------------------------------------------------------------------
export { computeIntentCoverage } from './coverage.js';

// ---------------------------------------------------------------------------
// Regression Detection (TE7)
// ---------------------------------------------------------------------------
export { detectRegressions } from './regression.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { TEST_VERSION } from './version.js';
