/**
 * @module @enterstellar-ai/devtools/styles
 * @description Centralized inline style objects for the DevTools panel.
 *
 * Self-contained dark theme — no external CSS imports, no Tailwind,
 * no CSS modules. All styles are typed via `React.CSSProperties`.
 *
 * Design rationale: DevTools is a development-only tool that must
 * not interfere with the host application's styles. Inline styles
 * ensure complete isolation without CSS specificity conflicts.
 *
 * @internal
 */

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Color Palette (Dark Theme)
// ---------------------------------------------------------------------------

/** Base colors for the DevTools dark theme. */
const colors = {
    /** Panel background. */
    bg: '#1a1a2e',
    /** Panel surface (cards, rows). */
    surface: '#16213e',
    /** Elevated surface (selected row, hover). */
    surfaceElevated: '#0f3460',
    /** Primary text. */
    text: '#e4e4e7',
    /** Secondary/muted text. */
    textMuted: '#a1a1aa',
    /** Border color. */
    border: '#27274a',
    /** Accent color (Enterstellar brand). */
    accent: '#e94560',
    /** Accent hover state. */
    accentHover: '#ff6b81',
    /** Success/pass status. */
    success: '#22c55e',
    /** Warning/corrected status. */
    warning: '#f59e0b',
    /** Error/fail status. */
    error: '#ef4444',
    /** Code/monospace background. */
    codeBg: '#0d1117',
    /** Scrollbar track. */
    scrollTrack: '#1a1a2e',
    /** Scrollbar thumb. */
    scrollThumb: '#27274a',
} as const;

// ---------------------------------------------------------------------------
// Status Colors (exported for panel components — C6)
// ---------------------------------------------------------------------------

/**
 * Compilation status → color mapping for panel components.
 *
 * Exported so that panels can reference status colors without
 * hardcoding hex values (C6 — no magic values).
 *
 * @internal
 */
export const statusColors: Readonly<Record<'pass' | 'corrected' | 'fail', string>> = {
    pass: colors.success,
    corrected: colors.warning,
    fail: colors.error,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/** Font stack for DevTools UI. */
const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Monospace font stack for code/JSON display. */
const fontFamilyMono = '"SF Mono", "Fira Code", "JetBrains Mono", Consolas, "Courier New", monospace';

// ---------------------------------------------------------------------------
// Exported Style Objects
// ---------------------------------------------------------------------------

/**
 * Styles for the floating toggle button (⚡).
 *
 * @see Design Choice DT2
 */
export const toggleButtonStyles: Readonly<Record<string, CSSProperties>> = {
    button: {
        position: 'fixed',
        zIndex: 99999,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: 'none',
        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
        color: '#ffffff',
        fontSize: 20,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(233, 69, 96, 0.4)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        userSelect: 'none',
    },
} as const;

/**
 * Position offset styles for each toggle button position.
 */
export const togglePositionStyles: Readonly<Record<string, CSSProperties>> = {
    'bottom-right': { bottom: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 },
    'top-right': { top: 16, right: 16 },
    'top-left': { top: 16, left: 16 },
} as const;

/**
 * Styles for the main DevTools panel container.
 */
export const panelStyles: Readonly<Record<string, CSSProperties>> = {
    container: {
        position: 'fixed',
        top: 0,
        right: 0,
        width: 420,
        height: '100vh',
        zIndex: 99998,
        background: colors.bg,
        color: colors.text,
        fontFamily,
        fontSize: 13,
        lineHeight: 1.5,
        borderLeft: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.3)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surface,
        flexShrink: 0,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: colors.accent,
        letterSpacing: '0.02em',
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: colors.textMuted,
        cursor: 'pointer',
        fontSize: 18,
        padding: '2px 6px',
        borderRadius: 4,
        lineHeight: 1,
    },
    content: {
        flex: 1,
        overflow: 'auto',
        padding: 0,
    },
} as const;

/**
 * Styles for the tab bar.
 */
export const tabBarStyles: Readonly<Record<string, CSSProperties>> = {
    container: {
        display: 'flex',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surface,
        flexShrink: 0,
        overflowX: 'auto',
    },
    tab: {
        padding: '8px 14px',
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: 500,
        fontFamily,
        borderBottomWidth: 2,
        borderBottomStyle: 'solid',
        borderBottomColor: 'transparent',
        transition: 'color 0.15s ease, border-bottom-color 0.15s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    tabActive: {
        color: colors.accent,
        borderBottomColor: colors.accent,
    },
    tabDisabled: {
        opacity: 0.4,
        cursor: 'default',
    },
} as const;

