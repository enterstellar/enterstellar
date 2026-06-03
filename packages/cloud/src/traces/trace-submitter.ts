/**
 * @module @enterstellar-ai/cloud/traces/trace-submitter
 * @description Submits `AgentTrace` objects to Enterstellar Cloud for aggregation.
 *
 * Sends full `AgentTrace` payloads to `POST /v1/traces` for cloud-side
 * analytics, dashboard reporting, and Intent Router training data.
 *
 * **Triple consent gate (TA2, F13):**
 * Three independent checks must ALL pass before any network call:
 * 1. `CloudConfig.traceConsent` — client SDK flag (default `false`).
 * 2. `trace.consent.anonymizedAggregation` — per-trace consent field.
 * 3. Server-side `projects.trace_consent` — checked on the server.
 *
 * If either client-side check fails, the submission is silently skipped —
 * no network call, no IPU charge, no data leaves the device.
 *
 * **IPU cost:** 0 — trace submission is free (§9.1 corrected).
 * **No idempotency key:** 0-cost operations skip `X-Idempotency-Key` (F8).
 * **No pre-flight quota check:** Traces are free — quota is irrelevant.
 *
 * **Changes from v0.0.x:**
 * - IPU cost corrected: 5 → 0 (Bible §9.1: "never charge for data collection").
 * - Returns `CloudResult<{ accepted }>` instead of `CloudTraceResult` (SD7).
 * - Transport errors propagate as `CloudError` throws (SD3) — no longer
 *   silently swallowed.
 * - `traceConsent` flag added as a factory parameter (TA2 dual-consent).
 *
 * @see Design Choice TA2 — dual-consent: client flag + server flag.
 * @see Design Choice SD3 — throw on error, never silent degrade.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Audit Finding F13 — mandatory client consent flag.
 * @see Principle L12 — ForgeSignal is mandatory; AgentTrace is opt-in.
 * @see Principle L15 — zero framework imports.
 * @see Bible §9.1 — `POST /v1/traces` (0 IPU).
 */

import type { AgentTrace } from '@enterstellar-ai/types';

import type { IPUTracker } from '../metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../transport/cloud-http.js';
import type { CloudIPU, CloudResult } from '../types.js';

import { IPU_COSTS } from '../metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Pre-built result for consent-denied submissions.
 *
 * Returned immediately when either client-side consent check fails.
 * No network call, no IPU headers — `ipu` is `null`.
 *
 * Frozen to prevent accidental mutation.
 */
const CONSENT_DENIED_RESULT: CloudResult<{ readonly accepted: boolean }> = Object.freeze({
    data: Object.freeze({ accepted: false }),
    ipu: null,
});

// ---------------------------------------------------------------------------
// Server Response Shape
// ---------------------------------------------------------------------------

/**
 * Expected JSON response shape from `POST /v1/traces`.
 *
 * @internal — used only for typing the transport response.
 */
type TraceSubmitResponse = {
    readonly accepted: boolean;
};

// ---------------------------------------------------------------------------
// TraceSubmitter Interface
// ---------------------------------------------------------------------------

/**
 * Submitter for cloud-side `AgentTrace` aggregation.
 *
 * @internal — consumed by `createEnterstellarCloudClient()`, not exported publicly.
 */
export interface TraceSubmitter {
    /**
     * Submit an `AgentTrace` for cloud aggregation.
     *
     * **Triple consent gate (TA2, F13):**
     * 1. `CloudConfig.traceConsent` must be `true`.
     * 2. `trace.consent.anonymizedAggregation` must be `true`.
     * 3. Server checks `projects.trace_consent` (not our concern).
     *
     * If either client-side check fails, returns immediately with
     * `{ data: { accepted: false }, ipu: null }`.
     *
     * @param trace - The full `AgentTrace` to submit. Must have consent fields.
     * @returns Submission result wrapped in `CloudResult<T>`.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail (SD5).
     */
    submitTrace(
        trace: AgentTrace,
    ): Promise<CloudResult<{ readonly accepted: boolean }>>;
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
 * Creates a {@link TraceSubmitter} that submits `AgentTrace` objects
 * to the Enterstellar Cloud API.
 *
 * @param transport - The shared HTTP transport (provides auth, timeout, retry).
 * @param tracker - The IPU tracker (for reconciliation only — traces cost 0 IPU).
 * @param isAnonymous - Whether the client is in anonymous mode (`pk_anon`).
 * @param traceConsent - The `CloudConfig.traceConsent` flag (TA2, default `false`).
 * @param sessionType - The session type from `CloudConfig` (D111).
 * @returns A `TraceSubmitter` instance.
 *
 * @example
 * ```ts
 * const submitter = createTraceSubmitter(transport, tracker, false, true, 'app');
 * const { data } = await submitter.submitTrace(trace);
 *
 * if (data.accepted) {
 *     console.log('Trace submitted for cloud aggregation');
 * }
 * ```
 *
 * @see Design Choice TA2 — dual-consent gate.
 * @see Design Choice SD7 — universal return wrapper.
 * @internal
 */
export function createTraceSubmitter(
    transport: CloudHttpTransport,
    tracker: IPUTracker,
    isAnonymous: boolean,
    traceConsent: boolean,
    sessionType: string,
): TraceSubmitter {
    return {
        async submitTrace(
            trace: AgentTrace,
        ): Promise<CloudResult<{ readonly accepted: boolean }>> {
            // ---------------------------------------------------------------
            // Consent gate 1: CloudConfig.traceConsent (TA2, F13).
            //
            // If the client SDK flag is false, skip immediately.
            // This is the first line of defense — no data leaves the device.
            // ---------------------------------------------------------------
            if (!traceConsent) {
                return CONSENT_DENIED_RESULT;
            }

            // ---------------------------------------------------------------
            // Consent gate 2: per-trace consent field (L12/TL10).
            //
            // Each AgentTrace carries its own consent. The application
            // sets this based on user preference. If false, skip.
            // ---------------------------------------------------------------
            if (!trace.consent.anonymizedAggregation) {
                return CONSENT_DENIED_RESULT;
            }

            // ---------------------------------------------------------------
            // No pre-flight quota check — traces are free (0 IPU).
            // ---------------------------------------------------------------

            // ---------------------------------------------------------------
            // Execute the cloud API call.
            // ipuCost: 0 → no X-Idempotency-Key sent (AM10/F8).
            // Transport errors propagate as CloudError (SD3).
            // ---------------------------------------------------------------
            const response = await transport.request<TraceSubmitResponse>({
                method: 'POST',
                path: '/v1/traces',
                body: { trace, sessionType },
                ipuCost: IPU_COSTS.TRACE_SUBMIT,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker if server provides headers.
            // For 0-IPU endpoints the server may omit these (AG8).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // No local cost recording — traces are free.

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
