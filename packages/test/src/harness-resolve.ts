/**
 * @module @enterstellar-ai/test/harness-resolve
 * @description Implements the `resolve()` method for the test harness.
 *
 * Simulates the full Enterstellar pipeline using deterministic mock responses:
 * 1. Look up `mockResponses[intent]` → `ComponentIntent`
 * 2. Compile via real `@enterstellar-ai/compiler` (Zod, tokens, a11y all run)
 * 3. Build a synthetic `AgentTrace` from compilation result + timing
 * 4. Return the trace
 *
 * The compiler validation is **real** — only the intent resolution step is
 * mocked. This means Zod schema errors, design token violations, and
 * accessibility issues will surface exactly as they would in production.
 *
 * @see Implementation Bible §4.5 — `harness.resolve()` specification.
 * @see Design Choice TE1 — mocks for unit tests.
 */

import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type {
    AgentTrace,
    CompilationResult,
    ComponentIntent,
    TraceId,
} from '@enterstellar-ai/types';
import { EnterstellarError, createTraceId } from '@enterstellar-ai/types';

import type { ResolveOptions } from './types.js';

// ---------------------------------------------------------------------------
// resolve() Implementation
// ---------------------------------------------------------------------------

/**
 * Resolves an intent string through the mock pipeline and returns an `AgentTrace`.
 *
 * @param intent - The intent string to resolve (exact match against mockResponses).
 * @param mockResponses - The mutable mock response map (intent → ComponentIntent).
 * @param compiler - The real `EnterstellarCompiler` instance created by the harness.
 * @param options - Optional resolve configuration.
 * @returns A synthetic `AgentTrace` with real compilation results and timing.
 * @throws {EnterstellarError} Code `ENS-5010` if the intent has no mock response.
 *
 * @internal This function is wired into the harness by `createTestHarness()`.
 */
export async function resolve(
    intent: string,
    mockResponses: Map<string, ComponentIntent>,
    compiler: EnterstellarCompiler,
    options?: ResolveOptions,
): Promise<AgentTrace> {
    // ---------------------------------------------------------------------------
    // Step 1: Mock Intent Resolution
    // ---------------------------------------------------------------------------

    const mockResponse = mockResponses.get(intent);

    if (mockResponse === undefined) {
        throw new EnterstellarError(
            'ENS-5010',
            'test',
            `Intent "${intent}" has no mock response. ` +
            `Use harness.mock("${intent}", { component, props }) or harness.autoMock() first.`,
            false,
        );
    }

    // ---------------------------------------------------------------------------
    // Step 2: Real Compilation (L3 — compiler is never bypassed)
    // ---------------------------------------------------------------------------

    const resolutionStart = performance.now();
    const resolutionEnd = performance.now();
    const resolutionMs = resolutionEnd - resolutionStart;

    const compilationStart = performance.now();
    const compilationResult: CompilationResult = await compiler.compile(
        mockResponse,
        { agent: 'enterstellar-test-harness' },
    );
    const compilationEnd = performance.now();
    const compilationMs = compilationEnd - compilationStart;

    // ---------------------------------------------------------------------------
    // Step 3: Build Synthetic AgentTrace
    // ---------------------------------------------------------------------------

    const totalMs = resolutionMs + compilationMs;

    const trace: AgentTrace = buildTrace(
        intent,
        mockResponse,
        compilationResult,
        resolutionMs,
        compilationMs,
        totalMs,
        options,
    );

    return trace;
}

// ---------------------------------------------------------------------------
// Trace Builder (private helper)
// ---------------------------------------------------------------------------

/**
 * Builds a synthetic `AgentTrace` from compilation results and timing data.
 *
 * The trace follows the exact `AgentTrace` shape from `@enterstellar-ai/types/trace`.
 * Fields that are only meaningful in a real pipeline (e.g., `similarityScore`,
 * `renderMs`) are set to deterministic defaults for testability.
 *
 * @param intent - Raw intent string.
 * @param mockResponse - The `ComponentIntent` that was resolved.
 * @param result - The `CompilationResult` from the real compiler.
 * @param resolutionMs - Time spent in intent resolution (near-zero for mocks).
 * @param compilationMs - Time spent in compilation.
 * @param totalMs - Total pipeline time (resolution + compilation).
 * @param options - Optional resolve configuration.
 * @returns A complete `AgentTrace`.
 */
function buildTrace(
    intent: string,
    mockResponse: ComponentIntent,
    result: CompilationResult,
    resolutionMs: number,
    compilationMs: number,
    totalMs: number,
    options?: ResolveOptions,
): AgentTrace {
    const traceId: TraceId = createTraceId();

    // Determine if accessibility was auto-injected by checking compilation result.
    // If the result has no a11y errors, and status is 'pass' or 'corrected',
    // we consider accessibility as having been addressed.
    const hasA11yErrors = result.errors.some(
        (e) => e.code === 'ENS-2003',
    );

    const trace: AgentTrace = {
        id: traceId,
        timestamp: new Date().toISOString(),
        intent: {
            raw: intent,
            component: mockResponse.component,
            confidence: 1.0, // Mock resolution always has full confidence
            // exactOptionalPropertyTypes: conditionally spread optional fields
            ...(mockResponse.mode !== undefined ? { mode: mockResponse.mode } : {}),
            ...(mockResponse.interaction !== undefined ? { interaction: mockResponse.interaction } : {}),
        },
        resolution: {
            strategy: 'exact',
            resolvedComponent: result.componentName,
            candidatesConsidered: 1, // Mock = exact match, 1 candidate
        },
        compilation: {
            status: result.status,
            errorCount: result.errors.length,
            selfCorrectionAttempts: result.selfCorrectionAttempts,
            tokensValidated: true, // Compiler always validates tokens
            accessibilityInjected: !hasA11yErrors && result.status !== 'fail',
        },
        determinism: {
            level: 1.0, // Full GenUI in test context
            cacheHit: false, // Tests never use cache
            zone: 'test-zone',
        },
        metrics: {
            totalMs,
            resolutionMs,
            compilationMs,
            renderMs: 0, // No rendering in test harness
        },
        consent: {
            anonymizedAggregation: false, // Tests never send telemetry
        },
    };

    // Attach context as correlation metadata if provided
    if (options?.context !== undefined) {
        // Context is stored implicitly — the trace shape is fixed per
        // @enterstellar-ai/types. We use the correlationId field for test traceability.
        return {
            ...trace,
            correlationId: `test-${Date.now().toString(36)}`,
        };
    }

    return trace;
}
