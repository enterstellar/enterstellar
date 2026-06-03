/**
 * @module @enterstellar-ai/cloud/routing/cloud-router-proxy
 * @description Proxies intent routing requests to Enterstellar Cloud.
 *
 * Provides two methods:
 * - `route(intentHash)` → single prediction via `POST /v1/route`.
 * - `routeBatch(intentHashes)` → batch predictions via `POST /v1/route/batch`.
 *
 * **IPU cost:** 1 per intent (§9.1). Batch cost = N × 1 IPU.
 * **Timeout:** 10s default.
 * **Idempotency:** `X-Idempotency-Key` sent (AM10, ipuCost > 0).
 *
 * **Batch ordering guarantee (F19):** `result.data[i]` corresponds to
 * `intentHashes[i]`. The proxy does NOT reorder — the server preserves
 * input order.
 *
 * @see Design Choice IR2 — router prediction response shape.
 * @see Design Choice IR3 — empty predictions for unknown intents.
 * @see Design Choice IR5 — batch routing for pre-rendering.
 * @see Design Choice SD3 — throw on 429.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Bible §9.1 — `POST /v1/route`, `POST /v1/route/batch`.
 * @see Audit Finding F19 — batch ordering invariant.
 * @see Principle L15 — zero framework imports.
 */

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CloudIPU, CloudResult, RouterPrediction } from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';
import { createQuotaExceededError } from '../errors.js';

// ---------------------------------------------------------------------------
// CloudRouterProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for Cloud Intent Router — single and batch prediction.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface CloudRouterProxy {
    /**
     * Predict the component for a single intent hash.
     *
     * @param intentHash - SHA-256 hash of the intent string.
     * @returns Ranked predictions with model metadata.
     *
     * @throws {CloudError} `ENS-C4290` if quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    route(intentHash: string): Promise<CloudResult<RouterPrediction>>;

    /**
     * Predict components for a batch of intent hashes (pre-rendering).
     *
     * @param intentHashes - Array of SHA-256 intent hashes to resolve.
     * @returns Array of predictions in the same order as input (F19).
     *
     * @throws {CloudError} `ENS-C4290` if quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    routeBatch(
        intentHashes: readonly string[],
    ): Promise<CloudResult<readonly RouterPrediction[]>>;
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
 * Creates a {@link CloudRouterProxy} that routes intent prediction requests
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker for cost recording and quota checks.
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `CloudRouterProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createCloudRouterProxy(transport, tracker, false);
 *
 * // Single intent:
 * const { data } = await proxy.route('a1b2c3...');
 *
 * // Batch intents:
 * const { data: predictions } = await proxy.routeBatch(['a1b2c3...', 'd4e5f6...']);
 * ```
 *
 * @see Design Choice IR2 — prediction response shape.
 * @see Design Choice IR5 — batch routing.
 * @internal
 */
export function createCloudRouterProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): CloudRouterProxy {
    return {
        async route(intentHash: string): Promise<CloudResult<RouterPrediction>> {
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
            // ---------------------------------------------------------------
            const response = await transport.request<RouterPrediction>({
                method: 'POST',
                path: '/v1/route',
                body: { intentHash },
                ipuCost: IPU_COSTS.ROUTE,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker with server headers (CL1).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // Record local cost estimate.
            tracker.record(IPU_COSTS.ROUTE);

            // ---------------------------------------------------------------
            // Build CloudResult<RouterPrediction> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            // Guard against null data defensively.
            const data: RouterPrediction = response.data ?? {
                predictions: [],
                metadata: { modelVersion: 'unknown', signalCount: 0 },
            };

            return { data, ipu };
        },

        async routeBatch(
            intentHashes: readonly string[],
        ): Promise<CloudResult<readonly RouterPrediction[]>> {
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
            // Compute dynamic IPU cost: N × 1 per intent.
            // ---------------------------------------------------------------
            const batchCost = intentHashes.length * IPU_COSTS.ROUTE_BATCH_PER_INTENT;

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // ---------------------------------------------------------------
            const response = await transport.request<readonly RouterPrediction[]>({
                method: 'POST',
                path: '/v1/route/batch',
                body: { intentHashes },
                ipuCost: batchCost,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker with server headers (CL1).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // Record local cost estimate (dynamic batch cost).
            tracker.record(batchCost);

            // ---------------------------------------------------------------
            // Build CloudResult<readonly RouterPrediction[]> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            // Guard against null data — return empty array.
            const data: readonly RouterPrediction[] = response.data ?? [];

            return { data, ipu };
        },
    };
}
