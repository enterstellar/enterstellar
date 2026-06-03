/**
 * @module @enterstellar-ai/compiler/types
 * @description Compiler-local type definitions.
 *
 * These types are internal to `@enterstellar-ai/compiler` and define the configuration,
 * pipeline context, middleware step signature, self-correction context, and
 * warning structures used throughout the compilation process.
 *
 * **Naming:** Types for data shapes (`CompilerConfig`, `CompilationContext`),
 * consistent with Design Choice T1. The middleware step is a function type,
 * not an interface — it has no methods, only a callable signature.
 *
 * **L15 compliance:** Zero framework imports. All types are platform-agnostic.
 *
 * @see Implementation Bible §4.2
 * @see Design Choices C1–C20
 */

import type {
    CompilationError,
    CompilationResult,
    ComponentContract,
    ComponentIntent,
    DesignTokenSet,
    ForgeMode,
    IntentCategory,
} from '@enterstellar-ai/types';

import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

// ---------------------------------------------------------------------------
// Telemetry Recorder (dependency inversion for TL1)
// ---------------------------------------------------------------------------

/**
 * Narrow callback type for telemetry signal recording.
 *
 * Structurally compatible with `TelemetryCollector.record()` from
 * `@enterstellar-ai/telemetry`. The compiler defines this locally to avoid
 * a circular dependency (`telemetry → compiler → telemetry`).
 *
 * The Provider injects the real `TelemetryCollector.record()` method
 * when creating the compiler. Standalone compiler use (tests, CLI)
 * simply omits this parameter — no telemetry is recorded.
 *
 * @see Design Choice TL1 — compiler records compilation signals automatically.
 * @see Bible §4.2 — compiler deps do not include telemetry.
 */
export type TelemetryRecordInput = {
    /** Raw intent string from the user. Hashed internally by telemetry. */
    readonly rawIntent: string;
    /** PascalCase name of the resolved component. */
    readonly componentName: string;
    /** Classification of the intent. */
    readonly intentCategory: IntentCategory;
    /** Whether compilation passed, failed, or was self-corrected. */
    readonly compilationStatus: 'pass' | 'fail' | 'corrected';
    /** Forge mode used. Compiler always passes `'none'`. */
    readonly forgeMode: ForgeMode;
    /** Whether Forge was invoked. Compiler always passes `false`. */
    readonly forgeUsed: boolean;
    /** Total pipeline latency in milliseconds. */
    readonly latencyMs: number;
    /** Number of self-correction attempts. */
    readonly selfCorrectionAttempts: number;
    /** Tokens consumed by self-correction. */
    readonly correctionTokensUsed: number;
    /**
     * Count of Tier 1 (deterministic) corrections applied in this compilation.
     * Populated when the self-correction module is active.
     *
     * @see Design Choice SC-18 — correction tier breakdown for analytics.
     */
    readonly deterministicCorrections?: number;
    /**
     * Count of Tier 2 (template/example-based) corrections applied.
     * Populated when the self-correction module is active.
     *
     * @see Design Choice SC-18 — correction tier breakdown for analytics.
     */
    readonly templateCorrections?: number;
    /**
     * Which correction tier ultimately resolved the compilation.
     * - `0` — no correction needed (pass on first attempt).
     * - `1` — Tier 1 (deterministic) fixed all errors.
     * - `2` — Tier 2 (template) fixed remaining errors after Tier 1.
     * - `3` — Tier 3 (LLM) was required to fix remaining errors.
     *
     * @see Design Choice SC-18 — which tier earned the correction.
     */
    readonly correctionTier?: 0 | 1 | 2 | 3;
};

/**
 * Callback for recording telemetry signals.
 *
 * Matches the signature of `TelemetryCollector.record()` from
 * `@enterstellar-ai/telemetry` via structural typing.
 *
 * @see Design Choice TL1
 */
export type TelemetryRecorder = (input: TelemetryRecordInput) => void;

// ---------------------------------------------------------------------------
// Validation Failure Strategy
// ---------------------------------------------------------------------------

