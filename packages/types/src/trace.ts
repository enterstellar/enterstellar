/**
 * @module @enterstellar-ai/types/trace
 * @description AgentTrace — the observability record for every Enterstellar pipeline execution.
 *
 * Every intent processed by Enterstellar produces an `AgentTrace` capturing intent,
 * resolution, compilation, determinism, and performance metrics. Traces power
 * the DevTools timeline, validation log, and performance profiler.
 *
 * @see Bible §3.4
 * @see Design Choices T5, T11
 * @see Appendix E P2 (correlationId), consent fields
 */

import { z } from 'zod';

import type { TraceId } from './brands.js';
import type { ComponentIntent } from './intent.js';
import type { CompilationProvenance, CompilationStatus, CompilationError } from './compiler.js';
import { CompilationErrorSchema } from './compiler.js';
import { ComponentIntentSchema } from './intent.js';

// ---------------------------------------------------------------------------
// Nested Data Types (per T11)
// ---------------------------------------------------------------------------

/**
 * Intent data captured in the trace.
 * Records what the agent requested.
 */
export type TraceIntent = {
    /** Raw intent string or component name from the agent. */
    readonly raw: string;
    /** Parsed component name after normalization. */
    readonly component: string;
    /** Confidence score from the agent (0.0–1.0). */
    readonly confidence: number;
    /** Display mode, if provided. */
    readonly mode?: string;
    /** Interaction type, if provided. */
    readonly interaction?: string;
};

/**
 * Resolution data captured in the trace.
 * Records how the intent was resolved to a component.
 */
export type TraceResolution = {
    /** How the component was resolved. */
    readonly strategy: 'exact' | 'semantic' | 'forge' | 'fallback';
    /** Name of the resolved component. */
    readonly resolvedComponent: string;
    /** Semantic similarity score, if semantic search was used. */
    readonly similarityScore?: number;
    /** Number of candidate components considered before selection. */
    readonly candidatesConsidered: number;
};

/**
 * Compilation data captured in the trace.
 * Records the compiler's validation outcome.
 */
export type TraceCompilation = {
    /** Final compilation status. */
    readonly status: 'pass' | 'fail' | 'corrected';
    /** Number of validation errors encountered (including self-corrected ones). */
    readonly errorCount: number;
    /** Number of self-correction attempts made. */
    readonly selfCorrectionAttempts: number;
    /** Whether design token enforcement was applied. */
    readonly tokensValidated: boolean;
    /** Whether accessibility attributes were auto-injected. */
    readonly accessibilityInjected: boolean;
};

/**
 * Determinism data captured in the trace.
 * Records the zone's determinism configuration at render time.
 */
export type TraceDeterminism = {
    /** Zone determinism level (0.0–1.0). */
    readonly level: number;
    /** Whether a cached result was used. */
    readonly cacheHit: boolean;
    /** The zone name this trace belongs to. */
    readonly zone: string;
};

/**
 * Performance metrics captured in the trace.
 * Powers the DevTools performance profiler.
 */
export type TraceMetrics = {
    /** Total pipeline latency in milliseconds (intent → rendered). */
    readonly totalMs: number;
    /** Time from intent reception to resolution in milliseconds. */
    readonly resolutionMs: number;
    /** Time from resolution to compilation completion in milliseconds. */
    readonly compilationMs: number;
    /** Time from compilation to rendered output in milliseconds. */
    readonly renderMs: number;
};

/**
 * User consent state for trace aggregation.
 * Required for Enterstellar Cloud's trace aggregation API (opt-in).
 *
 * @see Appendix E — TL10 (ForgeSignal vs AgentTrace consent distinction)
 */
export type TraceConsent = {
    /** Whether this trace can be aggregated anonymously for analytics. */
    readonly anonymizedAggregation: boolean;
};

// ---------------------------------------------------------------------------
// ZoneTrace Type (Zone-level precursor)
// ---------------------------------------------------------------------------

