'use client';

/**
 * @module @enterstellar-ai/react/defaults/enterstellar-empty-state
 * @description Default empty state component for Enterstellar zones.
 *
 * Rendered by `<LifecycleWrapper>` when the zone is in `empty` state
 * and no custom empty component is registered in the component contract.
 *
 * The `empty` state is distinct from `error` — it indicates the agent
 * returned valid data that resolved to no renderable content. This can
 * occur when a query returns zero results (e.g., "no patients match
 * this filter") or when the agent explicitly signals empty content.
 *
 * Uses CSS custom properties (L2) with `--enterstellar-empty-*` namespace for
 * full theming control, matching the ProvenanceBadge pattern.
 *
 * @see Design Choice LC8 — ship default state components.
 * @see Principle L2 — all visual values resolve to design tokens.
 * @see Principle L9 — every component has loading, error, empty, ready states.
 *
 * @example
 * ```tsx
 * import { EnterstellarEmptyState } from '@enterstellar-ai/react';
 *
 * // Used automatically by LifecycleWrapper:
 * <LifecycleWrapper state="empty" ... />
 *
 * // Or used directly:
 * <EnterstellarEmptyState />
 * ```
 */

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// CSS Custom Properties (L2 compliance)
// ---------------------------------------------------------------------------

/**
 * Container styles for the empty state card.
 *
 * @internal
 */
const EMPTY_CONTAINER_STYLES: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--enterstellar-empty-gap, 8px)',
    padding: 'var(--enterstellar-empty-padding, 24px 16px)',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    fontFamily: 'var(--enterstellar-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
} as const;

/**
 * Styles for the empty state icon.
 *
 * Uses a subtle circle with a muted appearance to convey
 * "nothing here" without looking like an error.
 *
 * @internal
 */
const EMPTY_ICON_STYLES: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'var(--enterstellar-empty-icon-size, 40px)',
    height: 'var(--enterstellar-empty-icon-size, 40px)',
    borderRadius: '50%',
    backgroundColor: 'var(--enterstellar-empty-icon-bg, #f3f4f6)',
    color: 'var(--enterstellar-empty-icon-color, #9ca3af)',
    fontSize: 'var(--enterstellar-empty-icon-font-size, 18px)',
    lineHeight: '1',
    flexShrink: 0,
} as const;

/**
 * Styles for the empty state message text.
 *
 * @internal
 */
const EMPTY_MESSAGE_STYLES: CSSProperties = {
    fontSize: 'var(--enterstellar-empty-font-size, 13px)',
    lineHeight: 'var(--enterstellar-empty-line-height, 1.5)',
    color: 'var(--enterstellar-empty-color, #6b7280)',
    margin: 0,
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Default empty state for Enterstellar zones (LC8).
 *
 * Displays a neutral "nothing to show" message with a circular icon.
 * Communicates that the agent processed the request successfully but
 * there is no content to render — distinct from an error.
 *
 * All visual values are controlled via `--enterstellar-empty-*` CSS custom
 * properties for L2 compliance.
 *
 * @returns An empty state placeholder element.
 *
 * @see Design Choice LC8 — default state components.
 * @see Principle L2 — CSS custom properties for all visual values.
 * @see Principle L9 — every component has loading, error, empty, ready states.
 */
export function EnterstellarEmptyState(): React.JSX.Element {
    return (
        <div
            role="status"
            data-enterstellar-empty-state
            style={EMPTY_CONTAINER_STYLES}
        >
            {/* Empty state icon — circle with dash */}
            <span style={EMPTY_ICON_STYLES} aria-hidden="true">
                —
            </span>

            {/* Empty state message */}
            <p style={EMPTY_MESSAGE_STYLES}>
                No content available
            </p>
        </div>
    );
}