/**
 * Strategy for handling validation failures during compilation.
 *
 * - `'self-correct'` — invoke the `onCorrection` callback to retry (C4).
 * - `'fallback'` — render the `fallbackComponent` immediately (C6).
 * - `'reject'` — return a `'fail'` result with errors, no fallback.
 *
 * @see Design Choice C6 — fallback is the default after exhausted retries.
 */
export type ValidationFailureStrategy = 'self-correct' | 'fallback' | 'reject';

// ---------------------------------------------------------------------------
// Validation Failure Config
// ---------------------------------------------------------------------------

/**
 * Configuration for how the compiler handles validation failures.
 *
 * @see Design Choice C4 — callback-based self-correction.
 * @see Design Choice C6 — fallback component after max retries.
 */
export type ValidationFailureConfig = {
    /** Strategy to use when validation fails. */
    readonly strategy: ValidationFailureStrategy;
    /** Maximum self-correction retries before fallback. Default: `2`. */
    readonly maxRetries: number;
    /** PascalCase name of the fallback component in the registry. */
    readonly fallbackComponent: string;
};

// ---------------------------------------------------------------------------
// Self-Correction Callback Context (C4, C5)
// ---------------------------------------------------------------------------

/**
 * Context passed to the `onCorrection` callback during self-correction.
 *
 * Contains the original intent, the target component's schema in compact
 * manifest format, and the validation errors to correct.
 *
 * @see Design Choice C4 — consumer-provided correction callback.
 * @see Design Choice C5 — all three: errors + intent + schema.
 */
export type CorrectionContext = {
    /** The original `ComponentIntent` that failed validation. */
    readonly intent: ComponentIntent;
    /** Compact manifest representation of the target component's prop schema. */
    readonly schema: Readonly<Record<string, unknown>>;
    /** Validation errors that need correction. */
    readonly errors: readonly CompilationError[];
};

/**
 * The expected return shape from the self-correction callback.
 * Contains the corrected component name and props to re-validate.
 */
export type CorrectionResult = {
    /** PascalCase name of the target component (may be unchanged). */
    readonly component: string;
    /** Corrected props to re-validate against the contract schema. */
    readonly props: Readonly<Record<string, unknown>>;
};

/**
 * Self-correction callback signature.
 *
 * The consumer (typically `Provider`) wires this to the agent connection.
 * The compiler itself has zero transport knowledge — it only calls this
 * function and awaits corrected output.
 *
 * @see Design Choice C4 — callback pattern keeps compiler testable.
 */
export type CorrectionCallback = (
    errors: readonly CompilationError[],
    context: CorrectionContext,
) => Promise<CorrectionResult>;

// ---------------------------------------------------------------------------
// Deterministic Correction Types (SC-01, SC-04, SC-08, SC-11)
// ---------------------------------------------------------------------------

/**
 * Deterministic correction strategies used by Tier 1 and Tier 2.
 *
 * Each strategy maps to a specific correction primitive:
 * - `'type-coercion'` — `string "72"` → `number 72` (§3.4 Strategy 1)
 * - `'boolean-coercion'` — `"yes"` → `true`, `1` → `true` (§3.4 Strategy 2)
 * - `'default-extraction'` — missing field → `z.default()` value (§3.4 Strategy 3)
 * - `'enum-nearest'` — `"defualt"` → `"default"` via Levenshtein (§3.4 Strategy 4)
 * - `'token-nearest'` — `"token:denger"` → `"token:danger"` (§3.4 Strategy 5)
 * - `'example-fallback'` — missing field → value from `contract.examples[0].props` (§4.5)
 *
 * @see Design Choice SC-04 — 4 Tier 1 strategies + 1 Tier 2 strategy.
 * @see Design Choice SC-11 — traces record which strategy was used.
 */
export type CorrectionStrategy =
    | 'type-coercion'
    | 'boolean-coercion'
    | 'default-extraction'
    | 'enum-nearest'
    | 'token-nearest'
    | 'example-fallback';

