/**
 * @module @enterstellar-ai/compiler/deterministic-correction
 * @description Deterministic self-correction for LLM prop errors (Tier 1 + Tier 2).
 *
 * Attempts to fix compilation errors without calling an external LLM.
 * Uses the contract's Zod schema metadata, design token set, and
 * example props to apply deterministic corrections.
 *
 * **Tier 1 (Deterministic):** Type coercion, boolean coercion, Zod default
 * extraction, Levenshtein enum matching, token nearest-match.
 * **Tier 2 (Template):** Missing-field fallback from `contract.examples[0].props`
 * with staleness guard.
 *
 * This module is **pure** — it does not mutate inputs, does not run the
 * pipeline, and has no side effects. It returns corrected props for the
 * caller (`compile.ts`) to re-validate through the full pipeline (SC-10).
 *
 * **L15 compliance:** Zero framework imports.
 * **SC-15 compliance:** Zod public API only — no `_def` access.
 *
 * @see Design Choice SC-01 — 3-tier architecture.
 * @see Design Choice SC-02 — function signature takes `ComponentContract + DesignTokenSet`.
 * @see Design Choice SC-04 — 4 Tier 1 + 1 Tier 2 correction strategies.
 * @see Design Choice SC-10 — caller re-validates after correction.
 * @see Design Choice SC-16 — short-circuit when remaining is empty.
 */

import type { z } from 'zod';

import type {
    CompilationError,
    ComponentContract,
    DesignTokenSet,
} from '@enterstellar-ai/types';

import type {
    CorrectionTraceEntry,
    DeterministicCorrectionResult,
} from './types.js';
import { findNearestToken } from './utils/token-utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default maximum Levenshtein distance for enum fuzzy matching.
 * At distance 2, only unambiguous typos correct (e.g., `"defualt"` → `"default"`).
 * Distances ≥ 3 risk semantic changes (e.g., `"low"` → `"log"`).
 *
 * @see Design Choice SC-12 — configurable via `selfCorrection.enumMatchThreshold`.
 */
const DEFAULT_ENUM_MATCH_THRESHOLD = 2;

/**
 * Strings that unambiguously represent `true` in LLM output.
 * Used by `attemptBooleanCoercion()` for expanded boolean parsing.
 *
 * @see Bible §3.4 Strategy 2 — Boolean Coercion.
 */
const TRUTHY_STRINGS: ReadonlySet<string> = new Set(['true', 'yes', '1', 'on', 'enabled']);

/**
 * Strings that unambiguously represent `false` in LLM output.
 * Used by `attemptBooleanCoercion()` for expanded boolean parsing.
 *
 * @see Bible §3.4 Strategy 2 — Boolean Coercion.
 */
const FALSY_STRINGS: ReadonlySet<string> = new Set(['false', 'no', '0', 'off', 'disabled']);

// ---------------------------------------------------------------------------
// Strategy 1: Type Coercion (§3.4 Strategy 1, §3.5 Safety Rules)
// ---------------------------------------------------------------------------

/**
 * Attempts lossless type coercion between primitive types.
 *
 * **Supported coercions (§3.5 safety rules):**
 * - `string → number`: `Number(value)` with NaN, Infinity, and empty string guards.
 * - `string → boolean`: Simple `"true"` / `"false"` check (expanded set in `attemptBooleanCoercion`).
 * - `number → string`: `String(value)` — always lossless.
 * - `boolean → string`: `String(value)` — always lossless.
 *
 * **Rejected coercions (§3.5):**
 * - `string → string[]` — structural guess.
 * - `object → anything` — semantic restructuring.
 * - Empty string → `0` — semantically wrong despite valid JS.
 *
 * @param was - The original invalid value.
 * @param shouldBe - The expected type string from `fix.shouldBe` (e.g., `'number'`, `'boolean'`).
 * @returns `{ success: true, value }` if coercion succeeded, `{ success: false, value: was }` otherwise.
 *
 * @see Bible §3.4 Strategy 1 — Type Coercion.
 * @see Bible §3.5 — Coercion Safety Rules.
 * @see Design Choice SC-13 — only lossless/preservable transforms.
 */
