'use client';

/**
 * @module @enterstellar-ai/devtools/panels/performance-profiler
 * @description P1 Tab — Latency aggregation and per-trace performance bars.
 *
 * The Performance Profiler computes P50/P95/P99/mean/min/max from all
 * buffered traces' `metrics.totalMs` values and renders:
 * 1. Stat cards for aggregated percentiles
 * 2. Horizontal bar chart sorted by slowest trace (descending)
 * 3. Click-to-inspect: clicking a bar selects the trace
 *
 * Data flow:
 * ```
 * useDevtoolsTraces(filter) → computeLatencyStats(totalMs[])
 *                               ↓ stat cards + bar chart
 *                               ↓ onSelectTrace (click bar)
 *                               parent panel ← selected trace
 * ```
 *
 * Current limitation: `ZoneTrace.metrics` only provides `totalMs`.
 * Per-stage breakdown (`resolutionMs`/`compilationMs`/`renderMs`)
 * requires `AgentTrace` in the store — noted as future enhancement.
 *
 * @see Bible §4.4 — Performance Profiler tab ("P50/P95/P99")
 * @see Design Choice DT4 — P1 tab
 * @see Design Choice DT5 — 500 traces in memory
 *
 * @internal
 */

import { useState, useMemo, useCallback } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';

import type { TraceFilter, LatencyStats } from '../types.js';
import { useDevtoolsTraces } from '../use-devtools-traces.js';
import { computeLatencyStats } from '../utils/percentiles.js';
import { FilterBar } from '../components/filter-bar.js';
import {
    performanceProfilerStyles as styles,
    sharedPanelStyles,
    panelStyles,
    statusColors,
} from '../styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `PerformanceProfiler` panel.
 *
 * @internal
 */
type PerformanceProfilerProps = {
    /**
     * Maximum traces retained in the DevTools buffer.
     * Passed through from `<EnterstellarDevTools />` config.
     *
     * @default 500
     */
    readonly maxTraces: number;

    /**
     * Callback fired when a trace bar is clicked.
     * The parent uses this to navigate to the Component Inspector.
     *
     * @param trace - The selected trace, or `null` to deselect.
     */
    readonly onSelectTrace: (trace: ZoneTrace | null) => void;

    /**
     * Currently selected trace ID, if any.
     * Used to highlight the selected bar row.
     */
    readonly selectedTraceId: string | null;
};

// ---------------------------------------------------------------------------
// Stat Card Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a single stat card (e.g., "P50: 42ms").
 *
 * @param label - The stat label (e.g., "P50", "P95").
 * @param value - The stat value in milliseconds, or `null` if no data.
 * @returns The stat card element.
 *
 * @internal
 */
