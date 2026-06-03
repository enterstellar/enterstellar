/**
 * @module @enterstellar-ai/compiler/create-compiler
 * @description Factory for creating an `EnterstellarCompiler` instance.
 *
 * `createCompiler(config)` returns a plain object with closures — no class
 * instance, no prototype chain. Consistent with the `createRegistry()` pattern.
 *
 * The factory:
 * 1. Validates the `CompilerConfig`.
 * 2. Creates an internal parse cache (C17) wired to registry events.
 * 3. Returns an `EnterstellarCompiler` with `compile()`, `lint()`, and `use()`.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C3 — optional cache accepted.
 * @see Design Choice C17 — internal cache created by factory.
 * @see Design Choice C18 — `use()` registers custom middleware.
 */

import type { CompilationResult, ComponentIntent } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

import type {
    EnterstellarCompiler,
    CompilationStep,
    CompilerConfig,
    CompileOptions,
    LintResult,
    SelfCorrectionConfig,
} from './types.js';
import { createCompilationCache } from './cache.js';
import { compile } from './compile.js';
import { lint } from './lint.js';

// ---------------------------------------------------------------------------
// Config Defaults
// ---------------------------------------------------------------------------

/**
 * Default values for `CompilerConfig` optional fields.
 * Applied when the user provides a partial config.
 */
const CONFIG_DEFAULTS = {
    strictDesignTokens: true,
    autoAccessibility: true,
    maxNestingDepth: 10,
    includeDiff: true,
    onValidationFailure: {
        strategy: 'self-correct' as const,
        maxRetries: 2,
        fallbackComponent: 'GenericCard',
    },
} as const;

/** Minimum allowed Levenshtein distance for enum matching (SC-12). */
const MIN_ENUM_THRESHOLD = 1;

/** Maximum allowed Levenshtein distance for enum matching (SC-12). */
const MAX_ENUM_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------

/** Minimum allowed nesting depth (P4). */
const MIN_NESTING_DEPTH = 3;

/** Maximum allowed nesting depth (P4). */
const MAX_NESTING_DEPTH = 20;

/**
 * Validates and normalizes a `CompilerConfig`, applying defaults
 * for unspecified optional fields.
 *
 * @param config - The user-provided config (may be partial).
 * @returns A fully resolved `CompilerConfig`.
 * @throws {EnterstellarError} If critical config values are invalid.
 */
function resolveConfig(config: CompilerConfigInput): CompilerConfig {
    // --- SC-09: Backward compatibility for onCorrection → selfCorrection.llm ---
    // If both APIs are provided, selfCorrection.llm takes precedence.
    // Emit a deprecation warning to stderr so consumers know to migrate.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- SC-09: deliberate access for backward compat migration
    if (config.onCorrection !== undefined && config.selfCorrection?.llm !== undefined) {
        console.warn(
            '[@enterstellar-ai/compiler] DEPRECATION: Both `onCorrection` and `selfCorrection.llm` are set. ' +
            '`selfCorrection.llm` takes precedence. Remove `onCorrection` to silence this warning.',
        );
    }

    // Build base config without optional fields.
    // With `exactOptionalPropertyTypes: true`, we must conditionally spread
    // the field only when defined — assigning `undefined` explicitly is illegal.
    const base = {
        registry: config.registry,
        strictDesignTokens: config.strictDesignTokens ?? CONFIG_DEFAULTS.strictDesignTokens,
        autoAccessibility: config.autoAccessibility ?? CONFIG_DEFAULTS.autoAccessibility,
        maxNestingDepth: config.maxNestingDepth ?? CONFIG_DEFAULTS.maxNestingDepth,
        includeDiff: config.includeDiff ?? CONFIG_DEFAULTS.includeDiff,
        onValidationFailure: config.onValidationFailure ?? CONFIG_DEFAULTS.onValidationFailure,
    };

    const resolved: CompilerConfig = {
        ...base,
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- SC-09: forward deprecated field to resolved config
        ...(config.onCorrection !== undefined
            ? { onCorrection: config.onCorrection } // eslint-disable-line @typescript-eslint/no-deprecated -- SC-09
            : {}),
        ...(config.onTelemetry !== undefined
            ? { onTelemetry: config.onTelemetry }
            : {}),
        ...(config.selfCorrection !== undefined
            ? { selfCorrection: config.selfCorrection }
            : {}),
    };

    // Validate nesting depth range (P4: 3–20)
    if (
        resolved.maxNestingDepth < MIN_NESTING_DEPTH ||
        resolved.maxNestingDepth > MAX_NESTING_DEPTH
    ) {
        throw new EnterstellarError(
            'ENS-2001',
            'compiler',
            `maxNestingDepth must be between ${String(MIN_NESTING_DEPTH)} and ${String(MAX_NESTING_DEPTH)}, received ${String(resolved.maxNestingDepth)}.`,
            false,
        );
    }

    // Validate fallback component is not empty
    if (resolved.onValidationFailure.fallbackComponent.trim() === '') {
        throw new EnterstellarError(
            'ENS-2001',
            'compiler',
            'onValidationFailure.fallbackComponent must not be empty.',
            false,
        );
    }

    // Validate enumMatchThreshold range (SC-12: 1–5)
    const threshold = resolved.selfCorrection?.enumMatchThreshold;
    if (threshold !== undefined && (threshold < MIN_ENUM_THRESHOLD || threshold > MAX_ENUM_THRESHOLD)) {
        throw new EnterstellarError(
            'ENS-2001',
            'compiler',
            `selfCorrection.enumMatchThreshold must be between ${String(MIN_ENUM_THRESHOLD)} and ${String(MAX_ENUM_THRESHOLD)}, received ${String(threshold)}.`,
            false,
        );
    }

    return resolved;
}

