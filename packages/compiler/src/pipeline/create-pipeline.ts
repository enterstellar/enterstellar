/**
 * @module @enterstellar-ai/compiler/pipeline/create-pipeline
 * @description Builds and executes the compilation middleware chain.
 *
 * The pipeline is an ordered sequence of `NamedStep` functions. Each step
 * receives a `CompilationContext` and a `next` function that invokes the
 * downstream chain. Steps may:
 * - Pass through (call `next()` and return its result).
 * - Modify the context (add errors, transform props) then call `next()`.
 * - Short-circuit (return without calling `next()`) to stop the pipeline.
 *
 * The trace step is always executed last, regardless of custom step ordering.
 *
 * **L15 compliance:** Zero framework imports. Pure async orchestration.
 *
 * @see Design Choice C1 — standalone, composable middleware functions.
 * @see Design Choice C18 — consumers add custom steps via `compiler.use()`.
 */

import type { CompilationContext } from '../types.js';
import type { NamedStep } from './types.js';

// ---------------------------------------------------------------------------
// Pipeline Executor
// ---------------------------------------------------------------------------

/**
 * Executes a sequence of named pipeline steps as a middleware chain.
 *
 * Each step is invoked with the shared `CompilationContext` and a `next`
 * function that calls the subsequent step. The chain executes in insertion
 * order — built-in steps first, then custom steps, then trace (always last).
 *
 * If a step does not call `next()`, the pipeline short-circuits and
 * downstream steps are skipped. This is intentional — steps like resolve
 * may short-circuit on unknown component errors.
 *
 * @param steps - Ordered array of `NamedStep` entries to execute.
 * @param context - The mutable `CompilationContext` shared across all steps.
 * @returns The final `CompilationContext` after all steps have executed.
 *
 * @see Design Choice C1 — `(context, next) => next(modifiedResult)` pattern.
 *
 * @example
 * ```ts
 * const steps: NamedStep[] = [
 *   { name: 'resolve', execute: resolveStep },
 *   { name: 'parse', execute: parseStep },
 *   { name: 'token', execute: tokenStep },
 *   { name: 'accessibility', execute: accessibilityStep },
 *   { name: 'custom', execute: hipaaCheck },
 *   { name: 'trace', execute: traceStep },
 * ];
 *
 * const result = await executePipeline(steps, context);
 * ```
 */
export async function executePipeline(
    steps: readonly NamedStep[],
    context: CompilationContext,
): Promise<CompilationContext> {
    /**
     * Recursively builds the `next()` chain starting from step at `index`.
     * Each invocation creates a closure that calls the current step with
     * a `next` function pointing to the subsequent step. At the end of
     * the chain, `next()` is a no-op that returns the context as-is.
     */
    async function executeStep(index: number): Promise<CompilationContext> {
        // Base case: no more steps — return the context as-is
        if (index >= steps.length) {
            return context;
        }

        const currentStep = steps[index];

        // Safety: if undefined (shouldn't happen given bounds check), passthrough
        if (currentStep === undefined) {
            return context;
        }

        // Build the `next` function that invokes the downstream chain
        const next = async (): Promise<CompilationContext> => {
            return executeStep(index + 1);
        };

        // Execute the current step with context and next
        return currentStep.execute(context, next);
    }

    return executeStep(0);
}

// ---------------------------------------------------------------------------
// Pipeline Builder
// ---------------------------------------------------------------------------

/**
 * Builds an ordered pipeline from built-in steps and custom middleware.
 *
 * The execution order is:
 * 1. Built-in steps (resolve → parse → token → accessibility) — in fixed order.
 * 2. Custom steps — in insertion order via `compiler.use()`.
 * 3. Trace step — always last, regardless of other ordering.
 *
 * @param builtInSteps - The 4 core built-in steps (resolve, parse, token, a11y).
 * @param customSteps - Custom steps registered via `compiler.use()`.
 * @param traceStep - The trace step (always last).
 * @returns An ordered array of `NamedStep` ready for `executePipeline()`.
 *
 * @see Design Choice C18 — insertion order determines execution order.
 */
export function buildPipeline(
    builtInSteps: readonly NamedStep[],
    customSteps: readonly NamedStep[],
    traceStep: NamedStep,
): readonly NamedStep[] {
    return [...builtInSteps, ...customSteps, traceStep];
}
