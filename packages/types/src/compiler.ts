/**
 * @module @enterstellar-ai/types/compiler
 * @description Compilation result types — the output of the Enterstellar UI Compiler.
 *
 * After the compiler validates a `ComponentIntent` against its
 * `ComponentContract`, it produces a `CompilationResult` with provenance,
 * validation status, and any errors encountered.
 *
 * @see Bible §3.3
 * @see Design Choices C1–C20, T1, T5, T11
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// String Union Types
// ---------------------------------------------------------------------------

/**
 * Compilation outcome status.
 * - `'pass'` — intent validated successfully, component is safe to render.
 * - `'fail'` — validation failed, fallback should be rendered.
 * - `'corrected'` — LLM self-correction fixed the original errors.
 */
export type CompilationStatus = 'pass' | 'fail' | 'corrected';

// ---------------------------------------------------------------------------
// Nested Data Types (per T11 — standalone named types)
// ---------------------------------------------------------------------------

/**
 * Provenance metadata attached to every compilation result.
 * Tracks the agent, registry, and compiler that produced the result
 * for auditability and the trust frame.
 *
 * @see Design Choice C12 — consumer passes `agent` via explicit parameter.
 */
export type CompilationProvenance = {
    /** Identifier of the AI agent/model that generated the intent (e.g., `'gpt-4o'`). */
    readonly agent: string;
    /** URL or name of the registry used for component resolution. */
    readonly registry: string;
    /** ISO 8601 timestamp when compilation occurred. */
    readonly compiledAt: string;
    /** Semantic version of the compiler that produced this result. */
    readonly compilerVersion: string;
    /** Forge mode used, if the component was forged. `undefined` for registry components. */
    readonly forgeMode?: 'local' | 'cloud';
    /** Origin metadata for the resolved contract, if it came from a remote registry. */
    readonly contractOrigin?: {
        /** URL of the originating registry. */
        readonly registryUrl: string;
        /** Publisher of the contract. */
        readonly publisher: string;
    };
};

/**
 * Machine-readable suggestion for fixing a compilation error.
 * Enables auto-fix in DevTools, self-correction loops, and CI reporting.
 *
 * @see Design Choice C15
 */
export type CompilationFix = {
    /** The prop field path that should be changed (e.g., `'tokens.color'`). */
    readonly field: string;
    /** The invalid value that was provided. */
    readonly was: unknown;
    /** The correct value that should be used instead. */
    readonly shouldBe: unknown;
};

/**
 * A single compilation error with a machine-readable code, path, and optional fix.
 *
 * @see Design Choice C14 — `ENS-2xxx` codes for compiler errors.
 * @see Design Choice C15 — all errors include a `fix` suggestion where applicable.
 */
export type CompilationError = {
    /** Machine-readable error code (e.g., `'ENS-2001'`). */
    readonly code: string;
    /** Dot-path to the invalid field (e.g., `'props.riskLevel'`). */
    readonly path: string;
    /** Human-readable error message. */
    readonly message: string;
    /** The value that was received. */
    readonly received?: unknown;
    /** The value that was expected. */
    readonly expected?: unknown;
    /** Machine-readable fix suggestion, if applicable. */
    readonly fix?: CompilationFix;
};

// ---------------------------------------------------------------------------
// CompilationResult Type
// ---------------------------------------------------------------------------

/**
 * The output of the Enterstellar UI Compiler after validating a `ComponentIntent`.
 *
 * Contains the resolved component name, validated props, compilation status,
 * provenance for auditability, and any errors encountered during validation.
 *
 * @see Bible §3.3
 */
export type CompilationResult = {
    /** PascalCase name of the resolved component. */
    readonly componentName: string;
    /** Validated props after schema parsing, token enforcement, and accessibility injection. */
    readonly props: Readonly<Record<string, unknown>>;
    /** Compilation outcome status. */
    readonly status: CompilationStatus;
    /** Provenance metadata for tracing and the trust frame. */
    readonly provenance: CompilationProvenance;
    /** Validation errors encountered during compilation. Empty if `status === 'pass'`. */
    readonly errors: readonly CompilationError[];
    /** Number of self-correction attempts made before final result. */
    readonly selfCorrectionAttempts: number;
    /**
     * Diff between raw LLM props and final compiled props.
     * Included when `includeDiff` config flag is `true` (default in dev, off in prod).
     *
     * @see Design Choice C13
     */
    readonly diff?: {
        /** The raw props as received from the agent. */
        readonly raw: Readonly<Record<string, unknown>>;
        /** The final compiled props after correction, stripping, and injection. */
        readonly compiled: Readonly<Record<string, unknown>>;
    };
    /**
     * Correction trace for DevTools and performance profiling.
     *
     * Populated when `selfCorrection.trace === true` in the compiler config.
     * Each entry records a single correction applied by Tier 1 (deterministic)
     * or Tier 2 (template), including the field, original value, corrected value,
     * and the strategy used.
     *
     * Default: omitted in production. Enabled automatically when DevTools are
     * attached, or explicitly via `selfCorrection: { trace: true }`.
     *
     * @see Design Choice SC-11 — correction trace entry design.
     * @see Design Choice SC-08 — `trace` flag in `SelfCorrectionConfig`.
     */
    readonly correctionTrace?: readonly {
        /** Which tier applied this correction (`1` = deterministic, `2` = template). */
        readonly tier: 1 | 2;
        /** The error code that was corrected (e.g., `'ENS-2001'`). */
        readonly errorCode: string;
        /** The field path that was corrected. */
        readonly field: string;
        /** The original invalid value. */
        readonly was: unknown;
        /** The corrected value. */
        readonly correctedTo: unknown;
        /** The correction strategy used (e.g., `'type-coercion'`, `'enum-nearest'`). */
        readonly strategy: string;
    }[];
};

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating a `CompilationError` at runtime.
 *
 * @see Design Choice T7
 */
export const CompilationErrorSchema = z.object({
    code: z.string().min(1, 'Error code is required.'),
    path: z.string(),
    message: z.string().min(1, 'Error message is required.'),
    received: z.unknown().optional(),
    expected: z.unknown().optional(),
    fix: z
        .object({
            field: z.string().min(1),
            was: z.unknown(),
            shouldBe: z.unknown(),
        })
        .optional(),
});

/**
 * Zod schema for validating a `CompilationResult` at runtime.
 *
 * @see Design Choice T7
 */
export const CompilationResultSchema = z.object({
    componentName: z.string().min(1, 'Component name is required.'),
    props: z.record(z.string(), z.unknown()),
    status: z.enum(['pass', 'fail', 'corrected']),
    provenance: z.object({
        agent: z.string().min(1),
        registry: z.string().min(1),
        compiledAt: z.string().min(1),
        compilerVersion: z.string().min(1),
        forgeMode: z.enum(['local', 'cloud']).optional(),
        contractOrigin: z
            .object({
                registryUrl: z.string(),
                publisher: z.string(),
            })
            .optional(),
    }),
    errors: z.array(CompilationErrorSchema),
    selfCorrectionAttempts: z.number().int().min(0),
    diff: z
        .object({
            raw: z.record(z.string(), z.unknown()),
            compiled: z.record(z.string(), z.unknown()),
        })
        .optional(),
    correctionTrace: z
        .array(
            z.object({
                tier: z.union([z.literal(1), z.literal(2)]),
                errorCode: z.string().min(1),
                field: z.string().min(1),
                was: z.unknown(),
                correctedTo: z.unknown(),
                strategy: z.string().min(1),
            }),
        )
        .optional(),
});
