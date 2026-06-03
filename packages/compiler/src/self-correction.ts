/**
 * @module @enterstellar-ai/compiler/self-correction
 * @description Self-Correction Loop Orchestration.
 *
 * When compilation fails and the strategy is `'self-correct'`, this module
 * invokes the consumer-provided `onCorrection` callback to give the LLM
 * a chance to fix its output. The compiler itself has zero transport
 * knowledge — it only calls the callback and re-validates the result.
 *
 * **Retry protocol:**
 * 1. Call `onCorrection(errors, { intent, schema, errors })`.
 * 2. Re-validate the corrected output through the pipeline.
 * 3. If still invalid and attempts < maxRetries → retry from step 1.
 * 4. If exhausted → fall back to `fallbackComponent` (C6).
 * 5. If callback throws → `ENS-2009`, fall through to fallback.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C4 — callback-based correction, compiler is transport-agnostic.
 * @see Design Choice C5 — all three: errors + intent + Zod schema.
 * @see Design Choice C6 — render fallbackComponent after max retries.
 * @see Design Choice C7 — track token usage in trace (observability first).
 */

import type { CompilationError, ComponentIntent } from '@enterstellar-ai/types';

import type {
    CompilerConfig,
    CorrectionContext,
    CorrectionResult,
} from './types.js';
import {
    selfCorrectionExhaustedError,
    correctionCallbackError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Self-Correction Result
// ---------------------------------------------------------------------------

/**
 * Result of the self-correction loop.
 */
export type SelfCorrectionResult = {
    /** Whether self-correction resolved all errors. */
    readonly corrected: boolean;
    /** Number of correction attempts made. */
    readonly attempts: number;
    /** The corrected intent (if successful), or `undefined` if exhausted. */
    readonly correctedIntent?: {
        readonly component: string;
        readonly props: Readonly<Record<string, unknown>>;
    };
    /** Additional errors produced during the correction loop. */
    readonly errors: readonly CompilationError[];
};

// ---------------------------------------------------------------------------
// Schema Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a compact manifest representation of the contract's prop schema.
 *
 * The Zod schema is converted to a plain object description for the LLM
 * to understand what the component expects. This is the compact manifest
 * format (C5) — NOT raw JSON Schema — to minimize token cost.
 *
 * @param contract - The component contract with the Zod schema.
 * @returns A plain object representing the schema shape.
 */
function extractSchemaDescription(
    contractProps: unknown,
): Record<string, unknown> {
    // Attempt to extract the schema shape for the correction callback.
    // Zod schemas expose `.shape` on ZodObject instances.
    if (
        typeof contractProps === 'object' &&
        contractProps !== null &&
        'shape' in contractProps
    ) {
        const shape = (contractProps as { shape: Record<string, unknown> }).shape;
        const description: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(shape)) {
            // Extract basic type info from each Zod field
            if (
                typeof value === 'object' &&
                value !== null &&
                '_def' in value
            ) {
                const def = (value as { _def: Record<string, unknown> })._def;
                description[key] = {
                    type: def['typeName'] ?? 'unknown',
                    description: def['description'] ?? undefined,
                };
            } else {
                description[key] = { type: 'unknown' };
            }
        }

        return description;
    }

    // Fallback: return empty schema description
    return {};
}

// ---------------------------------------------------------------------------
// Self-Correction Loop
// ---------------------------------------------------------------------------

/**
 * Executes the self-correction retry loop.
 *
 * Invokes the consumer's `onCorrection` callback with full context (C5):
 * - Validation errors that need fixing.
 * - The original `ComponentIntent`.
 * - The target component's schema in compact manifest format.
 *
 * Retries up to `config.onValidationFailure.maxRetries` times. Each retry
 * passes the accumulated errors from the previous attempt.
 *
 * @param errors - Initial validation errors from the first compilation pass.
 * @param intent - The original `ComponentIntent`.
 * @param contractProps - The Zod schema from the target contract.
 * @param config - The compiler configuration with correction callback and limits.
 * @returns A `SelfCorrectionResult` indicating whether correction succeeded.
 *
 * @see Design Choice C4 — callback pattern.
 * @see Design Choice C5 — errors + intent + schema sent to callback.
 * @see Design Choice C6 — fallback after exhaustion.
 *
 * @example
 * ```ts
 * const result = await executeSelfCorrection(
 *   context.errors,
 *   context.intent,
 *   contract.props,
 *   config,
 * );
 * if (result.corrected) {
 *   // Re-compile with result.correctedIntent
 * }
 * ```
 */
export async function executeSelfCorrection(
    errors: readonly CompilationError[],
    intent: ComponentIntent,
    contractProps: unknown,
    config: CompilerConfig,
): Promise<SelfCorrectionResult> {
    const { maxRetries } = config.onValidationFailure;

    // SC-09: Resolve LLM callback from new or deprecated config path.
    // selfCorrection.llm takes precedence over the deprecated onCorrection.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- SC-09: deliberate fallback to deprecated onCorrection
    const llmCallback = config.selfCorrection?.llm ?? config.onCorrection;

    // If no LLM correction callback is provided, skip Tier 3 entirely.
    // Deterministic correction (Tier 1 + 2) runs independently in compile.ts.
    if (llmCallback === undefined) {
        return {
            corrected: false,
            attempts: 0,
            errors: [selfCorrectionExhaustedError(0, maxRetries)],
        };
    }

    const accumulatedErrors: CompilationError[] = [];
    let currentErrors: readonly CompilationError[] = errors;
    let lastResult: CorrectionResult | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Build the correction context (C5: all three)
        const correctionContext: CorrectionContext = {
            intent,
            schema: extractSchemaDescription(contractProps),
            errors: currentErrors,
        };

        try {
            // Invoke the consumer's LLM correction callback (C4 / SC-09)
            lastResult = await llmCallback(currentErrors, correctionContext);

            // Return successful correction for re-validation by the orchestrator
            return {
                corrected: true,
                attempts: attempt,
                correctedIntent: {
                    component: lastResult.component,
                    props: lastResult.props,
                },
                errors: [],
            };
        } catch (err: unknown) {
            // Correction callback failed (network error, agent error, etc.)
            const errorMessage = err instanceof Error
                ? err.message
                : String(err);

            accumulatedErrors.push(correctionCallbackError(errorMessage));

            // Update current errors for next retry attempt
            currentErrors = [...errors, ...accumulatedErrors];
        }
    }

    // Exhausted all retries
    accumulatedErrors.push(selfCorrectionExhaustedError(maxRetries, maxRetries));

    return {
        corrected: false,
        attempts: maxRetries,
        errors: accumulatedErrors,
    };
}
