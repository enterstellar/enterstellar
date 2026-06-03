/**
 * @module @enterstellar-ai/semantic-index/types
 * @description Module-local type definitions for the Semantic Index.
 *
 * This file declares the `SemanticIndex` interface (public API surface),
 * `SemanticIndexConfig` (factory configuration), `SearchOptions`, `SearchFilter`,
 * and the pluggable `EmbeddingProvider` / `VectorStore` abstractions.
 *
 * **Naming:** Interfaces for objects with methods (`SemanticIndex`, `EmbeddingProvider`,
 * `VectorStore`); types for data shapes (`SemanticIndexConfig`, `SearchOptions`) —
 * per Design Choice T1.
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript + `@enterstellar-ai/types`.
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 */

import type {
    CompactManifestEntry,
    SemanticSearchResult,
} from '@enterstellar-ai/types';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

// ---------------------------------------------------------------------------
// Embedding Provider (SI1, SI2)
// ---------------------------------------------------------------------------

/**
 * Pluggable embedding provider — abstracts the model that converts text
 * into high-dimensional vectors for semantic similarity search.
 *
 * Enterstellar ships a default local provider using ONNX `all-MiniLM-L6-v2`
 * (384 dimensions, ~30MB). Cloud providers use OpenAI `text-embedding-3-small`
 * (1536 dimensions). Custom providers implement this interface.
 *
 * @see Design Choice SI1 — default local model: ONNX all-MiniLM-L6-v2.
 *
 * @example
 * ```ts
 * const mockProvider: EmbeddingProvider = {
 *   dimensions: 384,
 *   embed: async (texts) => texts.map(() => new Float64Array(384)),
 * };
 * ```
 */
export interface EmbeddingProvider {
    /**
     * Embeds one or more text strings into dense vector representations.
     *
     * @param texts - Array of text strings to embed. Order is preserved in output.
     * @returns Array of embedding vectors, one per input text. Each vector has
     *          exactly `dimensions` elements.
     */
    embed(texts: readonly string[]): Promise<readonly Float64Array[]>;

    /** The dimensionality of the embedding vectors produced by this provider. */
    readonly dimensions: number;
}

// ---------------------------------------------------------------------------
// Vector Store (SI4)
// ---------------------------------------------------------------------------

/**
 * A single hit returned from a vector store search.
 *
 * Contains the stored item's ID and its cosine similarity score
 * to the query vector.
 */
export type VectorSearchHit = {
    /** The unique identifier of the stored vector (component name). */
    readonly id: string;

    /**
     * Cosine similarity score between the query vector and this stored vector.
     * Range: -1.0 to 1.0 (normalized embeddings typically produce 0.0–1.0).
     */
    readonly score: number;
};

/**
 * Abstract vector storage interface — decouples the semantic index from
 * the underlying vector search implementation.
 *
 * Two implementations are planned:
 * - `MemoryVectorStore` — brute-force cosine similarity (≤500 components, <10ms).
 * - HNSW adapter — approximate nearest neighbors (500+ components, <5ms).
 *
 * @see Design Choice SI4 — auto-select based on registry size.
 */
export interface VectorStore {
    /**
     * Stores a vector under the given ID. Overwrites if ID already exists.
     *
     * @param id - Unique identifier (component name).
     * @param vector - Dense embedding vector.
     */
    add(id: string, vector: Float64Array): void;

    /**
     * Removes a vector by ID.
     *
     * @param id - The identifier to remove.
     * @returns `true` if the vector was removed, `false` if not found.
     */
    remove(id: string): boolean;

    /**
     * Searches for the top-K most similar vectors to the query.
     *
     * @param query - The query embedding vector.
     * @param topK - Maximum number of results to return.
     * @returns Array of hits sorted by descending similarity score.
     */
    search(query: Float64Array, topK: number): readonly VectorSearchHit[];

    /** Removes all stored vectors. */
    clear(): void;

    /** The current number of stored vectors. */
    readonly size: number;
}

// ---------------------------------------------------------------------------
// Search Options & Filters (SI5, SI7)
// ---------------------------------------------------------------------------

/**
 * Post-search filter criteria for restricting results to a subset
 * of the registry.
 *
 * Filters are applied after embedding search (brute-force mode) or
 * before search (HNSW mode with metadata filtering).
 *
 * @see Design Choice SI7 — filtered search by category, tags, or metadata.
 */
export type SearchFilter = {
    /**
     * Restrict results to components in this category.
     * E.g., `'clinical'` to only return clinical components.
     */
    readonly category?: string;

    /**
     * Restrict results to components matching ANY of these tags.
     * E.g., `['patient', 'vitals']` returns components tagged with either.
     */
    readonly tags?: readonly string[];
};

/**
 * Options for a semantic search query.
 *
 * @see Design Choice SI5 — default topK: 5, max: 20.
 * @see Design Choice SI7 — filtered search support.
 */
export type SearchOptions = {
    /**
     * Maximum number of results to return.
     * Default: `5`. Valid range: `1`–`20`.
     *
     * @see Design Choice SI5 — context window economy.
     */
    readonly topK?: number;

    /**
     * Post-search filter to restrict results by category or tags.
     *
     * @see Design Choice SI7 — filtered search.
     */
    readonly filter?: SearchFilter;
};

// ---------------------------------------------------------------------------
// Semantic Index Config
// ---------------------------------------------------------------------------

/**
 * Configuration for `createSemanticIndex()`.
 *
 * @see Design Choice SI1–SI12 for all locked configuration decisions.
 *
 * @example
 * ```ts
 * const index = createSemanticIndex({
 *   registry,
 *   provider: 'local',
 *   embeddingProvider: localOnnxProvider,
 * });
 * ```
 */
