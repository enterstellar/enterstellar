'use client';

/**
 * @module @enterstellar-ai/react/defaults/generic-card
 * @description Concrete fallback component for Enterstellar compilation failures.
 *
 * `GenericCard` is the default `fallbackComponent` registered by
 * `Provider` per RE1. It is rendered when:
 * - The compiler fails validation after `maxRetries` (C6).
 * - The requested component's renderer is not found in the `RendererRegistry`.
 *
 * It shows the failed component name, compilation errors with machine-readable
 * codes, and (optionally) the original props that were intended for the
 * component. This gives developers full visibility into what went wrong
 * without silent degradation (RE5).
 *
 * **Auto-registered** during `Provider` mount via `registerRenderer()`.
 * Zero consumer action required.
 *
 * Uses CSS custom properties (L2) with `--enterstellar-card-*` namespace for full
 * theming control. Falls back to neutral, accessible defaults when no
 * design tokens are present (Q2 resolved).
 *
 * @see Design Choice RE1 — auto-create with concrete `GenericCard` fallback.
 * @see Design Choice C6 — fallback receives error details as props.
 * @see Design Choice R6 — renderer registered separately from contract.
 * @see Principle L2 — all visual values resolve to design tokens.
 *
 * @example
 * ```tsx
 * // GenericCard is auto-registered — no import needed.
 * // It renders automatically when compilation fails:
 * <Zone name="sidebar" fallbackComponent="GenericCard" />
 *
 * // Or used directly for testing:
 * import { GenericCard } from '@enterstellar-ai/react';
 * <GenericCard
 *     originalComponent="PatientRiskPanel"
 *     errors={[{ code: 'ENS-2001', path: 'props.riskLevel', message: '...' }]}
 *     originalProps={{ patientId: '12345' }}
 * />
 * ```
 */

import { useState } from 'react';

import type { CSSProperties } from 'react';
import type { CompilationError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `GenericCard` fallback component.
 *
 * These props are injected by the compilation pipeline (C6) when the
 * `fallbackComponent` is rendered after validation failure.
 *
 * @see Design Choice C6 — fallback receives error details as props.
 */
export type GenericCardProps = {
    /**
     * PascalCase name of the component that failed compilation.
     * Displayed as the card header for developer identification.
     */
    readonly originalComponent: string;

    /**
     * Compilation errors encountered during validation.
     * Each error includes a machine-readable code, field path, and message.
     * Empty array if the failure reason is unknown (e.g., renderer not found).
     *
     * @see CompilationError — `{ code, path, message, received?, expected?, fix? }`
     */
    readonly errors: readonly CompilationError[];

    /**
     * The original props that were intended for the component.
     * Displayed in a collapsible section for debugging. May contain
     * complex nested objects — serialized with `JSON.stringify` and
     * guarded against circular references.
     */
    readonly originalProps: Readonly<Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// CSS Custom Properties (L2 compliance)
// ---------------------------------------------------------------------------

/**
 * Container styles for the generic card.
 * Uses `--enterstellar-card-*` namespace with neutral fallbacks.
 *
 * @internal
 */
const CARD_CONTAINER_STYLES: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--enterstellar-card-gap, 12px)',
    padding: 'var(--enterstellar-card-padding, 16px)',
    backgroundColor: 'var(--enterstellar-card-bg, #fafafa)',
    borderRadius: 'var(--enterstellar-card-radius, 8px)',
    border: 'var(--enterstellar-card-border, 1px solid #e5e5e5)',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--enterstellar-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    color: 'var(--enterstellar-card-color, #1a1a1a)',
} as const;

/**
 * Header section styles — contains the component name and "Fallback" badge.
 *
 * @internal
 */
const CARD_HEADER_STYLES: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
} as const;

/**
 * Component name label styles.
 *
 * @internal
 */