/**
 * Partial trace produced by `Zone` during compilation.
 *
 * `ZoneTrace` captures what the zone actually has at compile time:
 * intent, compilation status/errors, provenance, and zone-level metrics.
 * It does NOT include `resolution`, `determinism`, or `consent` fields —
 * those require the full compiler/lifecycle pipeline to produce.
 *
 * The fully resolved `AgentTrace` is assembled downstream by
 * `@enterstellar-ai/lifecycle` when all pipeline stages are complete.
 *
 * @see {@link AgentTrace} — the fully resolved trace with all pipeline stages.
 * @see Bible §5.3 — Zone specification.
 * @see Design Choice RE18 — `onError` callback receives this trace type.
 */
export type ZoneTrace = {
    /** Unique zone-trace identifier (format: `{zoneName}-{compilationId}-{timestamp}`). */
    readonly id: string;
    /** The raw `ComponentIntent` that triggered compilation. */
    readonly intent: ComponentIntent;
    /**
     * Compilation outcome data — status, errors, and self-correction attempts.
     * This is a subset of the full `TraceCompilation` shape.
     */
    readonly compilation: {
        /** Final compilation status (`pass`, `fail`, or `corrected`). */
        readonly status: CompilationStatus;
        /** Validation errors encountered during compilation. */
        readonly errors: readonly CompilationError[];
        /** Number of self-correction attempts made before final result. */
        readonly selfCorrectionAttempts: number;
    };
    /** Provenance metadata from the `CompilationResult`. */
    readonly provenance: CompilationProvenance;
    /**
     * Zone-level performance metrics.
     *
     * Unlike `TraceMetrics` (which breaks down resolution/compilation/render),
     * this only captures total latency and retry attempt count.
     */
    readonly metrics: {
        /** Total time from intent reception to render in milliseconds. */
        readonly totalMs: number;
        /** Current retry attempt number (0-indexed). */
        readonly retryAttempt: number;
    };
    /** ISO 8601 timestamp when this trace was created. */
    readonly timestamp: string;
};

// ---------------------------------------------------------------------------
// ZoneTrace Zod Schema (T7 — co-located schema for ZoneTrace)
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating a `ZoneTrace` at runtime.
 *
 * This is the **canonical single-source-of-truth** for `ZoneTrace` validation.
 * Used by:
 * - `Provider` to register the `'traces'` store extension (S2).
 * - DevTools for trace data integrity validation.
 * - Tests for fixture construction.
 *
 * The schema reuses `ComponentIntentSchema` and `CompilationErrorSchema`
 * from their respective modules (T7: co-located schemas, no duplication).
 *
 * @see Design Choice T7 — every type has a co-located Zod schema.
 * @see Design Choice S2 — typed `store.extend()` requires a Zod schema.
 * @see {@link ZoneTrace} — the TypeScript type this schema validates.
 */
export const ZoneTraceSchema = z.object({
    /** Unique zone-trace identifier. */
    id: z.string().min(1, 'Zone trace ID is required.'),

    /** The raw ComponentIntent that triggered compilation. */
    intent: ComponentIntentSchema,

    /**
     * Compilation outcome data — status, errors, and self-correction attempts.
     * Subset of the full TraceCompilation shape.
     */
    compilation: z.object({
        /** Final compilation status. */
        status: z.enum(['pass', 'fail', 'corrected']),
        /** Validation errors encountered during compilation. */
        errors: z.array(CompilationErrorSchema),
        /** Number of self-correction attempts made before final result. */
        selfCorrectionAttempts: z.number().int().min(0),
    }),

    /**
     * Provenance metadata from the CompilationResult.
     * Mirrors the CompilationProvenance type shape exactly.
     */
    provenance: z.object({
        /** Identifier of the AI agent/model. */
        agent: z.string().min(1),
        /** URL or name of the registry used. */
        registry: z.string().min(1),
        /** ISO 8601 timestamp when compilation occurred. */
        compiledAt: z.string().min(1),
        /** Semantic version of the compiler. */
        compilerVersion: z.string().min(1),
        /** Forge mode used, if the component was forged. */
        forgeMode: z.enum(['local', 'cloud']).optional(),
        /** Origin metadata for remote contracts. */
        contractOrigin: z
            .object({
                registryUrl: z.string(),
                publisher: z.string(),
            })
            .optional(),
    }),

    /** Zone-level performance metrics. */
    metrics: z.object({
        /** Total time from intent reception to render in milliseconds. */
        totalMs: z.number().min(0),
        /** Current retry attempt number (0-indexed). */
        retryAttempt: z.number().int().min(0),
    }),

    /** ISO 8601 timestamp when this trace was created. */
    timestamp: z.string().min(1, 'Timestamp is required.'),
});

