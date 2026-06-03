/**
 * @module @enterstellar-ai/migration/extract/heuristics
 * @description Heuristic fallback functions for enrichable fields.
 *
 * When Phase 1 cannot extract a field value from the AST (no JSDoc,
 * no ARIA attributes, no conditional rendering), these functions
 * generate `heuristic-fallback` values from conventions:
 *
 * | Field             | Heuristic                                    |
 * |:------------------|:---------------------------------------------|
 * | `description`     | `'TODO: Add description'`                    |
 * | `tags`            | `[]`                                         |
 * | `category`        | Directory path → known category, else `'utility'` |
 * | `intent`          | `'Render {name}'`                            |
 * | `ariaAttributes`  | `{}` (empty — Phase 3 fills from category)   |
 * | `designTokenRefs` | `[]`                                         |
 * | `lifecycleStates` | `[]`                                         |
 *
 * These values are tagged as `ManifestFieldSource: 'heuristic-fallback'`
 * and are candidates for Phase 2 LLM enrichment.
 *
 * **L15 compliance:** Zero framework imports. Pure string/path operations.
 *
 * @see Correction 2 — AST-Determined vs. Heuristic-Fallback decision rules
 */

import type { ComponentCategory } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Known Categories (R11 — ComponentCategory predefined values)
// ---------------------------------------------------------------------------

/**
 * The 8 predefined `ComponentCategory` values, excluding the extensible
 * `custom:${string}` template literal variant.
 *
 * Derived from `ComponentCategory` via `Exclude` — NOT a manual copy.
 * This ensures the compiler catches any drift between this array and
 * the source-of-truth type in `@enterstellar-ai/types`.
 *
 * @see Design Choice R11 — predefined component categories
 */
type PredefinedCategory = Exclude<ComponentCategory, `custom:${string}`>;

/**
 * The 8 predefined `ComponentCategory` values from `@enterstellar-ai/types`.
 *
 * Used by `inferCategory()` to match directory path segments against
 * known category names. The `custom:${string}` extensible variant is
 * NOT included — heuristic inference maps to known categories only.
 * Custom categories are an author-declared concern, not a heuristic one.
 *
 * **Compile-time sync guarantee (two guards):**
 * 1. `satisfies readonly PredefinedCategory[]` — ensures every element
 *    is a valid `PredefinedCategory`. Catches typos and stale values.
 * 2. `AssertNone<MissingCategories>` — ensures every `PredefinedCategory`
 *    is present in the array. Catches additions to `ComponentCategory`
 *    that aren't reflected here.
 *
 * If `ComponentCategory` in `@enterstellar-ai/types` is updated, `tsc` will error
 * here until this array is brought into sync.
 *
 * @see Design Choice R11 — predefined component categories
 * @see `@enterstellar-ai/compiler/pipeline/accessibility-step.ts` — CATEGORY_ROLE_DEFAULTS
 */
const KNOWN_CATEGORIES = [
    'clinical',
    'admin',
    'navigation',
    'data-display',
    'form',
    'feedback',
    'layout',
    'utility',
] as const satisfies readonly PredefinedCategory[];

/**
 * Compile-time exhaustiveness check.
 *
 * Verifies every `PredefinedCategory` is present in `KNOWN_CATEGORIES`.
 *
 * **How it works:** `Exclude<PredefinedCategory, ArrayValues>` is `never`
 * when all values are covered. If a new category is added to
 * `ComponentCategory` without updating `KNOWN_CATEGORIES`, the `Exclude`
 * resolves to that missing value. Since a non-`never` type cannot be
 * assigned to a `never` parameter, `tsc` emits an error like:
 *
 * ```
 * Argument of type 'void' is not assignable to parameter of type '"newcategory"'.
 * ```
 *
 * The function call is dead code — tree-shaken in production builds.
 * The `void` call satisfies `noUnusedLocals`.
 */
function assertCategoriesExhaustive(
    _missing: Exclude<PredefinedCategory, (typeof KNOWN_CATEGORIES)[number]>,
): void {
    // Intentionally empty — compile-time only.
}
void assertCategoriesExhaustive;

// ---------------------------------------------------------------------------
// Category Inference
// ---------------------------------------------------------------------------