const COMPONENT_NAME_STYLES: CSSProperties = {
    fontSize: 'var(--enterstellar-card-name-font-size, 14px)',
    fontWeight: 600,
    fontFamily: 'var(--enterstellar-font-mono, ui-monospace, "SF Mono", monospace)',
    color: 'var(--enterstellar-card-name-color, #1a1a1a)',
    margin: 0,
    wordBreak: 'break-word',
} as const;

/**
 * "Fallback" badge styles — indicates this is a fallback rendering.
 *
 * @internal
 */
const FALLBACK_BADGE_STYLES: CSSProperties = {
    display: 'inline-block',
    fontSize: 'var(--enterstellar-card-badge-font-size, 10px)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--enterstellar-card-badge-color, #92400e)',
    backgroundColor: 'var(--enterstellar-card-badge-bg, #fef3c7)',
    padding: '2px 6px',
    borderRadius: '4px',
    lineHeight: '1.4',
} as const;

/**
 * Error list container styles.
 *
 * @internal
 */
const ERROR_LIST_STYLES: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    margin: 0,
    padding: 0,
    listStyle: 'none',
} as const;

/**
 * Individual error item styles.
 *
 * @internal
 */
const ERROR_ITEM_STYLES: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: 'var(--enterstellar-card-error-padding, 8px 10px)',
    backgroundColor: 'var(--enterstellar-card-error-bg, #fef2f2)',
    borderRadius: 'var(--enterstellar-card-error-radius, 6px)',
    border: 'var(--enterstellar-card-error-border, 1px solid #fecaca)',
} as const;

/**
 * Error code badge styles within the error item.
 *
 * @internal
 */
const ERROR_CODE_STYLES: CSSProperties = {
    display: 'inline-block',
    fontSize: 'var(--enterstellar-card-error-code-size, 10px)',
    fontWeight: 600,
    fontFamily: 'var(--enterstellar-font-mono, ui-monospace, "SF Mono", monospace)',
    color: 'var(--enterstellar-card-error-code-color, #991b1b)',
    backgroundColor: 'var(--enterstellar-card-error-code-bg, #fee2e2)',
    padding: '1px 5px',
    borderRadius: '3px',
    letterSpacing: '0.025em',
    alignSelf: 'flex-start',
} as const;

/**
 * Error path + message text styles.
 *
 * @internal
 */
const ERROR_MESSAGE_STYLES: CSSProperties = {
    fontSize: 'var(--enterstellar-card-error-font-size, 12px)',
    lineHeight: 'var(--enterstellar-card-error-line-height, 1.5)',
    color: 'var(--enterstellar-card-error-message-color, #7f1d1d)',
    margin: 0,
    wordBreak: 'break-word',
} as const;

/**
 * Collapsible props toggle button styles.
 *
 * @internal
 */
const PROPS_TOGGLE_STYLES: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    alignSelf: 'flex-start',
    padding: '4px 0',
    fontSize: 'var(--enterstellar-card-toggle-font-size, 11px)',
    fontWeight: 500,
    fontFamily: 'inherit',
    color: 'var(--enterstellar-card-toggle-color, #6b7280)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    lineHeight: '1',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
} as const;

/**
 * Props code block styles.
 *
 * @internal
 */