/**
 * A single correction applied during deterministic self-correction.
 *
 * Traces are generated internally by every correction attempt and serve
 * two consumers:
 * 1. **DevTools** — when `selfCorrection.trace === true`, traces are included
 *    on `CompilationResult.correctionTrace` for visual debugging.
 * 2. **Telemetry** — correction counts and tier breakdown are always computed
 *    from traces, regardless of the `trace` config flag.
 *
 * @see Design Choice SC-11 — trace entry records tier, field, and strategy.
 */
export type CorrectionTraceEntry = {
    /** Which tier applied this correction (`1` = deterministic, `2` = template). */
    readonly tier: 1 | 2;
    /** The error code that was corrected (e.g., `'ENS-2001'`, `'ENS-2002'`). */
    readonly errorCode: string;
    /** The field path that was corrected (e.g., `'age'`, `'riskLevel'`). */
    readonly field: string;
    /** The original invalid value (`undefined` for missing-field errors). */
    readonly was: unknown;
    /** The corrected value that replaced the original. */
    readonly correctedTo: unknown;
    /** The correction strategy used to produce this fix. */
    readonly strategy: CorrectionStrategy;
};

/**
 * Result of a deterministic correction attempt (Tier 1 + Tier 2).
 *
 * Returned by `attemptDeterministicCorrection()`. The `remaining` array
 * creates a clean handoff between tiers — each tier works on a shrinking
 * error set. If `corrected` is `true`, ALL errors were resolved.
 *
 * @see Design Choice SC-01 — deterministic correction before LLM.
 * @see Design Choice SC-16 — short-circuit when `remaining.length === 0`.
 */
export type DeterministicCorrectionResult = {
    /** Whether ALL errors were corrected by deterministic means. */
    readonly corrected: boolean;
    /** The corrected props object (new object — inputs are not mutated). */
    readonly props: Readonly<Record<string, unknown>>;
    /** Errors that could not be fixed deterministically. */
    readonly remaining: readonly CompilationError[];
    /** Trace of which corrections were applied (for DevTools and telemetry). */
    readonly trace: readonly CorrectionTraceEntry[];
};

/**
 * Configuration for the 3-tier self-correction system.
 *
 * Replaces the flat `onCorrection` callback with a structured config
 * that supports deterministic correction (Tier 1 + 2) and optional
 * LLM correction (Tier 3).
 *
 * **Zero-config default:** When `selfCorrection` is omitted or
 * `deterministic` is unset, Tier 1 + 2 are enabled automatically.
 * This means every compiler instance gets deterministic self-healing
 * out of the box — no LLM, no callback, no configuration needed.
 *
 * @see Design Choice SC-08 — API surface: `{ deterministic, llm, trace, enumMatchThreshold }`.
 * @see Design Choice SC-09 — backward-compatible with `onCorrection`.
 */
export type SelfCorrectionConfig = {
    /**
     * Whether to enable deterministic correction (Tier 1 + Tier 2).
     * Default: `true`. Set to `false` to skip deterministic correction
     * entirely and go straight to LLM correction (Tier 3).
     *
     * When `true` (default): the compiler attempts type coercion,
     * default extraction, enum fuzzy matching, token nearest-match,
     * and example fallback BEFORE invoking the LLM.
     */
    readonly deterministic?: boolean;

    /**
     * Optional LLM correction function for Tier 3.
     * When provided, the compiler invokes this function for errors
     * that couldn't be fixed deterministically.
     *
     * Replaces the deprecated `onCorrection` callback. This is the
     * same function type — just moved into the `selfCorrection` namespace
     * for ergonomic grouping.
     *
     * @see Design Choice C4 — callback pattern keeps compiler testable.
     */
    readonly llm?: CorrectionCallback;

    /**
     * Whether to include correction trace data in the compilation result.
     * Default: `false` in production, `true` when DevTools are attached.
     *
     * When `true`: `CompilationResult.correctionTrace` is populated
     * with which tier corrected which error. Feeds the DevTools
     * Performance Profiler.
     *
     * @see Design Choice SC-11 — `CorrectionTraceEntry` design.
     */
    readonly trace?: boolean;

    /**
     * Maximum Levenshtein distance for enum fuzzy matching.
     * Default: `2`. Range: `1–5`.
     *
     * Lower values are more conservative (only obvious typos).
     * Higher values are more aggressive (risks semantic changes).
     * At `2`, only unambiguous typos correct: `"daner"` → `"danger"` (1),
     * `"warnning"` → `"warning"` (1). `"danger"` → `"warning"` (6) is
     * never corrected.
     *
     * @default 2
     * @see Design Choice SC-12 — Levenshtein threshold.
     */
    readonly enumMatchThreshold?: number;
};

