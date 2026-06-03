'use client';

/**
 * @module @enterstellar-ai/react/hooks/use-spatial-context
 * @description Hook for DOM-awareness data within an `<Zone>`.
 *
 * Provides zone dimensions, visibility state, and an explicit
 * `captureContext()` method for active context capture.
 *
 * **Two modes (P13):**
 * - **Passive (default):** Returns `{ zone, width, height, isVisible, focusedElement? }`
 *   from `ResizeObserver` / `IntersectionObserver`. Never sent to agent automatically.
 * - **Active:** Consumer calls `captureContext()` explicitly (e.g., on Cmd+K,
 *   "Ask AI" click). Returns a frozen `SpatialContextSnapshot`.
 *
 * **NO `mousemove` tracking** per RE12 — spatial context comes entirely
 * from observer APIs, not pointer events.
 *
 * @see Design Choice RE12 — ResizeObserver + IntersectionObserver, no mousemove
 * @see Appendix E P13 — passive default, active on demand
 *
 * @example
 * ```tsx
 * import { useSpatialContext } from '@enterstellar-ai/react';
 * import { useRef } from 'react';
 *
 * function MyZone() {
 *   const zoneRef = useRef<HTMLDivElement>(null);
 *   const spatial = useSpatialContext('sidebar', zoneRef);
 *
 *   return (
 *     <div ref={zoneRef}>
 *       <span>Width: {spatial.width}px</span>
 *       <span>Visible: {spatial.isVisible ? 'Yes' : 'No'}</span>
 *       <button onClick={() => {
 *         const snapshot = spatial.captureContext();
 *         // Send snapshot to agent
 *       }}>
 *         Capture Context
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SpatialContext, SpatialContextSnapshot } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns a `SpatialContext` for the given zone.
 *
 * Uses `ResizeObserver` for dimensions and `IntersectionObserver` for
 * visibility — no polling, no `mousemove`. Updates are passive;
 * `captureContext()` must be called explicitly to produce a snapshot.
 *
 * @param zoneName - The zone name this spatial context belongs to.
 * @param zoneRef - A ref to the zone's root DOM element.
 * @returns A `SpatialContext` with live dimensions, visibility, and capture method.
 *
 * @see Design Choice RE12
 * @see Appendix E P13
 */
export function useSpatialContext(
    zoneName: string,
    zoneRef: React.RefObject<HTMLDivElement | null>,
): SpatialContext {
    // -----------------------------------------------------------------------
    // Observable State
    // -----------------------------------------------------------------------

    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [focusedElement, setFocusedElement] = useState<string | undefined>(undefined);

    // Stable ref to avoid stale closures in observer callbacks
    const stateRef = useRef({ width: 0, height: 0, isVisible: false, focusedElement: undefined as string | undefined });

    // -----------------------------------------------------------------------
    // ResizeObserver — width & height
    // -----------------------------------------------------------------------

    useEffect(() => {
        const element = zoneRef.current;
        if (element === null) {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry !== undefined) {
                const { width: w, height: h } = entry.contentRect;
                const roundedW = Math.round(w);
                const roundedH = Math.round(h);

                // Only update if actually changed (avoid re-render loops)
                if (stateRef.current.width !== roundedW || stateRef.current.height !== roundedH) {
                    stateRef.current.width = roundedW;
                    stateRef.current.height = roundedH;
                    setWidth(roundedW);
                    setHeight(roundedH);
                }
            }
        });

        observer.observe(element);
        return () => { observer.disconnect(); };
    }, [zoneRef]);

    // -----------------------------------------------------------------------
    // IntersectionObserver — isVisible
    // -----------------------------------------------------------------------

    useEffect(() => {
        const element = zoneRef.current;
        if (element === null) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry !== undefined) {
                    const visible = entry.isIntersecting;
                    if (stateRef.current.isVisible !== visible) {
                        stateRef.current.isVisible = visible;
                        setIsVisible(visible);
                    }
                }
            },
            { threshold: 0.1 },
        );

        observer.observe(element);
        return () => { observer.disconnect(); };
    }, [zoneRef]);

    // -----------------------------------------------------------------------
    // Focus Tracking (passive — blur/focus events only)
    // -----------------------------------------------------------------------

    useEffect(() => {
        const element = zoneRef.current;
        if (element === null) {
            return;
        }

        const handleFocusIn = (event: FocusEvent): void => {
            const target = event.target;
            if (target instanceof HTMLElement) {
                const id = target.id || (target.getAttribute('data-enterstellar-id') ?? undefined);
                stateRef.current.focusedElement = id;
                setFocusedElement(id);
            }
        };

        const handleFocusOut = (): void => {
            stateRef.current.focusedElement = undefined;
            setFocusedElement(undefined);
        };

        element.addEventListener('focusin', handleFocusIn);
        element.addEventListener('focusout', handleFocusOut);

        return () => {
            element.removeEventListener('focusin', handleFocusIn);
            element.removeEventListener('focusout', handleFocusOut);
        };
    }, [zoneRef]);

    // -----------------------------------------------------------------------
    // captureContext() — Active Mode (P13)
    // -----------------------------------------------------------------------

    /**
     * Captures a frozen snapshot of the current spatial context.
     * Consumer decides when to call this (e.g., Cmd+K, "Ask AI" button).
     *
     * @returns A `SpatialContextSnapshot` with an ISO 8601 timestamp.
     */
    const captureContext = useCallback((): SpatialContextSnapshot => {
        const snapshot: SpatialContextSnapshot = {
            zone: zoneName,
            width: stateRef.current.width,
            height: stateRef.current.height,
            isVisible: stateRef.current.isVisible,
            ...(stateRef.current.focusedElement !== undefined
                ? { focusedElement: stateRef.current.focusedElement }
                : {}),
            capturedAt: new Date().toISOString(),
        };

        return Object.freeze(snapshot);
    }, [zoneName]);

    // -----------------------------------------------------------------------
    // Return SpatialContext
    // -----------------------------------------------------------------------

    return {
        zone: zoneName,
        width,
        height,
        isVisible,
        ...(focusedElement !== undefined ? { focusedElement } : {}),
        captureContext,
    };
}