function attemptTypeCoercion(
    was: unknown,
    shouldBe: string,
): { readonly success: boolean; readonly value: unknown } {
    // String → Number
    if (shouldBe === 'number' && typeof was === 'string') {
        // Guard: empty string → 0 is valid JS but semantically wrong (§3.5)
        if (was.trim() === '') {
            return { success: false, value: was };
        }
        const parsed = Number(was);
        // Guard: NaN and Infinity are not valid numeric prop values (§3.5)
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
            return { success: true, value: parsed };
        }
    }

    // String → Boolean (simple — expanded set handled by attemptBooleanCoercion)
    if (shouldBe === 'boolean' && typeof was === 'string') {
        const lower = was.toLowerCase();
        if (lower === 'true') return { success: true, value: true };
        if (lower === 'false') return { success: true, value: false };
    }

    // Number → String (always lossless, §3.5)
    if (shouldBe === 'string' && typeof was === 'number') {
        return { success: true, value: String(was) };
    }

    // Boolean → String (always lossless, §3.5)
    if (shouldBe === 'string' && typeof was === 'boolean') {
        return { success: true, value: String(was) };
    }

    return { success: false, value: was };
}

// ---------------------------------------------------------------------------
// Strategy 2: Boolean Coercion (§3.4 Strategy 2)
// ---------------------------------------------------------------------------

/**
 * Attempts expanded boolean coercion for LLM-common truthy/falsy patterns.
 *
 * Handles strings (`"yes"`, `"on"`, `"enabled"`, etc.) and exact numeric
 * values (`1` → `true`, `0` → `false`). Any value not in the explicit sets
 * fails to correct — no guessing.
 *
 * @param was - The original invalid value.
 * @returns `{ success: true, value }` if coercion succeeded, `{ success: false, value: false }` otherwise.
 *
 * @see Bible §3.4 Strategy 2 — Boolean Coercion.
 * @see Bible §3.5 — `number → boolean`: exact `1`/`0` only.
 */
function attemptBooleanCoercion(
    was: unknown,
): { readonly success: boolean; readonly value: boolean } {
    if (typeof was === 'string') {
        const lower = was.toLowerCase().trim();
        if (TRUTHY_STRINGS.has(lower)) return { success: true, value: true };
        if (FALSY_STRINGS.has(lower)) return { success: true, value: false };
    }
    // Number → Boolean: exact 1/0 only (§3.5). Any other number → skip.
    if (typeof was === 'number') {
        if (was === 1) return { success: true, value: true };
        if (was === 0) return { success: true, value: false };
    }
    return { success: false, value: false };
}

// ---------------------------------------------------------------------------
// Strategy 3: Default Extraction (§3.4 Strategy 3)
// ---------------------------------------------------------------------------

/**
 * Extracts the default value from a Zod schema field using the PUBLIC API.
 *
 * Uses `safeParse(undefined)` — if the schema has a `.default()`, parsing
 * `undefined` will succeed and return the default value. No `_def` access
 * required (SC-15).
 *
 * Only counts as "has default" if the parsed value is NOT `undefined`.
 * This distinguishes `.default("active")` (returns `"active"`) from
 * `.optional()` (returns `undefined`).
 *
 * Also handles the `null → default` coercion path (§3.5): when a field
 * receives `null` for a required field, this function is called to check
 * if a default exists.
 *
 * @param fieldSchema - The Zod schema for the specific field.
 * @returns `{ hasDefault: true, value }` if a default exists, `{ hasDefault: false }` otherwise.
 *
 * @see Bible §3.4 Strategy 3 — Default Extraction.
 * @see Design Choice SC-15 — Zod public API only.
 */
function extractZodDefault(
    fieldSchema: z.ZodType,
): { readonly hasDefault: boolean; readonly value: unknown } {
    const result = fieldSchema.safeParse(undefined);
    if (result.success) {
        // Schema accepted undefined — it has a .default() or is .optional().
        // Only count as "has default" if the parsed value is NOT undefined.
        if (result.data !== undefined) {
            return { hasDefault: true, value: result.data };
        }
    }
    return { hasDefault: false, value: undefined };
}

