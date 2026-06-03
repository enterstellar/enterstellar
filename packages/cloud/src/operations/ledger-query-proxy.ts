/**
 * @module @enterstellar-ai/cloud/operations/ledger-query-proxy
 * @description Proxies paginated IPU ledger queries to Enterstellar Cloud.
 *
 * Provides `getLedger(options?)` → `GET /v1/usage/ledger` — paginated
 * IPU ledger listing with cursor-based pagination. Returns per-operation
 * IPU charges for billing audit and verification.
 *
 * **IPU cost:** 0 (§9.1). Billing transparency — never charge to view
 * your own charges.
 * **No idempotency key:** 0-cost operations skip `X-Idempotency-Key` (F8).
 * **No pre-flight quota check:** Free operations — quota is irrelevant.
 *
 * @see Design Choice AM13 — IPU ledger exposure to customers.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Bible §9.1 — `GET /v1/usage/ledger`.
 * @see Principle L15 — zero framework imports.
 */

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type {
    CloudIPU,
    CloudResult,
    LedgerListOptions,
    LedgerPage,
} from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// LedgerQueryProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for paginated IPU ledger listing.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface LedgerQueryProxy {
    /**
     * Query the per-operation IPU ledger.
     *
     * @param options - Pagination options. All optional.
     * @returns Paginated ledger entries wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    getLedger(options?: LedgerListOptions): Promise<CloudResult<LedgerPage>>;
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
 * Creates a {@link LedgerQueryProxy} that routes paginated ledger queries
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker (for reconciliation only — queries cost 0 IPU).
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `LedgerQueryProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createLedgerQueryProxy(transport, tracker, false);
 *
 * // First page:
 * const { data: page } = await proxy.getLedger({ limit: 50 });
 *
 * // Iterate through entries:
 * for (const entry of page.items) {
 *     console.log(entry); // { operation, ipu_cost, timestamp, request_id }
 * }
 *
 * // Next page:
 * if (page.hasMore && page.cursor !== null) {
 *     const { data: nextPage } = await proxy.getLedger({ cursor: page.cursor });
 * }
 * ```
 *
 * @see Design Choice AM13 — IPU ledger exposure.
 * @internal
 */
export function createLedgerQueryProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): LedgerQueryProxy {
    return {
        async getLedger(
            options?: LedgerListOptions,
        ): Promise<CloudResult<LedgerPage>> {
            // ---------------------------------------------------------------
            // No pre-flight quota check — queries are free (0 IPU).
            // ---------------------------------------------------------------

            // ---------------------------------------------------------------
            // Build query string from optional parameters.
            // ---------------------------------------------------------------
            const queryString = buildQueryString({
                cursor: options?.cursor,
                limit: options?.limit,
            });

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // GET request — no body, params in URL.
            // ipuCost: 0 → no X-Idempotency-Key (F8).
            // ---------------------------------------------------------------
            const response = await transport.request<LedgerPage>({
                method: 'GET',
                path: `/v1/usage/ledger${queryString}`,
                ipuCost: IPU_COSTS.LEDGER_QUERY,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker if server provides headers.
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // ---------------------------------------------------------------
            // Build CloudResult<LedgerPage> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            const data: LedgerPage = response.data ?? {
                items: [],
                cursor: null,
                hasMore: false,
            };

            return { data, ipu };
        },
    };
}
