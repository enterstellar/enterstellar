'use client';

/**
 * @module @enterstellar-ai/devtools/components/trace-row
 * @description Single trace entry row for the Trace Timeline panel.
 *
 * Renders a compact horizontal row showing:
 * - Timestamp (HH:MM:SS.mmm format)
 * - Zone name (extracted from trace ID)
 * - Component name
 * - Compilation status badge (via {@link StatusBadge})
 * - Latency in milliseconds
 *
 * Supports selected/unselected visual states. Clicking a row fires
 * `onSelect(traceId)` to expand the Component Inspector for that trace.
 *
 * Styled via centralized `styles.ts` — no external CSS.
 *
 * @see Bible §4.4 — Trace Timeline tab
 *
 * @internal
 */

import { useCallback, useMemo } from 'react';

import type { TraceRowProps } from '../types.js';
import { traceRowStyles } from '../styles.js';
import { StatusBadge } from './status-badge.js';
import { extractZoneName } from '../use-devtools-traces.js';

// ---------------------------------------------------------------------------
// Time Formatter
// ---------------------------------------------------------------------------

/**
 * Formats an ISO 8601 timestamp to `HH:MM:SS.mmm` for compact display.
 *
 * @param isoTimestamp - ISO 8601 timestamp string.
 * @returns Formatted time string, or the raw input if parsing fails.
 *
 * @internal
 */
function formatTime(isoTimestamp: string): string {
    const date = new Date(isoTimestamp);

    // Guard against invalid dates
    if (Number.isNaN(date.getTime())) {
        return isoTimestamp;
    }

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');

    return `${hours}:${minutes}:${seconds}.${ms}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Single trace row in the Trace Timeline.
 *
 * Layout: `[timestamp] [zone] [component] [status] [latency]`
 *
 * Clicking the row fires `onSelect` with the trace ID. The parent
 * panel uses this to populate the Component Inspector.
 *
 * @param props - {@link TraceRowProps}
 * @returns The trace row element.
 *
 * @internal
 */
export function TraceRow(props: TraceRowProps): React.JSX.Element {
    const { trace, isSelected, onSelect } = props;

    /**
     * Memoize the click handler to avoid creating a new closure
     * on every render. Stable reference keyed on trace.id.
     */
    const handleClick = useCallback(() => {
        onSelect(trace.id);
    }, [onSelect, trace.id]);

    /**
     * Extract zone name from trace ID.
     * Memoized to avoid re-computing on re-renders.
     */
    const zoneName = useMemo(
        () => extractZoneName(trace.id),
        [trace.id],
    );

    /**
     * Merge base row styles with selected state.
     */
    const rowStyle: React.CSSProperties = {
        ...traceRowStyles['row'],
        ...(isSelected ? traceRowStyles['rowSelected'] : undefined),
    };

    return (
        <div
            role="row"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleClick();
                }
            }}
            style={rowStyle}
            aria-selected={isSelected}
            data-enterstellar-devtools-trace-id={trace.id}
        >
            {/* Timestamp */}
            <span style={traceRowStyles['timestamp']}>
                {formatTime(trace.timestamp)}
            </span>

            {/* Zone Name */}
            <span style={traceRowStyles['zone']} title={zoneName}>
                {zoneName}
            </span>

            {/* Component Name */}
            <span style={traceRowStyles['component']} title={trace.intent.component}>
                {trace.intent.component}
            </span>

            {/* Status Badge */}
            <StatusBadge status={trace.compilation.status} />

            {/* Latency */}
            <span style={traceRowStyles['latency']}>
                {trace.metrics.totalMs}ms
            </span>
        </div>
    );
}