// ---------------------------------------------------------------------------
// Strategy 4: Enum Nearest Match (§3.4 Strategy 4)
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * Classic dynamic programming implementation. O(n*m) time and space
 * where n and m are the string lengths. Sufficient for short enum values
 * (typically < 20 characters).
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns The minimum number of single-character edits (insertions,
 *   deletions, substitutions) to transform `a` into `b`.
 *
 * @see Bible §3.4 Strategy 4 — inline Levenshtein.
 */
function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    const firstRow = matrix[0];
    if (firstRow !== undefined) {
        for (let j = 0; j <= b.length; j++) {
            firstRow[j] = j;
        }
    }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const row = matrix[i];
            const prevRow = matrix[i - 1];
            if (row !== undefined && prevRow !== undefined) {
                const del = prevRow[j];
                const ins = row[j - 1];
                const sub = prevRow[j - 1];
                if (del !== undefined && ins !== undefined && sub !== undefined) {
                    row[j] = Math.min(del + 1, ins + 1, sub + cost);
                }
            }
        }
    }
    const lastRow = matrix[a.length];
    if (lastRow !== undefined) {
        return lastRow[b.length] ?? 0;
    }
    return 0;
}

/**
 * Finds the nearest enum value by Levenshtein distance.
 *
 * Case-insensitive comparison. Returns the original-case option value
 * (not the lowercased version) to preserve schema intent.
 *
 * @param received - The invalid enum value received from the LLM.
 * @param options - The valid enum options from the Zod schema (`.options`).
 * @param maxDistance - Maximum edit distance to consider a match. Default: `2` (SC-12).
 * @returns The nearest matching option, or `undefined` if no match within threshold.
 *
 * @see Bible §3.4 Strategy 4 — Enum Nearest Match.
 * @see Design Choice SC-12 — `maxDistance` default 2, configurable 1–5.
 */
function findNearestEnum(
    received: string,
    options: readonly string[],
    maxDistance: number = DEFAULT_ENUM_MATCH_THRESHOLD,
): string | undefined {
    let bestMatch: string | undefined;
    let bestDistance = Infinity;

    for (const option of options) {
        const distance = levenshtein(received.toLowerCase(), option.toLowerCase());
        if (distance < bestDistance && distance <= maxDistance) {
            bestDistance = distance;
            bestMatch = option;
        }
    }

    return bestMatch;
}

// ---------------------------------------------------------------------------
// Tier 1: Deterministic Correction Orchestration (§3.6)
// ---------------------------------------------------------------------------

/**
 * Navigates the Zod schema to extract the `.shape` record for field-level access.
 *
 * Uses duck-typing (SC-15) — checks for the presence of `.shape` on the
 * contract's `props` schema. If the schema is not a `z.ZodObject` (unlikely
 * but defensive), returns `undefined`.
 *
 * @param contract - The component contract containing the Zod schema.
 * @returns The shape record mapping field names to Zod types, or `undefined`.
 */
function getSchemaShape(
    contract: ComponentContract,
): Record<string, z.ZodType> | undefined {
    const schemaWithShape = contract.props as { shape?: Record<string, z.ZodType> };
    return schemaWithShape.shape;
}

/**
 * Executes Tier 1 deterministic correction on a set of compilation errors.
 *
 * Iterates each error and dispatches to the appropriate strategy function
 * based on `error.code` and `error.fix` metadata:
 *
 * | Error Code | Strategy Cascade |
 * |:---|:---|
 * | `ENS-2001` | type coercion → boolean coercion → enum nearest → default extraction |
 * | `ENS-2002` | token nearest-match |
 * | Other codes | Passed to `remaining[]` (not correctable by Tier 1) |
 *
 * **Precondition:** Errors without a `fix` field are pushed directly to
 * `remaining[]` — cannot correct without diagnosis.
 *
 * @param errors - Compilation errors from the failed pipeline run.
 * @param props - The original props that failed validation.
 * @param contract - The full `ComponentContract` (provides schema via `.props`).
 * @param designTokens - The registry's design token set (for `findNearestToken`).
 * @param enumMatchThreshold - Max Levenshtein distance for enum matching. Default: `2`.
 * @returns Corrected props, remaining unfixed errors, and a correction trace.
 *
 * @see Bible §3.6 — Tier 1 Orchestration reference implementation.
 * @see Design Choice SC-04 — 4 Tier 1 strategies.
 */
