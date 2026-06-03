/**
 * @module @enterstellar-ai/cloud/inference/cloud-forge-proxy
 * @description Proxies forge generation requests to Enterstellar Cloud.
 *
 * Provides the dual forge API mandated by SD6:
 * - `forge(options)` → `Promise<CloudResult<ComponentContract>>` — buffers
 *   the full SSE stream and returns the complete contract.
 * - `stream(options)` → `AsyncGenerator<ForgeFragment>` — yields typed SSE
 *   fragments as they arrive (progressive rendering).
 *
 * **IPU cost:** 10 per invocation (§9.1, CL2).
 * **Timeout:** 30s default (P99 = 10s, §8.9, F21).
 * **Idempotency:** `X-Idempotency-Key` sent on all requests (AM10).
 *
 * **Error policy (SD3):**
 * - Pre-flight quota exceeded → throw `CloudError` (`ENS-C4290`).
 * - 429 from server → throw `CloudError` (via transport).
 * - 5xx / network → retry 3× then throw `ENS-5005` (via transport).
 * - No more "degraded" return values — errors always throw.
 *
 * @see Design Choice SD6 — dual API: `forge()` + `forge.stream()`.
 * @see Design Choice CL2 — CloudForge = 10 IPU.
 * @see Design Choice SD3 — throw on 429, never silent degrade.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Bible §9.1 — `POST /v1/forge`.
 * @see Principle L15 — zero framework imports.
 */

import type { ComponentContract } from '@enterstellar-ai/types';

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CloudSSETransport, CloudSSEConfig } from '../transport/cloud-sse.js';
import type {
    CloudIPU,
    CloudResult,
    ForgeFragment,
    ForgeOptions,
} from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';
import { OPERATION_TIMEOUTS } from '../transport/cloud-http.js';
import { createQuotaExceededError } from '../errors.js';

// ---------------------------------------------------------------------------
// CloudForgeProxy Interface
// ---------------------------------------------------------------------------

/**
 * Proxy for Cloud Forge generation — dual API (SD6).
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface CloudForgeProxy {
    /**
     * Generate a `ComponentContract` via Cloud Forge (Promise API).
     *
     * Buffers the full server response and returns the complete contract
     * wrapped in `CloudResult<T>`.
     *
     * @param options - Forge generation options (intent + optional constraints).
     * @returns The complete contract with IPU metadata.
     *
     * @throws {CloudError} `ENS-C4290` if IPU quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    forge(options: ForgeOptions): Promise<CloudResult<ComponentContract>>;

    /**
     * Stream forge generation via Server-Sent Events (AsyncGenerator API).
     *
     * Delegates to `CloudSSETransport.stream()` and yields typed
     * `ForgeFragment` objects as the LLM generates the contract.
     *
     * @param options - Forge generation options (intent + optional constraints).
     * @yields {ForgeFragment} Typed SSE fragments in lifecycle order.
     *
     * @throws {CloudError} `ENS-C4290` if quota exceeded (before or during).
     * @throws {CloudError} `ENS-5005` on network error mid-stream.
     */
    stream(options: ForgeOptions): AsyncGenerator<ForgeFragment, void, undefined>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a `CloudIPU` object from transport response headers.
 *
 * Returns `null` if the client is in anonymous mode (AG8: all
 * `X-IPU-*` headers omitted) or if required headers are missing.
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
 * Creates a {@link CloudForgeProxy} that routes forge requests to the
 * Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport for the Promise API.
 * @param sseTransport - The SSE transport for the streaming API.
 * @param tracker - The IPU tracker for cost recording and quota checks.
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @param sessionType - The session type from `CloudConfig` (D111).
 * @returns A `CloudForgeProxy` instance.
 *
 * @example
 * ```ts
 * const proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');
 *
 * // Promise API:
 * const { data: contract, ipu } = await proxy.forge({ intent: 'card' });
 *
 * // Streaming API:
 * for await (const fragment of proxy.stream({ intent: 'card' })) {
 *     console.log(fragment.type, fragment.data);
 * }
 * ```
 *
 * @see Design Choice SD6 — dual API.
 * @see Design Choice CL2 — CloudForge = 10 IPU.
 * @see Design Choice SD3 — throw on quota exceeded.
 * @internal
 */
export function createCloudForgeProxy(
    transport: CloudHttpTransport,
    sseTransport: CloudSSETransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
    sessionType: string,
): CloudForgeProxy {
    return {
        async forge(options: ForgeOptions): Promise<CloudResult<ComponentContract>> {
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
            const response = await transport.request<ComponentContract>({
                method: 'POST',
                path: '/v1/forge',
                body: {
                    intent: options.intent,
                    constraints: options.constraints,
                    sessionType,
                },
                ipuCost: IPU_COSTS.FORGE,
                operationTimeout: OPERATION_TIMEOUTS.forge,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker with server headers (CL1).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // Record local cost estimate.
            tracker.record(IPU_COSTS.FORGE);

            // ---------------------------------------------------------------
            // Build CloudResult<ComponentContract> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            // The transport guarantees `response.ok === true` at this point
            // (non-2xx throws). We still guard against null data defensively.
            const data = response.data;
            if (data === null) {
                throw createQuotaExceededError({
                    code: 'ENS-C5000',
                    message: 'Forge response contained no data',
                });
            }

            return { data, ipu };
        },

        async *stream(options: ForgeOptions): AsyncGenerator<ForgeFragment, void, undefined> {
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
            // Delegate to SSE transport.
            // The SSE transport handles timeout, idempotency key,
            // header parsing, and fragment mapping.
            // ---------------------------------------------------------------
            const sseConfig: CloudSSEConfig = {
                body: {
                    intent: options.intent,
                    constraints: options.constraints,
                    sessionType,
                },
                isAnonymous,
            };

            // Record local cost estimate upfront.
            // The SSE transport will throw on failure, and the cost
            // is already committed server-side when the 2xx is received.
            tracker.record(IPU_COSTS.FORGE);

            yield* sseTransport.stream(sseConfig);
        },
    };
}
