/**
 * @module @enterstellar-ai/types/spatial
 * @description SpatialContext — DOM-awareness data for AI-informed layout decisions.
 *
 * The `SpatialContext` is the return type of the `useSpatialContext()` hook
 * in `@enterstellar-ai/react`. It provides zone dimensions, visibility state, and an
 * optional `captureContext()` method for explicit context capture.
 *
 * **Two modes:**
 * - Passive (default): returns `{ zone, width, height, isVisible, focusedElement? }`
 *   from `ResizeObserver` / `IntersectionObserver`. Never sent to agent automatically.
 * - Active: consumer calls `captureContext()` explicitly (e.g., on Cmd+K, "Ask AI" click).
 *
 * @see Appendix E P13
 * @see Design Choice RE12
 */

// ---------------------------------------------------------------------------
// SpatialContext Type
// ---------------------------------------------------------------------------

/**
 * DOM-awareness data returned by `useSpatialContext()`.
 *
 * Provides zone dimensions and visibility state for AI-informed layout
 * decisions. No DOM tree walking, no ancestor traversal — naturally
 * bounded by structure.
 *
 * @see Design Choice RE12
 * @see Appendix E P13
 */
export type SpatialContext = {
    /** Zone name this context belongs to. */
    readonly zone: string;
    /** Current width of the zone element in pixels. Updated via `ResizeObserver`. */
    readonly width: number;
    /** Current height of the zone element in pixels. Updated via `ResizeObserver`. */
    readonly height: number;
    /** Whether the zone is currently visible in the viewport. Updated via `IntersectionObserver`. */
    readonly isVisible: boolean;
    /** ID or selector of the currently focused element within the zone, if any. */
    readonly focusedElement?: string;
    /**
     * Explicitly captures the current spatial context for sending to the agent.
     * Consumer decides when to trigger (e.g., Cmd+K, "Ask AI" button).
     * Returns the captured context snapshot.
     *
     * @returns A snapshot of the current spatial context data.
     */
    readonly captureContext: () => SpatialContextSnapshot;
};

/**
 * A frozen snapshot of spatial context at a point in time.
 * Produced by `SpatialContext.captureContext()`.
 */
export type SpatialContextSnapshot = {
    /** Zone name. */
    readonly zone: string;
    /** Zone width at capture time. */
    readonly width: number;
    /** Zone height at capture time. */
    readonly height: number;
    /** Visibility at capture time. */
    readonly isVisible: boolean;
    /** Focused element at capture time. */
    readonly focusedElement?: string;
    /** ISO 8601 timestamp of when the capture occurred. */
    readonly capturedAt: string;
};
