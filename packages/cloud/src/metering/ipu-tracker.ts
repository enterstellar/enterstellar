/**
 * @module @enterstellar-ai/cloud/metering/ipu-tracker
 * @description Local IPU (Intent Processing Unit) estimate tracker.
 *
 * Implements the **client side** of CL1's hybrid metering model:
 * - The server is authoritative (IPU values in `X-IPU-Used`/`X-IPU-Remaining`).
 * - The client tracks local estimates for real-time dashboards.
 * - On each API response, `reconcile()` compares local vs server values.
 * - If drift exceeds 10%, the local estimate auto-corrects to the server value.
 *
 * **Lifecycle:**
 * 1. Created by `createEnterstellarCloudClient()` (one tracker per client instance).
 * 2. `record(cost)` called by each proxy module after a cloud API call.
 * 3. `reconcile(serverUsed, serverRemaining, ipuCost?)` called after parsing
 *    `X-IPU-Used`, `X-IPU-Remaining`, and `X-IPU-Cost` response headers (§9.3).
 * 4. `isOverQuota()` checked by proxies before making API calls.
 * 5. `getLastIPUCost()` used by proxies to populate `CloudIPU.cost` in
 *    the `CloudResult<T>` wrapper (SD7).
 *
 * **No persistence** — the tracker is ephemeral per session. IPU usage
 * resets on page reload. Server values are the ground truth.
 *
 * @see Design Choice CL1 — hybrid metering, auto-correct on >10% drift.
 * @see Design Choice CL2 — weighted IPU costs.
 * @see Design Choice CL3 — `isOverQuota()` enables pre-flight degradation.
 * @see Design Choice SD7 — universal return wrapper requires `CloudIPU.cost`.
 */

// ---------------------------------------------------------------------------
// IPUTracker Interface
// ---------------------------------------------------------------------------

/**
 * Local IPU estimate tracker.
 *
 * Created via {@link createIPUTracker}. Tracks client-side IPU estimates
 * and reconciles with server-reported values.
 *
 * @see Design Choice CL1
 */
export interface IPUTracker {
    /**
     * Record a local IPU cost estimate.
     *
     * Called by proxy modules after each cloud API call to increment
     * the local usage counter.
     *
     * @param cost - The IPU cost of the operation (from {@link IPU_COSTS}).
     */
    record(cost: number): void;

    /**
     * Reconcile local estimates with server-reported values.
     *
     * Called after every cloud API response that includes `X-IPU-Used`,
     * `X-IPU-Remaining`, and `X-IPU-Cost` headers (§9.3). If the drift
     * between local and server values exceeds 10%, the local estimate
     * auto-corrects to the server value (CL1).
     *
     * The optional `ipuCost` parameter stores the per-request cost
     * (from `X-IPU-Cost` header). Retrieved via {@link getLastIPUCost}
     * for populating `CloudIPU.cost` in `CloudResult<T>` (SD7).
     *
     * @param serverUsed - IPU used as reported by the server (`X-IPU-Used`).
     * @param serverRemaining - IPU remaining as reported by the server (`X-IPU-Remaining`).
     * @param ipuCost - IPU charged for this specific request (`X-IPU-Cost`). Optional.
     */
    reconcile(serverUsed: number, serverRemaining: number, ipuCost?: number): void;

    /**
     * Get the current local IPU estimate.
     *
     * @returns Object with `used`, `remaining`, and `limit` fields.
     *          `remaining` and `limit` are `null` until the first
     *          `reconcile()` call provides server data.
     */
    getEstimate(): IPUEstimate;

    /**
     * Check whether the client is over its IPU quota.
     *
     * Returns `true` if the local estimate of remaining IPUs is ≤ 0.
     * Returns `false` if no limit is known yet (before first reconciliation).
     *
     * Used by proxy modules for pre-flight checks before making
     * API calls — enables immediate graceful degradation (CL3)
     * without waiting for a 429 response.
     *
     * @returns `true` if over quota, `false` otherwise.
     */
    isOverQuota(): boolean;

    /**
     * Get the per-request IPU cost from the last `reconcile()` call.
     *
     * Returns the `ipuCost` value passed to the most recent `reconcile()`
     * invocation. Used by proxy modules to populate `CloudIPU.cost`
     * in the `CloudResult<T>` wrapper (SD7).
     *
     * Returns `undefined` if `reconcile()` has never been called or
     * if the last call did not include an `ipuCost` parameter.
     *
     * @returns The last per-request IPU cost, or `undefined`.
     *
     * @see Design Choice SD7 — `CloudResult<T>` includes `CloudIPU.cost`.
     */
    getLastIPUCost(): number | undefined;

