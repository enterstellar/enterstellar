/**
 * @module @enterstellar-ai/test/types
 * @description Module-local type definitions for `@enterstellar-ai/test`.
 *
 * This file declares the `EnterstellarTestHarness` interface (the public API surface),
 * `TestHarnessConfig` (factory configuration), assertion types, and supporting
 * data shapes for coverage analysis, regression detection, and VCR fixtures.
 *
 * Naming convention per Design Choice T1 (Option C):
 * - Interfaces for objects with methods (`EnterstellarTestHarness`).
 * - Types for data shapes (`TestHarnessConfig`, `IntentCoverageResult`).
 *
 * All fields are `readonly` — test types are data, not mutable state.
 *
 * @see Implementation Bible §4.5
 * @see Design Choices TE1–TE7
 */

import type { EnterstellarRegistry } from '@enterstellar-ai/registry';
import type {
    AgentTrace,
    CompilationResult,
    ComponentIntent,
} from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Factory Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for `createTestHarness()`.
 *
 * @see Design Choice TE1 — mocks for unit tests, VCR fixtures for integration.
 * @see Design Choice TE2 — inline mock, JSON fixture, and auto-generated modes.
 */
export type TestHarnessConfig = {
    /**
     * The registry to resolve and compile against.
     * The harness creates a real `EnterstellarCompiler` internally using this registry.
     */
    readonly registry: EnterstellarRegistry;

    /**
     * Deterministic mock responses for `resolve()`.
     *
     * Key: the intent string (exact match).
     * Value: the `ComponentIntent` to use as the resolved output.
     *
     * When `resolve(intent)` is called, the harness looks up this map.
     * If the intent is not found, an `EnterstellarError` with code `ENS-5010` is thrown.
     *
     * @see Design Choice TE1 — mocks for unit tests.
     */
    readonly mockResponses?: Readonly<Record<string, ComponentIntent>>;
};

// ---------------------------------------------------------------------------
// Resolve Options
// ---------------------------------------------------------------------------

/**
 * Optional configuration for a single `resolve()` call.
 */
