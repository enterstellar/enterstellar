/**
 * @module @enterstellar-ai/devtools/types
 * @description Internal type definitions for the `@enterstellar-ai/devtools` package.
 *
 * These types define the data shapes used by the DevTools panel, hooks,
 * and utility functions. Following Enterstellar convention (Design Choice T1):
 * `type` for data shapes, `interface` for objects with behavior.
 *
 * Public types (re-exported from `index.ts`):
 * - `DevToolsConfig`
 * - `DevToolsTab`
 * - `DevToolsCacheAdapter`
 * - `LatencyStats`
 *
 * @see Design Choices DT1–DT8 — DevTools locked decisions
 * @see Bible §4.4 — DevTools module specification
 * @internal
 */

import type { ZoneTrace } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the `<EnterstellarDevTools />` component.
 *
 * All fields are optional — sensible defaults are applied per
 * locked design choices DT2 and DT5.
 *
 * @see Design Choice DT2 — keyboard shortcut + floating button
 * @see Design Choice DT5 — 500 traces in memory
 */
export type DevToolsConfig = {
    /**
     * Maximum traces retained in the DevTools ring buffer.
     * Oldest traces are evicted when this limit is reached.
     *
     * @default 500
     * @see Design Choice DT5
     */
    readonly maxTraces?: number;

    /**
     * Whether the DevTools panel is visible on initial mount.
     * Useful for debugging sessions where you want immediate visibility.
     *
     * @default false
     */
    readonly defaultOpen?: boolean;

    /**
     * Keyboard shortcut string to toggle the panel.
     * Format: modifier keys joined with `+` (e.g., `'ctrl+shift+a'`).
     * Modifiers: `ctrl`, `shift`, `alt`, `meta`.
     *
     * @default 'ctrl+shift+a'
     * @see Design Choice DT2
     */
    readonly shortcut?: string;

    /**
     * Position of the floating toggle button (⚡) within the viewport.
     *
     * @default 'bottom-right'
     * @see Design Choice DT2
     */
    readonly position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
};

// ---------------------------------------------------------------------------
// Tab Identification
// ---------------------------------------------------------------------------

/**
 * Identifies a DevTools panel tab.
 *
 * P0 tabs (v1.0): `trace-timeline`, `component-inspector`, `validation-log`.
 * Deferred tabs: `cache-dashboard`, `performance-profiler`, `replay-mode`.
 *
 * @see Design Choice DT4 — tab phasing
 */
export type DevToolsTab =
    | 'trace-timeline'
    | 'component-inspector'
    | 'validation-log'
    | 'cache-dashboard'
    | 'performance-profiler'
    | 'replay-mode';

// ---------------------------------------------------------------------------
// Trace Filtering
// ---------------------------------------------------------------------------

/**
 * Filter criteria for the Trace Timeline panel.
 *
 * All fields are optional — when `undefined`, no filtering is applied
 * for that criterion. Filters are combined with logical AND.
 */
export type TraceFilter = {
    /** Filter by zone name (exact match). */
    readonly zone?: string;

    /** Filter by resolved component name (exact match). */
    readonly component?: string;

    /** Filter by compilation status. */
    readonly status?: 'pass' | 'fail' | 'corrected';

    /** Free-text search across intent, component name, and error messages. */
    readonly search?: string;
};

// ---------------------------------------------------------------------------
// Trace Export
// ---------------------------------------------------------------------------

/**
 * Serializable bundle for JSON trace export.
 *
 * Contains all data needed to reconstruct a debugging session
 * in an offline environment or share with collaborators.
 *
 * @see Design Choice DT8 — JSON export via download
 */
