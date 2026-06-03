/**
 * @module @enterstellar-ai/cloud/operations/data-deletion-proxy
 * @description Proxies GDPR right-to-delete requests to Enterstellar Cloud.
 *
 * Sends a data deletion request to `DELETE /v1/project/:id/data`.
 * This initiates the two-phase delete process (AG9, D110):
 *
 * 1. **Immediate soft-delete:** D1 rows get `deleted_at = NOW()`.
 *    Soft-deleted data is excluded from all queries immediately.
 * 2. **Background hard-purge:** A queue-triggered Worker permanently
 *    removes data from D1, R2 (object storage), Vectorize (embeddings),
 *    and ClickHouse (analytics) within 72 hours.
 *
 * **⚠ IRREVERSIBLE:** Once initiated, the soft-delete is immediate
 * and the hard-purge is queued. There is no undo mechanism. This
 * operation is designed for GDPR Article 17 ("right to erasure")
 * compliance.
 *
 * **IPU cost:** 0 (§9.1). Compliance operations are never charged.
 * **No idempotency key:** 0-cost operations skip `X-Idempotency-Key` (F8).
 * **No pre-flight quota check:** Free operations — quota is irrelevant.
 * **Fire-and-forget (F16):** Server returns `202 Accepted` immediately.
 *   No `jobId` or polling mechanism — deletion completes asynchronously.
 *
 * @see Design Choice AG9 — two-phase delete: soft-delete + background purge.
 * @see Design Choice D110 — GDPR soft-delete with queue-based hard-purge.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Audit Finding F16 — fire-and-forget, no `jobId`.
 * @see Bible §9.1 — `DELETE /v1/project/:id/data`.
 * @see Principle L15 — zero framework imports.
 */

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CloudIPU, CloudResult } from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// DataDeletionProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for GDPR data deletion — project data purge.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface DataDeletionProxy {
    /**
     * Initiate GDPR right-to-delete for a project's data.
     *
     * **⚠ IRREVERSIBLE.** Immediately soft-deletes all project data
     * in D1 and queues a background hard-purge across all storage
     * systems (D1, R2, Vectorize, ClickHouse).
     *
     * Returns `202 Accepted` — fire-and-forget from the SDK's perspective.
     *
     * @param projectId - The project ID to delete data for.
     * @returns Acceptance confirmation wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    deleteProjectData(
        projectId: string,
    ): Promise<CloudResult<{ readonly accepted: boolean }>>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

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
 * Creates a {@link DataDeletionProxy} that routes data deletion requests
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker (for reconciliation only — deletion costs 0 IPU).
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @returns A `DataDeletionProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createDataDeletionProxy(transport, tracker, false);
 *
 * // ⚠ IRREVERSIBLE — all project data will be purged.
 * const { data } = await proxy.deleteProjectData('proj_01HYX...');
 * console.log(data.accepted); // true — deletion initiated
 * ```
 *
 * @see Design Choice AG9 — two-phase delete.
 * @see Design Choice D110 — GDPR compliance.
 * @internal
 */
export function createDataDeletionProxy(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
): DataDeletionProxy {
    return {
        async deleteProjectData(
            projectId: string,
        ): Promise<CloudResult<{ readonly accepted: boolean }>> {
            // ---------------------------------------------------------------
            // No pre-flight quota check — deletion is free (0 IPU).
            // ---------------------------------------------------------------

            // ---------------------------------------------------------------
            // Build dynamic path with projectId.
            // Defensive encodeURIComponent — IDs are ULID-prefixed
            // (alphanumeric + underscore), but we encode just in case.
            // ---------------------------------------------------------------
            const path = `/v1/project/${encodeURIComponent(projectId)}/data`;

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // DELETE method — no body.
            // ipuCost: 0 → no X-Idempotency-Key (F8).
            // Server returns 202 Accepted (fire-and-forget, F16).
            // ---------------------------------------------------------------
            const response = await transport.request<{ accepted: boolean }>({
                method: 'DELETE',
                path,
                ipuCost: IPU_COSTS.DELETE_PROJECT_DATA,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker if server provides headers.
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // ---------------------------------------------------------------
            // Build CloudResult<{ accepted: boolean }> (SD7).
            // Default to accepted: true on 2xx — server returned 202.
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            const accepted = response.data?.accepted ?? true;

            return { data: { accepted }, ipu };
        },
    };
}
