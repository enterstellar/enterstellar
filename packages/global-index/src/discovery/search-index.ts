/**
 * @module @enterstellar-ai/global-index/discovery/search-index
 * @description Internal HTTP methods for contract search and retrieval.
 *
 * Provides three operations against the Global Index service:
 * 1. **Search** — `POST /v1/search` (GI5)
 * 2. **Get Contract** — `GET /v1/contracts/{name}?registry={url}`
 * 3. **Featured** — `GET /v1/featured`
 *
 * These are the core discovery operations — the most frequently called
 * methods on the `GlobalIndex` interface. All HTTP calls delegate to
 * the shared transport layer for consistent auth, timeout, error wrapping,
 * and Zod response validation.
 *
 * @see Design Choice GI5 — centralized search index, sub-100ms target.
 * @see Bible §4.14 — `search()`, `getContract()`, `featured()`.
 * @internal
 */

import { z } from 'zod';

import { createSearchError } from '../errors.js';
import { execute, executeOptional } from '../transport.js';
import type { TransportConfig } from '../transport.js';
import { GlobalSearchResultSchema } from '../types.js';
import type {
    GlobalSearchOptions,
    GlobalSearchResult,
} from '../types.js';

// ---------------------------------------------------------------------------
// Response Schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for the `POST /v1/search` response.
 * The server returns an object with a `results` array field.
 *
 * @internal
 */
const SearchResponseSchema = z.object({
    results: z.array(GlobalSearchResultSchema),
});

/**
 * Zod schema for the `GET /v1/contracts/{name}` response.
 * The server wraps the result in a `result` field.
 *
 * @internal
 */
const SingleResultResponseSchema = z.object({
    result: GlobalSearchResultSchema,
});

/**
 * Zod schema for the `GET /v1/featured` response.
 * Same structure as search — an object with a `results` array.
 *
 * @internal
 */
const FeaturedResponseSchema = z.object({
    results: z.array(GlobalSearchResultSchema),
});

// ---------------------------------------------------------------------------
// searchContracts()
// ---------------------------------------------------------------------------

/**
 * Searches for contracts across all federated registries.
 *
 * Sends a `POST /v1/search` request with the query and optional filters.
 * The Global Index service performs full-text + semantic search across
 * its centralized index (GI5) and returns results sorted by relevance.
 *
 * @param config - Transport configuration (endpoint, apiKey, timeoutMs).
 * @param query - Natural language search query (intent string).
 * @param options - Optional search configuration (topK, filters).
 * @returns Matching contracts sorted by relevance. Empty array if no matches.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @see Design Choice GI5 — centralized search, sub-100ms target.
 * @internal
 */
export async function searchContracts(
    config: TransportConfig,
    query: string,
    options?: GlobalSearchOptions,
): Promise<readonly GlobalSearchResult[]> {
    // -----------------------------------------------------------------------
    // Build request body
    // -----------------------------------------------------------------------
    const body: Record<string, unknown> = { query };

    if (options?.topK !== undefined) {
        body['topK'] = options.topK;
    }

    if (options?.filters !== undefined) {
        const filters: Record<string, unknown> = {};

        if (options.filters.category !== undefined) {
            filters['category'] = options.filters.category;
        }
        if (options.filters.publisher !== undefined) {
            filters['publisher'] = options.filters.publisher;
        }
        if (options.filters.certified !== undefined) {
            filters['certified'] = options.filters.certified;
        }

        // Only include filters object if at least one filter is set
        if (Object.keys(filters).length > 0) {
            body['filters'] = filters;
        }
    }

    // -----------------------------------------------------------------------
    // HTTP request
    // -----------------------------------------------------------------------
    const response = await execute(config, {
        method: 'POST',
        path: '/v1/search',
        body: body,
    }, SearchResponseSchema);

    // Cast: Zod validates the envelope; contract field is passed through
    // as Record<string, unknown> but contains a full ComponentContract at runtime.
    return response.data.results as unknown as readonly GlobalSearchResult[];
}

// ---------------------------------------------------------------------------
// getContract()
// ---------------------------------------------------------------------------

/**
 * Retrieves a specific contract by name and originating registry URL.
 *
 * Sends a `GET /v1/contracts/{name}?registry={url}` request.
 * Returns `null` if the server responds with `404 Not Found` —
 * a missing contract is an expected case, not an exception.
 *
 * @param config - Transport configuration.
 * @param name - PascalCase component name (e.g., `'PatientVitals'`).
 * @param registryUrl - URL of the registry that published the contract.
 * @returns The contract with federation metadata, or `null` if not found.
 * @throws {EnterstellarError} `ENS-5032` if `name` or `registryUrl` is empty.
 * @throws {EnterstellarError} `ENS-5032` on non-404 HTTP/network errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @internal
 */
export async function getContract(
    config: TransportConfig,
    name: string,
    registryUrl: string,
): Promise<GlobalSearchResult | null> {
    // -----------------------------------------------------------------------
    // Guard: empty name or registry URL
    // -----------------------------------------------------------------------
    if (name.trim() === '') {
        throw createSearchError('Component name must not be empty.');
    }

    if (registryUrl.trim() === '') {
        throw createSearchError('Registry URL must not be empty.');
    }

    // -----------------------------------------------------------------------
    // HTTP request — uses executeOptional for 404 → null
    // -----------------------------------------------------------------------
    const response = await executeOptional(config, {
        method: 'GET',
        path: `/v1/contracts/${encodeURIComponent(name)}`,
        query: { registry: registryUrl },
    }, SingleResultResponseSchema);

    if (response === null) {
        return null;
    }

    // Cast: Zod validates the envelope; contract field is a full ComponentContract at runtime.
    return response.data.result as unknown as GlobalSearchResult;
}

// ---------------------------------------------------------------------------
// getFeatured()
// ---------------------------------------------------------------------------

/**
 * Retrieves trending and featured contracts from the Global Index.
 *
 * Sends a `GET /v1/featured` request. Featured contracts are curated
 * server-side based on usage count, star count, and certification status.
 *
 * @param config - Transport configuration.
 * @returns Top featured contracts sorted by relevance. Empty array if none.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @internal
 */
export async function getFeatured(
    config: TransportConfig,
): Promise<readonly GlobalSearchResult[]> {
    const response = await execute(config, {
        method: 'GET',
        path: '/v1/featured',
    }, FeaturedResponseSchema);

    // Cast: Zod validates the envelope; contract field is a full ComponentContract at runtime.
    return response.data.results as unknown as readonly GlobalSearchResult[];
}
