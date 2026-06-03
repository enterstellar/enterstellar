/**
 * @module @enterstellar-ai/compiler/pipeline/resolve-step
 * @description Pipeline Step 1: Component Resolution.
 *
 * Looks up the `ComponentIntent.component` name in the registry. If the
 * component exists, its `ComponentContract` is attached to the context
 * for downstream steps. If not found, emits `ENS-2004` and short-circuits
 * the pipeline — no further steps execute.
 *
 * **L1 compliance:** Registry is the source of truth. The LLM cannot
 * invent UI — it can only play cards from the valid registry deck.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C1 — middleware step signature.
 * @see Principle L1 — Registry is the source of truth.
 */

import type { CompilationContext, CompilationStep } from '../types.js';
import { unknownComponentError } from '../errors.js';

// ---------------------------------------------------------------------------
// Resolve Step
// ---------------------------------------------------------------------------

/**
 * Pipeline Step 1: Resolves the target component from the registry.
 *
 * Performs an O(1) lookup via `registry.get(intent.component)`. On miss,
 * pushes `ENS-2004: Unknown component` and returns the context immediately
 * without calling `next()` — short-circuiting the pipeline.
 *
 * On hit, the context's `contract` field is already set by the caller
 * (the compile orchestrator resolves the contract before building the
 * context). This step validates that the resolution is consistent.
 *
 * @param context - The compilation context with `intent` and `registry`.
 * @param next - Invokes the downstream pipeline.
 * @returns The context, either with a valid contract or with an `ENS-2004` error.
 *
 * @example
 * ```ts
 * const steps: NamedStep[] = [
 *   { name: 'resolve', execute: resolveStep },
 *   // ...
 * ];
 * ```
 */
export const resolveStep: CompilationStep = async (
    context: CompilationContext,
    next: () => Promise<CompilationContext>,
): Promise<CompilationContext> => {
    const { intent, registry } = context;
    const contract = registry.get(intent.component);

    if (contract === undefined) {
        // Unknown component — short-circuit the pipeline
        context.errors.push(unknownComponentError(intent.component));
        return context;
    }

    // Verify consistency: the contract in context matches the resolved one.
    // This is a defensive check — in practice, the compile orchestrator
    // sets context.contract before pipeline execution. If mismatched,
    // trust the registry lookup (source of truth per L1).
    if (context.contract.name !== contract.name) {
        // Overwrite with registry truth — should not happen in practice
        (context as { contract: typeof contract }).contract = contract;
    }

    return next();
};
