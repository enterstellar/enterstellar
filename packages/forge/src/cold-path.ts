/**
 * @module @enterstellar-ai/forge/cold-path
 * @description Cold Path trace recording and local clustering for the Forge.
 *
 * Every forge invocation is logged as a `ForgeTraceRecord` (Hot Path Rule 6).
 * The Cold Path module provides:
 *
 * - **`recordForgeTrace()`** — stores a trace record in memory.
 * - **`getTraceHistory()`** — returns all recorded traces.
 * - **`getClusteredIntents()`** — groups traces by `intentHash` and returns
 *   intents exceeding the `clusterThreshold`.
 *
 * The actual Cold Path pipeline (cluster → generate full contract → automated
 * test suite → HITL queue → canary rollout) runs **server-side** on Enterstellar Cloud
 * (F10). This module only provides the client-side trace collection and local
 * clustering analysis.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice F10 — Cold Path pipeline runs server-side.
 * @see Design Choice F11 — `clusterThreshold` default: 5.
 * @see Cold Path Rules 1–5 (Bible §4.10).
 * @see Hot Path Rule 6 — every forge invocation logged.
 */

import type { ForgeTraceRecord } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Clustered Intent Type
// ---------------------------------------------------------------------------

/**
 * A clustered intent that has exceeded the `clusterThreshold` of occurrences.
 *
 * Clustered intents are candidates for Cold Path promotion: the server-side
 * pipeline generates a full contract, runs automated tests, and queues
 * for HITL review.
 *
 * @see Cold Path Rule 1 — clustering at `clusterThreshold` occurrences.
 */
export type ClusteredIntent = {
    /** Slugified intent name. */
    readonly intentSlug: string;
    /** SHA-256 hash of the raw intent. */
    readonly intentHash: string;
    /** Number of times this intent was forged. */
    readonly count: number;
    /** Success rate (0.0–1.0) across all forge attempts. */
    readonly successRate: number;
    /** Timestamps of all occurrences (ISO 8601). */
    readonly timestamps: readonly string[];
};

// ---------------------------------------------------------------------------
// ColdPathTracker Interface
// ---------------------------------------------------------------------------

/**
 * Internal Cold Path tracker interface.
 *
 * Returned by `createColdPathTracker()`. Manages trace recording,
 * history retrieval, and local clustering.
 */
export interface ColdPathTracker {
    /**
     * Records a forge trace for Cold Path analysis.
     *
     * @param record - The `ForgeTraceRecord` to store.
     *
     * @see Hot Path Rule 6 — every forge invocation logged.
     */
    recordTrace(record: ForgeTraceRecord): void;

    /**
     * Returns the complete trace history.
     *
     * @returns A readonly array of all recorded `ForgeTraceRecord` entries.
     */
    getTraceHistory(): readonly ForgeTraceRecord[];

    /**
     * Returns intents that have been forged at least `threshold` times.
     *
     * Groups traces by `intentHash` and returns those exceeding the threshold.
     * Used by the server-side Cold Path pipeline to identify promotion candidates.
     *
     * @param threshold - Minimum occurrences to qualify as clustered. Default: `5` (F11).
     * @returns Array of `ClusteredIntent` entries exceeding the threshold.
     *
     * @see Cold Path Rule 1 — clustering at threshold.
     * @see Design Choice F11 — default threshold: 5.
     */
    getClusteredIntents(threshold?: number): readonly ClusteredIntent[];

    /**
     * Clears all recorded traces.
     *
     * Used after successful flush to Enterstellar Cloud, or in test teardown.
     */
    clearHistory(): void;

    /**
     * Returns the total number of recorded traces.
     */
    readonly size: number;
}

// ---------------------------------------------------------------------------
// Default Cluster Threshold
// ---------------------------------------------------------------------------

/**
 * Default minimum occurrences before an intent qualifies as clustered.
 *
 * @see Design Choice F11 — `clusterThreshold` default: 5.
 */
const DEFAULT_CLUSTER_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a Cold Path tracker for recording forge traces and clustering.
 *
 * @returns A `ColdPathTracker` instance with an empty trace history.
 *
 * @see Design Choice F10 — Cold Path runs server-side; this is client-side tracking.
 */
export function createColdPathTracker(): ColdPathTracker {
    /**
     * Internal trace storage. Append-only in normal operation.
     * Cleared on `clearHistory()` or after server flush.
     */
    const traces: ForgeTraceRecord[] = [];

    // -----------------------------------------------------------------------
    // recordTrace
    // -----------------------------------------------------------------------

    function recordTrace(record: ForgeTraceRecord): void {
        traces.push(record);
    }

    // -----------------------------------------------------------------------
    // getTraceHistory
    // -----------------------------------------------------------------------

    function getTraceHistory(): readonly ForgeTraceRecord[] {
        return [...traces];
    }

    // -----------------------------------------------------------------------
    // getClusteredIntents
    // -----------------------------------------------------------------------

    function getClusteredIntents(
        threshold: number = DEFAULT_CLUSTER_THRESHOLD,
    ): readonly ClusteredIntent[] {
        // Group traces by intentHash
        const groups = new Map<string, {
            intentSlug: string;
            intentHash: string;
            count: number;
            successCount: number;
            timestamps: string[];
        }>();

        for (const trace of traces) {
            const existing = groups.get(trace.intentHash);

            if (existing !== undefined) {
                existing.count += 1;
                if (trace.success) {
                    existing.successCount += 1;
                }
                existing.timestamps.push(trace.timestamp);
            } else {
                groups.set(trace.intentHash, {
                    intentSlug: trace.intentSlug,
                    intentHash: trace.intentHash,
                    count: 1,
                    successCount: trace.success ? 1 : 0,
                    timestamps: [trace.timestamp],
                });
            }
        }

        // Filter to groups exceeding the threshold
        const clustered: ClusteredIntent[] = [];

        for (const group of groups.values()) {
            if (group.count >= threshold) {
                clustered.push({
                    intentSlug: group.intentSlug,
                    intentHash: group.intentHash,
                    count: group.count,
                    successRate: group.count > 0
                        ? group.successCount / group.count
                        : 0,
                    timestamps: [...group.timestamps],
                });
            }
        }

        // Sort by count descending (most frequent first)
        clustered.sort((a, b) => b.count - a.count);

        return clustered;
    }

    // -----------------------------------------------------------------------
    // clearHistory
    // -----------------------------------------------------------------------

    function clearHistory(): void {
        traces.length = 0;
    }

    // -----------------------------------------------------------------------
    // Return public API
    // -----------------------------------------------------------------------

    return {
        recordTrace,
        getTraceHistory,
        getClusteredIntents,
        clearHistory,
        get size(): number {
            return traces.length;
        },
    };
}
