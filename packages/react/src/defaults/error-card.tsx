'use client';

/**
 * @module @enterstellar-ai/react/defaults/enterstellar-error-card
 * @description Default error state component for Enterstellar zones.
 *
 * Rendered by `<LifecycleWrapper>` when the zone is in `error` state
 * and no custom error component is registered in the component contract.
 *
 * Displays the error message and a "Retry" button that triggers the
 * `onRetry` callback (LC9). If the error is an `EnterstellarError`, the error
 * code is also displayed for debugging.
 *
 * Uses CSS custom properties (L2) with `--enterstellar-error-*` namespace for
 * full theming control, matching the ProvenanceBadge pattern.
 *
 * @see Design Choice LC8 — ship default state components.
 * @see Design Choice LC9 — error component receives `onRetry`.
 * @see Principle L2 — all visual values resolve to design tokens.
 *
 * @example
 * ```tsx
 * import { EnterstellarErrorCard } from '@enterstellar-ai/react';
 *
 * // Used automatically by LifecycleWrapper:
 * <LifecycleWrapper state="error" error={error} onRetry={handleRetry} ... />
 *
 * // Or used directly:
 * <EnterstellarErrorCard error={someError} onRetry={() => retryCompilation()} />
 * ```
 */

import type { CSSProperties } from 'react';

import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `EnterstellarErrorCard` component.
 *
 * @see Design Choice LC9 — `onRetry` is required.
 */
export type EnterstellarErrorCardProps = {
    /**
     * The error to display.
     * If an `EnterstellarError`, the error code is shown alongside the message.
     * If a generic `Error`, only the message is shown.
     */
    readonly error: Error;

    /**
     * Callback invoked when the user clicks the "Retry" button.
     * Triggers a new compilation attempt in `Zone`.
     *
     * @see Design Choice LC9 — user-initiated retry.
     */
    readonly onRetry: () => void;
};

// ---------------------------------------------------------------------------
// CSS Custom Properties (L2 compliance)
// ---------------------------------------------------------------------------

/**
 * Container styles for the error card.
 *
 * @internal
 */
const ERROR_CONTAINER_STYLES: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--enterstellar-error-gap, 12px)',
    padding: 'var(--enterstellar-error-padding, 16px)',
    backgroundColor: 'var(--enterstellar-error-bg, #fef2f2)',
    borderRadius: 'var(--enterstellar-error-radius, 8px)',
    border: 'var(--enterstellar-error-border, 1px solid #fecaca)',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--enterstellar-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
} as const;

/**
 * Styles for the error code badge (shown only for EnterstellarError instances).
 *
 * @internal
 */
const ERROR_CODE_STYLES: CSSProperties = {
    display: 'inline-block',
    fontSize: 'var(--enterstellar-error-code-font-size, 11px)',
    fontWeight: 600,
    fontFamily: 'var(--enterstellar-font-mono, ui-monospace, "SF Mono", monospace)',
    color: 'var(--enterstellar-error-code-color, #991b1b)',
    backgroundColor: 'var(--enterstellar-error-code-bg, #fee2e2)',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.025em',
    alignSelf: 'flex-start',
} as const;

/**
 * Styles for the error message text.
 *
 * @internal
 */
const ERROR_MESSAGE_STYLES: CSSProperties = {
    fontSize: 'var(--enterstellar-error-font-size, 13px)',
    lineHeight: 'var(--enterstellar-error-line-height, 1.5)',
    color: 'var(--enterstellar-error-color, #7f1d1d)',
    margin: 0,
    wordBreak: 'break-word',
} as const;

/**
 * Styles for the retry button.
 *
 * @internal
 */
const RETRY_BUTTON_STYLES: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    alignSelf: 'flex-start',
    padding: 'var(--enterstellar-error-button-padding, 6px 14px)',
    fontSize: 'var(--enterstellar-error-button-font-size, 12px)',
    fontWeight: 500,
    fontFamily: 'inherit',
    color: 'var(--enterstellar-error-button-color, #991b1b)',
    backgroundColor: 'var(--enterstellar-error-button-bg, #ffffff)',
    border: 'var(--enterstellar-error-button-border, 1px solid #fca5a5)',
    borderRadius: 'var(--enterstellar-error-button-radius, 6px)',
    cursor: 'pointer',
    lineHeight: '1',
    transition: 'background-color 150ms ease, border-color 150ms ease',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Default error card for Enterstellar zones (LC8, LC9).
 *
 * Displays the error information and a "Retry" button for user-initiated
 * retry (LC9). If the error is an `EnterstellarError`, the error code (e.g.,
 * `ENS-3004`) is shown as a badge for debugging and documentation lookup.
 *
 * All visual values are controlled via `--enterstellar-error-*` CSS custom
 * properties for L2 compliance.
 *
 * @param props - {@link EnterstellarErrorCardProps}
 * @returns An error display element with retry action.
 *
 * @see Design Choice LC8 — default state components.
 * @see Design Choice LC9 — error component receives `onRetry`.
 * @see Principle L2 — CSS custom properties for all visual values.
 */
export function EnterstellarErrorCard(props: EnterstellarErrorCardProps): React.JSX.Element {
    const { error, onRetry } = props;

    /**
     * Check if the error is an `EnterstellarError` to conditionally display
     * the error code badge.
     */
    const isEnterstellarError = error instanceof EnterstellarError;
    const errorCode = isEnterstellarError ? error.code : null;

    return (
        <div
            role="alert"
            aria-live="assertive"
            data-enterstellar-error-card
            style={ERROR_CONTAINER_STYLES}
        >
            {/* Error code badge — only for EnterstellarError instances */}
            {errorCode !== null && (
                <span style={ERROR_CODE_STYLES} aria-label={`Error code: ${errorCode}`}>
                    {errorCode}
                </span>
            )}

            {/* Error message */}
            <p style={ERROR_MESSAGE_STYLES}>
                {error.message}
            </p>

            {/* Retry button (LC9) */}
            <button
                type="button"
                style={RETRY_BUTTON_STYLES}
                onClick={onRetry}
                data-enterstellar-retry
                aria-label="Retry compilation"
            >
                ↻ Retry
            </button>
        </div>
    );
}
