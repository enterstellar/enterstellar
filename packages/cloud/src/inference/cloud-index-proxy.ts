/**
 * @module @enterstellar-ai/cloud/inference/cloud-index-proxy
 * @description Proxies semantic search requests to Enterstellar Cloud.
 *
 * Sends a natural language query to `POST /v1/semantic-search` and
 * returns a `CloudResult<readonly SemanticSearchResult[]>` wrapping
 * the server's search results with IPU metadata (SD7).
 *
 * **IPU cost:** 1 per invocation (§9.1, CL2).
 * **Timeout:** 10s default.
 * **Idempotency:** `X-Idempotency-Key` sent (AM10, ipuCost > 0).
 *
 * **Error policy (SD3):**
 * - Pre-flight quota exceeded → throw `CloudError` (`ENS-C4290`).
 * - 429 from server → throw `CloudError` (via transport).
 * - 5xx / network → retry 3× then throw `ENS-5005` (via transport).
 *
 * @see Design Choice CL2 — cloud semantic search = 1 IPU.
 * @see Design Choice SD3 — throw on 429.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Design Choice SI5 — default `topK: 5`.
 * @see Bible §9.1 — `POST /v1/semantic-search`.
 * @see Principle L15 — zero framework imports.
 */

import type { SemanticSearchResult } from '@enterstellar-ai/types';

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CloudIPU, CloudResult } from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';
import { createQuotaExceededError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default number of results to return from a semantic search.
 *
 * @see Design Choice SI5 — default `topK: 5`.
 */
const DEFAULT_TOP_K = 5;

// ---------------------------------------------------------------------------
// Server Response Shape
// ---------------------------------------------------------------------------

/**
 * Expected JSON response shape from `POST /v1/semantic-search`.
 *
 * @internal — used only for typing the transport response.
 */
type SemanticSearchResponse = {
    readonly results: readonly SemanticSearchResult[];
};

// ---------------------------------------------------------------------------
// CloudIndexProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for Cloud Semantic Index search.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface CloudIndexProxy {
    /**
     * Search for components via Cloud Semantic Index.
     *
     * @param query - Natural language search query (intent string).
     * @param topK - Maximum number of results. @default 5 (SI5).
     * @returns Search results wrapped in `CloudResult<T>` with IPU metadata.
     *
     * @throws {CloudError} `ENS-C4290` if IPU quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    search(
        query: string,
        topK?: number,
    ): Promise<CloudResult<readonly SemanticSearchResult[]>>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a `CloudIPU` object from transport response headers.
 *
 * @param ipuUsed - `X-IPU-Used` header value.
 * @param ipuRemaining - `X-IPU-Remaining` header value.
 * @param ipuCost - `X-IPU-Cost` header value.
 * @param isAnonymous - Whether the client is in anonymous mode.
 * @returns A `CloudIPU` object, or `null`.
 */
function buildIPU(
    ipuUsed: number | undefined,
    ipuRemaining: number | undefined,
    ipuCost: number | undefined,
    isAnonymous: boolean,
): CloudIPU | null {
    if (isAnonymous) {
        return null;
    }

    if (ipuUsed !== undefined && ipuRemaining !== undefined && ipuCost !== undefined) {
        return { used: ipuUsed, remaining: ipuRemaining, cost: ipuCost };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a {@link CloudIndexProxy} that routes semantic search requests
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker for cost recording and quota checks.
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `CloudIndexProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createCloudIndexProxy(transport, tracker, false);
 * const { data: results, ipu } = await proxy.search('patient vitals', 10);
 *
 * for (const result of results) {
 *     console.log(result.componentName, result.score);
 * }
 * ```
 *
 * @see Design Choice CL2 — cloud semantic search = 1 IPU.
 * @see Design Choice SD3 — throw on quota exceeded.
 * @internal
 */
export function createCloudIndexProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): CloudIndexProxy {
    return {
        async search(
            query: string,
            topK: number = DEFAULT_TOP_K,
        ): Promise<CloudResult<readonly SemanticSearchResult[]>> {
            // ---------------------------------------------------------------
            // Pre-flight quota check (SD3).
            // Throws CloudError instead of returning degraded.
            // ---------------------------------------------------------------
            if (tracker.isOverQuota()) {
                throw createQuotaExceededError({
                    code: 'ENS-C4290',
                    message: 'IPU quota exceeded (pre-flight check)',
                });
            }

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // Transport handles retry (SD5), 429 throw (SD3), timeout (F21).
            // ---------------------------------------------------------------
            const response = await transport.request<SemanticSearchResponse>({
                method: 'POST',
                path: '/v1/semantic-search',
                body: { query, topK },
                ipuCost: IPU_COSTS.SEMANTIC_SEARCH,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker with server headers (CL1).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // Record local cost estimate.
            tracker.record(IPU_COSTS.SEMANTIC_SEARCH);

            // ---------------------------------------------------------------
            // Build CloudResult<readonly SemanticSearchResult[]> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            // The transport guarantees `response.ok === true` at this point.
            // Guard against null data defensively.
            const data = response.data;
            const results: readonly SemanticSearchResult[] = data?.results ?? [];

            return { data: results, ipu };
        },
    };
}
