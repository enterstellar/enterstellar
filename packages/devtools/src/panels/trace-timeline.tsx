'use client';

/**
 * @module @enterstellar-ai/devtools/panels/trace-timeline
 * @description P0 Tab 1 — Chronological list of all `ZoneTrace` events.
 *
 * The Trace Timeline is the primary observation surface for Enterstellar DevTools.
 * It renders a scrollable list of all traces from the ring buffer, with
 * filter controls and an export button.
 *
 * Clicking a trace row selects it and communicates the selection to the
 * parent `<EnterstellarDevTools />` component, which populates the Component
 * Inspector tab with the selected trace's details.
 *
 * Data flow:
 * ```
 * useDevtoolsTraces(filter) → FilterBar + TraceRow[] + export button
 *                              ↑ filter state         ↓ onSelectTrace
 *                              parent panel ←──────────┘
 * ```
 *
 * @see Bible §4.4 — Trace Timeline tab
 * @see Design Choice DT4 — P0 tab
 * @see Design Choice DT5 — 500 traces in memory
 * @see Design Choice DT8 — JSON export
 * @see Principle L4 — every render is traceable
 *
 * @internal
 */

import { useState, useCallback } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';

import type { TraceFilter } from '../types.js';
import { useDevtoolsTraces } from '../use-devtools-traces.js';
import { exportTraces } from '../export-traces.js';
import { FilterBar } from '../components/filter-bar.js';
import { TraceRow } from '../components/trace-row.js';
import { panelStyles, exportButtonStyles, sharedPanelStyles } from '../styles.js';
import { DEVTOOLS_MAX_TRACES } from '../constants.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `TraceTimeline` panel.
 *
 * @internal
 */
type TraceTimelineProps = {
    /**
     * Maximum traces retained in the DevTools buffer.
     * Passed through from `<EnterstellarDevTools />` config.
     *
     * @default 500
     */
    readonly maxTraces: number;

    /**
     * Callback fired when a trace is selected by clicking a row.
     * The parent component uses this to populate the Component Inspector.
     *
     * @param trace - The selected trace, or `null` to deselect.
     */
    readonly onSelectTrace: (trace: ZoneTrace | null) => void;

    /**
     * Currently selected trace ID, if any.
     * Used to highlight the selected row.
     */
    readonly selectedTraceId: string | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Trace Timeline panel — P0 Tab 1.
 *
 * Renders:
 * 1. Header with trace count and export button
 * 2. Filter bar (search, zone, component, status)
 * 3. Scrollable list of trace rows
 * 4. Empty state when no traces match
 *
 * @param props - {@link TraceTimelineProps}
 * @returns The timeline panel element.
 *
 * @see Bible §4.4 — Trace Timeline specification
 *
 * @internal
 */
export function TraceTimeline(props: TraceTimelineProps): React.JSX.Element {
    const { maxTraces, onSelectTrace, selectedTraceId } = props;

    // -----------------------------------------------------------------------
    // Filter State
    // -----------------------------------------------------------------------

    const [filter, setFilter] = useState<TraceFilter>({});

    // -----------------------------------------------------------------------
    // Data Subscription
    // -----------------------------------------------------------------------

    const {
        allTraces,
        filteredTraces,
        availableZones,
        availableComponents,
    } = useDevtoolsTraces(filter, maxTraces);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    /**
     * Handles trace row selection.
     * Toggles selection if the same trace is clicked again.
     */
    const handleSelect = useCallback(
        (traceId: string) => {
            if (traceId === selectedTraceId) {
                // Deselect on second click
                onSelectTrace(null);
                return;
            }

            const trace = allTraces.find((t) => t.id === traceId);
            if (trace !== undefined) {
                onSelectTrace(trace);
            }
        },
        [selectedTraceId, onSelectTrace, allTraces],
    );

    /**
     * Handles the export button click.
     * Exports all traces (not just filtered) with an empty zone config
     * snapshot (zone configs are not directly accessible from this panel).
     */
    const handleExport = useCallback(() => {
        exportTraces(allTraces, {});
    }, [allTraces]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div
            style={sharedPanelStyles['panelRoot']}
            data-enterstellar-devtools-panel="trace-timeline"
        >
            {/* Header */}
            <div
                style={sharedPanelStyles['header']}
            >
                <span style={sharedPanelStyles['headerMeta']}>
                    {filteredTraces.length} / {allTraces.length} traces
                    {allTraces.length >= (maxTraces > 0 ? maxTraces : DEVTOOLS_MAX_TRACES) && (
                        <span title="Buffer is full — oldest traces are being evicted">
                            {' '}(buffer full)
                        </span>
                    )}
                </span>
                <button
                    type="button"
                    onClick={handleExport}
                    style={exportButtonStyles['button']}
                    aria-label="Export traces as JSON"
                    disabled={allTraces.length === 0}
                >
                    ↓ Export
                </button>
            </div>

            {/* Filter Bar */}
            <FilterBar
                filter={filter}
                onFilterChange={setFilter}
                availableZones={availableZones}
                availableComponents={availableComponents}
            />

            {/* Trace List */}
            <div
                style={panelStyles['content']}
                role="table"
                aria-label="Trace timeline"
            >
                {filteredTraces.length === 0 ? (
                    <div
                        style={sharedPanelStyles['emptyState']}
                    >
                        {allTraces.length === 0
                            ? 'No traces yet. Trigger an intent in an Zone to start.'
                            : 'No traces match the current filters.'}
                    </div>
                ) : (
                    filteredTraces.map((trace) => (
                        <TraceRow
                            key={trace.id}
                            trace={trace}
                            isSelected={trace.id === selectedTraceId}
                            onSelect={handleSelect}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
