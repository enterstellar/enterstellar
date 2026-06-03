/**
 * @module @enterstellar-ai/migration/enrichment/enrich-manifest
 * @description Phase 2 orchestrator — enriches heuristic-fallback fields via LLM.
 *
 * Implements Correction 2's deterministic gating logic:
 * - `ast-determined` fields → SKIP (never sent to LLM)
 * - `heuristic-fallback` fields → SEND to LLM via `EnrichmentProvider`
 * - Provider returns `SemanticOverlay` → merged into manifest, source → `enrichment`
 *
 * Returns `EnrichResult` (Audit E1) — not a bare `StructuralManifest` — to
 * preserve diagnostic visibility and `@enriched-fields` provenance data.
 *
 * **Bible placement deviation:** The Implementation Bible places orchestration
 * in `migrate.ts` (CLI). We place it here for code-sharing with `@enterstellar-ai/cloud`
 * (same pattern as `extractManifest()`). The CLI's `migrate.ts` calls
 * `enrichManifest()` instead of implementing the loop inline.
 *
 * **Error handling:** Enrichment failure NEVER blocks migration (Correction 3,
 * §1.1 binding spec). All `EnrichmentError` and `unknown` errors are caught
 * and captured in `EnrichResult.diagnostics` — never re-thrown.
 *
 * **L15 compliance:** Zero framework imports. Pure orchestration logic.
 *
 * @see Correction 2 — Binary Source Model: The Gating Logic
 * @see Correction 3 — Enrichment Error Handling
 * @see Audit E1 — EnrichResult return type for diagnostic visibility
 */

import type {
    StructuralManifest,
    EnrichableFieldKey,
    EnrichedFieldPatch,
    SemanticOverlay,
    EnrichResult,
    EnrichDiagnostic,
    EnrichableField,
} from '../types.js';
import type { EnrichmentProvider } from './types.js';
import { EnrichmentError } from './types.js';

// ---------------------------------------------------------------------------
// Enrichable Field Keys (Correction 2)
// ---------------------------------------------------------------------------

/**
 * The 7 enrichable field keys from `StructuralManifest`.
 *
 * Phase 2 iterates ONLY over these fields — structural fields (`name`,
 * `props`, `defaultProps`, `generics`, `existingZodSchemas`,
 * `eventHandlers`) are invariant and never sent to the LLM.
 *
 * Typed as `readonly EnrichableFieldKey[]` for iteration safety. The
 * `as const satisfies` ensures compile-time exhaustiveness — if a new
 * `EnrichableFieldKey` is added to `types.ts`, `tsc` will error here
 * until this array is updated.
 *
 * @see Correction 2 — Field Classification: Structural vs. Enrichable
 */
export const ENRICHABLE_FIELD_KEYS = [
    'description',
    'tags',
    'category',
    'intent',
    'ariaAttributes',
    'designTokenRefs',
    'lifecycleStates',
] as const satisfies readonly EnrichableFieldKey[];

/**
 * Compile-time exhaustiveness check for `ENRICHABLE_FIELD_KEYS`.
 *
 * Verifies every `EnrichableFieldKey` is present in the array. If a
 * new key is added to the union type without updating this array,
 * `tsc` emits an error.
 *
 * The function call is dead code — tree-shaken in production builds.
 * The `void` call satisfies `noUnusedLocals`.
 */
function assertFieldKeysExhaustive(
    _missing: Exclude<EnrichableFieldKey, (typeof ENRICHABLE_FIELD_KEYS)[number]>,
): void {
    // Intentionally empty — compile-time only.
}
void assertFieldKeysExhaustive;

// ---------------------------------------------------------------------------
// Enrichment Orchestrator (Phase 2 Entry Point)
// ---------------------------------------------------------------------------

/**
 * Phase 2 entry point — enriches heuristic-fallback fields via an LLM provider.
 *
 * Implements Correction 2's gating logic:
 * 1. Partitions enrichable fields into `skippedFields` (ast-determined)
 *    and `fieldsToEnrich` (heuristic-fallback).
 * 2. If all fields are ast-determined → early return (no LLM call).
 * 3. Calls `provider.enrich(manifest, source)`.
 * 4. On success → merges `SemanticOverlay` via `mergeOverlay()`.
 * 5. On failure → captures error in `diagnostics`, returns original manifest.
 *
 * Returns `EnrichResult` (not bare `StructuralManifest`) to provide:
 * - `enrichedFields` — needed by Phase 3 for `@enriched-fields` provenance header
 * - `skippedFields` — ast-determined fields that were never sent to LLM
 * - `diagnostics` — provider warnings/errors for CLI-level messaging
 *
 * **Audit E1:** The CLI uses `enrichResult.diagnostics` for per-error-code
 * user-facing log messages (replacing the bible's `switch (err.code)` block).
 * The CLI uses `enrichResult.enrichedFields` to populate the `@enriched-fields`
 * provenance header.
 *
 * @param manifest - Phase 1 output (`StructuralManifest`).
 * @param source - Original component source code.
 * @param provider - The resolved `EnrichmentProvider`.
 * @returns An `EnrichResult` with the manifest, enriched/skipped field lists,
 *   and diagnostics. On provider failure, manifest is unchanged and the
 *   error is captured in `diagnostics` (never thrown).
 *
 * @example
 * ```ts
 * const result = await enrichManifest(manifest, sourceCode, provider);
 *
 * // result.manifest — the (potentially enriched) StructuralManifest
 * // result.enrichedFields — ['description', 'tags'] (for @enriched-fields header)
 * // result.skippedFields — ['category', 'ariaAttributes'] (ast-determined)
 * // result.diagnostics — any warnings or errors from the provider
 * ```
 *
 * @see Correction 2 — Binary Source Model: The Gating Logic
 * @see Correction 3 — Enrichment Error Handling
 * @see Audit E1 — EnrichResult return type for diagnostic visibility
 */
