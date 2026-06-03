/**
 * @module @enterstellar-ai/cloud/operations/traces-query-proxy
 * @description Proxies paginated trace listing requests to Enterstellar Cloud.
 *
 * Provides `getTraces(options?)` → `GET /v1/traces` — paginated trace
 * listing with cursor-based pagination, filterable by `correlationId`
 * and/or `threadId`.
 *
 * **IPU cost:** 0 (§9.1). Reading your own data is always free.
 * **No idempotency key:** 0-cost operations skip `X-Idempotency-Key` (F8).
 * **No pre-flight quota check:** Free operations — quota is irrelevant.
 *
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Bible §9.1 — `GET /v1/traces`.
 * @see Principle L15 — zero framework imports.
 */

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type {
    CloudIPU,
    CloudResult,
    TraceListOptions,
    TracePage,
} from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// TracesQueryProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for paginated trace listing.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface TracesQueryProxy {
    /**
     * Query traces for the authenticated project.
     *
     * @param options - Pagination and filter options. All optional.
     * @returns Paginated trace listing wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    getTraces(options?: TraceListOptions): Promise<CloudResult<TracePage>>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a URL query string from an object of optional parameters.
 *
 * Only includes keys whose values are not `undefined` and not `null`.
 * Returns an empty string if no parameters are provided.
 *
 * @param params - Key-value pairs to serialize as query parameters.
 * @returns Query string prefixed with `?`, or empty string.
 */
function buildQueryString(
    params: Readonly<Record<string, string | number | undefined | null>>,
): string {
    const entries: string[] = [];

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            entries.push(
                `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
            );
        }
    }

    return entries.length > 0 ? `?${entries.join('&')}` : '';
}

/**
 * Builds a `CloudIPU` object from transport response headers.
 *
 * For 0-IPU endpoints, the server may omit `X-IPU-*` headers (AG8).
 * In that case, or in anonymous mode, returns `null`.
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
 * Creates a {@link TracesQueryProxy} that routes paginated trace queries
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker (for reconciliation only — queries cost 0 IPU).
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `TracesQueryProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createTracesQueryProxy(transport, tracker, false);
 *
 * // First page:
 * const { data: page } = await proxy.getTraces({ limit: 20 });
 *
 * // Next page:
 * if (page.hasMore && page.cursor !== null) {
 *     const { data: nextPage } = await proxy.getTraces({ cursor: page.cursor });
 * }
 * ```
 *
 * @internal
 */
export function createTracesQueryProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): TracesQueryProxy {
    return {
        async getTraces(
            options?: TraceListOptions,
        ): Promise<CloudResult<TracePage>> {
            // ---------------------------------------------------------------
            // No pre-flight quota check — queries are free (0 IPU).
            // ---------------------------------------------------------------

            // ---------------------------------------------------------------
            // Build query string from optional parameters.
            // Only non-undefined values are included.
            // ---------------------------------------------------------------
            const queryString = buildQueryString({
                cursor: options?.cursor,
                limit: options?.limit,
                correlation_id: options?.correlationId,
                thread_id: options?.threadId,
            });

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // GET request — no body, params in URL.
            // ipuCost: 0 → no X-Idempotency-Key (F8).
            // ---------------------------------------------------------------
            const response = await transport.request<TracePage>({
                method: 'GET',
                path: `/v1/traces${queryString}`,
                ipuCost: IPU_COSTS.GET_TRACES,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker if server provides headers.
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // ---------------------------------------------------------------
            // Build CloudResult<TracePage> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            const data: TracePage = response.data ?? {
                items: [],
                cursor: null,
                hasMore: false,
            };

            return { data, ipu };
        },
    };
}