// ---------------------------------------------------------------------------
// Compiler Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for `createCompiler()`.
 *
 * All fields have documented defaults. The registry is the only required
 * field — all others fall back to safe, strict defaults.
 *
 * @see Design Choice C3 — optional cache instance.
 * @see Design Choice C8 — `strictDesignTokens` default: `true`.
 * @see Design Choice C10 — `autoAccessibility` per-component.
 * @see Design Choice P4 — `maxNestingDepth` range: 3–20.
 * @see Design Choice C13 — `includeDiff` for DevTools.
 */
export type CompilerConfig = {
    /** The registry to validate intents against. Required. */
    readonly registry: EnterstellarRegistry;
    /** Validation failure handling strategy and limits. */
    readonly onValidationFailure: ValidationFailureConfig;
    /**
     * Whether to enforce strict design token compliance.
     * When `true` (default), non-token visual values are rejected.
     * When `false`, coerces to nearest token by semantic category after retries.
     *
     * @see Design Choice C8
     */
    readonly strictDesignTokens: boolean;
    /**
     * Whether to auto-inject accessibility attributes for missing ARIA attrs.
     * Injects `role` and `aria-*` only — never `tabindex`.
     *
     * @see Design Choice C10
     */
    readonly autoAccessibility: boolean;
    /**
     * Maximum allowed nesting depth for `ComponentIntent` trees.
     * Range: 3–20. Default: `10`.
     *
     * @see Design Choice P4
     */
    readonly maxNestingDepth: number;
    /**
     * Whether to include a diff between raw and compiled props in the result.
     * Default: `true` (useful for DevTools). Set to `false` in production.
     *
     * @see Design Choice C13
     */
    readonly includeDiff: boolean;
    /**
     * Self-correction configuration for the 3-tier architecture.
     *
     * When omitted, deterministic correction (Tier 1 + 2) is still enabled
     * by default — the compiler self-heals common LLM errors without any
     * configuration. Set `selfCorrection: { deterministic: false }` to
     * disable deterministic correction entirely.
     *
     * @see Design Choice SC-08 — structured self-correction config.
     * @see Design Choice SC-01 — 3-tier architecture.
     */
    readonly selfCorrection?: SelfCorrectionConfig;
    /**
     * Optional self-correction callback for Tier 3 (LLM) correction.
     *
     * @deprecated Use `selfCorrection.llm` instead. This field is preserved
     * for backward compatibility. If both `onCorrection` and `selfCorrection.llm`
     * are provided, `selfCorrection.llm` takes precedence and a deprecation
     * warning is emitted.
     *
     * @see Design Choice SC-09 — backward-compatible migration.
     * @see Design Choice C4 — callback pattern.
     */
    readonly onCorrection?: CorrectionCallback;
    /**
     * Optional telemetry recorder. When provided, the compiler calls this
     * after every `compile()` invocation to emit a `ForgeSignal` (TL1).
     *
     * Structurally compatible with `TelemetryCollector.record()`.
     * Injected by `Provider` at creation time. Standalone compiler
     * use (tests, CLI) omits this — no telemetry is recorded.
     *
     * @see Design Choice TL1 — compiler records compilation signals automatically.
     */
    readonly onTelemetry?: TelemetryRecorder;
};

// ---------------------------------------------------------------------------
// Compilation Warning (non-fatal)
// ---------------------------------------------------------------------------