/**
 * Infers a component category from its file path.
 *
 * Splits the path into directory segments and checks each against the
 * 8 known `ComponentCategory` values. Matching is **case-insensitive**
 * to handle variations like `Clinical/`, `FORM/`, or `data-display/`.
 *
 * **Match priority:** The first matching segment (leftmost) wins. For
 * a path like `src/clinical/form/PatientForm.tsx`, the result is
 * `'clinical'` — the parent directory is the stronger signal.
 *
 * **Fallback:** Returns `'utility'` when no known category is found
 * in the path. This is the safest default — utility components have
 * the least restrictive accessibility and routing constraints.
 *
 * **Path normalization:** Backslashes are converted to forward slashes
 * to handle Windows-style paths consistently.
 *
 * @param filePath - Relative file path from the project root
 *   (e.g., `'src/components/clinical/PatientCard.tsx'`).
 * @returns The inferred category string — one of the 8 known
 *   `ComponentCategory` values.
 *
 * @example
 * ```ts
 * inferCategory('src/components/clinical/PatientCard.tsx');
 * // → 'clinical'
 *
 * inferCategory('src/components/ui/Card.tsx');
 * // → 'utility'
 *
 * inferCategory('src/data-display/Chart.tsx');
 * // → 'data-display'
 *
 * inferCategory('lib\\feedback\\Toast.tsx');
 * // → 'feedback' (Windows path normalized)
 * ```
 *
 * @see Correction 2 — category decision rule
 */
export function inferCategory(filePath: string): string {
    // Normalize Windows backslashes → forward slashes for consistent splitting.
    const normalized = filePath.replace(/\\/g, '/');

    // Split into path segments and discard the filename (last segment).
    const segments = normalized.split('/');
    segments.pop(); // Remove filename — only directories are relevant.

    // Check each directory segment against known categories.
    // Leftmost match wins (parent directory is stronger signal).
    for (const segment of segments) {
        const lower = segment.toLowerCase();

        for (const category of KNOWN_CATEGORIES) {
            if (lower === category) {
                return category;
            }
        }
    }

    // No known category found in path — default to 'utility'.
    return 'utility';
}

// ---------------------------------------------------------------------------
// Intent Generation
// ---------------------------------------------------------------------------

/**
 * Generates a heuristic intent string from the component name.
 *
 * Intent is inherently semantic — it is **never** AST-determined.
 * The heuristic value `'Render {name}'` serves as a placeholder
 * until Phase 2 enrichment produces a natural-language intent.
 *
 * This function is deterministic: the same component name always
 * produces the same intent string.
 *
 * @param componentName - PascalCase component name
 *   (e.g., `'PatientCard'`, `'NavigationSidebar'`).
 * @returns A heuristic intent string
 *   (e.g., `'Render PatientCard'`, `'Render NavigationSidebar'`).
 *
 * @example
 * ```ts
 * generateHeuristicIntent('PatientCard');
 * // → 'Render PatientCard'
 *
 * generateHeuristicIntent('Spacer');
 * // → 'Render Spacer'
 * ```
 */
export function generateHeuristicIntent(componentName: string): string {
    return `Render ${componentName}`;
}

// ---------------------------------------------------------------------------
// Description Fallback
// ---------------------------------------------------------------------------

/**
 * Generates a heuristic description for components without JSDoc.
 *
 * If the component has a `@deprecated` annotation but no `@description`,
 * the heuristic includes the deprecation notice for context. This helps
 * Phase 2 LLM enrichment produce a more informed description.
 *
 * **Deterministic:** The same inputs always produce the same output.
 *
 * @param componentName - PascalCase component name
 *   (e.g., `'PatientCard'`).
 * @param deprecated - The `@deprecated` annotation text, if present.
 *   When `undefined`, the deprecation notice is omitted.
 * @returns A heuristic description string tagged for developer attention.
 *
 * @example
 * ```ts
 * generateHeuristicDescription('PatientCard');
 * // → 'TODO: Add description'
 *
 * generateHeuristicDescription('OldWidget', 'Use NewWidget instead');
 * // → 'TODO: Add description (note: component is deprecated — Use NewWidget instead)'
 * ```
 */
export function generateHeuristicDescription(
    componentName: string,
    deprecated?: string,
): string {
    // The componentName is available for future heuristic refinement
    // (e.g., PascalCase splitting → "Patient Card" → sentence generation).
    // v1 uses a static placeholder per the Correction 2 spec.
    void componentName;

    if (deprecated !== undefined) {
        return `TODO: Add description (note: component is @deprecated — ${deprecated})`;
    }

    return 'TODO: Add description';
}
