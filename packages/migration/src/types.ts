/**
 * @module @enterstellar-ai/migration/types
 * @description Core type definitions for the Enterstellar migration pipeline.
 *
 * This file contains all data shapes for the 3-phase migration pipeline:
 *
 * - **Phase 1 (Extraction):** `StructuralManifest`, `EnrichableField<T>`,
 *   `ManifestFieldSource`, `GenericParam`, `ExtractResult`, `ExtractDiagnostic`,
 *   `ServerExtractRequest`, `ServerExtractResponse`
 * - **Phase 2 (Enrichment):** `EnrichableFieldKey`, `EnrichedFieldPatch`,
 *   `SemanticOverlay`, `EnrichDiagnostic`, `EnrichResult`
 * - **Phase 3 (Assembly):** `MigrationOutcome`, `MigrationProvenance`,
 *   `MigrationResult`, `MigrateBatchSummary`
 *
 * **Zod schemas (T7):** `MigrationResultSchema`, `MigrateBatchSummarySchema`,
 * `SemanticOverlaySchema` (runtime validation for LLM output),
 * `ServerExtractRequestSchema` (HTTP request body validation).
 *
 * All types use the `type` keyword per T1. All fields are `readonly` per
 * strict TS policy. No inline object literals per T11.
 *
 * @see Correction 1 — 4-Level Outcome Model (migration-01-pipeline.md)
 * @see Correction 2 — Binary Source Model (migration-01-pipeline.md)
 * @see Correction 4 — Server-Side Extraction (migration-04-server-extract.md)
 * @see Design Choice T1 — `type` for data shapes
 * @see Design Choice T5 — every field documented
 * @see Design Choice T7 — Zod schemas for public serialized types
 * @see Design Choice T11 — standalone named types for nested objects
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Source Model (Correction 2)
// ---------------------------------------------------------------------------

/**
 * Provenance tag for every manifest field.
 *
 * - `ast-determined`: Value was directly extracted from source code
 *   (export name, TS interface, JSDoc `@description`, existing ARIA attrs).
 *   100% deterministic. Immutable — LLM cannot override.
 *
 * - `heuristic-fallback`: Value was inferred from conventions
 *   (filename → category, empty string → missing description).
 *   Candidate for LLM enrichment if `--enrich` is used.
 *
 * - `enrichment`: Value was provided by the LLM during Phase 2.
 *   Only set when `--enrich` is used AND the field was previously
 *   `'heuristic-fallback'`. Never overwrites `'ast-determined'`.
 *
 * @see Correction 2 — Binary Source Model
 */
export type ManifestFieldSource = 'ast-determined' | 'heuristic-fallback' | 'enrichment';

// ---------------------------------------------------------------------------
// Source Location (T11 — standalone named type)
// ---------------------------------------------------------------------------

/**
 * Points to a specific location in a source file.
 *
 * Used by `EnrichableField` to trace `ast-determined` values back to
 * their originating AST node. Enables "Go to Source" in LSP (§2) and
 * contextual `@enterstellar-review` annotations (Correction 1).
 *
 * Extracted as a standalone type per T11 — no inline object literals.
 *
 * @see Correction 2 — `sourceLocation` provenance tracing
 */
export type SourceLocation = {
    /** Relative file path from the project root. */
    readonly file: string;
    /** 1-indexed line number of the AST node. */
    readonly line: number;
};

// ---------------------------------------------------------------------------
// Enrichable Field Wrapper (Correction 2)
// ---------------------------------------------------------------------------

/**
 * Wrapper for fields whose provenance may vary across pipeline phases.
 *
 * Phase 1 (Extraction) sets the initial `source` to either
 * `'ast-determined'` or `'heuristic-fallback'`. Phase 2 (Enrichment)
 * may promote `'heuristic-fallback'` → `'enrichment'` for fields the
 * LLM successfully enriches. Phase 2 **never** overwrites
 * `'ast-determined'` values (hard constraint from Correction 2).
 *
 * @typeParam T - The type of the wrapped value.
 *
 * @see Correction 2 — Binary Source Model
 */
