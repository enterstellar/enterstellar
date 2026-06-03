/**
 * @module @enterstellar-ai/cloud/operations/certify-proxy
 * @description Proxies contract certification initiation to Enterstellar Cloud.
 *
 * Sends a certification request to `POST /v1/contracts/:id/certify`.
 * This starts the asynchronous "Enterstellar Certified" lifecycle (GI5):
 * `none → pending → running → certified | failed`.
 *
 * The SDK returns the initial `pending` state with a polling URL.
 * The caller is responsible for polling `GET /v1/contracts/:id`
 * to check `certification_status` for completion (CR10).
 *
 * **IPU cost:** 20 per invocation (§9.1, CR6) — highest per-operation cost.
 * **Timeout:** 90s default (CR5: max 60s microVM runtime + overhead, F21).
 * **Idempotency:** `X-Idempotency-Key` sent (AM10). Critical at 20 IPU —
 *   prevents double-charge if the response is lost in transit.
 *
 * @see Design Choice GI5 — certification lifecycle state machine.
 * @see Design Choice CR5 — Fly.io microVM, max 60s runtime.
 * @see Design Choice CR6 — certification costs 20 IPU.
 * @see Design Choice CR10 — polling-based notification.
 * @see Design Choice SD3 — throw on 429.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Audit Finding F14 — `CertifyResult` type defined per GI5 shape.
 * @see Audit Finding F21 — 90s timeout for certification.
 * @see Bible §9.1 — `POST /v1/contracts/:id/certify`.
 * @see Principle L15 — zero framework imports.
 */

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CertifyResult, CloudIPU, CloudResult } from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';
import { OPERATION_TIMEOUTS } from '../transport/cloud-http.js';
import { createQuotaExceededError } from '../errors.js';

// ---------------------------------------------------------------------------
// Server Response Shape
// ---------------------------------------------------------------------------

/**
 * Expected JSON response shape from `POST /v1/contracts/:id/certify`.
 *
 * The server returns a `202 Accepted` with the certification job status.
 *
 * @internal — used only for typing the transport response.
 */
type CertifyResponse = {
    readonly status: 'pending';
    readonly pollUrl: string;
};

// ---------------------------------------------------------------------------
// CertifyProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for "Enterstellar Certified" contract certification initiation.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface CertifyProxy {
    /**
     * Initiate certification for a published contract.
     *
     * @param contractId - The contract ID to certify (e.g., `'comp_01HYX...'`).
     * @returns Pending status with polling URL, wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-C4290` if quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    certify(contractId: string): Promise<CloudResult<CertifyResult>>;
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
 * Creates a {@link CertifyProxy} that routes certification requests
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker for cost recording and quota checks.
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `CertifyProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createCertifyProxy(transport, tracker, false);
 * const { data } = await proxy.certify('comp_01HYX...');
 *
 * // data.status === 'pending'
 * // Poll data.pollUrl for completion via @enterstellar-ai/global-index.
 * ```
 *
 * @see Design Choice GI5 — certification lifecycle.
 * @see Design Choice CR6 — 20 IPU cost.
 * @internal
 */
export function createCertifyProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): CertifyProxy {
    return {
        async certify(contractId: string): Promise<CloudResult<CertifyResult>> {
            // ---------------------------------------------------------------
            // Pre-flight quota check (SD3).
            // Critical at 20 IPU — avoid initiating a costly operation
            // that will be rejected by the server.
            // ---------------------------------------------------------------
            if (tracker.isOverQuota()) {
                throw createQuotaExceededError({
                    code: 'ENS-C4290',
                    message: 'IPU quota exceeded (pre-flight check)',
                });
            }

            // ---------------------------------------------------------------
            // Build dynamic path with contractId.
            // Defensive encodeURIComponent — IDs are ULID-prefixed
            // (alphanumeric + underscore), but we encode just in case.
            // ---------------------------------------------------------------
            const path = `/v1/contracts/${encodeURIComponent(contractId)}/certify`;

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // 90s timeout (CR5: max 60s microVM + overhead).
            // X-Idempotency-Key sent (AM10, ipuCost = 20 > 0).
            // ---------------------------------------------------------------
            const response = await transport.request<CertifyResponse>({
                method: 'POST',
                path,
                ipuCost: IPU_COSTS.CERTIFY,
                operationTimeout: OPERATION_TIMEOUTS.certify,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker with server headers (CL1).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // Record local cost estimate.
            tracker.record(IPU_COSTS.CERTIFY);

            // ---------------------------------------------------------------
            // Build CloudResult<CertifyResult> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            // Defensive fallback — should always be present on 2xx.
            const data: CertifyResult = response.data ?? {
                status: 'pending',
                pollUrl: `/v1/contracts/${encodeURIComponent(contractId)}`,
            };

            return { data, ipu };
        },
    };
}