export type TraceExportBundle = {
    /** ISO 8601 timestamp of when the export was created. */
    readonly exportedAt: string;

    /** The `@enterstellar-ai/types` SDK version that produced these traces. */
    readonly sdkVersion: string;

    /** All traces captured in the DevTools buffer at export time. */
    readonly traces: readonly ZoneTrace[];

    /** Snapshot of zone configurations at export time. */
    readonly zoneConfigs: Readonly<Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// Cache Adapter Protocol (L5 — Incrementally Adoptable)
// ---------------------------------------------------------------------------

/**
 * Minimal cache interface for the DevTools Cache Dashboard.
 *
 * Defines a protocol (structural contract) rather than importing
 * `RenderCache` from `@enterstellar-ai/cache` directly. This avoids a hard
 * peer dependency: consumers who don't use `@enterstellar-ai/cache` can still
 * use DevTools without installing it.
 *
 * Any object that satisfies this shape works — including the real
 * `RenderCache`, a mock, or a custom implementation.
 *
 * @see Design Choice DT7 — data access patterns
 * @see Bible §4.4 — Cache Dashboard tab
 */
export type DevToolsCacheAdapter = {
    /**
     * Returns current cache performance statistics.
     *
     * The returned object shape matches `CacheStats` from `@enterstellar-ai/cache`:
     * `hits`, `misses`, `entries` (count), and `hitRate` (0.0–1.0).
     *
     * @returns Cache performance statistics snapshot.
     */
    readonly getStats: () => {
        readonly hits: number;
        readonly misses: number;
        readonly entries: number;
        readonly hitRate: number;
    };

    /**
     * Invalidates all cache entries.
     *
     * Used by the Cache Dashboard "Clear Cache" button.
     * After clearing, `getStats()` should reflect `entries: 0`.
     */
    readonly invalidateAll: () => void;
};

// ---------------------------------------------------------------------------
// Performance Profiler Statistics
// ---------------------------------------------------------------------------

/**
 * Aggregated latency statistics for the Performance Profiler panel.
 *
 * Computed from all traces' `metrics.totalMs` values in the ring buffer.
 * Percentiles use the nearest-rank method on the sorted dataset.
 *
 * @see Bible §4.4 — Performance Profiler tab ("P50/P95/P99")
 * @see Design Choice DT5 — 500 traces in memory
 */
export type LatencyStats = {
    /** 50th percentile (median) latency in milliseconds. */
    readonly p50: number;
    /** 95th percentile latency in milliseconds. */
    readonly p95: number;
    /** 99th percentile latency in milliseconds. */
    readonly p99: number;
    /** Arithmetic mean latency in milliseconds. */
    readonly mean: number;
    /** Minimum observed latency in milliseconds. */
    readonly min: number;
    /** Maximum observed latency in milliseconds. */
    readonly max: number;
    /** Total number of data points used for computation. */
    readonly count: number;
};

// ---------------------------------------------------------------------------
// Replay Mode Pipeline Steps
// ---------------------------------------------------------------------------

/**
 * A single pipeline step in the Replay Mode log viewer.
 *
 * Each step represents one stage of the Enterstellar compilation pipeline,
 * rendered as an expandable section in the vertical stepper UI.
 *
 * Steps are derived from `ZoneTrace` fields. When `AgentTrace` data
 * becomes available in the store (future enhancement), additional
 * steps (resolution, determinism) will be populated.
 *
 * @see Design Choice DT6 — log viewer, step-by-step replay
 * @see Bible §4.4 — Replay Mode tab
 */
export type ReplayStep = {
    /**
     * Machine-readable step identifier.
     * Used as the React key and for step navigation.
     *
     * @example 'intent', 'compilation', 'validation', 'provenance', 'output', 'performance'
     */
    readonly name: string;

    /**
     * Human-readable label displayed in the step header.
     *
     * @example 'Intent Received', 'Compilation', 'Validation Errors'
     */
    readonly label: string;

    /**
     * Step data rendered via `JsonViewer`.
     * Shape varies per step — `unknown` is intentional for flexibility.
     */
    readonly data: unknown;

    /**
     * Step outcome status.
     * - `'completed'` — step executed successfully (green indicator).
     * - `'failed'` — step produced errors (red indicator).
     * - `'skipped'` — step data unavailable at this trace level (grey indicator).
     */
    readonly status: 'completed' | 'failed' | 'skipped';
};

// ---------------------------------------------------------------------------
// Internal Component Props
// ---------------------------------------------------------------------------

/**
 * Props for the `TraceRow` component.
 *
 * Renders a single trace entry in the timeline list.
 *
 * @internal
 */
export type TraceRowProps = {
    /** The trace to render. */
    readonly trace: ZoneTrace;

    /** Whether this row is currently selected/expanded. */
    readonly isSelected: boolean;

    /** Callback fired when the row is clicked. */
    readonly onSelect: (traceId: string) => void;
};

/**
 * Props for the `StatusBadge` component.
 *
 * Renders a color-coded compilation status indicator.
 *
 * @internal
 */
export type StatusBadgeProps = {
    /** Compilation status to display. */
    readonly status: 'pass' | 'fail' | 'corrected';
};

/**
 * Props for the `JsonViewer` component.
 *
 * Renders a collapsible JSON tree for inspecting structured data.
 *
 * @internal
 */
export type JsonViewerProps = {
    /** The data to render as a JSON tree. */
    readonly data: unknown;

    /** Label shown at the root of the tree. */
    readonly label?: string;

    /** Whether the root node starts expanded. */
    readonly defaultExpanded?: boolean;
};

/**
 * Props for the `FilterBar` component.
 *
 * Shared filter controls used by Timeline and Validation Log.
 *
 * @internal
 */
export type FilterBarProps = {
    /** Current filter state. */
    readonly filter: TraceFilter;

    /** Callback fired when any filter criterion changes. */
    readonly onFilterChange: (filter: TraceFilter) => void;

    /** Available zone names for the zone dropdown. */
    readonly availableZones: readonly string[];

    /** Available component names for the component dropdown. */
    readonly availableComponents: readonly string[];
};

/**
 * Props for the `ToggleButton` component.
 *
 * Floating action button (⚡) for toggling the DevTools panel.
 *
 * @see Design Choice DT2
 * @internal
 */
export type ToggleButtonProps = {
    /** Whether the DevTools panel is currently open. */
    readonly isOpen: boolean;

    /** Callback fired when the button is clicked. */
    readonly onToggle: () => void;

    /** Viewport position for the button. */
    readonly position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
};