/**
 * Styles for trace timeline rows.
 */
export const traceRowStyles: Readonly<Record<string, CSSProperties>> = {
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
        cursor: 'pointer',
        transition: 'background 0.1s ease',
    },
    rowSelected: {
        background: colors.surfaceElevated,
    },
    timestamp: {
        fontSize: 11,
        color: colors.textMuted,
        fontFamily: fontFamilyMono,
        flexShrink: 0,
        width: 70,
    },
    zone: {
        fontSize: 12,
        color: colors.textMuted,
        flexShrink: 0,
        maxWidth: 80,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    component: {
        fontSize: 12,
        fontWeight: 500,
        color: colors.text,
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    latency: {
        fontSize: 11,
        color: colors.textMuted,
        fontFamily: fontFamilyMono,
        flexShrink: 0,
    },
} as const;

/**
 * Styles for status badges (pass / corrected / fail).
 */
export const statusBadgeStyles: Readonly<Record<string, CSSProperties>> = {
    base: {
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        lineHeight: '16px',
        flexShrink: 0,
    },
    pass: {
        background: `${colors.success}20`,
        color: colors.success,
    },
    corrected: {
        background: `${colors.warning}20`,
        color: colors.warning,
    },
    fail: {
        background: `${colors.error}20`,
        color: colors.error,
    },
} as const;

/**
 * Styles for the JSON viewer component.
 */
export const jsonViewerStyles: Readonly<Record<string, CSSProperties>> = {
    container: {
        fontFamily: fontFamilyMono,
        fontSize: 12,
        lineHeight: 1.6,
        background: colors.codeBg,
        borderRadius: 4,
        padding: '8px 12px',
        overflow: 'auto',
        maxHeight: 300,
    },
    key: {
        color: '#7dd3fc',
    },
    string: {
        color: '#86efac',
    },
    number: {
        color: '#fbbf24',
    },
    boolean: {
        color: '#c084fc',
    },
    null: {
        color: colors.textMuted,
        fontStyle: 'italic',
    },
    toggle: {
        cursor: 'pointer',
        color: colors.textMuted,
        background: 'none',
        border: 'none',
        fontFamily: fontFamilyMono,
        fontSize: 12,
        padding: 0,
        userSelect: 'none',
    },
    indent: {
        paddingLeft: 16,
    },
} as const;

/**
 * Styles for the filter bar component.
 */
export const filterBarStyles: Readonly<Record<string, CSSProperties>> = {
    container: {
        display: 'flex',
        gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surface,
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        minWidth: 120,
        padding: '4px 8px',
        background: colors.codeBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        color: colors.text,
        fontSize: 12,
        fontFamily,
        outline: 'none',
    },
    select: {
        padding: '4px 8px',
        background: colors.codeBg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        color: colors.text,
        fontSize: 12,
        fontFamily,
        outline: 'none',
        cursor: 'pointer',
    },
} as const;

/**
 * Styles for the panel stub ("Coming Soon") placeholder.
 */
export const panelStubStyles: Readonly<Record<string, CSSProperties>> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
        color: colors.textMuted,
        gap: 8,
        padding: 24,
        textAlign: 'center',
    },
    icon: {
        fontSize: 32,
        opacity: 0.5,
    },
    title: {
        fontSize: 14,
        fontWeight: 500,
    },
    subtitle: {
        fontSize: 12,
    },
} as const;

/**
 * Styles for the component inspector panel.
 */
export const inspectorStyles: Readonly<Record<string, CSSProperties>> = {
    container: {
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    section: {
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
    },
    sectionHeader: {
        padding: '6px 10px',
        background: colors.surface,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: colors.textMuted,
    },
    sectionBody: {
        padding: 10,
    },
    emptyState: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
        color: colors.textMuted,
        fontSize: 13,
    },
    field: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 0',
        fontSize: 12,
    },
    fieldLabel: {
        color: colors.textMuted,
    },
    fieldValue: {
        color: colors.text,
        fontFamily: fontFamilyMono,
        fontSize: 11,
    },
} as const;

/**
 * Styles for the validation log panel.
 */