/**
 * A non-fatal warning generated during compilation.
 *
 * Warnings are logged in the trace but do not cause compilation failure.
 * Examples: stripped unknown props (P10), token coercion (C8 non-strict).
 */
export type CompilationWarning = {
    /** Warning code (e.g., `'ENS-2007'` for token coercion). */
    readonly code: string;
    /** Dot-path to the relevant field (e.g., `'props.color'`). */
    readonly path: string;
    /** Human-readable warning message. */
    readonly message: string;
};

// ---------------------------------------------------------------------------
// Lint Result
// ---------------------------------------------------------------------------

/**
 * The output of `compiler.lint()` — validation results without a full
 * `CompilationResult`.
 *
 * Separates errors (fatal validation failures) from warnings (non-fatal
 * advisories like stripped props or token coercion). The migration pipeline
 * (Phase 3) uses both to determine the 4-level outcome model:
 *
 * | Errors | Warnings | Outcome   |
 * |:-------|:---------|:----------|
 * | 0      | 0        | `CLEAN`   |
 * | 0      | >0       | `WARN`    |
 * | >0     | any      | `REVIEW`  |
 *
 * @see Design Choice C19 — lint mode.
 */
export type LintResult = {
    /** Validation errors encountered during linting. Empty if the intent is valid. */
    readonly errors: readonly CompilationError[];
    /** Non-fatal warnings (stripped unknown props, token coercion). */
    readonly warnings: readonly CompilationWarning[];
};

// ---------------------------------------------------------------------------
// Compilation Context (mutable pipeline state)
// ---------------------------------------------------------------------------

/**
 * Mutable context object passed through the compilation pipeline.
 *
 * Each middleware step reads from and writes to this context. Immutable
 * fields (intent, contract, registry, config) are set once at pipeline
 * start. Mutable fields are accumulated by each step.
 *
 * @see Design Choice C1 — middleware pattern.
 * @see Design Choice C18 — custom steps receive this context.
 */
export type CompilationContext = {
    // --- Immutable (set once at pipeline start) ---

    /** The original `ComponentIntent` being compiled. */
    readonly intent: ComponentIntent;
    /** The resolved `ComponentContract` from the registry. */
    readonly contract: ComponentContract;
    /** The registry instance for lookups. */
    readonly registry: EnterstellarRegistry;
    /** The compiler configuration. */
    readonly config: CompilerConfig;
    /** Design tokens from the registry, cached for the pipeline. */
    readonly designTokens: DesignTokenSet;
    /** Agent identifier passed by the consumer (C12). */
    readonly agent: string;

    // --- Mutable (accumulated by pipeline steps) ---

    /** Current props state — mutated by parse, token, and a11y steps. */
    props: Record<string, unknown>;
    /** Compilation errors accumulated during the pipeline. */
    errors: CompilationError[];
    /** Non-fatal warnings (stripped props, token coercion). */
    warnings: CompilationWarning[];
    /** Names of props that were stripped by the parse step (P10). */
    strippedProps: string[];
    /** Count of token overrides applied during token enforcement. */
    tokenCoercions: number;
    /** Names of accessibility attributes auto-injected by the a11y step. */
    accessibilityInjections: string[];
};

// ---------------------------------------------------------------------------
// Compilation Step (middleware signature)
// ---------------------------------------------------------------------------

/**
 * A single step in the compilation pipeline.
 *
 * Steps are composable async functions following the middleware pattern.
 * Each step receives the current `CompilationContext` and a `next` function
 * to invoke the downstream pipeline. Steps may modify the context, add
 * errors/warnings, or short-circuit by not calling `next`.
 *
 * @see Design Choice C1 — standalone, composable functions.
 * @see Design Choice C18 — consumers register custom steps via `compiler.use()`.
 *
 * @example
 * ```ts
 * const hipaaCheck: CompilationStep = async (context, next) => {
 *   if (containsPHI(context.props)) {
 *     context.errors.push(createHipaaError(context));
 *     return context; // short-circuit — do not call next()
 *   }
 *   return next();
 * };
 * ```
 */