function executeTier1(
    errors: readonly CompilationError[],
    props: Readonly<Record<string, unknown>>,
    contract: ComponentContract,
    designTokens: DesignTokenSet,
    enumMatchThreshold: number,
): { readonly props: Record<string, unknown>; readonly remaining: CompilationError[]; readonly trace: CorrectionTraceEntry[] } {
    const correctedProps: Record<string, unknown> = { ...props };
    const remaining: CompilationError[] = [];
    const trace: CorrectionTraceEntry[] = [];

    // Pre-compute schema shape once for all field-level lookups (SC-15)
    const shape = getSchemaShape(contract);

    for (const error of errors) {
        // Skip errors without fix suggestions — can't correct what we can't diagnose
        if (error.fix === undefined) {
            remaining.push(error);
            continue;
        }

        const { field, was, shouldBe } = error.fix;
        // Extract the prop field name from the dot-path (e.g., 'props.age' → 'age')
        const fieldName = field.startsWith('props.') ? field.slice(6) : field;
        let fixed = false;

        // Strategy dispatch based on error code + fix metadata
        switch (error.code) {
            case 'ENS-2001': { // Schema parse failure
                // --- Strategy 1: Type coercion (§3.4 Strategy 1) ---
                const coercion = attemptTypeCoercion(was, String(shouldBe));
                if (coercion.success) {
                    correctedProps[fieldName] = coercion.value;
                    trace.push({ tier: 1, errorCode: error.code, field: fieldName, was, correctedTo: coercion.value, strategy: 'type-coercion' });
                    fixed = true;
                    break;
                }

                // --- Strategy 2: Boolean coercion (§3.4 Strategy 2) ---
                // Expanded set check — handles "yes", "on", "enabled", 1, 0, etc.
                if (String(shouldBe) === 'boolean') {
                    const boolCoercion = attemptBooleanCoercion(was);
                    if (boolCoercion.success) {
                        correctedProps[fieldName] = boolCoercion.value;
                        trace.push({ tier: 1, errorCode: error.code, field: fieldName, was, correctedTo: boolCoercion.value, strategy: 'boolean-coercion' });
                        fixed = true;
                        break;
                    }
                }

                // --- Strategy 4: Enum nearest match (§3.4 Strategy 4, SC-15) ---
                if (shape !== undefined && typeof was === 'string') {
                    const fieldSchema = shape[fieldName];
                    if (fieldSchema !== undefined) {
                        // Duck-type check for z.enum — .options is the public API (SC-15)
                        const enumSchema = fieldSchema as { options?: readonly string[] };
                        if (Array.isArray(enumSchema.options)) {
                            const nearest = findNearestEnum(was, enumSchema.options, enumMatchThreshold);
                            if (nearest !== undefined) {
                                correctedProps[fieldName] = nearest;
                                trace.push({ tier: 1, errorCode: error.code, field: fieldName, was, correctedTo: nearest, strategy: 'enum-nearest' });
                                fixed = true;
                                break;
                            }
                        }
                    }
                }

                // --- Strategy 3: Default extraction (§3.4 Strategy 3, SC-15) ---
                // Handles both missing fields (was === undefined) and null values (§3.5)
                if ((was === undefined || was === null) && shape !== undefined) {
                    const fieldSchema = shape[fieldName];
                    if (fieldSchema !== undefined) {
                        const defaultResult = extractZodDefault(fieldSchema);
                        if (defaultResult.hasDefault) {
                            correctedProps[fieldName] = defaultResult.value;
                            trace.push({ tier: 1, errorCode: error.code, field: fieldName, was, correctedTo: defaultResult.value, strategy: 'default-extraction' });
                            fixed = true;
                        }
                    }
                }
                break;
            }

            case 'ENS-2002': { // Invalid design token
                // --- Strategy 5: Token nearest-match (§3.4 Strategy 5) ---
                const nearest = findNearestToken(String(was), designTokens);
                if (nearest !== undefined) {
                    correctedProps[fieldName] = nearest;
                    trace.push({ tier: 1, errorCode: error.code, field: fieldName, was, correctedTo: nearest, strategy: 'token-nearest' });
                    fixed = true;
                }
                break;
            }

            // ENS-2003, ENS-2004, ENS-2010, etc. — not correctable by Tier 1 (§3.2)
            default:
                break;
        }

        if (!fixed) {
            remaining.push(error);
        }
    }

    return { props: correctedProps, remaining, trace };
}

