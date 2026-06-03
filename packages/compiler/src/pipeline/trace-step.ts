/**
 * @module @enterstellar-ai/compiler/pipeline/trace-step
 * @description Pipeline Step 5: Trace Emission and CompilationResult Construction.
 *
 * Always executes last in the pipeline. Assembles the final `CompilationResult`
 * from the accumulated `CompilationContext`, including provenance metadata,
 * compilation status, validated props, errors, and optional diff.
 *
 * This step does NOT call `next()` — it is the terminal step of the chain.
 *
 * **L4 compliance:** Observable by Default. Every compilation produces a result.
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C12 — agent is an explicit parameter in provenance.
 * @see Design Choice C13 — diff gated by `includeDiff` config flag.
 * @see Design Choice T14 — compiler version in provenance.
 */

import type { CompilationResult, CompilationProvenance } from '@enterstellar-ai/types';

import type { CompilationContext, CompilationStep } from '../types.js';
import { generateDiff } from '../diff.js';
import { COMPILER_VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Status Determination
// ---------------------------------------------------------------------------

/**
 * Determines the compilation status from the context state.
 *
 * - `'fail'` — errors remain after all pipeline steps (and self-correction).
 * - `'corrected'` — self-correction was used AND resolved all errors.
 * - `'pass'` — no errors, no self-correction needed.
 *
 * @param context - The completed compilation context.
 * @returns The compilation status.
 */
function determineStatus(
    context: CompilationContext,
    selfCorrectionAttempts: number,
): 'pass' | 'fail' | 'corrected' {
    if (context.errors.length > 0) {
        return 'fail';
    }
    if (selfCorrectionAttempts > 0) {
        return 'corrected';
    }
    return 'pass';
}

// ---------------------------------------------------------------------------
// Trace Step Factory
// ---------------------------------------------------------------------------

/**
 * Creates the trace step with access to the pre-pipeline raw props snapshot
 * and self-correction attempt count.
 *
 * The trace step is not a static export like other steps — it needs runtime
 * context (raw snapshot, correction count) injected by the compile orchestrator.
 * This factory creates a closure with that context.
 *
 * @param rawPropsSnapshot - Deep snapshot of props taken before pipeline execution.
 * @param selfCorrectionAttempts - Number of self-correction loops completed.
 * @returns A `CompilationStep` that builds the final `CompilationResult`.
 *
 * @see Design Choice C13 — `includeDiff` controls whether diff is included.
 * @see Design Choice C12 — `agent` in provenance from `context.agent`.
 */
export function createTraceStep(
    rawPropsSnapshot: Readonly<Record<string, unknown>>,
    selfCorrectionAttempts: number,
): CompilationStep {
    /**
     * Pipeline Step 5: Builds the `CompilationResult`.
     *
     * Terminal step — does NOT call `next()`. Constructs provenance,
     * determines status, generates diff (if configured), and attaches
     * the final result to the context for the compile orchestrator to read.
     */
    const traceStep: CompilationStep = (
        context: CompilationContext,
        _next: () => Promise<CompilationContext>,
    ): Promise<CompilationContext> => {
        const { contract, config, agent } = context;

        // Build provenance metadata (C12, T14)
        const provenance: CompilationProvenance = {
            agent,
            registry: 'local',
            compiledAt: new Date().toISOString(),
            compilerVersion: COMPILER_VERSION,
            ...(contract._meta.forged ? { forgeMode: 'local' as const } : {}),
            ...(contract.origin !== undefined
                ? {
                    contractOrigin: {
                        registryUrl: contract.origin.registryUrl,
                        publisher: contract.origin.publisher,
                    },
                }
                : {}),
        };

        // Determine compilation status
        const status = determineStatus(context, selfCorrectionAttempts);

        // Generate diff if configured (C13)
        const diff = generateDiff(
            rawPropsSnapshot,
            context.props,
            config.includeDiff,
        );

        // Build the final CompilationResult
        const result: CompilationResult = {
            componentName: contract.name,
            props: Object.freeze({ ...context.props }),
            status,
            provenance,
            errors: Object.freeze([...context.errors]),
            selfCorrectionAttempts,
            ...(diff !== undefined ? { diff } : {}),
        };

        // Attach result to context for the orchestrator to extract.
        // We use a type-safe extension rather than `any`.
        (context as CompilationContext & { __result?: CompilationResult }).__result = result;

        // Terminal step — do NOT call next()
        return Promise.resolve(context);
    };

    return traceStep;
}