export type CompilationStep = (
    context: CompilationContext,
    next: () => Promise<CompilationContext>,
) => Promise<CompilationContext>;

// ---------------------------------------------------------------------------
// Compile Options
// ---------------------------------------------------------------------------

/**
 * Options passed to `compiler.compile()` and `compiler.lint()`.
 *
 * @see Design Choice C12 — `agent` is an explicit parameter.
 * @see Design Choice TL1 — telemetry fields passed from caller.
 */
export type CompileOptions = {
    /**
     * Identifier of the AI agent/model that generated the intent.
     * Explicit dependency injection — the compiler does not infer this.
     *
     * @see Design Choice C12
     */
    readonly agent?: string;

    /**
     * Raw intent string from the user. Used for telemetry (TL1/TL3).
     * If not provided, falls back to `intent.component` name.
     * Hashed to SHA-256 by the telemetry recorder — never stored raw.
     *
     * @see Design Choice TL3
     */
    readonly rawIntent?: string;

    /**
     * Classification of the intent. Used for telemetry (TL1).
     * If not provided, defaults to `'utility'`.
     */
    readonly intentCategory?: IntentCategory;
};

// ---------------------------------------------------------------------------
// EnterstellarCompiler Interface
// ---------------------------------------------------------------------------

/**
 * The Enterstellar UI Compiler — the type checker of GenUI.
 *
 * Created via `createCompiler(config)`. Returns a plain object with closures —
 * no class instance, no prototype chain (consistent with registry factory).
 *
 * @see Implementation Bible §4.2
 * @see Design Choices C1–C20
 *
 * @example
 * ```ts
 * import { createCompiler } from '@enterstellar-ai/compiler';
 * import { createRegistry } from '@enterstellar-ai/registry';
 *
 * const registry = createRegistry({ components: [...] });
 * const compiler = createCompiler({
 *   registry,
 *   onValidationFailure: { strategy: 'self-correct', maxRetries: 2, fallbackComponent: 'GenericCard' },
 *   strictDesignTokens: true,
 *   autoAccessibility: true,
 *   maxNestingDepth: 10,
 *   includeDiff: true,
 * });
 *
 * const result = await compiler.compile(intent, { agent: 'gpt-4o' });
 * ```
 */
export interface EnterstellarCompiler {
    /**
     * Compiles a `ComponentIntent` against its `ComponentContract`.
     *
     * Runs the full pipeline: resolve → parse → tokens → accessibility → trace.
     * Handles self-correction if configured. Never throws — always returns a
     * `CompilationResult` with status `'pass'`, `'corrected'`, or `'fail'`.
     *
     * @param intent - The `ComponentIntent` from the normalizer or agent.
     * @param options - Optional compile-time parameters (e.g., `agent` identifier).
     * @returns A `CompilationResult` with validated props, provenance, and errors.
     *
     * @see Design Choice C2 — async (self-correction requires LLM calls).
     * @see Design Choice C12 — agent passed via explicit parameter.
     */
    compile(
        intent: ComponentIntent,
        options?: CompileOptions,
    ): Promise<CompilationResult>;

    /**
     * Validates a `ComponentIntent` without producing a full `CompilationResult`.
     *
     * Returns only the validation errors. No provenance, no trace emission.
     * Used by `@enterstellar-ai/test` for assertions and CI pipelines.
     *
     * @param intent - The `ComponentIntent` to validate.
     * @returns A `LintResult` containing validation errors and non-fatal warnings.
     *
     * @see Design Choice C19 — lint mode.
     */
    lint(intent: ComponentIntent): Promise<LintResult>;

    /**
     * Registers a custom middleware step in the compilation pipeline.
     *
     * Custom steps are inserted after the built-in steps (resolve, parse,
     * token, accessibility) and before the trace step. Insertion order
     * determines execution order.
     *
     * @param step - A `CompilationStep` function.
     *
     * @see Design Choice C18 — plugin middleware API.
     */
    use(step: CompilationStep): void;
}