export type ResolveOptions = {
    /**
     * Optional context passed alongside the intent.
     * Available in the resulting `AgentTrace` for inspection.
     */
    readonly context?: Readonly<Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// CompileRaw Input
// ---------------------------------------------------------------------------

/**
 * Input shape for `compileRaw()` — a raw component reference with props.
 *
 * This bypasses mock/intent resolution and compiles the JSON directly
 * against the registry's contract for the named component.
 */
export type CompileRawInput = {
    /** PascalCase component name (must exist in the registry). */
    readonly component: string;

    /** Props to validate against the contract's Zod schema. */
    readonly props: Readonly<Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// Assertion Helpers
// ---------------------------------------------------------------------------

/**
 * Framework-agnostic assertion helpers.
 *
 * Each method checks a condition and throws `EnterstellarError` (module: `@enterstellar-ai/test`)
 * on failure. Returns `void` on success. These are NOT Vitest matchers — they
 * work in any test runner.
 *
 * @see Implementation Bible §4.5 — `harness.expect.*` API.
 */
export type TestAssertions = {
    /**
     * Asserts the trace resolved to the named component.
     *
     * @param trace - The `AgentTrace` from `resolve()`.
     * @param componentName - Expected PascalCase component name.
     * @throws {EnterstellarError} Code `ENS-5001` if the resolved component does not match.
     */
    componentToBe(trace: AgentTrace, componentName: string): void;

    /**
     * Asserts the resolution confidence exceeds a threshold.
     *
     * @param trace - The `AgentTrace` from `resolve()`.
     * @param threshold - Minimum confidence (0.0–1.0).
     * @throws {EnterstellarError} Code `ENS-5002` if confidence is at or below the threshold.
     */
    confidenceAbove(trace: AgentTrace, threshold: number): void;

    /**
     * Asserts the compilation result has `status: 'pass'`.
     *
     * @param result - The `CompilationResult` from `compileRaw()` or extracted from a trace.
     * @throws {EnterstellarError} Code `ENS-5003` if `result.status` is not `'pass'`.
     */
    compilationToPass(result: CompilationResult): void;

    /**
     * Asserts no design token violations exist in the compilation result.
     *
     * Checks for errors with codes `ENS-2002` (hallucinated token) in the
     * compilation result's error array.
     *
     * @param result - The `CompilationResult` to check.
     * @throws {EnterstellarError} Code `ENS-5004` if token violations are found.
     */
    tokenCompliant(result: CompilationResult): void;

    /**
     * Asserts total latency is below the given threshold.
     *
     * @param trace - The `AgentTrace` with timing metrics.
     * @param maxMs - Maximum allowed latency in milliseconds.
     * @throws {EnterstellarError} Code `ENS-5005` if `totalLatency` exceeds `maxMs`.
     */
    latencyBelow(trace: AgentTrace, maxMs: number): void;

    /**
     * Asserts no accessibility violations exist in the compilation result.
     *
     * Checks for errors with codes `ENS-2003` (missing accessibility attr)
     * in the compilation result's error array.
     *
     * @param result - The `CompilationResult` to check.
     * @throws {EnterstellarError} Code `ENS-5006` if accessibility violations are found.
     */
    accessibilityToPass(result: CompilationResult): void;
};

// ---------------------------------------------------------------------------
// Test Harness Interface
// ---------------------------------------------------------------------------

/**
 * The Enterstellar Test Harness public interface.
 *
 * Created via `createTestHarness()`. Simulates the full Enterstellar pipeline
 * using deterministic mock responses instead of real LLM calls. The
 * compiler validation (Zod schema, design tokens, accessibility) is
 * real — only the intent resolution is mocked.
 *
 * @see Implementation Bible §4.5
 * @see Design Choice TE1 — mocks for unit, VCR for integration.
 * @see Design Choice TE2 — inline mock, JSON fixtures, auto-generated.
 */
export interface EnterstellarTestHarness {
    /**
     * Resolve an intent string to an `AgentTrace`.
     *
     * Simulates the full pipeline:
     * 1. Look up `mockResponses[intent]` → `ComponentIntent`
     * 2. Compile via real `@enterstellar-ai/compiler`
     * 3. Build synthetic `AgentTrace` from compilation result + timing
     * 4. Return the trace
     *
     * @param intent - The intent string to resolve.
     * @param options - Optional resolve configuration.
     * @returns A synthetic `AgentTrace` with compilation results and timing.
     * @throws {EnterstellarError} Code `ENS-5010` if the intent has no mock response.
     */
    resolve(intent: string, options?: ResolveOptions): Promise<AgentTrace>;

    /**
     * Compile raw JSON directly (skip intent resolution).
     *
     * Constructs a `ComponentIntent` from the raw input and passes it
     * through `compiler.compile()`. Useful for testing specific prop
     * combinations without mocking intent resolution.
     *
     * @param raw - Component name and props to compile.
     * @returns The `CompilationResult` from the real compiler.
     */
    compileRaw(raw: CompileRawInput): Promise<CompilationResult>;

    /**
     * Register an inline mock for a specific intent string.
     *
     * Adds or overwrites an entry in the harness's mock response map.
     *
     * @param intent - The intent string to mock.
     * @param response - The `ComponentIntent` to return when this intent is resolved.
     *
     * @see Design Choice TE2 — inline mock definition.
     */
    mock(intent: string, response: ComponentIntent): void;

    /**
     * Auto-generate mocks for all registered components.
     *
     * Iterates the registry, and for each component:
     * 1. If the contract has `example` fields, creates a `ComponentIntent` from them.
     * 2. Otherwise, creates a minimal `ComponentIntent` with the component name.
     *
     * Generated mocks are added to the harness's internal mock map.
     * Existing mocks are NOT overwritten.
     *
     * @see Design Choice TE1 — `harness.autoMock(registry)`.
     * @see Design Choice TE2 — auto-generated mode.
     */
    autoMock(): void;

    /**
     * Framework-agnostic assertion helpers.
     *
     * Each method throws `EnterstellarError` on failure, returns `void` on success.
     * These work in any test runner (Vitest, Jest, Mocha, etc.).
     */
    readonly expect: TestAssertions;
}

// ---------------------------------------------------------------------------
// Coverage Analysis (TE5)
// ---------------------------------------------------------------------------

/**
 * A single test result record for coverage and regression analysis.
 *
 * Produced by the consumer after running tests — the harness does not
 * generate these automatically.
 *
 * @see Design Choice TE5 — intent coverage.
 */
export type TestResultRecord = {
    /** The intent string used in the test. */
    readonly intent: string;

    /** The PascalCase component name that was resolved. */
    readonly resolvedComponent: string;

    /** Whether the compilation passed (`status: 'pass'`). */
    readonly compilationPassed: boolean;
};

/**
 * Result from intent coverage analysis.
 *
 * Compares registered components against test results to determine
 * which components have at least one test resolving to them.
 *
 * @see Design Choice TE5 — intent coverage reporting.
 */
export type IntentCoverageResult = {
    /** Number of components with at least one test resolving to them. */
    readonly covered: number;

    /** Total registered components in the registry. */
    readonly total: number;

    /** Coverage percentage (0–100). */
    readonly percentage: number;

    /** PascalCase names of components with no test resolving to them. */
    readonly uncovered: readonly string[];
};

// ---------------------------------------------------------------------------
// Regression Detection (TE7)
// ---------------------------------------------------------------------------

/**
 * A detected regression: an intent that resolved to a different component
 * between the baseline run and the current run.
 *
 * @see Design Choice TE7 — regression detection for LLM upgrades.
 */
export type RegressionEntry = {
    /** The intent string that changed resolution. */
    readonly intent: string;

    /** Component resolved in the baseline run. */
    readonly baselineComponent: string;

    /** Component resolved in the current run. */
    readonly currentComponent: string;
};

// ---------------------------------------------------------------------------
// VCR Fixtures (TE1)
// ---------------------------------------------------------------------------

/**
 * A single VCR fixture entry stored on disk.
 *
 * Captures an intent → response mapping for replay in integration tests.
 * Stored as JSON files in the `.enterstellar-fixtures/` directory.
 *
 * @see Design Choice TE1 — VCR-style fixtures for integration tests.
 */
export type FixtureEntry = {
    /** The intent string. */
    readonly intent: string;

    /** The mock `ComponentIntent` response. */
    readonly response: ComponentIntent;

    /** Unix timestamp (ms) when this fixture was recorded. */
    readonly recordedAt: number;
};
