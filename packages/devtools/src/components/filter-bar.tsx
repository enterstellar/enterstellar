'use client';

/**
 * @module @enterstellar-ai/devtools/components/filter-bar
 * @description Shared filter controls for the DevTools panels.
 *
 * Renders a horizontal bar with:
 * - Text search input (free-text, case-insensitive)
 * - Zone dropdown (populated from available zones)
 * - Component dropdown (populated from available components)
 * - Status toggle buttons (pass / corrected / fail)
 *
 * The filter bar is a **controlled component** — state is managed
 * by the parent panel via `filter` prop and `onFilterChange` callback.
 *
 * Used by the Trace Timeline and Validation Log panels.
 * Styled via centralized `styles.ts` — no external CSS.
 *
 * @see Bible §4.4 — Trace Timeline, Validation Log tabs
 *
 * @internal
 */

import { useCallback } from 'react';

import type { FilterBarProps } from '../types.js';
import type { TraceFilter } from '../types.js';
import { filterBarStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shared filter controls for trace filtering.
 *
 * All filter criteria are optional. When a criterion is set to its
 * default value (`''` for search, `undefined` for dropdowns/status),
 * that filter is considered inactive.
 *
 * @param props - {@link FilterBarProps}
 * @returns The filter bar element.
 *
 * @internal
 */
export function FilterBar(props: FilterBarProps): React.JSX.Element {
    const { filter, onFilterChange, availableZones, availableComponents } = props;

    // -----------------------------------------------------------------------
    // Change Handlers
    // -----------------------------------------------------------------------

    /**
     * Handles text search input changes.
     * Builds a new filter object, omitting `undefined` properties
     * to satisfy `exactOptionalPropertyTypes`.
     */
    const handleSearchChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value;
            const updated: TraceFilter = Object.create(null) as TraceFilter;
            if (filter.zone !== undefined) { (updated as Record<string, unknown>)['zone'] = filter.zone; }
            if (filter.component !== undefined) { (updated as Record<string, unknown>)['component'] = filter.component; }
            if (filter.status !== undefined) { (updated as Record<string, unknown>)['status'] = filter.status; }
            if (value.length > 0) { (updated as Record<string, unknown>)['search'] = value; }
            onFilterChange(updated);
        },
        [filter, onFilterChange],
    );

    /**
     * Handles zone dropdown changes.
     * Empty string resets the zone filter.
     */
    const handleZoneChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value;
            const updated: TraceFilter = Object.create(null) as TraceFilter;
            if (value.length > 0) { (updated as Record<string, unknown>)['zone'] = value; }
            if (filter.component !== undefined) { (updated as Record<string, unknown>)['component'] = filter.component; }
            if (filter.status !== undefined) { (updated as Record<string, unknown>)['status'] = filter.status; }
            if (filter.search !== undefined) { (updated as Record<string, unknown>)['search'] = filter.search; }
            onFilterChange(updated);
        },
        [filter, onFilterChange],
    );

    /**
     * Handles component dropdown changes.
     * Empty string resets the component filter.
     */
    const handleComponentChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value;
            const updated: TraceFilter = Object.create(null) as TraceFilter;
            if (filter.zone !== undefined) { (updated as Record<string, unknown>)['zone'] = filter.zone; }
            if (value.length > 0) { (updated as Record<string, unknown>)['component'] = value; }
            if (filter.status !== undefined) { (updated as Record<string, unknown>)['status'] = filter.status; }
            if (filter.search !== undefined) { (updated as Record<string, unknown>)['search'] = filter.search; }
            onFilterChange(updated);
        },
        [filter, onFilterChange],
    );

    /**
     * Handles status filter toggle.
     * Clicking the same status again deactivates the filter.
     */
    const handleStatusClick = useCallback(
        (status: 'pass' | 'fail' | 'corrected') => {
            const updated: TraceFilter = Object.create(null) as TraceFilter;
            if (filter.zone !== undefined) { (updated as Record<string, unknown>)['zone'] = filter.zone; }
            if (filter.component !== undefined) { (updated as Record<string, unknown>)['component'] = filter.component; }
            if (filter.status !== status) { (updated as Record<string, unknown>)['status'] = status; }
            if (filter.search !== undefined) { (updated as Record<string, unknown>)['search'] = filter.search; }
            onFilterChange(updated);
        },
        [filter, onFilterChange],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div
            style={filterBarStyles['container']}
            role="search"
            aria-label="Filter traces"
            data-enterstellar-devtools-filter=""
        >
            {/* Text Search */}
            <input
                type="text"
                placeholder="Search intents, components…"
                value={filter.search ?? ''}
                onChange={handleSearchChange}
                style={filterBarStyles['input']}
                aria-label="Search traces"
            />

            {/* Zone Dropdown */}
            <select
                value={filter.zone ?? ''}
                onChange={handleZoneChange}
                style={filterBarStyles['select']}
                aria-label="Filter by zone"
            >
                <option value="">All Zones</option>
                {availableZones.map((zone) => (
                    <option key={zone} value={zone}>
                        {zone}
                    </option>
                ))}
            </select>

            {/* Component Dropdown */}
            <select
                value={filter.component ?? ''}
                onChange={handleComponentChange}
                style={filterBarStyles['select']}
                aria-label="Filter by component"
            >
                <option value="">All Components</option>
                {availableComponents.map((comp) => (
                    <option key={comp} value={comp}>
                        {comp}
                    </option>
                ))}
            </select>

            {/* Status Toggles */}
            {(['pass', 'corrected', 'fail'] as const).map((status) => (
                <button
                    key={status}
                    type="button"
                    onClick={() => { handleStatusClick(status); }}
                    style={{
                        ...filterBarStyles['select'],
                        fontWeight: filter.status === status ? 700 : 400,
                        opacity: filter.status === status ? 1 : 0.6,
                    }}
                    aria-pressed={filter.status === status}
                    aria-label={`Filter by status: ${status}`}
                >
                    {status.toUpperCase()}
                </button>
            ))}
        </div>
    );
}
