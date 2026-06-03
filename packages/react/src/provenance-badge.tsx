'use client';

/**
 * @module @enterstellar-ai/react/provenance-badge
 * @description Trust indicator showing component origin, agent, and compile time.
 *
 * The provenance badge is a small, absolute-positioned element inside the
 * zone wrapper div. It provides transparency about how a rendered component
 * was produced:
 *
 * - **Agent** — which AI agent generated the intent.
 * - **Origin** — `'registry'` (matched) or `'forged'` (generated at runtime).
 * - **Compile time** — how long the compiler pipeline took.
 * - **Compiler status** — `'pass'`, `'corrected'`, or `'fail'`.
 *
 * **Visibility rules:**
 * - Shown when `showProvenance={true}` on `<Zone>`.
 * - Hidden if no provenance data exists (e.g., static zone with determinism 0.0).
 *
 * @see Design Choice RE7 — absolute-positioned `<span>`, top-right corner
 * @see Principle L2 — design tokens for styling
 * @see Principle L4 — every render is traceable
 *
 * @example
 * ```tsx
 * <Zone name="sidebar" determinism={1.0} showProvenance>
 *   {/* Provenance badge appears automatically in top-right corner *\/}
 * </Zone>
 * ```
 */

import type { CompilationProvenance, CompilationStatus } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `ProvenanceBadge` component.
 *
 * @see Design Choice RE7 — absolute-positioned trust indicator.
 */
export type ProvenanceBadgeProps = {
    /** Provenance data from the `CompilationResult`. */
    readonly provenance: CompilationProvenance;
    /**
     * Compilation status (`'pass'`, `'corrected'`, or `'fail'`).
     * Drives the status indicator dot color.
     *
     * Passed separately because `CompilationProvenance` does not carry
     * the compilation status — that lives on `CompilationResult.status`.
     */
    readonly status: CompilationStatus;
    /** Whether the badge should be visible. */
    readonly visible: boolean;
};

// ---------------------------------------------------------------------------
// Styles (L2 — CSS custom properties with fallback values)
// ---------------------------------------------------------------------------

/**
 * Inline styles for the provenance badge.
 *
 * All visual values use CSS custom properties (`--enterstellar-provenance-*`)
 * with hardcoded fallbacks. When the Enterstellar design token system is
 * integrated, consumers override these custom properties via the
 * `:root` or zone-level CSS scope.
 *
 * @see Principle L2 — Design System as Firmware.
 * @see Design Choice RE7 — absolute-positioned, top-right corner.
 *
 * @internal
 */
const BADGE_STYLES: React.CSSProperties = {
    position: 'absolute',
    top: 'var(--enterstellar-provenance-offset, 4px)',
    right: 'var(--enterstellar-provenance-offset, 4px)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--enterstellar-provenance-gap, 4px)',
    padding: 'var(--enterstellar-provenance-padding, 2px 6px)',
    fontSize: 'var(--enterstellar-provenance-font-size, 10px)',
    fontFamily: 'var(--enterstellar-provenance-font-family, system-ui, -apple-system, sans-serif)',
    lineHeight: 'var(--enterstellar-provenance-line-height, 1.4)',
    color: 'var(--enterstellar-provenance-text, rgba(255, 255, 255, 0.9))',
    backgroundColor: 'var(--enterstellar-provenance-bg, rgba(0, 0, 0, 0.65))',
    borderRadius: 'var(--enterstellar-provenance-radius, 4px)',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 9999,
    whiteSpace: 'nowrap',
} as const;

/**
 * Status indicator dot colors mapped by `CompilationStatus`.
 *
 * Uses CSS custom properties for L2 compliance:
 * - `--enterstellar-status-pass` — green (default: `#22c55e`)
 * - `--enterstellar-status-corrected` — amber (default: `#f59e0b`)
 * - `--enterstellar-status-fail` — red (default: `#ef4444`)
 *
 * @internal
 */
const STATUS_COLORS: Readonly<Record<CompilationStatus, string>> = {
    pass: 'var(--enterstellar-status-pass, #22c55e)',
    corrected: 'var(--enterstellar-status-corrected, #f59e0b)',
    fail: 'var(--enterstellar-status-fail, #ef4444)',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Provenance badge — a trust indicator for AI-rendered components.
 *
 * Renders as a small overlay in the top-right corner of the zone wrapper.
 * Displays the agent name, compilation status dot, and compile timestamp.
 *
 * @param props - {@link ProvenanceBadgeProps}
 * @returns The badge element, or `null` if not visible.
 *
 * @see Design Choice RE7 — absolute-positioned trust indicator.
 * @see Principle L2 — all visual values resolve to design tokens.
 * @see Principle L4 — every render is traceable.
 */
export function ProvenanceBadge(props: ProvenanceBadgeProps): React.JSX.Element | null {
    const { provenance, status, visible } = props;

    if (!visible) {
        return null;
    }

    const statusColor = STATUS_COLORS[status];
    const forgeLabel = provenance.forgeMode !== undefined ? ` · ${provenance.forgeMode}` : '';

    /**
     * Format compile time for display.
     * Uses `compiledAt` ISO string, showing HH:MM:SS.
     */
    const compileTime = (() => {
        try {
            const date = new Date(provenance.compiledAt);
            return date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch {
            return '—';
        }
    })();

    return (
        <span
            data-enterstellar-provenance
            style={BADGE_STYLES}
            aria-hidden="true"
            title={`Agent: ${provenance.agent} · Registry: ${provenance.registry} · Status: ${status} · Compiled: ${provenance.compiledAt}${forgeLabel}`}
        >
            <span
                style={{
                    width: 'var(--enterstellar-provenance-dot-size, 6px)',
                    height: 'var(--enterstellar-provenance-dot-size, 6px)',
                    borderRadius: '50%',
                    backgroundColor: statusColor,
                    display: 'inline-block',
                    flexShrink: 0,
                }}
                aria-hidden="true"
            />
            {provenance.agent} · {compileTime}
        </span>
    );
}
