'use client';

/**
 * @module @enterstellar-ai/react/zone-error-boundary
 * @description Per-zone React error boundary.
 *
 * Each `<Zone>` wraps its rendered content in a `ZoneErrorBoundary`.
 * A crash in one zone (e.g., bad render function, runtime exception)
 * must **never** take down other zones — isolation is mandatory (RE16).
 *
 * **Behavior:**
 * - Catches render errors via `componentDidCatch`.
 * - Renders `fallback` content (React node).
 * - Fires `onError(error, trace)` callback if provided (RE18).
 * - Supports recovery via `resetErrorBoundary()` — e.g., when a new
 *   intent arrives for the zone (P14: latest intent wins).
 *
 * **Why a class component?**
 * React error boundaries require `componentDidCatch` / `getDerivedStateFromError`,
 * which are only available on class components. This is the sole class component
 * in `@enterstellar-ai/react`.
 *
 * @see Design Choice RE16 — per-zone error boundary
 * @see Design Choice RE18 — `onError={(error, trace) => ...}`
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Props & State Types
// ---------------------------------------------------------------------------

/**
 * Props for the `ZoneErrorBoundary` component.
 *
 * @internal
 */
export type ZoneErrorBoundaryProps = {
    /** Zone name for error identification and trace lookup. */
    readonly zoneName: string;
    /** Fallback content to render when an error is caught. */
    readonly fallback: ReactNode;
    /**
     * Error callback fired with the caught error and current agent trace.
     *
     * @see Design Choice RE18
     */
    readonly onError?: (error: Error, trace: ZoneTrace | null) => void;
    /**
     * The latest agent trace for this zone (if any).
     * Passed to `onError` callback for debugging context.
     */
    readonly latestTrace: ZoneTrace | null;
    /** Children to render when no error has occurred. */
    readonly children: ReactNode;
};

/**
 * Internal state for the error boundary.
 *
 * @internal
 */
type ZoneErrorBoundaryState = {
    /** Whether an error has been caught. */
    readonly hasError: boolean;
    /** The caught error, if any. */
    readonly error: Error | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Per-zone React error boundary.
 *
 * Wraps the rendered content of each `<Zone>` to isolate render
 * failures. If one zone crashes, other zones continue operating normally.
 *
 * @see Design Choice RE16 — per-zone isolation
 * @see Design Choice RE18 — `onError` callback with trace context
 *
 * @internal
 */
export class ZoneErrorBoundary extends Component<
    ZoneErrorBoundaryProps,
    ZoneErrorBoundaryState
> {
    constructor(props: ZoneErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    /**
     * Derives error state from a caught error.
     * React calls this during the render phase.
     */
    static getDerivedStateFromError(error: unknown): ZoneErrorBoundaryState {
        const normalizedError =
            error instanceof Error
                ? error
                : new Error(String(error));

        return { hasError: true, error: normalizedError };
    }

    /**
     * Logs the error and invokes the `onError` callback (RE18).
     * React calls this during the commit phase.
     */
    override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
        const normalizedError =
            error instanceof Error
                ? error
                : new Error(String(error));

        // Log to console for developer visibility
        console.error(
            `[@enterstellar-ai/react] ZoneErrorBoundary caught error in zone "${this.props.zoneName}":`,
            normalizedError,
            errorInfo,
        );

        // Fire the onError callback with trace context (RE18)
        this.props.onError?.(normalizedError, this.props.latestTrace);
    }

    /**
     * Reset the error boundary when the zone receives a new intent.
     * Called by `Zone` when P14 triggers (latest-intent-wins).
     *
     * This allows the zone to attempt re-rendering with new data
     * after a previous render crashed.
     */
    resetErrorBoundary(): void {
        this.setState({ hasError: false, error: null });
    }

    /**
     * Reset error state when children change (new intent arrived).
     * This implements automatic recovery per P14 — if a new intent
     * arrives for the zone, the error boundary resets and attempts
     * to render the new content.
     */
    override componentDidUpdate(prevProps: ZoneErrorBoundaryProps): void {
        if (this.state.hasError && prevProps.children !== this.props.children) {
            this.setState({ hasError: false, error: null });
        }
    }

    override render(): ReactNode {
        if (this.state.hasError) {
            return this.props.fallback;
        }

        return this.props.children;
    }
}