export type EnrichableField<T> = {
    /** The field's current value (may be AST-extracted, heuristic, or LLM-enriched). */
    readonly value: T;
    /** Provenance tag indicating how this value was obtained. */
    readonly source: ManifestFieldSource;
    /**
     * Source location in the original file. Present only for
     * `'ast-determined'` fields — heuristic and enrichment values
     * have no source location because they didn't come from the source file.
     */
    readonly sourceLocation?: SourceLocation;
};

// ---------------------------------------------------------------------------
// Generic Type Parameters (Correction 1)
// ---------------------------------------------------------------------------

/**
 * A captured generic type parameter from a generic component.
 *
 * Used by Phase 3 (Assembly) to generate intelligent Zod placeholder
 * schemas for REVIEW-level contracts. The constraint determines the
 * placeholder quality:
 *
 * | Constraint                        | Placeholder                         |
 * |:----------------------------------|:------------------------------------|
 * | `Record<string, unknown>`         | `z.record(z.unknown())`             |
 * | `string`                          | `z.string()`                        |
 * | `{ id: string }`                  | `z.object({ id: z.string() }).passthrough()` |
 * | (none)                            | `z.unknown()`                       |
 *
 * @see Correction 1 — Generics: The Primary Source of REVIEW Annotations
 */
export type GenericParam = {
    /** The type parameter name (e.g., `'T'`, `'TData'`). */
    readonly name: string;
    /** The constraint expression, if any (e.g., `'Record<string, unknown>'`). */
    readonly constraint?: string;
};

// ---------------------------------------------------------------------------
// Structural Manifest — Phase 1 Output (Correction 2)
// ---------------------------------------------------------------------------

/**
 * Phase 1 output — the complete extraction result for one component.
 *
 * **Structural fields** are bare values (always `ast-determined`).
 * **Enrichable fields** carry source provenance via `EnrichableField<T>`.
 *
 * This intermediate representation does NOT map 1:1 to `ComponentContract`.
 * Phase 3 (Assembly) performs the transformation — see Correction 1's
 * field mapping table.
 *
 * @see Correction 2 — Binary Source Model
 * @see Correction 1 — Phase 3 Assembly: Mapping Manifest → ComponentContract
 */
