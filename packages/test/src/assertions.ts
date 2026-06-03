/**
 * @module @enterstellar-ai/test/assertions
 * @description Framework-agnostic assertion helpers for Enterstellar test harness.
 *
 * Each function checks a condition and throws `EnterstellarError` on failure. Returns
 * `void` on success. These assertions work in **any** test runner (Vitest,
 * Jest, Mocha, node:test, etc.) — they are NOT Vitest matchers.
 *
 * Error codes used:
 * - `ENS-5001` — `componentToBe` assertion failure
 * - `ENS-5002` — `confidenceAbove` assertion failure
 * - `ENS-5003` — `compilationToPass` assertion failure
 * - `ENS-5004` — `tokenCompliant` assertion failure
 * - `ENS-5005` — `latencyBelow` assertion failure
 * - `ENS-5006` — `accessibilityToPass` assertion failure
 *
 * @see Implementation Bible §4.5 — `harness.expect.*` specification.
 */

import type { AgentTrace, CompilationResult } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// ENS-5001: componentToBe
// ---------------------------------------------------------------------------

/**
 * Asserts that the given trace resolved to the expected component.
 *
 * Compares `trace.resolution.resolvedComponent` against `componentName`
 * using strict equality.
 *
 * @param trace - The `AgentTrace` produced by `harness.resolve()`.
 * @param componentName - Expected PascalCase component name.
 * @throws {EnterstellarError} Code `ENS-5001` if the resolved component does not match.
 *
 * @example
 * ```ts
 * const trace = await harness.resolve('show vitals');
 * harness.expect.componentToBe(trace, 'PatientVitals');
 * ```
 */
export function componentToBe(
    trace: AgentTrace,
    componentName: string,
): void {
    const actual = trace.resolution.resolvedComponent;

    if (actual !== componentName) {
        throw new EnterstellarError(
            'ENS-5001',
            'test',
            `Expected component "${componentName}" but resolved to "${actual}".`,
            false,
        );
    }
}

// ---------------------------------------------------------------------------
// ENS-5002: confidenceAbove
// ---------------------------------------------------------------------------

/**
 * Asserts that the intent confidence score exceeds the given threshold.
 *
 * Compares `trace.intent.confidence` against `threshold` using strict
 * greater-than (`>`). A value **equal** to the threshold fails.
 *
 * @param trace - The `AgentTrace` produced by `harness.resolve()`.
 * @param threshold - Minimum confidence (0.0–1.0, exclusive).
 * @throws {EnterstellarError} Code `ENS-5002` if confidence is at or below the threshold.
 *
 * @example
 * ```ts
 * harness.expect.confidenceAbove(trace, 0.8); // passes if confidence > 0.8
 * ```
 */
export function confidenceAbove(
    trace: AgentTrace,
    threshold: number,
): void {
    const actual = trace.intent.confidence;

    if (actual <= threshold) {
        throw new EnterstellarError(
            'ENS-5002',
            'test',
            `Expected confidence above ${threshold.toFixed(2)} ` +
            `but got ${actual.toFixed(2)}.`,
            false,
        );
    }
}

// ---------------------------------------------------------------------------
// ENS-5003: compilationToPass
// ---------------------------------------------------------------------------

/**
 * Asserts that the compilation result has `status: 'pass'`.
 *
 * A `'corrected'` status also fails — this assertion requires a clean pass
 * without self-correction. Use `result.status !== 'fail'` for lenient checks.
 *
 * @param result - The `CompilationResult` from `compileRaw()` or a trace's compilation.
 * @throws {EnterstellarError} Code `ENS-5003` if `result.status` is not `'pass'`.
 *
 * @example
 * ```ts
 * const result = await harness.compileRaw({ component: 'Alert', props: { severity: 'high' } });
 * harness.expect.compilationToPass(result);
 * ```
 */
export function compilationToPass(result: CompilationResult): void {
    if (result.status !== 'pass') {
        const errorSummary = result.errors
            .map((e) => `  [${e.code}] ${e.path}: ${e.message}`)
            .join('\n');

        throw new EnterstellarError(
            'ENS-5003',
            'test',
            `Expected compilation to pass but got status "${result.status}".\n` +
            `Errors (${result.errors.length.toString()}):\n${errorSummary}`,
            false,
        );
    }
}

// ---------------------------------------------------------------------------
// ENS-5004: tokenCompliant
// ---------------------------------------------------------------------------

/**
 * Asserts no design token violations exist in the compilation result.
 *
 * Filters the compilation errors for codes starting with `'ENS-2002'`
 * (hallucinated/invalid design token). If any are found, the assertion fails.
 *
 * @param result - The `CompilationResult` to check.
 * @throws {EnterstellarError} Code `ENS-5004` if design token violations are present.
 *
 * @example
 * ```ts
 * harness.expect.tokenCompliant(result);
 * ```
 */
export function tokenCompliant(result: CompilationResult): void {
    const tokenErrors = result.errors.filter(
        (e) => e.code === 'ENS-2002',
    );

    if (tokenErrors.length > 0) {
        const errorSummary = tokenErrors
            .map((e) => `  [${e.code}] ${e.path}: ${e.message}`)
            .join('\n');

        throw new EnterstellarError(
            'ENS-5004',
            'test',
            `Expected token compliance but found ${tokenErrors.length.toString()} violation(s):\n${errorSummary}`,
            false,
        );
    }
}

// ---------------------------------------------------------------------------
// ENS-5005: latencyBelow
// ---------------------------------------------------------------------------

/**
 * Asserts that the total pipeline latency is below a given threshold.
 *
 * Compares `trace.metrics.totalMs` against `maxMs` using strict less-than (`<`).
 * A value **equal** to the threshold fails.
 *
 * @param trace - The `AgentTrace` with timing metrics.
 * @param maxMs - Maximum allowed latency in milliseconds (exclusive).
 * @throws {EnterstellarError} Code `ENS-5005` if `totalMs` is at or above `maxMs`.
 *
 * @example
 * ```ts
 * harness.expect.latencyBelow(trace, 100); // passes if totalMs < 100
 * ```
 */
export function latencyBelow(
    trace: AgentTrace,
    maxMs: number,
): void {
    const actual = trace.metrics.totalMs;

    if (actual >= maxMs) {
        throw new EnterstellarError(
            'ENS-5005',
            'test',
            `Expected latency below ${maxMs.toString()}ms ` +
            `but got ${actual.toFixed(2)}ms.`,
            false,
        );
    }
}

// ---------------------------------------------------------------------------
// ENS-5006: accessibilityToPass
// ---------------------------------------------------------------------------

/**
 * Asserts no accessibility violations exist in the compilation result.
 *
 * Filters the compilation errors for codes starting with `'ENS-2003'`
 * (missing accessibility attribute). If any are found, the assertion fails.
 *
 * @param result - The `CompilationResult` to check.
 * @throws {EnterstellarError} Code `ENS-5006` if accessibility violations are present.
 *
 * @example
 * ```ts
 * harness.expect.accessibilityToPass(result);
 * ```
 */
export function accessibilityToPass(result: CompilationResult): void {
    const a11yErrors = result.errors.filter(
        (e) => e.code === 'ENS-2003',
    );

    if (a11yErrors.length > 0) {
        const errorSummary = a11yErrors
            .map((e) => `  [${e.code}] ${e.path}: ${e.message}`)
            .join('\n');

        throw new EnterstellarError(
            'ENS-5006',
            'test',
            `Expected accessibility compliance but found ${a11yErrors.length.toString()} violation(s):\n${errorSummary}`,
            false,
        );
    }
}
