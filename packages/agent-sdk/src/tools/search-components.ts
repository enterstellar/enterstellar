/**
 * @module @enterstellar-ai/agent-sdk/tools/search-components
 * @description Implements the `enterstellar_search_components` MCP tool.
 *
 * Searches the semantic index for components matching a natural-language
 * query. Returns the top-K most similar components sorted by descending
 * similarity score.
 *
 * **Delegation:** Directly wraps `SemanticIndex.search()` with input
 * validation and error wrapping. The semantic index handles embedding,
 * vector search, and threshold filtering internally.
 *
 * **Edge cases:**
 * - Empty query → returns empty array (no error).
 * - `topK` out of range → clamped to [1, 20] (agent-friendly, no error).
 * - Semantic index failure → wrapped in `ENS-8002`.
 *
 * @see Bible §4.16 — `enterstellar_search_components` tool definition.
 * @see Design Choice SI5 — default topK: 5, max: 20.
 * @see Design Choice SI6 — noMatchThreshold filtering.
 */

import type { SemanticSearchResult } from '@enterstellar-ai/types';

import type { AgentSDKSemanticIndex } from '../types.js';
import { searchFailedError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of results when `topK` is not specified (SI5). */
const DEFAULT_TOP_K = 5;

/** Minimum allowed `topK` value. */
const MIN_TOP_K = 1;

/** Maximum allowed `topK` value (SI5). */
const MAX_TOP_K = 20;

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar_search_components` tool.
 *
 * Searches the semantic index for components matching the natural-language
 * `query`. Returns up to `topK` results sorted by descending similarity.
 *
 * @param semanticIndex - The semantic index instance to search against.
 * @param query - Natural-language intent string (e.g., `'show patient vitals'`).
 * @param topK - Maximum number of results. Clamped to [1, 20]. Default: 5.
 * @returns Array of `SemanticSearchResult` objects with similarity scores.
 *
 * @throws {EnterstellarError} Code `ENS-8002` if the semantic index search fails.
 *
 * @example
 * ```ts
 * const results = await executeSearchComponents(index, 'show patient vitals', 5);
 * // results[0].componentName === 'PatientVitals'
 * // results[0].similarity === 0.92
 * ```
 */
export async function executeSearchComponents(
    semanticIndex: AgentSDKSemanticIndex,
    query: string,
    topK?: number,
): Promise<readonly SemanticSearchResult[]> {
    // Empty query → empty results (no error, agent-friendly)
    if (query.trim().length === 0) {
        return [];
    }

    // Clamp topK to valid range — don't error, agent may send out-of-range values
    const clampedTopK = Math.max(
        MIN_TOP_K,
        Math.min(MAX_TOP_K, topK ?? DEFAULT_TOP_K),
    );

    try {
        return await semanticIndex.search(query, { topK: clampedTopK });
    } catch (error: unknown) {
        throw searchFailedError(query, error);
    }
}