export type StructuralManifest = {
    // ─── Structural: always AST-determined (bare values) ───────────────

    /** PascalCase component name from the export declaration. */
    readonly name: string;

    /**
     * Zod schema generated from the TypeScript props interface/type.
     *
     * Always extracted from AST — if no props interface exists, this
     * is `z.object({})` (valid for zero-props components like `<Spacer />`).
     */
    readonly props: z.ZodType;

    /**
     * Default prop values extracted from destructured defaults or `defaultProps`.
     *
     * Used by Phase 3 to generate the `examples[0].props` entry.
     * Empty record if no defaults found.
     */
    readonly defaultProps: Readonly<Record<string, unknown>>;

    /**
     * Generic type parameters, if the component is generic.
     *
     * Captured for Correction 1's REVIEW-level placeholder generation.
     * Empty array if the component has no generics.
     */
    readonly generics: readonly GenericParam[];

    /**
     * Existing Zod schemas found in the source file.
     *
     * **v1 behavior:** Captured for provenance and developer visibility ONLY.
     * Phase 3 always generates the contract's `props` schema from the
     * TypeScript interface, NOT from existing Zod schemas. This avoids
     * the merge ambiguity when existing schemas are partial.
     *
     * Phase 3 adds a provenance comment when this array is non-empty:
     * `// Note: existing Zod schemas detected — consider migrating constraints.`
     *
     * **Type rationale:** `string[]` (variable names), not `z.ZodType[]`.
     * `ts-morph` performs static AST analysis — it can detect that a variable
     * like `const UserSchema = z.object({...})` exists, but cannot extract
     * the runtime `z.ZodType` instance. Runtime modifiers (`.refine()`,
     * `.transform()`, `.pipe()`) have no static type representation.
     */
    readonly existingZodSchemas: readonly string[];

    /**
     * Detected event handler types from JSX (e.g., `['click', 'submit', 'change']`).
     *
     * This is a STRUCTURAL field — it's either in the AST or not.
     * Does NOT map to a `ComponentContract` field. Serves as input context
     * for the Phase 2 LLM enrichment prompt: event handler presence helps
     * the LLM write better `description`, `tags`, and `intent` values.
     *
     * Empty array if no event handlers found.
     */
    readonly eventHandlers: readonly string[];

    // ─── Enrichable: may be AST, heuristic, or LLM-enriched ───────────

    /** Component description. AST source: JSDoc `@description` tag. */
    readonly description: EnrichableField<string>;

    /** Semantic tags for fuzzy matching. AST source: JSDoc `@tags` or none. */
    readonly tags: EnrichableField<readonly string[]>;

    /**
     * Component category. AST source: directory path mapping.
     *
     * The value is a `ComponentCategory` string but stored as `string`
     * here because heuristic/enrichment values may be arbitrary before
     * Phase 3 validates them against the category enum.
     */
    readonly category: EnrichableField<string>;

    /**
     * Canonical intent query for the component.
     *
     * Maps to `ComponentContract.examples[0].intent` in Phase 3.
     * AST source: none — intent is inherently semantic. Always starts
     * as `heuristic-fallback` with value `'Render {name}'`. Phase 2
     * enrichment produces a natural-language intent.
     */
    readonly intent: EnrichableField<string>;

    /** ARIA attributes. AST source: JSX `role`/`aria-*` attributes. */
    readonly ariaAttributes: EnrichableField<Readonly<Record<string, string>>>;

    /** Design token references. AST source: CSS variable usage (`var(--enterstellar-*)`). */
    readonly designTokenRefs: EnrichableField<readonly string[]>;

    /**
     * Lifecycle states. AST source: conditional rendering patterns.
     *
     * Detected from patterns like `if (loading) return <Spinner />`.
     * Empty array if no conditional rendering patterns found.
     */
    readonly lifecycleStates: EnrichableField<readonly string[]>;
};

// ---------------------------------------------------------------------------
// Enrichable Field Keys & Overlay (Correction 2)
// ---------------------------------------------------------------------------

/**
 * The keys of `StructuralManifest` that are `EnrichableField<T>` wrappers.
 *
 * Phase 2 iterates ONLY over these fields — structural fields are
 * invariant and never sent to the LLM.
 *
 * @see Correction 2 — Field Classification: Structural vs. Enrichable
 */
export type EnrichableFieldKey =
    | 'description'
    | 'tags'
    | 'category'
    | 'intent'
    | 'ariaAttributes'
    | 'designTokenRefs'
    | 'lifecycleStates';

/**
 * Type-safe enrichment patch — key determines value type at compile time.
 *
 * Uses a mapped-then-indexed pattern to enforce that each key's value
 * matches the corresponding `EnrichableField<T>`'s generic parameter:
 *
 * ```ts
 * { key: 'description', value: 'A patient card' }   // ✅ string
 * { key: 'tags', value: ['clinical', 'card'] }       // ✅ readonly string[]
 * { key: 'description', value: 42 }                  // ❌ type error
 * { key: 'name', value: 'Foo' }                      // ❌ 'name' not in EnrichableFieldKey
 * ```
 *
 * @see Correction 2 — Phase 2 Enrichment: SemanticOverlay return type
 */
export type EnrichedFieldPatch = {
    [K in EnrichableFieldKey]: {
        /** The enrichable field key being patched. */
        readonly key: K;
        /** The enriched value — type inferred from the field's `EnrichableField<T>`. */
        readonly value: StructuralManifest[K] extends EnrichableField<infer T> ? T : never;
    };
}[EnrichableFieldKey];

