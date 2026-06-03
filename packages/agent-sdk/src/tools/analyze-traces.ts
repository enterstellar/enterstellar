/**
 * @module @enterstellar-ai/agent-sdk/tools/analyze-traces
 * @description Implements the `enterstellar_analyze_traces` MCP tool.
 *
 * Queries `EnterstellarStore` for local session traces and groups them by a
 * specified dimension. Returns aggregated metrics per group for
 * agent-driven observability.
 *
 * **Data source (AS5):** Local traces from `EnterstellarStore.get('traces')`.
 * No cloud API calls — session-scoped, in-memory only.
 *
 * **Supported groupBy dimensions:**
 * - `'component'` — groups by resolved component name.
 * - `'zone'` — groups by zone name (from determinism data).
 * - `'status'` — groups by compilation status (`pass`/`fail`/`corrected`).
 * - `'strategy'` — groups by resolution strategy (`exact`/`semantic`/`forge`/`fallback`).
 *
 * **Time range filtering:**
 * - `'last-hour'` — traces from the last 60 minutes.
 * - `'last-day'` — traces from the last 24 hours.
 * - `'all'` — no time filtering.
 * - ISO 8601 timestamp — traces after the given timestamp.
 *
 * **Edge cases:**
 * - Store not configured → `ENS-8005`.
 * - Invalid `groupBy` → `ENS-8005` with valid options listed.
 * - No matching traces → returns `{ totalTraces: 0, groups: [] }`.
 *
 * @see Bible §4.16 — `enterstellar_analyze_traces` tool definition.
 * @see Design Choice AS5 — local traces from `EnterstellarStore`.
 */