export type SemanticIndexConfig = {
    /**
     * The Enterstellar registry to index. The semantic index reads component
     * contracts from this registry and subscribes to its events for
     * incremental re-embedding (SI3).
     */
    readonly registry: EnterstellarRegistry;

    /**
     * Where embedding and search execute.
     *
     * - `'local'` — in-process embedding + in-memory vector store.
     * - `'cloud'` — delegates to `api.enterstellar.dev` semantic search endpoint.
     * - `'hybrid'` — local first, cloud fallback when local confidence < threshold.
     *
     * @see Design Choice SI12 — hybrid fallback triggers.
     */
    readonly provider: 'cloud' | 'local' | 'hybrid';

    /**
     * The embedding provider for generating dense vectors from text.
     * Required for `'local'` and `'hybrid'` providers.
     *
     * @see Design Choice SI1 — default: ONNX all-MiniLM-L6-v2.
     */
    readonly embeddingProvider?: EmbeddingProvider;

    /**
     * Cloud endpoint URL for `'cloud'` and `'hybrid'` providers.
     * Required when `provider` is `'cloud'`; optional for `'hybrid'`
     * (fallback only triggers if endpoint is reachable).
     */
    readonly cloudEndpoint?: string;

    /**
     * Minimum similarity score threshold. Results below this score
     * are excluded, and when ALL results fall below it, the Forge
     * should activate (caller's responsibility).
     *
     * Default: `0.4`.
     *
     * @see Design Choice SI6 — configurable per registry.
     */
    readonly noMatchThreshold?: number;

    /**
     * Maximum number of entries in the query result cache.
     * Exact-match intent string keys. Invalidated on registry changes.
     *
     * Default: `100`.
     *
     * @see Design Choice SI9 — LRU cache for identical queries.
     */
    readonly maxCacheSize?: number;
};

// ---------------------------------------------------------------------------
// SemanticIndex Interface
// ---------------------------------------------------------------------------

/**
 * The Enterstellar Semantic Index — embedding-based component retrieval engine.
 *
 * Reduces the LLM context window from ~50K tokens to ~200 by selecting
 * only the most relevant `ComponentContract`s for a given intent string.
 *
 * **Factory:** Created via `createSemanticIndex(config)`. Returns a plain
 * object with closures — no class instance, no prototype chain (R1 pattern).
 *
 * **Lifecycle:** Call `build()` once after creation to compute embeddings.
 * The index auto-updates on registry changes (SI3).
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 *
 * @example
 * ```ts
 * const index = createSemanticIndex({ registry, provider: 'local', embeddingProvider });
 * await index.build();
 *
 * const results = await index.search('show patient vitals');
 * const manifest = index.getCompactManifest(results);
 * // manifest entries include similarity scores (SI8)
 * ```
 */
export interface SemanticIndex {
    /**
     * Builds the full vector index from the current registry state.
     *
     * Iterates all registered components, generates embedding text per SI2
     * (`name + description + category + tags + props.keys + accessibility.role`),
     * batches through the `EmbeddingProvider`, and stores in the `VectorStore`.
     *
     * Must be called once before `search()`. Subsequent calls rebuild from scratch.
     * For incremental updates, the index auto-subscribes to registry events (SI3).
     */
    build(): Promise<void>;

    /**
     * Searches for components matching a natural-language intent.
     *
     * Returns the top-K most similar components, sorted by descending
     * similarity score. Results below `noMatchThreshold` are excluded.
     *
     * @param intent - Natural-language intent string (e.g., `'show patient vitals'`).
     * @param options - Optional search configuration (topK, filter).
     * @returns Array of search results with similarity scores.
     *
     * @throws {EnterstellarError} Code `ENS-5021` if called before `build()`.
     * @throws {EnterstellarError} Code `ENS-5022` if `topK` is outside 1–20.
     *
     * @see Design Choice SI5 — default topK: 5, max: 20.
     * @see Design Choice SI6 — noMatchThreshold filtering.
     * @see Design Choice SI9 — results cached by exact intent string.
     */
    search(intent: string, options?: SearchOptions): Promise<readonly SemanticSearchResult[]>;

    /**
     * Generates compact manifest entries for a set of search results.
     *
     * Each entry includes the component's metadata in the token-efficient
     * compact format, enriched with the similarity `score` (SI8).
     *
     * @param results - Search results from a prior `search()` call.
     * @returns Array of `CompactManifestEntry` objects with `score` populated.
     *
     * @see Design Choice SI8 — similarity scores in manifest.
     * @see Design Choice R8 — compact JSON format for token efficiency.
     */
    getCompactManifest(results: readonly SemanticSearchResult[]): readonly CompactManifestEntry[];

    /**
     * Pre-computes embeddings and caches search results for common intents.
     *
     * Should be called after `build()`, typically via `requestIdleCallback`
     * or `setTimeout(0)` for non-blocking execution.
     *
     * @param intents - Array of common intent strings to pre-warm.
     *
     * @see Design Choice SI11 — warmup for UX improvement on first search.
     */
    warmup(intents: readonly string[]): Promise<void>;

    /**
     * Clears the vector store and query cache, then rebuilds the full index.
     *
     * Use for manual full recomputation. Normally not needed — the index
     * auto-updates incrementally via registry event subscriptions (SI3).
     */
    rebuild(): Promise<void>;

    /** The current number of indexed components. */
    readonly size: number;
}
