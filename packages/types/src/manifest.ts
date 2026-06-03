/**
 * @module @enterstellar-ai/types/manifest
 * @description Compact Manifest types — the token-efficient component
 * descriptions sent to the LLM's system prompt.
 *
 * The compact manifest reduces context window consumption from ~50K tokens
 * to ~200 by including only the essential component metadata for selection.
 *
 * @see Bible §4.1 — Registry manifest generation
 * @see Design Choices R8, R9, R10
 */

// ---------------------------------------------------------------------------
// Compact Manifest Types
// ---------------------------------------------------------------------------

/**
 * A single entry in the compact manifest — the minimal representation of a
 * component sent to the LLM for component selection.
 *
 * Format per Design Choice R8: custom compact JSON with name, description,
 * prop summaries, and category. NOT full JSON Schema (too verbose).
 *
 * @see Design Choice R8 — compact JSON format
 * @see Design Choice R9 — descriptions max 120 chars (enforced by `defineComponent`)
 * @see Design Choice SI8 — similarity scores included when available
 */
export type CompactManifestEntry = {
    /** PascalCase component name. Max 30 characters. */
    readonly name: string;
    /** Concise component description. Max 120 characters. */
    readonly description: string;
    /** Component category for classification. */
    readonly category: string;
    /** Summary of key props: `{ "patientId": "string (UUID)", "riskLevel": "enum: low|medium|high|critical" }`. */
    readonly props: Readonly<Record<string, string>>;
    /**
     * Display mode, if specified in the contract.
     *
     * @see Appendix E P8
     */
    readonly mode?: string;
    /**
     * Interaction type, if specified in the contract.
     *
     * @see Appendix E P8
     */
    readonly interaction?: string;
    /**
     * Semantic similarity score (0.0–1.0).
     * Only present when the manifest entry comes from a semantic search result.
     * Helps the LLM prioritize high-confidence matches.
     *
     * @see Design Choice SI8
     */
    readonly score?: number;
};
