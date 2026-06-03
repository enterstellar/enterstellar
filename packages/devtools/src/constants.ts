/**
 * @module @enterstellar-ai/devtools/constants
 * @description Module-level constants for `@enterstellar-ai/devtools`.
 *
 * All values are derived from locked design choices (DT2, DT4, DT5).
 * These are the single source of truth — never hardcode these values
 * elsewhere in the package.
 *
 * @see Design Choice DT2 — toggle shortcut + floating button
 * @see Design Choice DT4 — tab phasing (P0/P1/P2)
 * @see Design Choice DT5 — 500 traces in memory
 */

import type { DevToolsTab } from './types.js';

// ---------------------------------------------------------------------------
// Trace Buffer
// ---------------------------------------------------------------------------

/**
 * Maximum number of traces retained in the DevTools ring buffer.
 *
 * @see Design Choice DT5 — 500 traces at ~100 bytes metadata each ≈ 50KB.
 */
export const DEVTOOLS_MAX_TRACES = 500;

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

/**
 * Default keyboard shortcut to toggle the DevTools panel.
 *
 * @see Design Choice DT2 — `Ctrl+Shift+A`
 */
export const DEVTOOLS_DEFAULT_SHORTCUT = 'ctrl+shift+a';

// ---------------------------------------------------------------------------
// Panel Dimensions
// ---------------------------------------------------------------------------

/** Default panel width in pixels. */
export const DEVTOOLS_PANEL_WIDTH = 420;

/** Default panel height in pixels (80% of viewport). */
export const DEVTOOLS_PANEL_HEIGHT_PERCENT = 80;

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

/**
 * P0 tabs shipped at v1.0.
 *
 * @see Design Choice DT4
 */
export const P0_TABS: readonly DevToolsTab[] = [
    'trace-timeline',
    'component-inspector',
    'validation-log',
] as const;

/**
 * All tabs (P0 + deferred). Order determines tab bar rendering order.
 */
export const ALL_TABS: readonly DevToolsTab[] = [
    'trace-timeline',
    'component-inspector',
    'validation-log',
    'cache-dashboard',
    'performance-profiler',
    'replay-mode',
] as const;

/**
 * Human-readable labels for each tab.
 * Keyed by `DevToolsTab` for type-safe lookup.
 */
export const TAB_LABELS: Readonly<Record<DevToolsTab, string>> = {
    'trace-timeline': 'Timeline',
    'component-inspector': 'Inspector',
    'validation-log': 'Validation',
    'cache-dashboard': 'Cache',
    'performance-profiler': 'Performance',
    'replay-mode': 'Replay',
} as const;

/**
 * Set of tabs not yet implemented — rendered as `PanelStub` placeholders.
 *
 * Empty when all phases are complete. Retained for forward compatibility:
 * future tabs (e.g., Chrome Extension–exclusive panels) can be added here
 * during development without breaking the tab bar rendering logic.
 *
 * @see Design Choice DT4 — tab phasing (P0/P1/P2)
 */
export const DEFERRED_TABS: ReadonlySet<DevToolsTab> = new Set<DevToolsTab>([]);

// ---------------------------------------------------------------------------
// Cache Dashboard
// ---------------------------------------------------------------------------

/**
 * Polling interval for Cache Dashboard stats refresh, in milliseconds.
 *
 * The Cache Dashboard polls `DevToolsCacheAdapter.getStats()` at this
 * interval to display live-updating hit/miss statistics. 2 seconds
 * balances responsiveness with minimal performance overhead.
 *
 * @see Bible §4.4 — Cache Dashboard tab
 */
export const CACHE_POLL_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Replay Mode
// ---------------------------------------------------------------------------

/**
 * Maximum nesting depth for Replay Mode JSON viewer sections.
 *
 * Limits recursion in the `JsonViewer` component when rendering
 * pipeline step data. 8 levels is sufficient for typical trace
 * structures without risking stack overflow on pathological input.
 *
 * @see Design Choice DT6 — log viewer, step-by-step replay
 */
export const REPLAY_MAX_DEPTH = 8;
