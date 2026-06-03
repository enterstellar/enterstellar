/**
 * @module @enterstellar-ai/semantic-index/create-semantic-index
 * @description Main factory for the Enterstellar Semantic Index.
 *
 * `createSemanticIndex(config)` returns a `SemanticIndex` object that:
 * 1. **Embeds** all registry components using the configured `EmbeddingProvider`
 * 2. **Stores** embeddings in a `MemoryVectorStore` (brute-force cosine)
 * 3. **Searches** for components matching natural-language intents
 * 4. **Caches** identical queries in an LRU cache (SI9)
 * 5. **Auto-updates** on registry changes via event subscription (SI3)
 * 6. **Warms up** common intents for instant first-search UX (SI11)
 *
 * **Factory pattern:** Returns a plain object with closures — no class,
 * no prototype chain. Consistent with the R1 pattern across all Enterstellar modules.
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript engine module.
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 */

import type {
    CompactManifestEntry,
    ComponentContract,
    SemanticSearchResult,
} from '@enterstellar-ai/types';

import { buildEmbeddingText } from './embedding-text.js';
import {
    embeddingProviderError,
    indexNotBuiltError,
    invalidTopKError,
    warmupFailedError,
} from './errors.js';
import { createMemoryVectorStore } from './memory-vector-store.js';
import { createQueryCache } from './query-cache.js';
import type { QueryCache } from './query-cache.js';
import type {
    SearchFilter,
    SearchOptions,
    SemanticIndex,
    SemanticIndexConfig,
    VectorStore,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default similarity threshold below which results are excluded (SI6). */
const DEFAULT_NO_MATCH_THRESHOLD = 0.4;

/** Default number of results to return (SI5). */
const DEFAULT_TOP_K = 5;

/** Minimum allowed topK value (SI5). */
const MIN_TOP_K = 1;

/** Maximum allowed topK value (SI5). */
const MAX_TOP_K = 20;

/** Default LRU cache size (SI9). */
const DEFAULT_MAX_CACHE_SIZE = 100;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Applies post-search filtering by category and/or tags.
 *
 * Filtering is applied after vector search in brute-force mode (SI7).
 * A result passes the filter if:
 * - `filter.category` is absent OR matches the contract's category
 * - `filter.tags` is absent OR at least one tag overlaps with the contract's tags
 *
 * @param results - Unfiltered search results.
 * @param filter - Filter criteria.
 * @returns Filtered results (same ordering preserved).
 */
function applyFilter(
    results: readonly SemanticSearchResult[],
    filter: SearchFilter,
): readonly SemanticSearchResult[] {
    return results.filter((result) => {
        // Category filter: exact match
        if (filter.category !== undefined && result.contract.category !== filter.category) {
            return false;
        }

        // Tags filter: at least one tag must overlap
        if (filter.tags !== undefined && filter.tags.length > 0) {
            const contractTags = new Set(result.contract.tags);
            const hasOverlap = filter.tags.some((tag) => contractTags.has(tag));
            if (!hasOverlap) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Builds a `CompactManifestEntry` from a `SemanticSearchResult`.
 *
 * Generates the token-efficient format per Design Choice R8, enriched
 * with the similarity `score` per SI8.
 *
 * @param result - A single search result.
 * @returns A `CompactManifestEntry` with `score` populated.
 */
function buildManifestEntry(result: SemanticSearchResult): CompactManifestEntry {
    const contract = result.contract;

    // Extract prop key summaries from the Zod schema.
    // We use a simplified format: `{ "propName": "unknown" }` since
    // full type descriptions require deeper Zod introspection (deferred).
    const propSummary: Record<string, string> = {};
    if (
        typeof contract.props === 'object' &&
        'shape' in contract.props &&
        contract.props.shape !== null &&
        typeof contract.props.shape === 'object'
    ) {
        for (const key of Object.keys(contract.props.shape)) {
            propSummary[key] = 'unknown';
        }
    }

    return {
        name: contract.name,
        description: contract.description,
        category: contract.category,
        props: propSummary,
        score: result.similarity,
    };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an Enterstellar Semantic Index — embedding-based component retrieval engine.
 *
 * The index reduces the LLM context window from ~50K tokens to ~200 by
 * selecting only the most relevant `ComponentContract`s for a given intent.
 *
 * @param config - Index configuration. See `SemanticIndexConfig` for details.
 * @returns A `SemanticIndex` instance (plain object with closures, per R1).
 *
 * @example
 * ```ts
 * import { createSemanticIndex } from '@enterstellar-ai/semantic-index';
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 *
 * const registry = createRegistry({ components: [PatientVitals, MedicationList] });
 * const index = createSemanticIndex({
 *   registry,
 *   provider: 'local',
 *   embeddingProvider: myLocalProvider,
 * });
 *
 * await index.build();
 * const results = await index.search('show patient vitals');
 * const manifest = index.getCompactManifest(results);
 * ```
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 */
export function createSemanticIndex(config: SemanticIndexConfig): SemanticIndex {
    const {
        registry,
        embeddingProvider,
        noMatchThreshold = DEFAULT_NO_MATCH_THRESHOLD,
        maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
    } = config;

    // ------------------------------------------------------------------
    // Internal state
    // ------------------------------------------------------------------

    /** The vector store holding component embeddings. */
    const vectorStore: VectorStore = createMemoryVectorStore();

    /** LRU query cache for identical intent strings (SI9). */
    const queryCache: QueryCache = createQueryCache(maxCacheSize);

    /**
     * Tracks whether `build()` has been called at least once.
     * `search()` throws `ENS-5021` if the index hasn't been built.
     */
    let isBuilt = false;

    /**
     * Stores unsubscribe functions for registry event handlers.
     * These are registered after the first `build()` call.
     */
    const unsubscribers: Array<() => void> = [];

    // ------------------------------------------------------------------
    // Internal: Embed a single component
    // ------------------------------------------------------------------

    /**
     * Embeds a single component and adds it to the vector store.
     *
     * @param contract - The component contract to embed.
     * @throws {EnterstellarError} Code `ENS-5020` if the embedding provider fails.
     */
    async function embedComponent(contract: ComponentContract): Promise<void> {
        if (embeddingProvider === undefined) {
            return;
        }

        const text = buildEmbeddingText(contract);

        try {
            const [vector] = await embeddingProvider.embed([text]);
            if (vector !== undefined) {
                vectorStore.add(contract.name, vector);
            }
        } catch (error: unknown) {
            throw embeddingProviderError(
                `Failed to embed component '${contract.name}'`,
                error,
            );
        }
    }

    // ------------------------------------------------------------------
    // Internal: Registry event handlers (SI3)
    // ------------------------------------------------------------------

    /**
     * Handles `register` and `update` events — incrementally re-embed
     * the changed component and invalidate the query cache.
     */
    function handleComponentChange(contract: ComponentContract): void {
        // Invalidate cache — any cached results may now be stale (SI9)
        queryCache.invalidate();

        // Re-embed asynchronously. Errors are caught and logged silently —
        // a failed incremental update should not crash the application.
        void embedComponent(contract).catch(() => {
            // Silently swallow — the component will be re-embedded on
            // the next full `rebuild()` call. Logging is handled upstream
            // by the telemetry layer when available.
        });
    }

    /**
     * Handles `unregister` events — remove the component from the
     * vector store and invalidate the query cache.
     */
    function handleComponentRemove(contract: ComponentContract): void {
        vectorStore.remove(contract.name);
        queryCache.invalidate();
    }

    /**
     * Subscribes to registry events for incremental re-embedding.
     * Called once after the first `build()`.
     */
    function subscribeToRegistry(): void {
        // Avoid duplicate subscriptions on repeated `build()` calls
        if (unsubscribers.length > 0) {
            return;
        }

        unsubscribers.push(registry.on('register', handleComponentChange));
        unsubscribers.push(registry.on('update', handleComponentChange));
        unsubscribers.push(registry.on('unregister', handleComponentRemove));
    }

    // ------------------------------------------------------------------
    // Public API (SemanticIndex interface)
    // ------------------------------------------------------------------

    return {
        async build(): Promise<void> {
            // Clear existing state for a fresh build
            vectorStore.clear();
            queryCache.invalidate();

            if (embeddingProvider === undefined) {
                // No provider — index is "built" but empty.
                // Useful for cloud-only mode where search delegates to api.enterstellar.dev.
                isBuilt = true;
                subscribeToRegistry();
                return;
            }

            // Collect all component contracts from the registry
            const componentNames = registry.list();
            const contracts: ComponentContract[] = [];

            for (const name of componentNames) {
                const contract = registry.get(name);
                if (contract !== undefined) {
                    contracts.push(contract);
                }
            }

            // Batch-embed all contracts.
            // Build embedding text for each, then embed in a single batch
            // call for provider efficiency (batching reduces API round-trips
            // for cloud providers like OpenAI).
            if (contracts.length > 0) {
                const texts = contracts.map((c) => buildEmbeddingText(c));

                try {
                    const vectors = await embeddingProvider.embed(texts);

                    for (let i = 0; i < contracts.length; i++) {
                        const contract = contracts[i];
                        const vector = vectors[i];
                        if (contract !== undefined && vector !== undefined) {
                            vectorStore.add(contract.name, vector);
                        }
                    }
                } catch (error: unknown) {
                    throw embeddingProviderError(
                        'Batch embedding failed during build()',
                        error,
                    );
                }
            }

            isBuilt = true;
            subscribeToRegistry();
        },

        async search(
            intent: string,
            options?: SearchOptions,
        ): Promise<readonly SemanticSearchResult[]> {
            // Guard: index must be built before searching
            if (!isBuilt) {
                throw indexNotBuiltError();
            }

            // Validate topK (SI5: 1–20)
            const topK = options?.topK ?? DEFAULT_TOP_K;
            if (topK < MIN_TOP_K || topK > MAX_TOP_K) {
                throw invalidTopKError(topK);
            }

            // Check query cache (SI9: exact intent string match)
            const cached = queryCache.get(intent);
            if (cached !== undefined) {
                // Apply filter on cached results (filter may differ per call)
                if (options?.filter !== undefined) {
                    return applyFilter(cached, options.filter).slice(0, topK);
                }
                return cached.slice(0, topK);
            }

            // No provider — return empty (cloud-only mode stub)
            if (embeddingProvider === undefined) {
                return [];
            }

            // Embed the intent string
            let intentVector: Float64Array;
            try {
                const [vector] = await embeddingProvider.embed([intent]);
                if (vector === undefined) {
                    return [];
                }
                intentVector = vector;
            } catch (error: unknown) {
                throw embeddingProviderError(
                    `Failed to embed intent: '${intent}'`,
                    error,
                );
            }

            // Vector search — retrieve more than topK to account for
            // post-search filtering and threshold exclusion
            const searchTopK = Math.min(vectorStore.size, MAX_TOP_K * 2);
            const hits = vectorStore.search(intentVector, searchTopK);

            // Map vector hits to SemanticSearchResult with full contracts
            const results: SemanticSearchResult[] = [];
            for (const hit of hits) {
                // Exclude results below the no-match threshold (SI6)
                if (hit.score < noMatchThreshold) {
                    continue;
                }

                const contract = registry.get(hit.id);
                if (contract !== undefined) {
                    results.push({
                        componentName: hit.id,
                        similarity: hit.score,
                        contract,
                    });
                }
            }

            // Cache the unfiltered results (SI9: cache before filtering)
            queryCache.set(intent, results);

            // Apply post-search filter if provided (SI7)
            let filtered: readonly SemanticSearchResult[] = results;
            if (options?.filter !== undefined) {
                filtered = applyFilter(results, options.filter);
            }

            // Return at most topK results
            return filtered.slice(0, topK);
        },

        getCompactManifest(
            results: readonly SemanticSearchResult[],
        ): readonly CompactManifestEntry[] {
            return results.map(buildManifestEntry);
        },

        async warmup(intents: readonly string[]): Promise<void> {
            // Guard: index must be built before warmup
            if (!isBuilt) {
                throw indexNotBuiltError();
            }

            let failedCount = 0;

            for (const intent of intents) {
                try {
                    // search() handles embedding + caching internally
                    await this.search(intent);
                } catch {
                    failedCount++;
                }
            }

            // Report partial failures as a recoverable warning (ENS-5025)
            if (failedCount > 0) {
                throw warmupFailedError(failedCount, intents.length);
            }
        },

        async rebuild(): Promise<void> {
            vectorStore.clear();
            queryCache.invalidate();
            isBuilt = false;
            await this.build();
        },

        get size(): number {
            return vectorStore.size;
        },
    };
}

// ---------------------------------------------------------------------------
// Re-export SearchOptions for consumers importing from the factory module
// ---------------------------------------------------------------------------
export type { SearchOptions };