export const validationLogStyles: Readonly<Record<string, CSSProperties>> = {
    row: {
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
        cursor: 'pointer',
        transition: 'background 0.1s ease',
    },
    errorCode: {
        fontFamily: fontFamilyMono,
        fontSize: 11,
        fontWeight: 600,
        color: colors.error,
    },
    message: {
        fontSize: 12,
        color: colors.text,
        marginTop: 2,
    },
    fix: {
        fontSize: 11,
        color: colors.success,
        marginTop: 4,
        fontFamily: fontFamilyMono,
    },
    meta: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 4,
        display: 'flex',
        gap: 8,
    },
} as const;

/**
 * Styles for the export button.
 */
export const exportButtonStyles: Readonly<Record<string, CSSProperties>> = {
    button: {
        padding: '4px 10px',
        background: 'transparent',
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        color: colors.textMuted,
        fontSize: 11,
        cursor: 'pointer',
        fontFamily,
        transition: 'color 0.15s ease, border-color 0.15s ease',
    },
} as const;

// ---------------------------------------------------------------------------
// Shared Panel Styles
// ---------------------------------------------------------------------------

/**
 * Shared styles used across multiple DevTools panels (Trace Timeline,
 * Validation Log) for consistent headers, search bars, and empty states.
 *
 * @internal
 */
export const sharedPanelStyles: Readonly<Record<string, CSSProperties>> = {
    /** Panel root container with vertical flex layout. */
    panelRoot: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
    },
    /** Panel header bar with border separator. */
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
    },
    /** Header metadata text (trace count, issue count). */
    headerMeta: {
        fontSize: 12,
        color: colors.textMuted,
    },
    /** Panel search bar container with border separator. */
    searchBar: {
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
    },
    /** Empty state centered message. */
    emptyState: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 120,
        color: colors.textMuted,
        fontSize: 13,
    },
    /** Primary text color for component names in entries. */
    componentName: {
        fontSize: 13,
        fontWeight: 500,
        color: colors.text,
    },
} as const;

// ---------------------------------------------------------------------------
// Performance Profiler Styles
// ---------------------------------------------------------------------------

/**
 * Styles for the Performance Profiler panel (P1).
 *
 * Stat cards display P50/P95/P99 aggregations.
 * Latency bars use CSS width proportional to `totalMs`.
 *
 * @see Bible §4.4 — Performance Profiler tab
 * @internal
 */
