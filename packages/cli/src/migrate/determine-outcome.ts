/**
 * @module @enterstellar-ai/cli/migrate/determine-outcome
 * @description Standalone outcome utilities for `ContractAssemblyResult`.
 *
 * Provides three public functions for deriving and applying
 * `MigrationOutcome` from a `ContractAssemblyResult`:
 *
 * 1. {@link determineOutcome} — maps annotation arrays to a
 *    `MigrationOutcome` using the 4-level outcome model.
 * 2. {@link patchContractContent} — replaces an `@outcome` marker in
 *    a contract content string with a given outcome value.
 * 3. {@link reconstructProvenance} — returns a new `MigrationProvenance`
 *    with a different outcome (the original is `readonly`).
 *
 * **Current pipeline status:** As of Mid-Session Decision #4, the
 * `enterstellar migrate` orchestrator does NOT call these functions — outcome
 * is computed inline inside `assembleContract()` and read directly from
 * `contractResult.provenance.outcome`. These utilities are retained as
 * public API for external consumers who build custom orchestrators
 * around `assembleContract()`.
 *
 * ## Why Annotations, Not `compiler.lint()`
 *
 * `compiler.lint()` is architecturally inapplicable to migration.
 * `lint(intent, config)` validates a `ComponentIntent` against a
 * registered `ComponentContract`. During migration, there is no intent
 * and no registered contract. Annotations from `assembleContract()`'s
 * structural checks (R1–R9) are the correct and definitive signal.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Correction 1 — 4-Level Outcome Model
 * @see Implementation Plan §3 Component 2 — Outcome Determination
 */

import type { MigrationOutcome, MigrationProvenance } from '@enterstellar-ai/migration';
import type { ContractAssemblyResult } from '@enterstellar-ai/migration';

// ---------------------------------------------------------------------------
// Outcome Determination
// ---------------------------------------------------------------------------

/**
 * Determines the 4-level migration outcome from assembly annotations.
 *
 * Maps the `reviewAnnotations` and `warnAnnotations` arrays from a
 * `ContractAssemblyResult` to a `MigrationOutcome`:
 *
 * | `reviewAnnotations` | `warnAnnotations` | Outcome     |
 * |:--------------------|:------------------|:------------|
 * | `> 0`               | any               | `'review'`  |
 * | `0`                 | `> 0`             | `'warn'`    |
 * | `0`                 | `0`               | `'clean'`   |
 *
 * **Precedence:** `review` takes precedence over `warn`. If both arrays
 * are non-empty, the outcome is `'review'` — review-level issues require
 * human attention and supersede warnings.
 *
 * **Note:** The `'skip'` outcome is NOT produced by this function. SKIP
 * is determined earlier in the pipeline when AST extraction fails
 * (before assembly is even attempted).
 *
 * @param result - The `ContractAssemblyResult` from `assembleContract()`.
 * @returns The migration outcome: `'clean'`, `'warn'`, or `'review'`.
 *
 * @example
 * ```ts
 * const contractResult = assembleContract(manifest, sourcePath, version);
 * const outcome = determineOutcome(contractResult);
 * // outcome: 'clean' | 'warn' | 'review'
 * ```
 *
 * @see Correction 1 — 4-Level Outcome Model
 */
export function determineOutcome(result: ContractAssemblyResult): MigrationOutcome {
    if (result.reviewAnnotations.length > 0) {
        return 'review';
    }

    if (result.warnAnnotations.length > 0) {
        return 'warn';
    }

    return 'clean';
}

// ---------------------------------------------------------------------------
// Content Patching (Audit E1)
// ---------------------------------------------------------------------------

/**
 * The placeholder outcome embedded by `assembleContract()` in the
 * generated contract's provenance header.
 *
 * @see assemble-contract.ts L630 — `outcome: 'clean'` (hardcoded placeholder)
 * @see assemble-contract.ts L189 — `@outcome ${provenance.outcome}` (in content)
 */
const OUTCOME_PLACEHOLDER = '@outcome clean';

/**
 * Replaces the `@outcome clean` placeholder in the generated contract
 * content string with the real outcome.
 *
 * `assembleContract()` generates the provenance header with
 * `@outcome clean` as a placeholder (because outcome determination
 * happens AFTER assembly). This function patches the content string
 * with the actual outcome before writing to disk.
 *
 * **Safety:** `@outcome clean` appears exactly once in the generated
 * content — in the JSDoc provenance block. `String.replace()` with
 * first-match semantics is safe and deterministic.
 *
 * **Identity case:** If the real outcome IS `'clean'`, the content
 * is returned unchanged (the placeholder is already correct).
 *
 * @param content - The generated contract content string from
 *   `assembleContract().content`.
 * @param outcome - The real outcome determined by {@link determineOutcome}.
 * @returns The patched content string with the correct `@outcome` tag.
 *
 * @example
 * ```ts
 * const patched = patchContractContent(contractResult.content, 'review');
 * // ' * @outcome clean' → ' * @outcome review' in the provenance header
 * ```
 *
 * @see Audit E1 — `@outcome clean` baked into content string
 */
export function patchContractContent(
    content: string,
    outcome: MigrationOutcome,
): string {
    // Fast path: if the outcome is 'clean', the placeholder is already correct.
    if (outcome === 'clean') {
        return content;
    }

    return content.replace(OUTCOME_PLACEHOLDER, `@outcome ${outcome}`);
}

// ---------------------------------------------------------------------------
// Provenance Reconstruction (Audit E1)
// ---------------------------------------------------------------------------

/**
 * Creates a new `MigrationProvenance` object with the corrected outcome.
 *
 * `assembleContract()` returns a `MigrationProvenance` with
 * `outcome: 'clean'` as a placeholder. Since `MigrationProvenance.outcome`
 * is `readonly`, the CLI cannot mutate it directly — it must reconstruct
 * a new object with the corrected value.
 *
 * @param provenance - The original `MigrationProvenance` from
 *   `assembleContract().provenance`.
 * @param outcome - The real outcome determined by {@link determineOutcome}.
 * @returns A new `MigrationProvenance` object with the corrected outcome.
 *   All other fields are preserved via spread.
 *
 * @example
 * ```ts
 * const corrected = reconstructProvenance(contractResult.provenance, 'review');
 * // corrected.outcome === 'review'
 * // corrected.source === contractResult.provenance.source (preserved)
 * ```
 *
 * @see Audit E1 — `readonly` provenance requires reconstruction
 * @see types.ts L481 — `readonly outcome: MigrationOutcome`
 */
export function reconstructProvenance(
    provenance: MigrationProvenance,
    outcome: MigrationOutcome,
): MigrationProvenance {
    return {
        ...provenance,
        outcome,
    };
}