// ---------------------------------------------------------------------------
// Input Type (partial config)
// ---------------------------------------------------------------------------

/**
 * User-facing input for `createCompiler()`.
 *
 * Only `registry` is required. All other fields have safe defaults.
 * Uses `Partial` for optional fields to provide ergonomic DX.
 */
export type CompilerConfigInput = {
    /** The registry to validate intents against. Required. */
    readonly registry: CompilerConfig['registry'];
    /** Validation failure handling. Default: self-correct with 2 retries. */
    readonly onValidationFailure?: CompilerConfig['onValidationFailure'];
    /** Strict token enforcement. Default: `true`. */
    readonly strictDesignTokens?: boolean;
    /** Auto-inject accessibility attrs. Default: `true`. */
    readonly autoAccessibility?: boolean;
    /** Max nesting depth. Default: `10`, range: 3–20. */
    readonly maxNestingDepth?: number;
    /** Include raw/compiled diff. Default: `true`. */
    readonly includeDiff?: boolean;
    /**
     * Self-correction configuration for the 3-tier architecture.
     * Default: `{ deterministic: true }` — Tier 1 + 2 enabled, no LLM.
     *
     * @see Design Choice SC-08.
     */
    readonly selfCorrection?: SelfCorrectionConfig;
    /**
     * Self-correction callback for Tier 3 (LLM).
     *
     * @deprecated Use `selfCorrection.llm` instead. Preserved for backward
     * compatibility (SC-09). If both are provided, `selfCorrection.llm` wins.
     */
    readonly onCorrection?: CompilerConfig['onCorrection'];
    /**
     * Optional telemetry recorder. Injected by `Provider` (TL1).
     * Structurally compatible with `TelemetryCollector.record()`.
     *
     * @see Design Choice TL1
     */
    readonly onTelemetry?: CompilerConfig['onTelemetry'];
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarCompiler` instance.
 *
 * Returns a plain object with closures — no class, no prototype chain.
 * The factory creates an internal parse cache wired to the registry's
 * mutation events for automatic invalidation (C17).
 *
 * @param configInput - User-provided configuration (only `registry` required).
 * @returns An `EnterstellarCompiler` with `compile()`, `lint()`, and `use()` methods.
 * @throws {EnterstellarError} If `configInput` contains invalid values.
 *
 * @see Design Choice C3 — compiler-level cache for dedup.
 * @see Design Choice C17 — cache cleared on registry update.
 * @see Design Choice C18 — `use()` for custom middleware.
 *
 * @example
 * ```ts
 * import { createCompiler } from '@enterstellar-ai/compiler';
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 *
 * const registry = createRegistry({ components: [PatientVitals] });
 * const compiler = createCompiler({ registry });
 *
 * const result = await compiler.compile(intent, { agent: 'gpt-4o' });
 *
 * // Register a custom HIPAA validation step
 * compiler.use(async (ctx, next) => {
 *   if (containsPHI(ctx.props)) {
 *     ctx.errors.push(hipaaError());
 *     return ctx;
 *   }
 *   return next();
 * });
 * ```
 */
export function createCompiler(configInput: CompilerConfigInput): EnterstellarCompiler {
    const config = resolveConfig(configInput);
    const customSteps: CompilationStep[] = [];

    // Create internal cache wired to registry events (C17)
    const cache = createCompilationCache(500, (event, handler) =>
        config.registry.on(event, handler),
    );

    return {
        async compile(
            intent: ComponentIntent,
            options?: CompileOptions,
        ): Promise<CompilationResult> {
            return compile(intent, config, customSteps, cache, options);
        },

        async lint(
            intent: ComponentIntent,
        ): Promise<LintResult> {
            return lint(intent, config, customSteps);
        },

        use(step: CompilationStep): void {
            customSteps.push(step);
        },
    };
}