// ---------------------------------------------------------------------------
// Tier 2: Template Correction (§4)
// ---------------------------------------------------------------------------

/**
 * Validates contract example props against the CURRENT schema.
 *
 * Uses the first example (index 0) for deterministic behavior. If the
 * example props fail `safeParse()`, they are stale (schema has drifted
 * since registration) and must NOT be used for correction.
 *
 * **SC-06 binding decision:** Correcting with stale data is worse than
 * not correcting. Tier 2 coverage depends on contract hygiene.
 *
 * @param contract - The component contract containing examples and schema.
 * @returns Validated example props, or `undefined` if no valid examples exist.
 *
 * @see Bible §4.4 — Preconditions (Mandatory Guards).
 * @see Design Choice SC-06 — staleness guard.
 */
function getValidatedExampleProps(
    contract: ComponentContract,
): Record<string, unknown> | undefined {
    if (contract.examples.length === 0) return undefined;

    // Use the first example (deterministic — always index 0)
    const example = contract.examples[0];
    if (example === undefined) return undefined;

    // Validate example props against the CURRENT schema
    const result = contract.props.safeParse(example.props);
    if (!result.success) {
        // Example props are stale — schema has drifted since registration.
        // Do NOT use stale data for correction. Return undefined → skip Tier 2.
        return undefined;
    }

    return result.data as Record<string, unknown>;
}

/**
 * Executes Tier 2 template correction using contract example props.
 *
 * **Activation precondition (Bible §4.3, binding — gap D-1):**
 * Tier 2 ONLY activates when ALL of the following are true:
 * 1. The error is `ENS-2001` (schema parse failure).
 * 2. The error's `fix.was` is `undefined` (field is MISSING, not wrong-typed).
 * 3. The example props contain a value for this field.
 * 4. The example value passes the field's own schema validation.
 *
 * If `fix.was !== undefined`, the field exists but has the wrong type —
 * that's Tier 1's job. Substituting example data over user-provided data
 * would render example data instead of the user's data.
 *
 * @param remaining - Errors that Tier 1 could not fix.
 * @param props - The props after Tier 1 correction.
 * @param contract - The full `ComponentContract` (provides examples and schema).
 * @returns Corrected props, still-remaining errors, and a correction trace.
 *
 * @see Bible §4.5 — Tier 2 Orchestration reference implementation.
 * @see Bible §4.3 — Tier 2 activation guard (D-1).
 * @see Design Choice SC-06 — staleness guard.
 */
function executeTier2(
    remaining: readonly CompilationError[],
    props: Record<string, unknown>,
    contract: ComponentContract,
): { readonly props: Record<string, unknown>; readonly remaining: CompilationError[]; readonly trace: CorrectionTraceEntry[] } {
    const exampleProps = getValidatedExampleProps(contract);
    if (exampleProps === undefined) {
        // No valid examples — Tier 2 is a no-op
        return { props, remaining: [...remaining], trace: [] };
    }

    const correctedProps: Record<string, unknown> = { ...props };
    const stillRemaining: CompilationError[] = [];
    const trace: CorrectionTraceEntry[] = [];

    // Pre-compute schema shape for field-level validation (SC-15)
    const shape = getSchemaShape(contract);

    for (const error of remaining) {
        // Tier 2 ONLY handles missing-field errors that Tier 1 couldn't fix
        // Binding precondition (Bible §4.3, gap D-1):
        // - error.code must be ENS-2001
        // - error.fix must exist
        // - error.fix.was MUST be undefined (field is MISSING, not wrong-typed)
        if (
            error.code !== 'ENS-2001' ||
            error.fix === undefined ||
            error.fix.was !== undefined  // was !== undefined → field exists but wrong type → Tier 1's job
        ) {
            stillRemaining.push(error);
            continue;
        }

        const fieldName = error.fix.field.startsWith('props.')
            ? error.fix.field.slice(6)
            : error.fix.field;

        // Check if the example has a value for this field
        if (fieldName in exampleProps) {
            const exampleValue = exampleProps[fieldName];

            // Validate the specific field value against its schema (SC-15: duck-type .shape)
            if (shape !== undefined) {
                const fieldSchema = shape[fieldName];
                if (fieldSchema !== undefined) {
                    const fieldResult = fieldSchema.safeParse(exampleValue);
                    if (fieldResult.success) {
                        correctedProps[fieldName] = fieldResult.data;
                        trace.push({
                            tier: 2,
                            errorCode: error.code,
                            field: fieldName,
                            was: undefined,
                            correctedTo: fieldResult.data,
                            strategy: 'example-fallback',
                        });
                        continue; // Fixed — don't add to remaining
                    }
                }
            }
        }

        stillRemaining.push(error);
    }

    return { props: correctedProps, remaining: stillRemaining, trace };
}

