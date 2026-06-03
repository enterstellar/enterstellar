/**
 * @module @enterstellar-ai/test/vitest-matchers
 * @description Custom Vitest matchers for Enterstellar test assertions.
 *
 * Provides `.toResolveToComponent()`, `.toPassValidation()`,
 * `.toBeTokenCompliant()`, `.toHaveLatencyBelow()`, and
 * `.toPassAccessibility()` matchers that integrate with Vitest's
 * `expect()` API.
 *
 * ## Usage
 *
 * ```ts
 * import { enterstellarMatchers } from '@enterstellar-ai/test';
 * import { expect } from 'vitest';
 *
 * expect.extend(enterstellarMatchers);
 *
 * // Then in tests:
 * expect(trace).toResolveToComponent('PatientVitals');
 * expect(result).toPassValidation();
 * expect(result).toBeTokenCompliant();
 * expect(trace).toHaveLatencyBelow(100);
 * expect(result).toPassAccessibility();
 * ```
 *
 * ## Type Augmentation
 *
 * Import `@enterstellar-ai/test/vitest` in your test setup file to get full
 * TypeScript support for the custom matchers:
 *
 * ```ts
 * // vitest.setup.ts
 * import '@enterstellar-ai/test/vitest';
 * import { enterstellarMatchers } from '@enterstellar-ai/test';
 * expect.extend(enterstellarMatchers);
 * ```
 *
 * @see Design Choice TE4 — broad Vitest matcher set.
 */

import type { AgentTrace, CompilationResult } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Matcher Result Type
// ---------------------------------------------------------------------------

/**
 * Return shape for a Vitest custom matcher.
 * Required by `expect.extend()`.
 */
type MatcherResult = {
    readonly pass: boolean;
    readonly message: () => string;
};

// ---------------------------------------------------------------------------
// Matcher Implementations
// ---------------------------------------------------------------------------

/**
 * Custom Vitest matchers for Enterstellar GenUI testing.
 *
 * Pass this object to `expect.extend(enterstellarMatchers)` to register all matchers.
 *
 * @see Design Choice TE4
 */
export const enterstellarMatchers = {
    /**
     * Asserts the `AgentTrace` resolved to the expected component.
     *
     * @param received - An `AgentTrace` instance.
     * @param componentName - Expected PascalCase component name.
     */
    toResolveToComponent(
        received: AgentTrace,
        componentName: string,
    ): MatcherResult {
        const actual = received.resolution.resolvedComponent;
        const pass = actual === componentName;

        return {
            pass,
            message: pass
                ? () =>
                    `Expected trace NOT to resolve to "${componentName}" but it did.`
                : () =>
                    `Expected trace to resolve to "${componentName}" but got "${actual}".`,
        };
    },

    /**
     * Asserts the `CompilationResult` has `status: 'pass'`.
     *
     * @param received - A `CompilationResult` instance.
     */
    toPassValidation(received: CompilationResult): MatcherResult {
        const pass = received.status === 'pass';

        const errorSummary = received.errors
            .map((e) => `  [${e.code}] ${e.path}: ${e.message}`)
            .join('\n');

        return {
            pass,
            message: pass
                ? () =>
                    `Expected compilation NOT to pass but it did.`
                : () =>
                    `Expected compilation to pass but got status "${received.status}".\n` +
                    `Errors (${received.errors.length.toString()}):\n${errorSummary}`,
        };
    },

    /**
     * Asserts no design token violations exist in the `CompilationResult`.
     *
     * @param received - A `CompilationResult` instance.
     */
    toBeTokenCompliant(received: CompilationResult): MatcherResult {
        const tokenErrors = received.errors.filter(
            (e) => e.code === 'ENS-2002',
        );
        const pass = tokenErrors.length === 0;

        const errorSummary = tokenErrors
            .map((e) => `  [${e.code}] ${e.path}: ${e.message}`)
            .join('\n');

        return {
            pass,
            message: pass
                ? () =>
                    `Expected token violations but found none.`
                : () =>
                    `Expected token compliance but found ${tokenErrors.length.toString()} violation(s):\n${errorSummary}`,
        };
    },

    /**
     * Asserts the total pipeline latency is below a given threshold.
     *
     * @param received - An `AgentTrace` instance.
     * @param maxMs - Maximum allowed latency in milliseconds.
     */
    toHaveLatencyBelow(
        received: AgentTrace,
        maxMs: number,
    ): MatcherResult {
        const actual = received.metrics.totalMs;
        const pass = actual < maxMs;

        return {
            pass,
            message: pass
                ? () =>
                    `Expected latency NOT to be below ${maxMs.toString()}ms ` +
                    `but got ${actual.toFixed(2)}ms.`
                : () =>
                    `Expected latency below ${maxMs.toString()}ms ` +
                    `but got ${actual.toFixed(2)}ms.`,
        };
    },

    /**
     * Asserts no accessibility violations exist in the `CompilationResult`.
     *
     * @param received - A `CompilationResult` instance.
     */
    toPassAccessibility(received: CompilationResult): MatcherResult {
        const a11yErrors = received.errors.filter(
            (e) => e.code === 'ENS-2003',
        );
        const pass = a11yErrors.length === 0;

        const errorSummary = a11yErrors
            .map((e) => `  [${e.code}] ${e.path}: ${e.message}`)
            .join('\n');

        return {
            pass,
            message: pass
                ? () =>
                    `Expected accessibility violations but found none.`
                : () =>
                    `Expected accessibility compliance but found ${a11yErrors.length.toString()} violation(s):\n${errorSummary}`,
        };
    },
};