/**
 * Phase 2 output — LLM-enriched values for `heuristic-fallback` fields.
 *
 * A sparse patch containing ONLY the fields that were enriched.
 * Phase 3 (Assembly) merges this into the `StructuralManifest`, setting
 * `source: 'enrichment'` on each patched field.
 *
 * @see Correction 2 — Phase 2 Enrichment: The Gating Logic
 */
export type SemanticOverlay = {
    /** The enriched field patches. May be empty if all fields were AST-determined. */
    readonly fields: readonly EnrichedFieldPatch[];
};

// ---------------------------------------------------------------------------
// Enrichment Result (Audit E1)
// ---------------------------------------------------------------------------

/**
 * Diagnostic emitted during Phase 2 enrichment.
 *
 * Accumulates provider warnings (rate limit retries, parse warnings,
 * auth failures) for CLI-level error reporting. The orchestrator
 * (`enrichManifest`) pushes diagnostics into the `EnrichResult` so
 * the CLI can produce per-error-code user-facing log messages without
 * coupling `@enterstellar-ai/migration` to CLI-specific logging.
 *
 * Follows the same pattern as Phase 1's `ExtractDiagnostic`.
 *
 * @see Audit E1 — EnrichResult return type for diagnostic visibility
 */
export type EnrichDiagnostic = {
    /** Severity level of the diagnostic. */
    readonly level: 'info' | 'warning' | 'error';
    /** Human-readable diagnostic message. */
    readonly message: string;
    /**
     * The enrichable field this diagnostic relates to, if any.
     *
     * Present when the diagnostic is field-specific (e.g., a single field
     * failed validation in the LLM response). Absent for provider-level
     * errors (e.g., auth failure, quota exhaustion).
     */
    readonly field?: EnrichableFieldKey;
    /**
     * The enrichment error code, if this diagnostic was triggered by a
     * provider error.
     *
     * Typed as `string` (not `EnrichmentErrorCode`) to avoid a circular
     * import between `types.ts` and `enrichment/types.ts`. The orchestrator
     * populates this with the actual `EnrichmentErrorCode` value — the CLI
     * can narrow on it for per-code messaging.
     *
     * @example 'AUTH_FAILED' | 'QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'PARSE_ERROR'
     */
    readonly errorCode?: string;
};

/**
 * Phase 2 output — enriched manifest with diagnostic visibility.
 *
 * Follows the same pattern as Phase 1's `ExtractResult { manifest, diagnostics }`.
 * Returning a structured result (not a bare `StructuralManifest`) preserves:
 *
 * - **`enrichedFields`** — needed by Phase 3 to populate the `@enriched-fields`
 *   provenance header tag (Correction 1 binding requirement).
 * - **`skippedFields`** — `ast-determined` fields that were never sent to the LLM.
 *   Useful for debugging and batch summary reporting.
 * - **`diagnostics`** — provider warnings and errors for CLI-level messaging.
 *   The CLI reads `diagnostics[].errorCode` to produce per-error-code log
 *   messages (replacing the bible's `switch (err.code)` block).
 *
 * On provider failure, `manifest` is returned unchanged, `enrichedFields` is
 * empty, and the error is captured in `diagnostics` (never thrown).
 *
 * @see Audit E1 — EnrichResult preserves diagnostic visibility and provenance data
 * @see Correction 1 — `@enriched-fields` provenance header
 */
export type EnrichResult = {
    /** The (potentially enriched) structural manifest. */
    readonly manifest: StructuralManifest;
    /**
     * Field keys that were successfully enriched by the LLM.
     *
     * Empty if enrichment failed or all fields were `ast-determined`.
     * Phase 3 uses this to populate `MigrationProvenance.enrichedFields`.
     */
    readonly enrichedFields: readonly EnrichableFieldKey[];
    /**
     * Field keys that were skipped (`ast-determined` — never sent to LLM).
     *
     * The complement of `enrichedFields` relative to `ENRICHABLE_FIELD_KEYS`
     * (minus any fields that were `heuristic-fallback` but failed enrichment).
     */
    readonly skippedFields: readonly EnrichableFieldKey[];
    /** Diagnostics emitted during enrichment (provider warnings, errors). */
    readonly diagnostics: readonly EnrichDiagnostic[];
};

