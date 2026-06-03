/**
 * @module @enterstellar-ai/semantic-index
 * @description Enterstellar Semantic Index — embedding-based component retrieval engine.
 *
 * Reduces the LLM context window from ~50K tokens to ~200 by selecting only
 * the most relevant `ComponentContract`s for any natural-language intent.
 *
 * This barrel file re-exports the public API surface. Consumers import from
 * `@enterstellar-ai/semantic-index`. Internal modules (cosine-similarity, memory-vector-store,
 * query-cache, embedding-text) are implementation details and NOT re-exported.
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export { createSemanticIndex } from './create-semantic-index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
    EmbeddingProvider,
    SearchFilter,
    SearchOptions,
    SemanticIndex,
    SemanticIndexConfig,
    VectorSearchHit,
    VectorStore,
} from './types.js';

export type { QueryCache } from './query-cache.js';
