'use client';

/**
 * @module @enterstellar-ai/devtools/components/status-badge
 * @description Color-coded compilation status indicator.
 *
 * Renders a small inline badge with a background tint and text color
 * derived from the compilation status:
 * - `pass` — green (#22c55e)
 * - `corrected` — amber (#f59e0b)
 * - `fail` — red (#ef4444)
 *
 * Used in the Trace Timeline rows and Validation Log entries.
 * Styled via centralized `styles.ts` — no external CSS.
 *
 * @see Bible §4.4 — Trace Timeline tab
 *
 * @internal
 */

import type { StatusBadgeProps } from '../types.js';
import { statusBadgeStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Label Mapping
// ---------------------------------------------------------------------------

/**
 * Human-readable labels for each compilation status.
 * Displayed as uppercase text within the badge.
 */
const STATUS_LABELS: Readonly<Record<StatusBadgeProps['status'], string>> = {
    pass: 'PASS',
    corrected: 'CORRECTED',
    fail: 'FAIL',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Color-coded badge indicating compilation status.
 *
 * Merges the base badge style (padding, font, border-radius) with
 * a status-specific color style (background tint + text color).
 *
 * @param props - {@link StatusBadgeProps}
 * @returns A styled `<span>` element.
 *
 * @internal
 */
export function StatusBadge(props: StatusBadgeProps): React.JSX.Element {
    const { status } = props;

    const mergedStyle: React.CSSProperties = {
        ...statusBadgeStyles['base'],
        ...statusBadgeStyles[status],
    };

    return (
        <span
            style={mergedStyle}
            role="status"
            aria-label={`Compilation status: ${status}`}
            data-enterstellar-devtools-status={status}
        >
            {STATUS_LABELS[status]}
        </span>
    );
}
