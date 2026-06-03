/**
 * @module @enterstellar-ai/cloud/signals/signal-submitter
 * @description Submits `ForgeSignal` objects to Enterstellar Cloud.
 *
 * Proxies signal submission to `POST /v1/signals`. This is the **only
 * method that works in anonymous mode** (`pk_anon_*` keys, SD1/SD4).
 *
 * **IPU cost:** 0 — signal ingestion is free (§9.1). Data collection
 * is Enterstellar's #1 strategic asset — never charge for it.
 *
 * **No idempotency key:** 0-cost operations do not require
 * `X-Idempotency-Key` (AM10/F8).
 *
 * **No pre-flight quota check:** Signals are free — quota status
 * is irrelevant. The only failure mode is network/server error.
 *
 * **Consent model:** ForgeSignals are **mandatory** (L12). Unlike
 * `AgentTrace` (opt-in, consent-gated), signals are the core telemetry
 * data that feeds the Intent Router. The consent model is enforced at
 * the `@enterstellar-ai/telemetry` layer, not here.
 *
 * @see Design Choice SD1 — anonymous mode: only `submitSignal()` available.
 * @see Design Choice SD4 — `@enterstellar-ai/telemetry` uses SDK with `pk_anon`.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Principle L12 — ForgeSignal is mandatory; AgentTrace is opt-in.
 * @see Principle L15 — zero framework imports.
 * @see Bible §9.1 — `POST /v1/signals` (0 IPU).
 */

import type { ForgeSignal } from '@enterstellar-ai/types';

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CloudIPU, CloudResult } from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// Server Response Shape
// ---------------------------------------------------------------------------

/**
 * Expected JSON response shape from `POST /v1/signals`.
 *
 * @internal — used only for typing the transport response.
 */
type SignalSubmitResponse = {
    readonly accepted: boolean;
};

// ---------------------------------------------------------------------------
// SignalSubmitter Interface
// ---------------------------------------------------------------------------

/**
 * Submitter for Cloud ForgeSignal ingestion.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface SignalSubmitter {
    /**
     * Submit a `ForgeSignal` to the Cloud corpus.
     *
     * Works in both full mode and anonymous mode. This is the only
     * SDK operation available with `pk_anon_*` keys (SD1).
     *
     * @param signal - The `ForgeSignal` from `@enterstellar-ai/telemetry`.
     * @returns Acceptance confirmation wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    submitSignal(
        signal: ForgeSignal,
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
 * Creates a {@link SignalSubmitter} that submits `ForgeSignal` objects
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker (for reconciliation only — signals cost 0 IPU).
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @param sessionType - The session type from `CloudConfig` (D111).
 * @returns A `SignalSubmitter` instance.
 *
 * @example
 * ```ts
 * const submitter = createSignalSubmitter(transport, tracker, true, 'app');
 * const { data } = await submitter.submitSignal(signal);
 *
 * if (data.accepted) {
 *     console.log('Signal ingested for Intent Router training');
 * }
 * ```
 *
 * @see Design Choice SD1 — anonymous mode: only signals.
 * @see Design Choice SD4 — `@enterstellar-ai/telemetry` uses `pk_anon`.
 * @internal
 */
export function createSignalSubmitter(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
    sessionType: string,
): SignalSubmitter {
    return {
        async submitSignal(
            signal: ForgeSignal,
        ): Promise<CloudResult<{ readonly accepted: boolean }>> {
            // ---------------------------------------------------------------
            // No pre-flight quota check — signals are free (0 IPU).
            // ---------------------------------------------------------------

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // ipuCost: 0 → no X-Idempotency-Key sent (AM10/F8).
            // ---------------------------------------------------------------
            const response = await transport.request<SignalSubmitResponse>({
                method: 'POST',
                path: '/v1/signals',
                body: { ...signal, sessionType },
                ipuCost: IPU_COSTS.SIGNAL_SUBMIT,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker if server provides headers.
            // For 0-IPU endpoints the server may omit these (AG8),
            // but if present, we accept them for future-proofing.
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // No local cost recording — signals are free.

            // ---------------------------------------------------------------
            // Build CloudResult<{ accepted: boolean }> (SD7).
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
