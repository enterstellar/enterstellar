'use client';

/**
 * @module @enterstellar-ai/react/defaults/enterstellar-skeleton
 * @description Default loading skeleton for Enterstellar zones.
 *
 * Rendered by `<LifecycleWrapper>` when the zone is in `loading` state
 * and no custom loading component is registered in the component contract.
 *
 * Uses CSS custom properties (L2) with `--enterstellar-skeleton-*` namespace for
 * full theming control. Displays three pulsing bars of varying width to
 * indicate content is being generated.
 *
 * **Accessibility:** `role="status"` + `aria-busy="true"` + visually
 * hidden live text announces "Loading…" to screen readers.
 *
 * @see Design Choice LC8 — ship default state components.
 * @see Principle L2 — all visual values resolve to design tokens.
 *
 * @example
 * ```tsx
 * import { EnterstellarSkeleton } from '@enterstellar-ai/react';
 *
 * // Used automatically by LifecycleWrapper:
 * <LifecycleWrapper state="loading" ... />
 *
 * // Or used directly:
 * <EnterstellarSkeleton />
 * ```
 */

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// CSS Custom Properties (L2 compliance)
// ---------------------------------------------------------------------------

/**
 * Container styles for the skeleton wrapper.
 *
 * Uses `--enterstellar-skeleton-*` CSS custom properties with hardcoded
 * fallbacks matching the ProvenanceBadge pattern.
 *
 * @internal
 */
const SKELETON_CONTAINER_STYLES: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--enterstellar-skeleton-gap, 12px)',
    padding: 'var(--enterstellar-skeleton-padding, 16px)',
    width: '100%',
    boxSizing: 'border-box',
} as const;

/**
 * Base styles shared by all skeleton bars.
 *
 * The pulse effect is achieved via CSS `animation` using a shimmer
 * gradient on `background-size`. This technique avoids `@keyframes`
 * entirely — the animation is driven by `background-position` cycling
 * with CSS `animation: shimmer ...`.
 *
 * Since inline `@keyframes` aren't supported in React inline styles,
 * we use a simple opacity pulse via CSS `animation` property referencing
 * a global keyframe. As a fallback, the bars render with a static
 * background color if animations are unavailable.
 *
 * @internal
 */
const SKELETON_BAR_BASE: CSSProperties = {
    height: 'var(--enterstellar-skeleton-bar-height, 14px)',
    borderRadius: 'var(--enterstellar-skeleton-bar-radius, 6px)',
    backgroundColor: 'var(--enterstellar-skeleton-color, #e5e7eb)',
    /** Shimmer overlay via linear gradient animation. */
    backgroundImage:
        'linear-gradient(90deg, transparent 0%, var(--enterstellar-skeleton-shine, rgba(255,255,255,0.4)) 50%, transparent 100%)',
    backgroundSize: '200% 100%',
    backgroundRepeat: 'no-repeat',
    // Animate background position for shimmer effect.
    // Falls back to static color if `@keyframes enterstellar-skeleton-shimmer` isn't defined.
    animation: 'enterstellar-skeleton-shimmer 1.5s ease-in-out infinite',
} as const;

/**
 * Width presets for the three skeleton bars.
 * Varying widths create a more natural placeholder appearance.
 *
 * @internal
 */
const BAR_WIDTHS = ['100%', '75%', '50%'] as const;

/**
 * Visually hidden styles for screen-reader-only text.
 *
 * @internal
 */
const SR_ONLY_STYLES: CSSProperties = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: '0',
} as const;

// ---------------------------------------------------------------------------
// Keyframes Injection
// ---------------------------------------------------------------------------

/**
 * Flag to ensure the shimmer keyframes rule is injected only once.
 *
 * The `@keyframes enterstellar-skeleton-shimmer` rule is injected into a
 * `<style>` element on first render. This is necessary because React
 * inline styles don't support `@keyframes`. The rule is injected once
 * globally and reused by all `EnterstellarSkeleton` instances.
 *
 * @internal
 */
let keyframesInjected = false;

/**
 * Injects the shimmer keyframes into the document head.
 * No-ops if already injected or if `document` is unavailable (SSR).
 *
 * @internal
 */
function injectShimmerKeyframes(): void {
    if (keyframesInjected || typeof document === 'undefined') {
        return;
    }

    const style = document.createElement('style');
    style.setAttribute('data-enterstellar-skeleton-keyframes', '');
    style.textContent = `
        @keyframes enterstellar-skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
    `;
    document.head.appendChild(style);
    keyframesInjected = true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Default loading skeleton for Enterstellar zones (LC8).
 *
 * Displays three animated pulse bars of varying width. All visual
 * values are controlled via `--enterstellar-skeleton-*` CSS custom properties
 * for L2 compliance.
 *
 * Injected automatically by `<LifecycleWrapper>` when the zone is in
 * `loading` state and no custom loading component is defined in the
 * component contract's `states.loading` field.
 *
 * @returns A skeleton placeholder element.
 *
 * @see Design Choice LC8 — default state components.
 * @see Principle L2 — CSS custom properties for all visual values.
 */
export function EnterstellarSkeleton(): React.JSX.Element {
    // Inject keyframes on first render (client-side only)
    injectShimmerKeyframes();

    return (
        <div
            role="status"
            aria-busy="true"
            data-enterstellar-skeleton
            style={SKELETON_CONTAINER_STYLES}
        >
            {/* Visually hidden text for screen readers */}
            <span style={SR_ONLY_STYLES}>Loading…</span>

            {/* Three pulse bars with varying widths */}
            {BAR_WIDTHS.map((width) => (
                <div
                    key={width}
                    aria-hidden="true"
                    style={{
                        ...SKELETON_BAR_BASE,
                        width,
                    }}
                />
            ))}
        </div>
    );
}