import type {
    TraceAnalysis,
    TraceAnalysisGroup,
    AgentSDKStore,
} from '../types.js';
import { traceAnalysisInvalidError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid groupBy dimension values. */
const VALID_GROUP_BY_VALUES = ['component', 'zone', 'status', 'strategy'] as const;

/** Type for valid groupBy values. */
type GroupByDimension = typeof VALID_GROUP_BY_VALUES[number];

/** Milliseconds in one hour. */
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Milliseconds in one day. */
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// ---------------------------------------------------------------------------
// Trace Shape (structural — avoids importing @enterstellar-ai/types AgentTrace)
// ---------------------------------------------------------------------------

/**
 * Minimal trace shape for analysis.
 *
 * Structurally matches the subset of `AgentTrace` from `@enterstellar-ai/types`
 * that trace analysis actually inspects. Avoids tight coupling.
 */
type AnalyzableTrace = {
    readonly timestamp: string;
    readonly resolution: {
        readonly strategy: string;
        readonly resolvedComponent: string;
    };
    readonly compilation: {
        readonly status: string;
    };
    readonly determinism: {
        readonly zone: string;
    };
    readonly metrics: {
        readonly totalMs: number;
    };
};

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar_analyze_traces` tool.
 *
 * Retrieves traces from the store, filters by time range, groups by the
 * specified dimension, and computes aggregated metrics per group.
 *
 * @param store - The Enterstellar store instance (optional — errors if not provided).
 * @param timeRange - Time range filter (`'last-hour'`, `'last-day'`, `'all'`, or ISO 8601).
 * @param groupBy - Grouping dimension (`'component'`, `'zone'`, `'status'`, `'strategy'`).
 * @returns Aggregated trace analysis with groups sorted by count descending.
 *
 * @throws {EnterstellarError} Code `ENS-8005` if store is not configured or groupBy is invalid.
 *
 * @example
 * ```ts
 * const analysis = await executeAnalyzeTraces(store, 'last-hour', 'component');
 * // analysis.totalTraces === 42
 * // analysis.groups[0].key === 'PatientVitals'
 * // analysis.groups[0].count === 15
 * ```
 */
export function executeAnalyzeTraces(
    store: AgentSDKStore | undefined,
    timeRange: string,
    groupBy: string,
): TraceAnalysis {
    // -----------------------------------------------------------------------
    // Validate dependencies
    // -----------------------------------------------------------------------

    if (store === undefined) {
        throw traceAnalysisInvalidError(
            'EnterstellarStore is not configured. Provide it via createAgentSDK({ store: ... }).',
        );
    }

    // -----------------------------------------------------------------------
    // Validate groupBy dimension
    // -----------------------------------------------------------------------

    if (!isValidGroupBy(groupBy)) {
        throw traceAnalysisInvalidError(
            `Invalid groupBy value '${groupBy}'.`,
        );
    }

    // -----------------------------------------------------------------------
    // Retrieve and filter traces
    // -----------------------------------------------------------------------

    const allTraces = store.get('traces');
    const traces: readonly AnalyzableTrace[] = Array.isArray(allTraces)
        ? (allTraces as readonly AnalyzableTrace[])
        : [];

    const cutoffMs = computeCutoffMs(timeRange);
    const filteredTraces = filterByTimeRange(traces, cutoffMs);

    // -----------------------------------------------------------------------
    // Group and aggregate
    // -----------------------------------------------------------------------

    const groups = groupTraces(filteredTraces, groupBy);

    return {
        timeRange,
        groupBy,
        totalTraces: filteredTraces.length,
        groups,
    };
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Type guard for valid `groupBy` dimension values.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid groupBy dimension.
 */
function isValidGroupBy(value: string): value is GroupByDimension {
    return (VALID_GROUP_BY_VALUES as readonly string[]).includes(value);
}

/**
 * Computes the cutoff timestamp in milliseconds for time range filtering.
 *
 * @param timeRange - Time range keyword or ISO 8601 timestamp.
 * @returns Cutoff in epoch milliseconds. `0` means no filtering.
 */
function computeCutoffMs(timeRange: string): number {
    const now = Date.now();

    switch (timeRange) {
        case 'last-hour':
            return now - ONE_HOUR_MS;
        case 'last-day':
            return now - ONE_DAY_MS;
        case 'all':
            return 0;
        default: {
            // Try parsing as ISO 8601 timestamp
            const parsed = Date.parse(timeRange);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
    }
}

/**
 * Filters traces by time range cutoff.
 *
 * @param traces - All traces from the store.
 * @param cutoffMs - Epoch milliseconds cutoff. Traces before this are excluded.
 * @returns Filtered array of traces within the time range.
 */
function filterByTimeRange(
    traces: readonly AnalyzableTrace[],
    cutoffMs: number,
): readonly AnalyzableTrace[] {
    if (cutoffMs === 0) {
        return traces;
    }

    return traces.filter((trace) => {
        const traceMs = Date.parse(trace.timestamp);
        return !Number.isNaN(traceMs) && traceMs >= cutoffMs;
    });
}

/**
 * Extracts the grouping key from a trace based on the groupBy dimension.
 *
 * @param trace - The trace to extract the key from.
 * @param groupBy - The grouping dimension.
 * @returns The grouping key string.
 */
function extractGroupKey(trace: AnalyzableTrace, groupBy: GroupByDimension): string {
    switch (groupBy) {
        case 'component':
            return trace.resolution.resolvedComponent;
        case 'zone':
            return trace.determinism.zone;
        case 'status':
            return trace.compilation.status;
        case 'strategy':
            return trace.resolution.strategy;
    }
}

/**
 * Groups traces by a dimension and computes aggregated metrics.
 *
 * @param traces - Filtered traces to group.
 * @param groupBy - The grouping dimension.
 * @returns Array of `TraceAnalysisGroup` sorted by count descending.
 */
function groupTraces(
    traces: readonly AnalyzableTrace[],
    groupBy: GroupByDimension,
): readonly TraceAnalysisGroup[] {
    // Accumulate per-group counters
    const accumulators = new Map<string, {
        count: number;
        totalLatencyMs: number;
        passCount: number;
    }>();

    for (const trace of traces) {
        const key = extractGroupKey(trace, groupBy);
        const existing = accumulators.get(key);

        if (existing !== undefined) {
            existing.count += 1;
            existing.totalLatencyMs += trace.metrics.totalMs;
            existing.passCount += trace.compilation.status === 'pass' ? 1 : 0;
        } else {
            accumulators.set(key, {
                count: 1,
                totalLatencyMs: trace.metrics.totalMs,
                passCount: trace.compilation.status === 'pass' ? 1 : 0,
            });
        }
    }

    // Convert to output format and sort by count descending
    const groups: TraceAnalysisGroup[] = [];

    for (const [key, acc] of accumulators) {
        groups.push({
            key,
            count: acc.count,
            avgLatencyMs: acc.count > 0 ? acc.totalLatencyMs / acc.count : 0,
            successRate: acc.count > 0 ? acc.passCount / acc.count : 0,
        });
    }

    groups.sort((a, b) => b.count - a.count);

    return groups;
}