    /**
     * Reset the tracker state.
     *
     * Clears the local estimate, server-reported values, and last
     * IPU cost. Used for billing period rollovers or testing.
     */
    reset(): void;
}

// ---------------------------------------------------------------------------
// IPUEstimate Type
// ---------------------------------------------------------------------------

/**
 * Current local IPU estimate snapshot.
 *
 * @see {@link IPUTracker.getEstimate}
 */
export type IPUEstimate = {
    /** Estimated IPUs consumed (locally tracked). */
    readonly used: number;

    /**
     * Estimated IPUs remaining.
     * `null` until the first server reconciliation provides a limit.
     */
    readonly remaining: number | null;

    /**
     * Total IPU limit for the billing period.
     * `null` until the first server reconciliation.
     */
    readonly limit: number | null;

    /**
     * Whether the last reconciliation detected drift > 10%
     * and auto-corrected the local estimate.
     */
    readonly lastReconciliationCorrected: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum acceptable drift between local and server IPU estimates.
 *
 * If `|localUsed - serverUsed| / serverUsed > DRIFT_THRESHOLD`,
 * the local estimate auto-corrects to the server value (CL1).
 */
const DRIFT_THRESHOLD = 0.10;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an {@link IPUTracker} for local IPU estimate tracking.
 *
 * @returns A new `IPUTracker` instance with zero initial usage.
 *
 * @example
 * ```ts
 * import { createIPUTracker } from './metering/ipu-tracker.js';
 * import { IPU_COSTS } from './metering/ipu-costs.js';
 *
 * const tracker = createIPUTracker();
 *
 * // After a forge call:
 * tracker.record(IPU_COSTS.FORGE); // +10 IPU
 *
 * // After receiving server headers:
 * tracker.reconcile(42, 958); // serverUsed=42, serverRemaining=958
 *
 * // Pre-flight check:
 * if (tracker.isOverQuota()) {
 *     // Fall back to local processing (CL3)
 * }
 * ```
 *
 * @see Design Choice CL1 — hybrid metering.
 */
export function createIPUTracker(): IPUTracker {
    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    /** Local estimate of IPUs consumed this session. */
    let localUsed = 0;

    /**
     * Server-reported IPU limit for the billing period.
     * `null` until the first `reconcile()` call.
     */
    let serverLimit: number | null = null;

    /** Whether the last reconciliation triggered a drift correction. */
    let lastCorrected = false;

    /**
     * Per-request IPU cost from the last `reconcile()` call.
     * Populated from the `X-IPU-Cost` response header.
     * `undefined` until the first reconciliation with a cost value.
     */
    let lastIPUCost: number | undefined;

    // -----------------------------------------------------------------------
    // IPUTracker Implementation
    // -----------------------------------------------------------------------

    return {
        record(cost: number): void {
            localUsed += cost;
        },

        reconcile(serverUsed: number, serverRemaining: number, ipuCost?: number): void {
            // Store the per-request cost for CloudResult<T> construction (SD7).
            lastIPUCost = ipuCost;

            // Compute the total limit from server data.
            serverLimit = serverUsed + serverRemaining;

            // ---------------------------------------------------------------
            // Drift detection (CL1)
            //
            // Formula: |localUsed - serverUsed| / serverUsed > 10%
            //
            // Edge case: if serverUsed is 0, any non-zero local estimate
            // is considered drift (since the server has no record of usage).
            // If both are 0, there is no drift.
            // ---------------------------------------------------------------
            if (serverUsed === 0) {
                // If local is also 0, no drift. If local > 0, correct.
                if (localUsed > 0) {
                    localUsed = serverUsed;
                    lastCorrected = true;
                } else {
                    lastCorrected = false;
                }
                return;
            }

            const drift = Math.abs(localUsed - serverUsed) / serverUsed;

            if (drift > DRIFT_THRESHOLD) {
                // Auto-correct: snap local estimate to server value.
                localUsed = serverUsed;
                lastCorrected = true;
            } else {
                lastCorrected = false;
            }
        },

        getEstimate(): IPUEstimate {
            // Compute remaining from local estimate if we have a limit.
            const remaining = serverLimit !== null
                ? Math.max(0, serverLimit - localUsed)
                : null;

            return {
                used: localUsed,
                remaining,
                limit: serverLimit,
                lastReconciliationCorrected: lastCorrected,
            };
        },

        isOverQuota(): boolean {
            // If no limit is known yet, assume not over quota.
            // The first API call will either succeed or return 429.
            if (serverLimit === null) {
                return false;
            }

            return localUsed >= serverLimit;
        },

        getLastIPUCost(): number | undefined {
            return lastIPUCost;
        },

        reset(): void {
            localUsed = 0;
            serverLimit = null;
            lastCorrected = false;
            lastIPUCost = undefined;
        },
    };
}
