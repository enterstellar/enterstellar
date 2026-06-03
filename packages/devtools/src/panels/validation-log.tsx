'use client';

/**
 * @module @enterstellar-ai/devtools/panels/validation-log
 * @description P0 Tab 3 — Filterable log of all compilation issues across traces.
 *
 * The Validation Log aggregates all traces where compilation status is
 * `fail` or `corrected`, providing a centralized view of all validation
 * issues detected by the Enterstellar compiler pipeline.
 *
 * Each entry displays:
 * - Timestamp and zone name
 * - Compilation status badge
 * - Component name and error count
 * - Self-correction attempts count
 * - Raw intent (for context)
 *
 * Clicking an entry fires `onSelectTrace` to populate the Component
 * Inspector with the associated trace's full details.
 *
 * Supports text search filtering across component names and intent text.
 *
 * @see Bible §4.4 — Validation Log tab
 * @see Design Choice DT4 — P0 tab
 * @see Coding Rule C15 — fix suggestions
 *
 * @internal
 */

import { useState, useMemo, useCallback } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';

import { useDevtoolsTraces, extractZoneName } from '../use-devtools-traces.js';
import { StatusBadge } from '../components/status-badge.js';
import { validationLogStyles, filterBarStyles, sharedPanelStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `ValidationLog` panel.
 *
 * @internal
 */
type ValidationLogProps = {
    /**
     * Maximum traces retained in the DevTools buffer.
     * Passed through from `<EnterstellarDevTools />` config.
     *
     * @default 500
     */
    readonly maxTraces: number;

    /**
     * Callback fired when a validation entry is clicked.
     * Navigates to the associated trace in the Component Inspector.
     *
     * @param trace - The trace associated with the clicked entry.
     */
    readonly onSelectTrace: (trace: ZoneTrace | null) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Validation Log panel — P0 Tab 3.
 *
 * Renders:
 * 1. Header with issue count
 * 2. Search input for filtering
 * 3. Scrollable list of validation entries
 * 4. Empty state when no issues exist
 *
 * Only traces with `compilation.status` of `'fail'` or `'corrected'`
 * appear in this log. Traces with `'pass'` status are excluded.
 *
 * @param props - {@link ValidationLogProps}
 * @returns The validation log panel element.
 *
 * @see Bible §4.4 — Validation Log specification
 *
 * @internal
 */
export function ValidationLog(props: ValidationLogProps): React.JSX.Element {
    const { maxTraces, onSelectTrace } = props;

    // -----------------------------------------------------------------------
    // Data Subscription
    // -----------------------------------------------------------------------

    /**
     * Subscribe to all traces with an empty filter.
     * We do our own filtering below to isolate validation issues.
     */
    const { allTraces } = useDevtoolsTraces({}, maxTraces);

    // -----------------------------------------------------------------------
    // Search State
    // -----------------------------------------------------------------------

    const [searchText, setSearchText] = useState('');

    // -----------------------------------------------------------------------
    // Derived Data: Validation Issues
    // -----------------------------------------------------------------------

    /**
     * Filter traces to only those with compilation issues.
     * A trace is a "validation issue" if its status is `fail` or `corrected`.
     */
    const issueTraces = useMemo((): readonly ZoneTrace[] => {
        const issues = allTraces.filter(
            (trace) =>
                trace.compilation.status === 'fail' ||
                trace.compilation.status === 'corrected',
        );

        // Apply search text filter if provided
        if (searchText.length === 0) {
            return issues;
        }

        const searchLower = searchText.toLowerCase();
        return issues.filter((trace) => {
            const componentMatch = trace.intent.component.toLowerCase().includes(searchLower);
            const zoneMatch = extractZoneName(trace.id).toLowerCase().includes(searchLower);
            return componentMatch || zoneMatch;
        });
    }, [allTraces, searchText]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    /**
     * Handles search input changes.
     */
    const handleSearchChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setSearchText(event.target.value);
        },
        [],
    );

    /**
     * Handles clicking a validation entry.
     * Fires `onSelectTrace` to navigate to the Component Inspector.
     */
    const handleEntryClick = useCallback(
        (trace: ZoneTrace) => {
            onSelectTrace(trace);
        },
        [onSelectTrace],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div
            style={sharedPanelStyles['panelRoot']}
            data-enterstellar-devtools-panel="validation-log"
        >
            {/* Header */}
            <div
                style={sharedPanelStyles['header']}
            >
                <span style={sharedPanelStyles['headerMeta']}>
                    {issueTraces.length} validation {issueTraces.length === 1 ? 'issue' : 'issues'}
                </span>
            </div>

            {/* Search Bar */}
            <div
                style={sharedPanelStyles['searchBar']}
            >
                <input
                    type="text"
                    placeholder="Search by component, intent, or zone…"
                    value={searchText}
                    onChange={handleSearchChange}
                    style={filterBarStyles['input']}
                    aria-label="Search validation issues"
                />
            </div>

            {/* Issue List */}
            <div
                style={{ flex: 1, overflow: 'auto' }}
                role="log"
                aria-label="Validation issues"
            >
                {issueTraces.length === 0 ? (
                    <div
                        style={sharedPanelStyles['emptyState']}
                    >
                        {allTraces.length === 0
                            ? 'No traces yet.'
                            : 'No validation issues found. All compilations passed.'}
                    </div>
                ) : (
                    issueTraces.map((trace) => (
                        <ValidationEntry
                            key={trace.id}
                            trace={trace}
                            onClick={handleEntryClick}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Validation Entry Component
// ---------------------------------------------------------------------------

/**
 * Props for the internal `ValidationEntry` component.
 *
 * @internal
 */
type ValidationEntryProps = {
    /** The trace with a validation issue. */
    readonly trace: ZoneTrace;

    /** Callback fired when the entry is clicked. */
    readonly onClick: (trace: ZoneTrace) => void;
};

/**
 * Renders a single validation issue entry in the log.
 *
 * Displays: status badge, component name, error count,
 * self-correction attempts, zone, timestamp, and raw intent.
 *
 * @param props - {@link ValidationEntryProps}
 * @returns A clickable validation entry element.
 *
 * @internal
 */
function ValidationEntry(props: ValidationEntryProps): React.JSX.Element {
    const { trace, onClick } = props;

    const handleClick = useCallback(() => {
        onClick(trace);
    }, [onClick, trace]);

    const zoneName = extractZoneName(trace.id);

    /**
     * Format timestamp for compact display.
     */
    const formattedTime = useMemo((): string => {
        const date = new Date(trace.timestamp);
        if (Number.isNaN(date.getTime())) {
            return trace.timestamp;
        }
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }, [trace.timestamp]);

    return (
        <div
            role="listitem"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleClick();
                }
            }}
            style={validationLogStyles['row']}
            data-enterstellar-devtools-validation-id={trace.id}
        >
            {/* Status + Component */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <StatusBadge status={trace.compilation.status} />
                <span style={sharedPanelStyles['componentName']}>
                    {trace.intent.component}
                </span>
            </div>

            {/* Error Details */}
            <div style={validationLogStyles['message']}>
                {trace.compilation.errors.length} {trace.compilation.errors.length === 1 ? 'error' : 'errors'}
                {trace.compilation.selfCorrectionAttempts > 0 && (
                    <span>
                        {' · '}{trace.compilation.selfCorrectionAttempts} self-correction{' '}
                        {trace.compilation.selfCorrectionAttempts === 1 ? 'attempt' : 'attempts'}
                    </span>
                )}
            </div>

            {/* Fix Suggestion (for corrected traces) */}
            {trace.compilation.status === 'corrected' && (
                <div style={validationLogStyles['fix']}>
                    ✓ Self-corrected successfully
                </div>
            )}

            {/* Meta: Zone + Timestamp */}
            <div style={validationLogStyles['meta']}>
                <span>{zoneName}</span>
                <span>{formattedTime}</span>
                <span
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 200,
                    }}
                    title={trace.intent.component}
                >
                    {trace.intent.component}
                </span>
            </div>
        </div>
    );
}