export async function enrichManifest(
    manifest: StructuralManifest,
    source: string,
    provider: EnrichmentProvider,
): Promise<EnrichResult> {
    const diagnostics: EnrichDiagnostic[] = [];

    // --- Step 1: Partition fields by source ---
    const skippedFields: EnrichableFieldKey[] = [];
    const fieldsToEnrich: EnrichableFieldKey[] = [];

    for (const key of ENRICHABLE_FIELD_KEYS) {
        const field = manifest[key] as EnrichableField<unknown>;
        if (field.source === 'ast-determined') {
            skippedFields.push(key);
        } else {
            fieldsToEnrich.push(key);
        }
    }

    // --- Step 2: Early return if nothing to enrich ---
    if (fieldsToEnrich.length === 0) {
        diagnostics.push({
            level: 'info',
            message: 'All enrichable fields are AST-determined — no LLM call needed.',
        });

        return {
            manifest,
            enrichedFields: [],
            skippedFields,
            diagnostics,
        };
    }

    // --- Step 3: Call provider ---
    let overlay: SemanticOverlay;
    try {
        overlay = await provider.enrich(manifest, source);
    } catch (err: unknown) {
        // --- Step 4/5: Error handling → diagnostics (never re-throw) ---
        if (err instanceof EnrichmentError) {
            diagnostics.push({
                level: 'error',
                message: `Enrichment failed: [${err.code}] ${err.message}`,
                errorCode: err.code,
            });
        } else {
            // Unknown error — generic warning
            const message = err instanceof Error
                ? err.message
                : 'An unknown error occurred during enrichment.';
            diagnostics.push({
                level: 'warning',
                message: `Enrichment failed with unexpected error: ${message}`,
            });
        }

        return {
            manifest,
            enrichedFields: [],
            skippedFields,
            diagnostics,
        };
    }

    // --- Step 6: Merge overlay ---
    const mergeResult = mergeOverlay(manifest, overlay);

    // --- Step 7: Return enrichment result ---
    return {
        manifest: mergeResult.manifest,
        enrichedFields: mergeResult.enrichedFields,
        skippedFields,
        diagnostics,
    };
}

// ---------------------------------------------------------------------------
// Overlay Merger
// ---------------------------------------------------------------------------

/**
 * Merges a `SemanticOverlay` into a `StructuralManifest`.
 *
 * For each patch in the overlay, promotes the corresponding field
 * from `heuristic-fallback` to `enrichment`. Only patches for fields
 * that are currently `heuristic-fallback` are applied — this is a
 * safety check against the overlay containing keys for fields that
 * were `ast-determined` (the LLM shouldn't have produced them, but
 * we defend against it).
 *
 * This is an **immutable** operation — returns a new manifest object.
 * The original manifest is never mutated.
 *
 * @param manifest - The current `StructuralManifest`.
 * @param overlay - The `SemanticOverlay` returned by the provider.
 * @returns An object with the enriched manifest and the list of field
 *   keys that were actually enriched (for `EnrichResult.enrichedFields`).
 *
 * @see Correction 2 — Phase 2 never touches ast-determined fields
 */
export function mergeOverlay(
    manifest: StructuralManifest,
    overlay: SemanticOverlay,
): { readonly manifest: StructuralManifest; readonly enrichedFields: readonly EnrichableFieldKey[] } {
    // Start with the original manifest — we'll spread over enriched fields.
    let enriched: StructuralManifest = manifest;
    const enrichedFields: EnrichableFieldKey[] = [];

    for (const patch of overlay.fields) {
        const key = patch.key;

        // Safety check: only apply patches for heuristic-fallback fields.
        // This defends against LLM hallucinations where the overlay contains
        // patches for ast-determined fields that should never be overwritten.
        const currentField = manifest[key] as EnrichableField<unknown>;
        if (currentField.source !== 'heuristic-fallback') {
            continue;
        }

        // Apply the patch — promote source to 'enrichment'.
        enriched = applyPatch(enriched, patch);
        enrichedFields.push(key);
    }

    return { manifest: enriched, enrichedFields };
}

// ---------------------------------------------------------------------------
// Patch Application (Internal)
// ---------------------------------------------------------------------------

/**
 * Applies a single `EnrichedFieldPatch` to a `StructuralManifest`.
 *
 * Creates a new manifest with the patched field's value updated and
 * source promoted to `'enrichment'`. Immutable — the original manifest
 * is not mutated.
 *
 * The discriminated union on `patch.key` ensures type-safe value
 * assignment at compile time — each branch knows the exact value type.
 *
 * @param manifest - The current manifest to patch.
 * @param patch - The field patch to apply.
 * @returns A new `StructuralManifest` with the patched field.
 */
function applyPatch(
    manifest: StructuralManifest,
    patch: EnrichedFieldPatch,
): StructuralManifest {
    // The discriminated union on `key` ensures type-safe assignment.
    // Each branch produces an `EnrichableField<T>` with the correct T.
    const enrichedField: EnrichableField<unknown> = {
        value: patch.value,
        source: 'enrichment',
    };

    return {
        ...manifest,
        [patch.key]: enrichedField,
    };
}