const PROPS_CODE_STYLES: CSSProperties = {
    fontSize: 'var(--enterstellar-card-props-font-size, 11px)',
    fontFamily: 'var(--enterstellar-font-mono, ui-monospace, "SF Mono", monospace)',
    color: 'var(--enterstellar-card-props-color, #374151)',
    backgroundColor: 'var(--enterstellar-card-props-bg, #f3f4f6)',
    padding: 'var(--enterstellar-card-props-padding, 10px 12px)',
    borderRadius: 'var(--enterstellar-card-props-radius, 6px)',
    border: 'var(--enterstellar-card-props-border, 1px solid #e5e7eb)',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    lineHeight: '1.5',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely serializes props to a JSON string for display.
 * Handles circular references and BigInt values gracefully.
 *
 * @param props - The props object to serialize.
 * @returns A formatted JSON string, or an error message if serialization fails.
 *
 * @internal
 */
function safeStringifyProps(props: Readonly<Record<string, unknown>>): string {
    try {
        return JSON.stringify(props, (_key, value: unknown) => {
            // Handle BigInt — not natively serializable
            if (typeof value === 'bigint') {
                return `${String(value)}n`;
            }
            return value;
        }, 2);
    } catch {
        return '{ /* circular reference — unable to serialize */ }';
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Concrete fallback component for Enterstellar compilation failures (RE1, C6).
 *
 * Displays an informational card showing:
 * 1. The name of the component that failed compilation.
 * 2. A "Fallback" badge for visual identification.
 * 3. Each compilation error with its code, path, and message.
 * 4. A collapsible section showing the original props (for debugging).
 *
 * All visual values are controlled via `--enterstellar-card-*` CSS custom
 * properties for L2 compliance. Falls back to neutral, accessible
 * defaults when no design tokens are available.
 *
 * @param props - {@link GenericCardProps}
 * @returns A fallback card element with error details.
 *
 * @see Design Choice RE1 — concrete, usable UI component.
 * @see Design Choice C6 — receives error details as props.
 * @see Principle L2 — CSS custom properties for all visual values.
 */
export function GenericCard(props: GenericCardProps): React.JSX.Element {
    const { originalComponent, errors, originalProps } = props;

    /**
     * Controls the visibility of the "Original Props" collapsible section.
     * Collapsed by default to reduce visual noise — expanded on demand
     * for debugging.
     */
    const [showProps, setShowProps] = useState(false);

    /**
     * Determines whether the original props have any content worth showing.
     * An empty object is not worth expanding.
     */
    const hasProps = Object.keys(originalProps).length > 0;

    return (
        <div
            role="alert"
            aria-live="polite"
            data-enterstellar-generic-card
            data-enterstellar-fallback-for={originalComponent}
            style={CARD_CONTAINER_STYLES}
        >
            {/* Header: component name + fallback badge */}
            <div style={CARD_HEADER_STYLES}>
                <h3 style={COMPONENT_NAME_STYLES}>
                    {originalComponent}
                </h3>
                <span style={FALLBACK_BADGE_STYLES}>
                    Fallback
                </span>
            </div>

            {/* Error list */}
            {errors.length > 0 ? (
                <ul style={ERROR_LIST_STYLES} aria-label="Compilation errors">
                    {errors.map((error, index) => (
                        <li
                            key={`${error.code}-${error.path}-${String(index)}`}
                            style={ERROR_ITEM_STYLES}
                        >
                            <span style={ERROR_CODE_STYLES} aria-label={`Error code: ${error.code}`}>
                                {error.code}
                            </span>
                            <p style={ERROR_MESSAGE_STYLES}>
                                {error.path !== '' && (
                                    <strong>{error.path}: </strong>
                                )}
                                {error.message}
                            </p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p style={ERROR_MESSAGE_STYLES}>
                    Compilation failed — no error details available.
                </p>
            )}

            {/* Collapsible original props section */}
            {hasProps && (
                <>
                    <button
                        type="button"
                        style={PROPS_TOGGLE_STYLES}
                        onClick={() => { setShowProps((prev) => !prev); }}
                        aria-expanded={showProps}
                        aria-controls="enterstellar-generic-card-props"
                        data-enterstellar-props-toggle
                    >
                        {showProps ? '▾ Hide' : '▸ Show'} original props
                    </button>

                    {showProps && (
                        <pre
                            id="enterstellar-generic-card-props"
                            style={PROPS_CODE_STYLES}
                            data-enterstellar-props-detail
                        >
                            {safeStringifyProps(originalProps)}
                        </pre>
                    )}
                </>
            )}
        </div>
    );
}