// ---------------------------------------------------------------------------
// AgentTrace Type
// ---------------------------------------------------------------------------

/**
 * The complete observability record for a single Enterstellar pipeline execution.
 *
 * Produced on every `compile()` call. Stored in `EnterstellarStore.traces[]`.
 * Consumed by DevTools (timeline, inspector, profiler, replay) and
 * optionally by Enterstellar Cloud for aggregated analytics.
 *
 * @see Bible §3.4
 * @see {@link ZoneTrace} — the zone-level precursor trace produced by `Zone`.
 */
export type AgentTrace = {
    /** Unique trace identifier. */
    readonly id: TraceId;
    /** ISO 8601 timestamp when the trace was created. */
    readonly timestamp: string;
    /**
     * Correlation ID tying related events across a multi-step interaction chain.
     * Enables DevTools Trace Timeline to group related events.
     *
     * @see Appendix E P2
     */
    readonly correlationId?: string;
    /** Intent data: what the agent requested. */
    readonly intent: TraceIntent;
    /** Resolution data: how the component was found. */
    readonly resolution: TraceResolution;
    /** Compilation data: the compiler's validation outcome. */
    readonly compilation: TraceCompilation;
    /** Determinism data: the zone's configuration at render time. */
    readonly determinism: TraceDeterminism;
    /** Performance metrics: latency breakdown. */
    readonly metrics: TraceMetrics;
    /** User consent state for trace aggregation. */
    readonly consent: TraceConsent;
};

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating an `AgentTrace` at runtime.
 *
 * @see Design Choice T7
 */
export const AgentTraceSchema = z.object({
    id: z.string().min(1, 'Trace ID is required.'),
    timestamp: z.string().min(1, 'Timestamp is required.'),
    correlationId: z.string().optional(),
    intent: z.object({
        raw: z.string(),
        component: z.string().min(1),
        confidence: z.number().min(0).max(1),
        mode: z.string().optional(),
        interaction: z.string().optional(),
    }),
    resolution: z.object({
        strategy: z.enum(['exact', 'semantic', 'forge', 'fallback']),
        resolvedComponent: z.string().min(1),
        similarityScore: z.number().min(0).max(1).optional(),
        candidatesConsidered: z.number().int().min(0),
    }),
    compilation: z.object({
        status: z.enum(['pass', 'fail', 'corrected']),
        errorCount: z.number().int().min(0),
        selfCorrectionAttempts: z.number().int().min(0),
        tokensValidated: z.boolean(),
        accessibilityInjected: z.boolean(),
    }),
    determinism: z.object({
        level: z.number().min(0).max(1),
        cacheHit: z.boolean(),
        zone: z.string().min(1),
    }),
    metrics: z.object({
        totalMs: z.number().min(0),
        resolutionMs: z.number().min(0),
        compilationMs: z.number().min(0),
        renderMs: z.number().min(0),
    }),
    consent: z.object({
        anonymizedAggregation: z.boolean(),
    }),
});