// ---------------------------------------------------------------------------
// Extraction Result (Correction 4)
// ---------------------------------------------------------------------------

/**
 * Diagnostic emitted during Phase 1 extraction.
 *
 * Diagnostics are informational — they do NOT prevent contract generation.
 * They surface extraction edge cases (e.g., partial JSDoc, deprecated
 * components, unresolvable type aliases) for developer awareness.
 *
 * @see Correction 4 — Server-Side Extraction
 */
export type ExtractDiagnostic = {
    /** Severity level of the diagnostic. */
    readonly level: 'info' | 'warning' | 'error';
    /** Human-readable diagnostic message. */
    readonly message: string;
    /** The manifest field this diagnostic relates to, if any. */
    readonly field?: string;
};

/**
 * The output of `extractManifest()` — Phase 1 extraction result.
 *
 * Contains the `StructuralManifest` for the extracted component and
 * any diagnostics emitted during extraction. Used by both the CLI
 * (`enterstellar migrate <path>`) and the cloud server endpoint
 * (`POST /api/v1/migrate/extract`).
 *
 * @see Correction 4 — Server-Side Extraction (code-sharing architecture)
 */
export type ExtractResult = {
    /** The extracted structural manifest for the component. */
    readonly manifest: StructuralManifest;
    /** Diagnostics emitted during extraction (informational, not blocking). */
    readonly diagnostics: readonly ExtractDiagnostic[];
};

// ---------------------------------------------------------------------------
// Server-Side Extraction Types (Correction 4)
// ---------------------------------------------------------------------------

/**
 * Request body for `POST /api/v1/migrate/extract`.
 *
 * The cloud server endpoint accepts the same inputs as `extractManifest()`:
 * component source code as a string, with an optional filename for
 * diagnostics and file extension detection.
 *
 * The CLI reads source from disk. The cloud server receives source from
 * the HTTP request body. Both pass the string to `extractManifest()` —
 * the shared function mandated by Correction 4.
 *
 * @example
 * ```json
 * {
 *   "source": "import React from 'react';\nexport function Button(props: { label: string }) { ... }",
 *   "filename": "Button.tsx"
 * }
 * ```
 *
 * @see Correction 4 — Server-Side Extraction (migration-04-server-extract.md)
 */
export type ServerExtractRequest = {
    /**
     * The component source code as a string.
     * Must be non-empty — an empty string cannot produce a valid extraction.
     */
    readonly source: string;
    /**
     * Optional filename for diagnostics and heuristic category inference.
     * When omitted, `extractManifest()` defaults to `'component.tsx'`.
     *
     * The filename is used for:
     * - `inferCategory()` — directory path segments match `ComponentCategory`
     * - `ExtractDiagnostic` messages — includes the filename for context
     * - File extension detection — `.tsx` vs `.ts` parsing mode
     */
    readonly filename?: string;
};

/**
 * Response body for `POST /api/v1/migrate/extract`.
 *
 * Identical to `ExtractResult` — alias retained for HTTP response
 * semantic context (Audit M1). The cloud endpoint returns the same
 * shape that `extractManifest()` produces locally. The alias makes
 * the intent clear when used in HTTP handler type annotations:
 *
 * ```typescript
 * // In @enterstellar-ai/cloud endpoint handler:
 * app.post('/api/v1/migrate/extract', async (c) => {
 *     const body: ServerExtractRequest = await c.req.json();
 *     const result: ServerExtractResponse = extractManifest(body.source, body.filename);
 *     return c.json(result);
 * });
 * ```
 *
 * @see Correction 4 — Server-Side Extraction (migration-04-server-extract.md)
 */
export type ServerExtractResponse = ExtractResult;

