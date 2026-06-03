/**
 * @module @enterstellar-ai/compiler/lint
 * @description Lint mode — validates a `ComponentIntent` without producing
 * a full `CompilationResult`.
 *
 * Returns validation errors and non-fatal warnings in a `LintResult`.
 * No provenance, no trace emission, no self-correction. Used by `@enterstellar-ai/test`
 * for assertions and CI pipelines for pre-merge validation.
 *
 * Runs the same validation logic as `compile()` (resolve → parse → token → a11y)
 * but skips the trace step and does not invoke self-correction.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C19 — lint mode.
 */

import type { ComponentIntent } from '@enterstellar-ai/types';

import type { CompilationContext, CompilationStep, CompilerConfig, LintResult } from './types.js';
import type { NamedStep } from './pipeline/types.js';
import { executePipeline } from './pipeline/create-pipeline.js';
import { resolveStep } from './pipeline/resolve-step.js';
import { parseStep } from './pipeline/parse-step.js';
import { tokenStep } from './pipeline/token-step.js';
import { accessibilityStep } from './pipeline/accessibility-step.js';
import { validateNestingDepth } from './nesting.js';
import { unknownComponentError } from './errors.js';

// ---------------------------------------------------------------------------
// Lint Function
// ---------------------------------------------------------------------------

/**
 * Validates a `ComponentIntent` and returns errors and warnings.
 *
 * Does NOT produce a `CompilationResult`, emit traces, or invoke
 * self-correction. Runs the core validation pipeline (resolve, parse,
 * token, accessibility) and returns all accumulated errors and warnings
 * in a `LintResult`.
 *
 * @param intent - The `ComponentIntent` to validate.
 * @param config - The `CompilerConfig` with registry and settings.
 * @param customSteps - Custom middleware steps for additional validation.
 * @returns A `LintResult` containing validation errors and non-fatal warnings.
 *
 * @see Design Choice C19 — lint mode for `@enterstellar-ai/test` and CI.
 *
 * @example
 * ```ts
 * const { errors, warnings } = await lint(intent, config, []);
 * if (errors.length > 0) {
 *   console.error('Validation failed:', errors);
 * }
 * ```
 */
export async function lint(
    intent: ComponentIntent,
    config: CompilerConfig,
    customSteps: readonly CompilationStep[],
): Promise<LintResult> {
    const { registry } = config;

    // --- 1. Resolve component ---
    const contract = registry.get(intent.component);

    if (contract === undefined) {
        return { errors: [unknownComponentError(intent.component)], warnings: [] };
    }

    // --- 2. Validate nesting depth (P4) ---
    const nestingResult = validateNestingDepth(
        intent.props,
        config.maxNestingDepth,
    );

    if (!nestingResult.valid && nestingResult.error !== undefined) {
        return { errors: [nestingResult.error], warnings: [] };
    }

    // --- 3. Build lint-only pipeline (no trace step) ---
    const context: CompilationContext = {
        intent,
        contract,
        registry,
        config,
        designTokens: registry.getDesignTokens(),
        agent: 'lint',

        props: { ...intent.props },
        errors: [],
        warnings: [],
        strippedProps: [],
        tokenCoercions: 0,
        accessibilityInjections: [],
    };

    const builtInSteps: readonly NamedStep[] = [
        { name: 'resolve', execute: resolveStep },
        { name: 'parse', execute: parseStep },
        { name: 'token', execute: tokenStep },
        { name: 'accessibility', execute: accessibilityStep },
    ];

    const namedCustomSteps: readonly NamedStep[] = customSteps.map(
        (step) => ({ name: 'custom' as const, execute: step }),
    );

    // No trace step — lint mode skips result construction and trace emission.
    // Use a passthrough terminal step that just returns the context.
    const terminalStep: NamedStep = {
        name: 'trace',
        execute: (ctx: CompilationContext, _next): Promise<CompilationContext> => Promise.resolve(ctx),
    };

    const pipeline = [...builtInSteps, ...namedCustomSteps, terminalStep];

    // --- 4. Execute pipeline ---
    const finalContext = await executePipeline(pipeline, context);

    return { errors: finalContext.errors, warnings: finalContext.warnings };
}
