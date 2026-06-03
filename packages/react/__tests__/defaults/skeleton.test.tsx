/**
 * @module @enterstellar-ai/react/__tests__/defaults/enterstellar-skeleton.test
 * @description Unit tests for `<EnterstellarSkeleton>`.
 *
 * Covers:
 * - Renders skeleton container with `data-enterstellar-skeleton` attribute.
 * - Has `role="status"` and `aria-busy="true"` for accessibility.
 * - Contains visually hidden "Loading…" text for screen readers.
 * - Renders exactly 3 pulse bars with varying widths.
 * - Uses CSS custom properties for theming (L2).
 * - Keyframes injection is idempotent.
 *
 * @see Design Choice LC8 — default state components.
 * @see Principle L2 — CSS custom properties for all visual values.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { EnterstellarSkeleton } from '../../src/defaults/skeleton.js';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
    cleanup();
    // Remove injected keyframes style element after each test
    const injectedStyle = document.querySelector('[data-enterstellar-skeleton-keyframes]');
    if (injectedStyle !== null) {
        injectedStyle.remove();
    }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<EnterstellarSkeleton>', () => {
    it('renders a container with data-enterstellar-skeleton attribute', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        expect(skeleton).not.toBeNull();
    });

    it('has role="status" for accessibility', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        expect(skeleton?.getAttribute('role')).toBe('status');
    });

    it('has aria-busy="true" indicating loading state', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    });

    it('contains visually hidden "Loading…" text for screen readers', () => {
        const { container } = render(<EnterstellarSkeleton />);

        // The text is present in the DOM but visually hidden via CSS
        expect(container.textContent).toContain('Loading…');
    });

    it('renders exactly 3 pulse bars', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        // 3 bars + 1 visually hidden span = 4 direct children
        // Bars are <div> elements with aria-hidden="true"
        const bars = skeleton?.querySelectorAll('div[aria-hidden="true"]');
        expect(bars?.length).toBe(3);
    });

    it('bars have varying widths (100%, 75%, 50%)', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        const bars = skeleton?.querySelectorAll('div[aria-hidden="true"]') ?? [];

        const widths = Array.from(bars).map(
            (bar) => (bar as HTMLElement).style.width,
        );

        expect(widths).toContain('100%');
        expect(widths).toContain('75%');
        expect(widths).toContain('50%');
    });

    it('uses CSS custom properties for skeleton color (L2)', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        const firstBar = skeleton?.querySelector('div[aria-hidden="true"]') as HTMLElement;

        // Background color uses CSS custom property with fallback
        expect(firstBar.style.backgroundColor).toContain('var(--enterstellar-skeleton-color');
    });

    it('bars reference enterstellar-skeleton-shimmer animation', () => {
        const { container } = render(<EnterstellarSkeleton />);

        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        const firstBar = skeleton?.querySelector('div[aria-hidden="true"]') as HTMLElement;

        // The inline style references the `enterstellar-skeleton-shimmer` keyframes.
        // The actual `@keyframes` rule is injected into `document.head` by
        // `injectShimmerKeyframes()` on first render (module-level singleton).
        expect(firstBar.style.animation).toContain('enterstellar-skeleton-shimmer');
    });
});
