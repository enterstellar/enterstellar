/**
 * @module @enterstellar-ai/semantic-index/embedding-text
 * @description Pure function that converts a `ComponentContract` into a single
 * text string for embedding by a vector model.
 *
 * The embedding text formula is **locked per Design Choice SI2**:
 *
 * ```
 * name + description + category + tags.join(' ') + props.keys.join(' ') + accessibility.role
 * ```
 *
 * **Excluded:** `states` keys (loading/error/empty are universal, add no
 * discriminating signal per SI2).
 *
 * This function is deterministic, side-effect-free, and fully testable.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice SI2 — locked field set for embedding.
 */

import type { ComponentContract } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Zod Shape Extraction
// ---------------------------------------------------------------------------

/**
 * Safely extracts the top-level property keys from a Zod schema.
 *
 * If the schema is a `ZodObject` (has a `.shape` property with enumerable keys),
 * returns those keys. For all other schema types (ZodArray, ZodUnion, etc.),
 * returns an empty array — those schemas don't have named properties.
 *
 * @param zodSchema - The Zod schema from `ComponentContract.props`.
 * @returns Array of top-level property key names, or empty array.
 */
function extractPropKeys(zodSchema: unknown): readonly string[] {
    // ZodObject instances expose `.shape` as a plain object of ZodType values.
    // We check for the property's existence and type defensively — the contract
    // type declares `props: z.ZodType` (opaque), so we cannot rely on a specific
    // Zod class hierarchy.
    if (
        zodSchema !== null &&
        typeof zodSchema === 'object' &&
        'shape' in zodSchema &&
        zodSchema.shape !== null &&
        typeof zodSchema.shape === 'object'
    ) {
        return Object.keys(zodSchema.shape);
    }
    return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the embedding text for a single `ComponentContract`.
 *
 * The output string is fed to an `EmbeddingProvider` to produce a dense
 * vector that captures the component's semantic identity. The formula
 * concatenates the locked field set per SI2:
 *
 * 1. `name` — PascalCase component name
 * 2. `description` — concise purpose (max 120 chars)
 * 3. `category` — predefined classification
 * 4. `tags` — semantic matching keywords (space-separated)
 * 5. `props.keys` — top-level prop names (space-separated)
 * 6. `accessibility.role` — WAI-ARIA role
 *
 * All parts are joined with a single space. Extra whitespace is collapsed
 * and the result is trimmed.
 *
 * @param contract - The `ComponentContract` to generate embedding text for.
 * @returns A single, normalized text string for embedding.
 *
 * @example
 * ```ts
 * const text = buildEmbeddingText(PatientVitalsContract);
 * // "PatientVitals Displays real-time patient vital signs clinical patient vitals monitoring patientId riskLevel region"
 * ```
 *
 * @see Design Choice SI2 — locked field set.
 */
export function buildEmbeddingText(contract: ComponentContract): string {
    const parts: string[] = [
        // 1. Component name
        contract.name,

        // 2. Description
        contract.description,

        // 3. Category
        contract.category,

        // 4. Tags (space-separated)
        contract.tags.join(' '),

        // 5. Prop keys extracted from Zod schema (space-separated)
        extractPropKeys(contract.props).join(' '),

        // 6. Accessibility role
        contract.accessibility.role,
    ];

    // Collapse multiple spaces and trim outer whitespace for a clean
    // embedding input. Avoids double-spaces from empty tag arrays or
    // schemas with no extractable prop keys.
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
