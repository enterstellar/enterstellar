/**
 * @module @enterstellar-ai/cloud/analytics/cloud-analytics-proxy
 * @description Proxies analytics queries to Enterstellar Cloud.
 *
 * Provides two methods mapping to two distinct Cloud endpoints:
 * - `analytics(query)` → `POST /v1/traces/analytics` — trace analytics
 *   powered by the dedicated Analytics Worker (TA3) and ClickHouse (TA4).
 * - `businessAnalytics(query)` → `POST /v1/analytics/query` — product
 *   intelligence analytics for the BI dashboard (TA10).
 *
 * Both accept an {@link AnalyticsQuery} (fixed `queryType` + optional
 * `filters`) and return `CloudResult<AnalyticsResult>` (SD7).
 *
 * **IPU cost:** 5 per invocation for both endpoints (§9.1, CL2).
 * **Timeout:** 30s default — OLAP queries can be slow (F21).
 * **Idempotency:** `X-Idempotency-Key` sent (AM10, ipuCost > 0).
 *
 * **HTTP method note (F17):** Bible §9.1 specifies `GET` for analytics
 * endpoints, but `AnalyticsQuery` requires a JSON body. The SDK uses
 * `POST` — a Bible §9.1 amendment has been flagged per audit finding F17.
 *
 * @see Design Choice TA3 — dedicated Analytics Worker.
 * @see Design Choice TA5 — fixed query types with filters.
 * @see Design Choice TA10 — Enterstellar Analytics (business intelligence).
 * @see Design Choice SD3 — throw on 429.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Audit Finding F17 — POST instead of GET for JSON body.
 * @see Audit Finding F21 — 30s timeout for OLAP queries.
 * @see Bible §9.1 — `POST /v1/traces/analytics`, `POST /v1/analytics/query`.
 * @see Principle L15 — zero framework imports.
 */

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type {
    AnalyticsQuery,
    AnalyticsResult,
    CloudIPU,
    CloudResult,
} from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';
import { OPERATION_TIMEOUTS } from '../transport/cloud-http.js';
import { createQuotaExceededError } from '../errors.js';

// ---------------------------------------------------------------------------
// CloudAnalyticsProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for Cloud Analytics — trace analytics and business analytics.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface CloudAnalyticsProxy {
    /**
     * Query trace analytics from ClickHouse via the Analytics Worker.
     *
     * Proxies to `POST /v1/traces/analytics`. Fixed query types with
     * optional filters (TA5). Results are returned as generic rows —
     * the schema varies by `queryType`.
     *
     * **IPU cost:** 5 per invocation (§9.1).
     *
     * @param query - Analytics query with `queryType` and optional `filters`.
     * @returns Analytics result rows wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-C4290` if quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    analytics(query: AnalyticsQuery): Promise<CloudResult<AnalyticsResult>>;

    /**
     * Query business/product analytics from ClickHouse.
     *
     * Proxies to `POST /v1/analytics/query`. Separate from trace
     * analytics — powers the Business Intelligence dashboard (TA10).
     *
     * **IPU cost:** 5 per invocation (§9.1).
     *
     * @param query - Analytics query with `queryType` and optional `filters`.
     * @returns Analytics result rows wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-C4290` if quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    businessAnalytics(query: AnalyticsQuery): Promise<CloudResult<AnalyticsResult>>;
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
 * Creates a {@link CloudAnalyticsProxy} that routes analytics queries
 * to the Enterstellar Cloud API.
 *
 * Both `analytics()` and `businessAnalytics()` share the same request
 * lifecycle — only the endpoint URL and IPU cost constant differ.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker for cost recording and quota checks.
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `CloudAnalyticsProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createCloudAnalyticsProxy(transport, tracker, false);
 *
 * const { data } = await proxy.analytics({
 *     queryType: 'intent_patterns',
 *     filters: { timeRange: '7d', limit: 100 },
 * });
 *
 * for (const row of data.rows) {
 *     console.log(row);
 * }
 * ```
 *
 * @see Design Choice TA3 — dedicated Analytics Worker.
 * @see Design Choice TA5 — fixed query types.
 * @see Design Choice TA10 — Enterstellar Analytics (BI).
 * @internal
 */
export function createCloudAnalyticsProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): CloudAnalyticsProxy {
    /**
     * Shared implementation for both analytics endpoints.
     *
     * Executes the full request lifecycle: pre-flight check → transport
     * call → reconcile → record → build `CloudResult<AnalyticsResult>`.
     *
     * @param path - The API endpoint path (e.g., `'/v1/traces/analytics'`).
     * @param query - The analytics query payload.
     * @param costConstant - The IPU cost for this operation.
     * @returns Analytics result wrapped in `CloudResult<T>`.
     */
    async function executeAnalyticsRequest(
        path: string,
        query: AnalyticsQuery,
        costConstant: number,
    ): Promise<CloudResult<AnalyticsResult>> {
        // ---------------------------------------------------------------
        // Pre-flight quota check (SD3).
        // ---------------------------------------------------------------
        if (tracker.isOverQuota()) {
            throw createQuotaExceededError({
                code: 'ENS-C4290',
                message: 'IPU quota exceeded (pre-flight check)',
            });
        }

        // ---------------------------------------------------------------
        // Execute the cloud API call.
        // Uses 30s timeout for OLAP queries (F21).
        // POST method per F17 (JSON body cannot be sent via GET).
        // ---------------------------------------------------------------
        const response = await transport.request<AnalyticsResult>({
            method: 'POST',
            path,
            body: query,
            ipuCost: costConstant,
            operationTimeout: OPERATION_TIMEOUTS.analytics,
        });

        // ---------------------------------------------------------------
        // Reconcile IPU tracker with server headers (CL1).
        // ---------------------------------------------------------------
        if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
            tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
        }

        // Record local cost estimate.
        tracker.record(costConstant);

        // ---------------------------------------------------------------
        // Build CloudResult<AnalyticsResult> (SD7).
        // ---------------------------------------------------------------
        const ipu = buildIPU(
            response.ipuUsed,
            response.ipuRemaining,
            response.ipuCost,
            isAnonymous,
        );

        // Defensive fallback: if data is null, construct an empty result
        // with the original queryType for client-side discrimination.
        const data: AnalyticsResult = response.data ?? {
            rows: [],
            queryType: query.queryType,
        };

        return { data, ipu };
    }

    return {
        async analytics(query: AnalyticsQuery): Promise<CloudResult<AnalyticsResult>> {
            return executeAnalyticsRequest(
                '/v1/traces/analytics',
                query,
                IPU_COSTS.TRACE_ANALYTICS,
            );
        },

        async businessAnalytics(query: AnalyticsQuery): Promise<CloudResult<AnalyticsResult>> {
            return executeAnalyticsRequest(
                '/v1/analytics/query',
                query,
                IPU_COSTS.BUSINESS_ANALYTICS,
            );
        },
    };
}