/**
 * Zod schema for `ServerExtractRequest` — validates the HTTP request body.
 *
 * Used by the cloud endpoint to `safeParse()` the incoming JSON before
 * passing to `extractManifest()`. Rejects:
 * - Missing `source` field → Zod `required` error
 * - Empty `source` string → `z.string().min(1)` error
 * - Non-string `source` → Zod type error
 * - Non-string `filename` (when present) → Zod type error
 *
 * @example
 * ```typescript
 * const parsed = ServerExtractRequestSchema.safeParse(requestBody);
 * if (!parsed.success) {
 *     return c.json({ error: parsed.error.format() }, 400);
 * }
 * const result = extractManifest(parsed.data.source, parsed.data.filename);
 * ```
 *
 * @see Correction 4 — Server-Side Extraction (migration-04-server-extract.md)
 * @see Design Choice T7 — Zod schemas for public serialized types
 */
export const ServerExtractRequestSchema = z.object({
    /** Non-empty component source code. */
    source: z.string().min(1),
    /** Optional filename for diagnostics. */
    filename: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Migration Outcome Model (Correction 1)
// ---------------------------------------------------------------------------

/**
 * 4-level outcome for a single component migration.
 *
 * Determined by the CLI orchestrator from assembly annotations:
 * - `'clean'`  — no `@enterstellar-review` or `@enterstellar-warn` annotations
 * - `'warn'`   — `warnAnnotations.length > 0` (heuristic inferences)
 * - `'review'` — `reviewAnnotations.length > 0` (requires human attention)
 * - `'skip'`   — AST extraction completely failed (no component found)
 *
 * **Important:** Outcome determination does NOT happen inside
 * `assembleContract()`. It is the responsibility of the CLI orchestrator
 * (`@enterstellar-ai/cli`), which maps assembly annotations to a `MigrationOutcome`.
 * This keeps `@enterstellar-ai/migration` free of `@enterstellar-ai/compiler` and
 * `@enterstellar-ai/registry` dependencies.
 *
 * **Why not `compiler.lint()`?** The original migration guide maps
 * `compiler.lint()` to outcome determination, but this is architecturally
 * inapplicable. `lint(intent, config)` validates a `ComponentIntent`
 * against a registered `ComponentContract` — it answers "does this
 * render request comply with this contract?" During migration, there is
 * no intent and no registered contract. The annotations are not a proxy
 * or workaround — they are the correct signal. `assembleContract()`'s
 * builders perform the same structural checks (R1–R9), and the
 * annotations capture exactly which fields need human attention.
 *
 * @see Correction 1 — 4-Level Outcome Model
 * @see determine-outcome.ts — `@enterstellar-ai/cli/migrate/determine-outcome`
 */
export type MigrationOutcome = 'clean' | 'warn' | 'review' | 'skip';

/**
 * Provenance metadata for the `@enterstellar-generated` header on `.contract.ts` files.
 *
 * Serialized as a JSDoc comment block at the top of each generated contract.
 *
 * @see Correction 1 — Provenance Header: Machine-Readable Migration Metadata
 */
export type MigrationProvenance = {
    /** Relative path to the source component file. */
    readonly source: string;
    /** ISO 8601 timestamp of generation. */
    readonly generatedAt: string;
    /** Pipeline version string (e.g., `'1.0.0'`). */
    readonly pipelineVersion: string;
    /** Pipeline phases that ran (e.g., `['ast']` or `['ast', 'enrichment']`). */
    readonly phases: readonly string[];
    /** Enrichment provider name, if Phase 2 ran (e.g., `'openai'`, `'enterstellar-cloud'`). */
    readonly enrichmentProvider?: string;
    /** Fields that were LLM-enriched (e.g., `['description', 'tags', 'category']`). */
    readonly enrichedFields?: readonly string[];
    /** The 4-level outcome for this component. */
    readonly outcome: MigrationOutcome;
};

/**
 * Options for `assembleContract()` that carry Phase 2 enrichment metadata.
 *
 * These optional fields populate the `@enrichment-provider` and
 * `@enriched-fields` tags in the generated provenance header. When
 * omitted, the provenance header records `@phases ast` only.
 *
 * @see Correction 1 — Provenance Header: Machine-Readable Migration Metadata
 * @see Audit M4 — AssemblyOptions defined in types.ts alongside MigrationProvenance
 */
export type AssemblyOptions = {
    /** Fields enriched by Phase 2 (for `@enriched-fields` header tag). */
    readonly enrichedFields?: readonly string[];
    /** Enrichment provider name (for `@enrichment-provider` header tag). */
    readonly enrichmentProvider?: string;
};

/**
 * Per-component migration result.
 *
 * Contains the outcome, file paths, annotations, and diagnostics for
 * a single component migration. Serialized to JSON when `--format json`
 * is used — Zod schema required per T7.
 *
 * @see Correction 1 — 4-Level Outcome Model
 */
export type MigrationResult = {
    /** PascalCase component name. */
    readonly componentName: string;
    /** Relative path to the source file. */
    readonly sourcePath: string;
    /** The 4-level outcome for this component. */
    readonly outcome: MigrationOutcome;
    /** Path to the generated `.contract.ts` file (absent for SKIP outcomes). */
    readonly contractPath?: string;
    /** Path to the generated `.test.ts` file (absent for SKIP outcomes). */
    readonly testPath?: string;
    /** `@enterstellar-review` annotations requiring developer attention. */
    readonly reviewAnnotations: readonly string[];
    /** `@enterstellar-warn` annotations for heuristic inferences. */
    readonly warnAnnotations: readonly string[];
    /** Extraction diagnostics from Phase 1. */
    readonly diagnostics: readonly ExtractDiagnostic[];
    /** Reason for SKIP outcome (absent for non-SKIP outcomes). */
    readonly skipReason?: string;
    /** Provenance metadata for the generated contract (absent for SKIP). */
    readonly provenance?: MigrationProvenance;
};

/**
 * Aggregate summary for a batch migration run.
 *
 * Produced at the end of `enterstellar migrate <dir>` to give a project-wide
 * overview. Serialized to JSON when `--format json` is used — Zod schema
 * required per T7.
 *
 * @see Correction 1 — Batch Summary: Terminal Output Format
 */
export type MigrateBatchSummary = {
    /** Total number of files scanned. */
    readonly totalFiles: number;
    /** Number of CLEAN outcomes. */
    readonly cleanCount: number;
    /** Number of WARN outcomes. */
    readonly warnCount: number;
    /** Number of REVIEW outcomes. */
    readonly reviewCount: number;
    /** Number of SKIP outcomes. */
    readonly skipCount: number;
    /** Per-component results. */
    readonly results: readonly MigrationResult[];
    /** Total wall-clock duration in milliseconds. */
    readonly durationMs: number;
};

// ---------------------------------------------------------------------------
// Zod Schemas for JSON-Serialized Types (T7)
// ---------------------------------------------------------------------------

/**
 * Zod schema for `MigrationOutcome`.
 *
 * Used by `MigrationResultSchema` and `MigrateBatchSummarySchema`
 * for runtime validation of JSON output.
 */
const MigrationOutcomeSchema = z.enum(['clean', 'warn', 'review', 'skip']);

/**
 * Zod schema for `ExtractDiagnostic`.
 *
 * Nested within `MigrationResultSchema` for diagnostic validation.
 */
const ExtractDiagnosticSchema = z.object({
    level: z.enum(['info', 'warning', 'error']),
    message: z.string(),
    field: z.string().optional(),
});

/**
 * Zod schema for `MigrationProvenance`.
 *
 * Nested within `MigrationResultSchema` for provenance validation.
 */
const MigrationProvenanceSchema = z.object({
    source: z.string(),
    generatedAt: z.string(),
    pipelineVersion: z.string(),
    phases: z.array(z.string()),
    enrichmentProvider: z.string().optional(),
    enrichedFields: z.array(z.string()).optional(),
    outcome: MigrationOutcomeSchema,
});

/**
 * Zod schema for `MigrationResult`.
 *
 * Validates the per-component result shape when serialized to JSON
 * via `--format json`. Required per T7 for public serialized types.
 *
 * @see Design Choice T7 — Zod schemas for runtime validation
 */
export const MigrationResultSchema = z.object({
    componentName: z.string(),
    sourcePath: z.string(),
    outcome: MigrationOutcomeSchema,
    contractPath: z.string().optional(),
    testPath: z.string().optional(),
    reviewAnnotations: z.array(z.string()),
    warnAnnotations: z.array(z.string()),
    diagnostics: z.array(ExtractDiagnosticSchema),
    skipReason: z.string().optional(),
    provenance: MigrationProvenanceSchema.optional(),
});

/**
 * Zod schema for `MigrateBatchSummary`.
 *
 * Validates the batch summary shape when serialized to JSON
 * via `--format json`. Required per T7 for public serialized types.
 *
 * @see Design Choice T7 — Zod schemas for runtime validation
 */
export const MigrateBatchSummarySchema = z.object({
    totalFiles: z.number().int().nonnegative(),
    cleanCount: z.number().int().nonnegative(),
    warnCount: z.number().int().nonnegative(),
    reviewCount: z.number().int().nonnegative(),
    skipCount: z.number().int().nonnegative(),
    results: z.array(MigrationResultSchema),
    durationMs: z.number().nonnegative(),
});

// ---------------------------------------------------------------------------
// Zod Schema for SemanticOverlay (T7 — LLM Output Validation)
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single `EnrichedFieldPatch`.
 *
 * Uses `z.discriminatedUnion` on the `key` field to enforce that each
 * variant's `value` matches the corresponding `EnrichableField<T>`'s
 * generic parameter. This enables `safeParse()` in the BYO-key provider
 * to validate LLM output and silently drop hallucinated fields.
 *
 * **Audit E2 (REJECTED):** `z.discriminatedUnion()` EXISTS and WORKS
 * in Zod 4.3.6 (verified via runtime test). Kept for explicit
 * self-documenting semantics over `z.union()`.
 *
 * **Audit E3 (ACCEPTED):** Array fields use `.readonly()` to match
 * the TypeScript `readonly string[]` types, ensuring `z.infer` type
 * compatibility in strict mode.
 *
 * @internal Used by `SemanticOverlaySchema` — not exported directly.
 */
const EnrichedFieldPatchSchema = z.discriminatedUnion('key', [
    z.object({ key: z.literal('description'), value: z.string() }),
    z.object({ key: z.literal('tags'), value: z.array(z.string()).readonly() }),
    z.object({ key: z.literal('category'), value: z.string() }),
    z.object({ key: z.literal('intent'), value: z.string() }),
    z.object({
        key: z.literal('ariaAttributes'),
        value: z.record(z.string(), z.string()),
    }),
    z.object({ key: z.literal('designTokenRefs'), value: z.array(z.string()).readonly() }),
    z.object({ key: z.literal('lifecycleStates'), value: z.array(z.string()).readonly() }),
]);

/**
 * Zod schema for `SemanticOverlay` — Phase 2 LLM output validation.
 *
 * Used by `BYOKeyEnrichmentProvider` to `safeParse()` the raw JSON
 * extracted from the LLM chat completion response. Invalid or
 * hallucinated fields are silently dropped (the overlay is a sparse
 * patch — missing fields simply don't get enriched).
 *
 * The Cloud provider does NOT use this schema — the server validates
 * before returning a trusted `SemanticOverlay` response.
 *
 * @see Design Choice T7 — Zod schemas for public serialized types
 * @see Correction 3 — BYOKeyEnrichmentProvider validation
 */
export const SemanticOverlaySchema = z.object({
    fields: z.array(EnrichedFieldPatchSchema).readonly(),
});
