/**
 * @module @enterstellar-ai/types/semantic-index
 * @description Semantic Index types — search results and related data shapes
 * for the embedding-based component retrieval engine.
 *
 * The Semantic Index reduces the LLM context window from ~50K tokens to ~200
 * by selecting only the most relevant components for a given intent.
 *
 * **Naming:** Types for data shapes (`SemanticSearchResult`), not interfaces —
 * per Design Choice T1 (interfaces for objects with methods).
 *
 * **L15 compliance:** Zero framework imports. Pure data types only.
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 */

import { z } from 'zod';

import { ComponentContractSchema } from './contract.js';
import type { ComponentContract } from './contract.js';

// ---------------------------------------------------------------------------
// SemanticSearchResult
// ---------------------------------------------------------------------------

/**
 * A single result from a semantic index search.
 *
 * Returned by `SemanticIndex.search()` — each result pairs a component
 * with its cosine similarity score to the queried intent.
 *
 * @see Design Choice SI8 — similarity scores included in manifest entries.
 * @see Design Choice SI5 — default `topK: 5`, max 20.
 * @see Design Choice SI6 — below `noMatchThreshold` (0.4) → Forge activates.
 */
export type SemanticSearchResult = {
    /** PascalCase name of the matched component. */
    readonly componentName: string;

    /**
     * Cosine similarity score between the intent embedding and
     * the component's embedding vector. Range: 0.0–1.0.
     *
     * Scores above `noMatchThreshold` (default 0.4) indicate viable matches.
     * Scores below trigger Forge activation (caller's responsibility).
     */
    readonly similarity: number;

    /**
     * The full `ComponentContract` of the matched component.
     * Provides immediate access to props schema, tokens, and metadata
     * without a second registry lookup.
     */
    readonly contract: ComponentContract;
};

// ---------------------------------------------------------------------------
// Zod Schema (T7)
// ---------------------------------------------------------------------------

/**
 * Zod schema for `SemanticSearchResult`.
 *
 * Enables runtime validation of search results — useful for
 * cross-boundary data validation (e.g., results received from
 * a cloud semantic index endpoint).
 *
 * @see Design Choice T7 — export both TS type and Zod schema.
 */
export const SemanticSearchResultSchema = z.object({
    /** PascalCase name of the matched component. */
    componentName: z.string().min(1),

    /**
     * Cosine similarity score. Clamped to [0.0, 1.0].
     */
    similarity: z.number().min(0).max(1),

    /** The matched component's full contract. */
    contract: ComponentContractSchema,
});
