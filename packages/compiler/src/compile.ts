/**
 * @module @enterstellar-ai/compiler/compile
 * @description Core compilation orchestration logic.
 *
 * This module is the central assembly point of the compiler. It:
 * 1. Resolves the target component from the registry.
 * 2. Checks the parse cache for dedup (C17).
 * 3. Validates nesting depth (P4).
 * 4. Builds the `CompilationContext` and runs the pipeline.
 * 5. Handles the self-correction loop if validation fails (C4–C7).
 * 6. Falls back to `fallbackComponent` on exhaustion (C6).
 * 7. Returns a `CompilationResult` — never throws.
 *
 * **L3 compliance:** Compiler never bypassed. Every intent goes through
 * the full pipeline — no fast path, no escape hatch.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C2 — async (self-correction requires LLM calls).
 * @see Design Choice C3 — optional cache for dedup.
 * @see Design Choice C6 — fallback component after max retries.
 */

import type {
    CompilationResult,
    CompilationError,
    ComponentContract,
    ComponentIntent,
} from '@enterstellar-ai/types';

import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

import type {
    CompilationContext,
    CompilationStep,
    CompilerConfig,
    CompileOptions,
} from './types.js';
import type { CompilationCache } from './cache.js';
import type { NamedStep } from './pipeline/types.js';
import { executePipeline, buildPipeline } from './pipeline/create-pipeline.js';
import { resolveStep } from './pipeline/resolve-step.js';
import { parseStep } from './pipeline/parse-step.js';
import { tokenStep } from './pipeline/token-step.js';
import { accessibilityStep } from './pipeline/accessibility-step.js';
import { createTraceStep } from './pipeline/trace-step.js';
import { snapshotProps } from './diff.js';
import { validateNestingDepth } from './nesting.js';
import { executeSelfCorrection } from './self-correction.js';
import {
    unknownComponentError,
    fallbackRenderedError,
} from './errors.js';
import { attemptDeterministicCorrection } from './deterministic-correction.js';
import type { CorrectionTraceEntry } from './types.js';
import { COMPILER_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Build Fail Result (utility for early exits)
// ---------------------------------------------------------------------------

/**
 * Constructs a `CompilationResult` with status `'fail'`.
 *
 * Used for early exits when the pipeline cannot run (unknown component,
 * nesting depth exceeded, fallback failures).
 *
 * @param componentName - The component that was attempted.
 * @param errors - The errors that caused the failure.
 * @param agent - The agent identifier (from compile options).
 * @returns A complete `CompilationResult` with `status: 'fail'`.
 */
function buildFailResult(
    componentName: string,
    errors: readonly CompilationError[],
    agent: string,
): CompilationResult {
    return {
        componentName,
        props: Object.freeze({}),
        status: 'fail',
        provenance: {
            agent,
            registry: 'local',
            compiledAt: new Date().toISOString(),
            compilerVersion: COMPILER_VERSION,
        },
        errors: Object.freeze([...errors]),
        selfCorrectionAttempts: 0,
    };
}

// ---------------------------------------------------------------------------
// Telemetry Emission Helper (TL1)
// ---------------------------------------------------------------------------

/**
 * Emits a telemetry signal for a completed compile() invocation.
 *
 * Called before every return from `compile()` — including early exits
 * (unknown component, nesting depth, cache hit). Ensures TL1 compliance:
 * every `compile()` call emits a signal regardless of outcome.
 *
 * No-op when `config.onTelemetry` is undefined (standalone compiler use).
 *
 * @param config - Compiler config (may or may not have `onTelemetry`).
 * @param result - The compilation result being returned.
 * @param options - Compile options with optional rawIntent/intentCategory.
 * @param intent - The original ComponentIntent.
 * @param startTime - `performance.now()` timestamp from compile() entry.
 */
function emitTelemetry(
    config: CompilerConfig,
    result: CompilationResult,
    options: CompileOptions,
    intent: ComponentIntent,
    startTime: number,
    deterministicCorrectionCount?: number,
    templateCorrectionCount?: number,
    correctionTierValue?: 0 | 1 | 2 | 3,
): void {
    if (config.onTelemetry === undefined) {
        return;
    }

    const latencyMs = Math.round(performance.now() - startTime);
    config.onTelemetry({
        rawIntent: options.rawIntent ?? intent.component,
        componentName: result.componentName,
        intentCategory: options.intentCategory ?? 'utility',
        compilationStatus: result.status === 'corrected' ? 'corrected' : result.status,
        forgeMode: 'none',
        forgeUsed: false,
        latencyMs,
        selfCorrectionAttempts: result.selfCorrectionAttempts,
        correctionTokensUsed: 0,
        // SC-18: Correction tier breakdown (optional fields for backward compat)
        ...(deterministicCorrectionCount !== undefined
            ? { deterministicCorrections: deterministicCorrectionCount }
            : {}),
        ...(templateCorrectionCount !== undefined
            ? { templateCorrections: templateCorrectionCount }
            : {}),
        ...(correctionTierValue !== undefined
            ? { correctionTier: correctionTierValue }
            : {}),
    });
}

// ---------------------------------------------------------------------------
// Build Compilation Context
// ---------------------------------------------------------------------------

/**
 * Constructs the initial `CompilationContext` for the pipeline.
 *
 * @param intent - The `ComponentIntent` to compile.
 * @param contract - The resolved `ComponentContract`.
 * @param registry - The `EnterstellarRegistry` instance.
 * @param config - The `CompilerConfig`.
 * @param agent - Agent identifier string.
 * @returns A fresh `CompilationContext` with zeroed accumulators.
 */
function buildContext(
    intent: ComponentIntent,
    contract: ComponentContract,
    registry: EnterstellarRegistry,
    config: CompilerConfig,
    agent: string,
): CompilationContext {
    return {
        // Immutable
        intent,
        contract,
        registry,
        config,
        designTokens: registry.getDesignTokens(),
        agent,

        // Mutable accumulators
        props: { ...intent.props },
        errors: [],
        warnings: [],
        strippedProps: [],
        tokenCoercions: 0,
        accessibilityInjections: [],
    };
}

// ---------------------------------------------------------------------------
// Extract Result from Context
// ---------------------------------------------------------------------------

/**
 * Extracts the `CompilationResult` that was attached to the context
 * by the trace step.
 *
 * @param context - The completed context.
 * @returns The `CompilationResult`, or `undefined` if trace step didn't run.
 */
function extractResult(
    context: CompilationContext,
): CompilationResult | undefined {
    return (context as CompilationContext & { __result?: CompilationResult }).__result;
}

// ---------------------------------------------------------------------------
// Core Compile Function
// ---------------------------------------------------------------------------

/**
 * Compiles a `ComponentIntent` through the full validation pipeline.
 *
 * **Never throws.** Always returns a `CompilationResult` with status
 * `'pass'`, `'corrected'`, or `'fail'`.
 *
 * **Sequence:**
 * 1. Resolve component from registry. If unknown → fail with `ENS-2004`.
 * 2. Validate nesting depth (P4). If exceeded → fail with `ENS-2010`.
 * 3. Check parse cache (C17). If hit → return cached result.
 * 4. Snapshot raw props for diff (C13).
 * 5. Build pipeline (resolve → parse → token → a11y → custom → trace).
 * 6. Execute pipeline.
 * 7. If errors and strategy is `'self-correct'` → run correction loop.
 * 8. If correction fails → fallback to `fallbackComponent` (C6).
 * 9. Cache successful parse results (C17).
 * 10. Return `CompilationResult`.
 *
 * @param intent - The `ComponentIntent` from the normalizer or agent.
 * @param config - The `CompilerConfig` with registry, limits, and callbacks.
 * @param customSteps - Custom middleware steps registered via `compiler.use()`.
 * @param cache - Optional parse result cache (C17).
 * @param options - Compile-time options (e.g., `agent` identifier).
 * @returns A `CompilationResult` — never throws.
 *
 * @see Design Choice C2 — async.
 * @see Principle L3 — compiler never bypassed.
 */
export async function compile(
    intent: ComponentIntent,
    config: CompilerConfig,
    customSteps: readonly CompilationStep[],
    cache: CompilationCache | undefined,
    options: CompileOptions = {},
): Promise<CompilationResult> {
    const { registry } = config;
    const agent = options.agent ?? 'unknown';
    const startTime = performance.now();

    // --- 1. Resolve component from registry ---
    const contract = registry.get(intent.component);

    if (contract === undefined) {
        const result = buildFailResult(
            intent.component,
            [unknownComponentError(intent.component)],
            agent,
        );
        emitTelemetry(config, result, options, intent, startTime);
        return result;
    }

    // --- 2. Validate nesting depth (P4) ---
    const nestingResult = validateNestingDepth(
        intent.props,
        config.maxNestingDepth,
    );

    if (!nestingResult.valid && nestingResult.error !== undefined) {
        const result = buildFailResult(
            intent.component,
            [nestingResult.error],
            agent,
        );
        emitTelemetry(config, result, options, intent, startTime);
        return result;
    }

    // --- 3. Check parse cache (C17) ---
    if (cache !== undefined) {
        const cached = cache.get(intent.component, intent.props);
        if (cached !== undefined) {
            // Cache hit — build a pass result from cached props
            const result: CompilationResult = {
                componentName: contract.name,
                props: Object.freeze({ ...cached }),
                status: 'pass',
                provenance: {
                    agent,
                    registry: 'local',
                    compiledAt: new Date().toISOString(),
                    compilerVersion: COMPILER_VERSION,
                },
                errors: Object.freeze([]),
                selfCorrectionAttempts: 0,
            };
            emitTelemetry(config, result, options, intent, startTime);
            return result;
        }
    }

    // --- 4. Snapshot raw props for diff (C13) ---
    const rawPropsSnapshot = snapshotProps(intent.props);

    // --- 5. First compilation pass ---
    let result = await runPipeline(
        intent,
        contract,
        config,
        customSteps,
        agent,
        rawPropsSnapshot,
        0,
    );

    // --- 5a. Deterministic correction: Tier 1 + Tier 2 [SC-01] ---
    // Runs BEFORE the LLM self-correction loop (Step 6).
    // Enabled by default — disabled only via explicit `selfCorrection.deterministic: false`.
    let deterministicTrace: readonly CorrectionTraceEntry[] = [];
    let deterministicCount = 0;
    let templateCount = 0;
    let correctionTier: 0 | 1 | 2 | 3 = 0;

    if (
        result.status === 'fail' &&
        config.selfCorrection?.deterministic !== false  // default: true (SC-08)
    ) {
        const correction = attemptDeterministicCorrection(
            result.errors,
            intent.props,
            contract,
            config.registry.getDesignTokens(),
            config.selfCorrection?.enumMatchThreshold,
        );

        // Track correction counts for telemetry (SC-18)
        deterministicCount = correction.trace.filter((t) => t.tier === 1).length;
        templateCount = correction.trace.filter((t) => t.tier === 2).length;
        deterministicTrace = correction.trace;

        // Only re-validate if at least one correction was applied (SC-16)
        if (correction.trace.length > 0) {
            // Re-validate through FULL pipeline (SC-10: mandatory re-validation)
            const correctedIntent: ComponentIntent = {
                ...intent,
                props: correction.props,
            };
            result = await runPipeline(
                correctedIntent,
                contract,
                config,
                customSteps,
                agent,
                rawPropsSnapshot,
                0,
            );

            // Attach correction trace if configured (SC-11)
            if (config.selfCorrection?.trace === true && deterministicTrace.length > 0) {
                result = {
                    ...result,
                    correctionTrace: deterministicTrace.map((entry) => ({
                        tier: entry.tier,
                        errorCode: entry.errorCode,
                        field: entry.field,
                        was: entry.was,
                        correctedTo: entry.correctedTo,
                        strategy: entry.strategy,
                    })),
                };
            }

            // Determine which tier earned the correction (SC-18)
            if (result.status !== 'fail') {
                correctionTier = templateCount > 0 ? 2 : 1;
            }
        }
    }

    // --- 6. Self-correction loop (C4–C7) ---
    if (
        result.status === 'fail' &&
        config.onValidationFailure.strategy === 'self-correct'
    ) {
        const correction = await executeSelfCorrection(
            result.errors,
            intent,
            contract.props,
            config,
        );

        if (correction.corrected && correction.correctedIntent !== undefined) {
            // Re-run pipeline with corrected intent
            const correctedIntent: ComponentIntent = {
                ...intent,
                component: correction.correctedIntent.component,
                props: correction.correctedIntent.props,
            };

            result = await runPipeline(
                correctedIntent,
                contract,
                config,
                customSteps,
                agent,
                rawPropsSnapshot,
                correction.attempts,
            );
        } else {
            // Correction exhausted — handle fallback (C6)
            result = await handleFallback(
                intent,
                config,
                customSteps,
                agent,
                rawPropsSnapshot,
                result.errors,
                correction.attempts,
            );
        }
    } else if (
        result.status === 'fail' &&
        config.onValidationFailure.strategy === 'fallback'
    ) {
        // Direct fallback — no self-correction attempt
        result = await handleFallback(
            intent,
            config,
            customSteps,
            agent,
            rawPropsSnapshot,
            result.errors,
            0,
        );
    }

    // --- 7. Cache successful parse results (C17) ---
    if (result.status === 'pass' && cache !== undefined) {
        cache.set(
            intent.component,
            intent.props,
            result.props,
        );
    }

    // --- 8. Emit telemetry signal (TL1 + SC-18) ---
    emitTelemetry(
        config,
        result,
        options,
        intent,
        startTime,
        deterministicCount,
        templateCount,
        correctionTier,
    );

    return result;
}

// ---------------------------------------------------------------------------
// Pipeline Execution Helper
// ---------------------------------------------------------------------------

/**
 * Runs the full pipeline for a single compilation pass.
 *
 * @param intent - The intent to compile.
 * @param contract - The resolved contract.
 * @param config - Compiler configuration.
 * @param customSteps - Custom middleware steps.
 * @param agent - Agent identifier.
 * @param rawPropsSnapshot - Pre-pipeline raw props snapshot.
 * @param selfCorrectionAttempts - Number of correction attempts so far.
 * @returns A `CompilationResult`.
 */
async function runPipeline(
    intent: ComponentIntent,
    contract: ComponentContract,
    config: CompilerConfig,
    customSteps: readonly CompilationStep[],
    agent: string,
    rawPropsSnapshot: Readonly<Record<string, unknown>>,
    selfCorrectionAttempts: number,
): Promise<CompilationResult> {
    const context = buildContext(intent, contract, config.registry, config, agent);

    // Build the step chain
    const builtInSteps: readonly NamedStep[] = [
        { name: 'resolve', execute: resolveStep },
        { name: 'parse', execute: parseStep },
        { name: 'token', execute: tokenStep },
        { name: 'accessibility', execute: accessibilityStep },
    ];

    const namedCustomSteps: readonly NamedStep[] = customSteps.map(
        (step) => ({ name: 'custom' as const, execute: step }),
    );

    const traceStep: NamedStep = {
        name: 'trace',
        execute: createTraceStep(rawPropsSnapshot, selfCorrectionAttempts),
    };

    const pipeline = buildPipeline(builtInSteps, namedCustomSteps, traceStep);

    // Execute
    const finalContext = await executePipeline(pipeline, context);

    // Extract the CompilationResult attached by the trace step
    const result = extractResult(finalContext);

    if (result !== undefined) {
        return result;
    }

    // Fallback: trace step didn't run (pipeline was short-circuited)
    return buildFailResult(intent.component, finalContext.errors, agent);
}

// ---------------------------------------------------------------------------
// Fallback Handler (C6)
// ---------------------------------------------------------------------------

/**
 * Handles the fallback path when self-correction is exhausted or
 * the strategy is `'fallback'`.
 *
 * Looks up the `fallbackComponent` in the registry and compiles a
 * minimal intent for it. The fallback component receives error details
 * as props for informational display.
 *
 * @see Design Choice C6 — fallback component, NOT best attempt.
 */
async function handleFallback(
    originalIntent: ComponentIntent,
    config: CompilerConfig,
    customSteps: readonly CompilationStep[],
    agent: string,
    rawPropsSnapshot: Readonly<Record<string, unknown>>,
    originalErrors: readonly CompilationError[],
    selfCorrectionAttempts: number,
): Promise<CompilationResult> {
    const { registry } = config;
    const { fallbackComponent } = config.onValidationFailure;

    // Check if fallback component exists in registry
    const fallbackContract = registry.get(fallbackComponent);

    if (fallbackContract === undefined) {
        // Fallback component not registered — hard fail
        return buildFailResult(
            originalIntent.component,
            [
                ...originalErrors,
                fallbackRenderedError(originalIntent.component, fallbackComponent),
                unknownComponentError(fallbackComponent),
            ],
            agent,
        );
    }

    // Build a minimal intent for the fallback component
    // The fallback receives error details as props (C6)
    const fallbackIntent: ComponentIntent = {
        component: fallbackComponent,
        props: {
            originalComponent: originalIntent.component,
            errors: originalErrors.map((e) => ({
                code: e.code,
                message: e.message,
                path: e.path,
            })),
            originalProps: originalIntent.props,
        },
        confidence: 1.0,
        _source: originalIntent._source,
    } as ComponentIntent;

    // Compile the fallback through the full pipeline (L3: never bypassed)
    const fallbackResult = await runPipeline(
        fallbackIntent,
        fallbackContract,
        config,
        customSteps,
        agent,
        rawPropsSnapshot,
        selfCorrectionAttempts,
    );

    // If fallback itself fails, return a hard fail with all errors
    if (fallbackResult.status === 'fail') {
        return {
            ...fallbackResult,
            errors: Object.freeze([
                ...originalErrors,
                fallbackRenderedError(originalIntent.component, fallbackComponent),
                ...fallbackResult.errors,
            ]),
        };
    }

    // Successful fallback — return with ENS-2006 informational error
    return {
        ...fallbackResult,
        errors: Object.freeze([
            ...originalErrors,
            fallbackRenderedError(originalIntent.component, fallbackComponent),
        ]),
    };
}