// ---------------------------------------------------------------------------
// Public API: attemptDeterministicCorrection (§6.2)
// ---------------------------------------------------------------------------

/**
 * Attempts deterministic correction of compilation errors.
 *
 * Orchestrates Tier 1 (deterministic) → Tier 2 (template) with short-circuit
 * optimization (SC-16): if Tier 1 resolves ALL errors, Tier 2 is skipped.
 *
 * This function is **pure** — it does not mutate inputs and has no side
 * effects. It returns a `DeterministicCorrectionResult` containing:
 * - `corrected: true` if ALL errors were resolved.
 * - `props` — the corrected props object (new object, inputs not mutated).
 * - `remaining` — errors that could not be fixed deterministically.
 * - `trace` — correction trace entries for DevTools and telemetry.
 *
 * The caller (`compile.ts`) is responsible for re-validating the corrected
 * props through the full pipeline (SC-10) and attaching the trace to the
 * `CompilationResult` when `selfCorrection.trace === true`.
 *
 * @param errors - Compilation errors from the failed pipeline run.
 * @param props - The original props that failed validation.
 * @param contract - The full `ComponentContract` (provides schema, examples, tokens).
 * @param designTokens - The registry's design token set (for `findNearestToken`).
 * @param enumMatchThreshold - Max Levenshtein distance for enum matching.
 *   Default: `2`. Range: `1–5`. Threaded from `selfCorrection.enumMatchThreshold`.
 * @returns A `DeterministicCorrectionResult` with corrected props and remaining errors.
 *
 * @see Bible §6.2 — The Correction Function Signature.
 * @see Design Choice SC-01 — deterministic correction before LLM.
 * @see Design Choice SC-02 — signature takes `ComponentContract + DesignTokenSet`.
 * @see Design Choice SC-16 — short-circuit when Tier 1 resolves all errors.
 *
 * @example
 * ```ts
 * const result = attemptDeterministicCorrection(
 *     compilationErrors,
 *     intent.props,
 *     contract,
 *     registry.getDesignTokens(),
 * );
 *
 * if (result.corrected) {
 *     // All errors fixed — re-validate through full pipeline
 *     const revalidated = await runPipeline({ ...intent, props: result.props });
 * }
 * ```
 */
export function attemptDeterministicCorrection(
    errors: readonly CompilationError[],
    props: Readonly<Record<string, unknown>>,
    contract: ComponentContract,
    designTokens: DesignTokenSet,
    enumMatchThreshold?: number,
): DeterministicCorrectionResult {
    const threshold = enumMatchThreshold ?? DEFAULT_ENUM_MATCH_THRESHOLD;

    // --- Tier 1: Deterministic Correction ---
    const tier1 = executeTier1(errors, props, contract, designTokens, threshold);

    // SC-16 short-circuit: if Tier 1 resolved ALL errors, skip Tier 2
    if (tier1.remaining.length === 0) {
        return {
            corrected: true,
            props: tier1.props,
            remaining: [],
            trace: tier1.trace,
        };
    }

    // --- Tier 2: Template Correction (examples-only, §4) ---
    const tier2 = executeTier2(tier1.remaining, tier1.props, contract);

    // Merge traces from both tiers
    const combinedTrace: CorrectionTraceEntry[] = [...tier1.trace, ...tier2.trace];

    return {
        corrected: tier2.remaining.length === 0,
        props: tier2.props,
        remaining: tier2.remaining,
        trace: combinedTrace,
    };
}