function StatCard(props: {
    readonly label: string;
    readonly value: number | null;
}): React.JSX.Element {
    const { label, value } = props;

    return (
        <div style={styles['statCard']}>
            <span style={styles['statLabel']}>{label}</span>
            <span style={styles['statValue']}>
                {value !== null ? `${String(Math.round(value))}ms` : '–'}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Bar Row Renderer
// ---------------------------------------------------------------------------

/**
 * Resolves the bar fill color based on compilation status.
 *
 * @param status - The trace compilation status.
 * @returns CSS color string.
 *
 * @internal
 */
function getBarColor(status: 'pass' | 'fail' | 'corrected'): string {
    return statusColors[status];
}

/**
 * Renders a single latency bar row.
 *
 * @param trace - The trace to render a bar for.
 * @param maxLatency - Maximum latency across all displayed traces (for width normalization).
 * @param isSelected - Whether this trace is currently selected.
 * @param onSelect - Click handler.
 * @returns The bar row element.
 *
 * @internal
 */
function BarRow(props: {
    readonly trace: ZoneTrace;
    readonly maxLatency: number;
    readonly isSelected: boolean;
    readonly onSelect: (traceId: string) => void;
}): React.JSX.Element {
    const { trace, maxLatency, isSelected, onSelect } = props;
    const latency = trace.metrics.totalMs;

    // Guard: prevent division by zero when all latencies are 0
    const widthPercent = maxLatency > 0
        ? Math.max(1, (latency / maxLatency) * 100)
        : 100;

    const handleClick = useCallback(() => {
        onSelect(trace.id);
    }, [onSelect, trace.id]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(trace.id);
        }
    }, [onSelect, trace.id]);

    return (
        <div
            style={{
                ...styles['barRow'],
                ...(isSelected ? styles['barRowHover'] : undefined),
            }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="row"
            tabIndex={0}
            aria-label={`${trace.intent.component}: ${String(latency)}ms, ${trace.compilation.status}`}
            aria-selected={isSelected}
        >
            <span style={styles['barLabel']} title={trace.intent.component}>
                {trace.intent.component}
            </span>
            <div
                style={{
                    ...styles['barFill'],
                    width: `${String(widthPercent)}%`,
                    background: getBarColor(trace.compilation.status),
                }}
                role="meter"
                aria-valuenow={latency}
                aria-valuemin={0}
                aria-valuemax={maxLatency}
                aria-label={`${String(latency)}ms`}
            />
            <span style={styles['barValue']}>
                {Math.round(latency)}ms
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Performance Profiler panel — P1 Tab.
 *
 * Renders:
 * 1. Header with trace count
 * 2. Filter bar (search, zone, component, status)
 * 3. Stat cards (P50, P95, P99, Mean, Min, Max)
 * 4. Latency bar chart sorted by slowest first
 * 5. Empty state when no traces exist
 *
 * @param props - {@link PerformanceProfilerProps}
 * @returns The performance profiler panel element.
 *
 * @see Bible §4.4 — Performance Profiler specification
 *
 * @internal
 */
export function PerformanceProfiler(props: PerformanceProfilerProps): React.JSX.Element {
    const { maxTraces, onSelectTrace, selectedTraceId } = props;

    // -----------------------------------------------------------------------
    // Filter State
    // -----------------------------------------------------------------------

    const [filter, setFilter] = useState<TraceFilter>({});

    // -----------------------------------------------------------------------
    // Data Subscription
    // -----------------------------------------------------------------------

    const {
        filteredTraces,
        availableZones,
        availableComponents,
    } = useDevtoolsTraces(filter, maxTraces);

    // -----------------------------------------------------------------------
    // Derived: Latency Stats (memoized per C7)
    // -----------------------------------------------------------------------

    /** Aggregated percentile stats across all filtered traces. */
    const latencyStats: LatencyStats | null = useMemo(
        () => computeLatencyStats(filteredTraces.map((t) => t.metrics.totalMs)),
        [filteredTraces],
    );

    /** Filtered traces sorted by totalMs descending (slowest first). */
    const sortedTraces: readonly ZoneTrace[] = useMemo(
        () => [...filteredTraces].sort((a, b) => b.metrics.totalMs - a.metrics.totalMs),
        [filteredTraces],
    );

    /** Maximum latency for bar width normalization. */
    const maxLatency: number = useMemo(
        () => sortedTraces.length > 0
            ? (sortedTraces[0]?.metrics.totalMs ?? 0)
            : 0,
        [sortedTraces],
    );

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    /**
     * Handles bar row click — toggles selection.
     * Same toggle pattern as TraceTimeline.
     */
    const handleSelect = useCallback(
        (traceId: string) => {
            if (traceId === selectedTraceId) {
                onSelectTrace(null);
                return;
            }

            const trace = filteredTraces.find((t) => t.id === traceId);
            if (trace !== undefined) {
                onSelectTrace(trace);
            }
        },
        [selectedTraceId, onSelectTrace, filteredTraces],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div
            style={sharedPanelStyles['panelRoot']}
            data-enterstellar-devtools-panel="performance-profiler"
        >
            {/* Header */}
            <div style={sharedPanelStyles['header']}>
                <span style={sharedPanelStyles['headerMeta']}>
                    {filteredTraces.length} traces
                </span>
            </div>

            {/* Filter Bar */}
            <FilterBar
                filter={filter}
                onFilterChange={setFilter}
                availableZones={availableZones}
                availableComponents={availableComponents}
            />

            {/* Stat Cards */}
            {latencyStats !== null && (
                <div style={styles['statsGrid']} role="group" aria-label="Latency statistics">
                    <StatCard label="P50" value={latencyStats.p50} />
                    <StatCard label="P95" value={latencyStats.p95} />
                    <StatCard label="P99" value={latencyStats.p99} />
                    <StatCard label="Mean" value={latencyStats.mean} />
                    <StatCard label="Min" value={latencyStats.min} />
                    <StatCard label="Max" value={latencyStats.max} />
                </div>
            )}

            {/* Sort Indicator */}
            {sortedTraces.length > 0 && (
                <div style={styles['sortControls']}>
                    ↓ Sorted by slowest
                </div>
            )}

            {/* Latency Bar Chart */}
            <div
                style={panelStyles['content']}
                role="table"
                aria-label="Latency distribution"
            >
                {sortedTraces.length === 0 ? (
                    <div style={sharedPanelStyles['emptyState']}>
                        {filteredTraces.length === 0
                            ? 'No traces yet. Trigger an intent in an Zone to start.'
                            : 'No traces match the current filters.'}
                    </div>
                ) : (
                    sortedTraces.map((trace) => (
                        <BarRow
                            key={trace.id}
                            trace={trace}
                            maxLatency={maxLatency}
                            isSelected={trace.id === selectedTraceId}
                            onSelect={handleSelect}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