export const performanceProfilerStyles: Readonly<Record<string, CSSProperties>> = {
    /** Stat cards container — horizontal grid. */
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.border}`,
    },
    /** Individual stat card. */
    statCard: {
        background: colors.surface,
        borderRadius: 6,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },
    /** Stat card label text (e.g., "P50", "P95"). */
    statLabel: {
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: colors.textMuted,
    },
    /** Stat card value text (e.g., "42ms"). */
    statValue: {
        fontSize: 18,
        fontWeight: 700,
        color: colors.text,
        fontFamily: fontFamilyMono,
    },
    /** Container for the latency bar chart list. */
    barChart: {
        flex: 1,
        overflow: 'auto',
        padding: '4px 12px',
    },
    /** Single latency bar row. */
    barRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        cursor: 'pointer',
        borderRadius: 4,
    },
    /** Bar row hover effect (applied dynamically). */
    barRowHover: {
        background: colors.surfaceElevated,
    },
    /** Component name label beside the bar. */
    barLabel: {
        fontSize: 11,
        color: colors.textMuted,
        minWidth: 100,
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    /** The latency bar fill segment — width set dynamically. */
    barFill: {
        height: 14,
        borderRadius: 3,
        minWidth: 2,
        transition: 'width 0.2s ease',
    },
    /** Latency value text at end of the bar. */
    barValue: {
        fontSize: 11,
        fontFamily: fontFamilyMono,
        color: colors.textMuted,
        minWidth: 50,
        textAlign: 'right' as const,
    },
    /** Sort controls container. */
    sortControls: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        fontSize: 11,
        color: colors.textMuted,
        borderBottom: `1px solid ${colors.border}`,
    },
} as const;

// ---------------------------------------------------------------------------
// Cache Dashboard Styles
// ---------------------------------------------------------------------------

/**
 * Styles for the Cache Dashboard panel (P1).
 *
 * Stat grid displays hit/miss/entries/hitRate.
 * Progress bar visualizes hit-rate as a proportional fill.
 *
 * @see Bible §4.4 — Cache Dashboard tab
 * @internal
 */
export const cacheDashboardStyles: Readonly<Record<string, CSSProperties>> = {
    /** Stats grid — 2x2 layout. */
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
        padding: 12,
    },
    /** Individual stat card. */
    statCard: {
        background: colors.surface,
        borderRadius: 6,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    /** Stat card label. */
    statLabel: {
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        color: colors.textMuted,
    },
    /** Stat card value. */
    statValue: {
        fontSize: 22,
        fontWeight: 700,
        color: colors.text,
        fontFamily: fontFamilyMono,
    },
    /** Hit rate progress bar container (background track). */
    progressTrack: {
        height: 8,
        borderRadius: 4,
        background: colors.codeBg,
        overflow: 'hidden',
        marginTop: 4,
    },
    /** Hit rate progress bar fill — width set dynamically. */
    progressFill: {
        height: '100%',
        borderRadius: 4,
        background: colors.success,
        transition: 'width 0.3s ease',
    },
    /** Action buttons container. */
    actions: {
        display: 'flex',
        gap: 8,
        padding: '0 12px 12px',
    },
    /** Action button (e.g., "Clear Cache"). */
    actionButton: {
        padding: '6px 14px',
        borderRadius: 6,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        color: colors.text,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily,
    },
    /** Disabled action button state. */
    actionButtonDisabled: {
        opacity: 0.4,
        cursor: 'not-allowed',
    },
    /** Full-panel empty state. */
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: colors.textMuted,
        fontSize: 13,
        textAlign: 'center' as const,
        padding: 24,
    },
    /** Empty state icon. */
    emptyIcon: {
        fontSize: 32,
    },
} as const;

// ---------------------------------------------------------------------------
// Replay Mode Styles
// ---------------------------------------------------------------------------

/**
 * Styles for the Replay Mode panel (P2).
 *
 * Vertical stepper with expandable steps.
 * Each step has a status indicator (●/✕/○) and expandable body.
 *
 * @see Design Choice DT6 — log viewer, step-by-step replay
 * @see Bible §4.4 — Replay Mode tab
 * @internal
 */
export const replayModeStyles: Readonly<Record<string, CSSProperties>> = {
    /** Step list container. */
    stepList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: '8px 12px',
        flex: 1,
        overflow: 'auto',
    },
    /** Individual step container. */
    step: {
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `2px solid ${colors.border}`,
        paddingLeft: 16,
        paddingBottom: 8,
        position: 'relative',
    },
    /** Step indicator dot (positioned on the left border). */
    stepIndicator: {
        position: 'absolute',
        left: -7,
        top: 4,
        width: 12,
        height: 12,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 8,
        fontWeight: 700,
    },
    /** Completed step indicator. */
    stepCompleted: {
        background: colors.success,
        color: '#fff',
    },
    /** Failed step indicator. */
    stepFailed: {
        background: colors.error,
        color: '#fff',
    },
    /** Skipped step indicator. */
    stepSkipped: {
        background: colors.border,
        color: colors.textMuted,
    },
    /** Step header (clickable to expand/collapse). */
    stepHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        padding: '4px 0',
    },
    /** Step label text. */
    stepLabel: {
        fontSize: 13,
        fontWeight: 600,
        color: colors.text,
    },
    /** Step status badge text. */
    stepStatus: {
        fontSize: 10,
        fontWeight: 500,
        color: colors.textMuted,
        textTransform: 'uppercase' as const,
    },
    /** Step body (expanded content). */
    stepBody: {
        paddingTop: 4,
        paddingBottom: 8,
    },
    /** Empty state for Replay Mode (no trace selected). */
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: colors.textMuted,
        fontSize: 13,
        textAlign: 'center' as const,
        padding: 24,
    },
    /** Empty state icon. */
    emptyIcon: {
        fontSize: 32,
    },
    /** Navigation buttons container. */
    navigation: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderTop: `1px solid ${colors.border}`,
        flexShrink: 0,
    },
    /** Navigation button (Previous / Next). */
    navButton: {
        padding: '4px 12px',
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        color: colors.text,
        fontSize: 12,
        cursor: 'pointer',
        fontFamily,
    },
    /** Disabled navigation button. */
    navButtonDisabled: {
        opacity: 0.4,
        cursor: 'not-allowed',
    },
    /** Step counter text (e.g., "Step 2 / 6"). */
    stepCounter: {
        fontSize: 11,
        color: colors.textMuted,
        fontFamily: fontFamilyMono,
    },
} as const;
