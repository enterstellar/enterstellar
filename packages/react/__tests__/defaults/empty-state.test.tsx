/**
 * @module @enterstellar-ai/react/__tests__/defaults/enterstellar-empty-state.test
 * @description Unit tests for `<EnterstellarEmptyState>`.
 *
 * Covers:
 * - Renders container with `data-enterstellar-empty-state` attribute.
 * - Has `role="status"` for accessibility.
 * - Displays "No content available" message.
 * - Contains a decorative icon (aria-hidden).
 * - Does NOT render a retry button (distinct from error state).
 * - Uses CSS custom properties for theming (L2).
 *
 * @see Design Choice LC8 — default state components.
 * @see Principle L2 — CSS custom properties for all visual values.
 * @see Principle L9 — every component has loading, error, empty, ready states.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { EnterstellarEmptyState } from '../../src/defaults/empty-state.js';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<EnterstellarEmptyState>', () => {
    it('renders a container with data-enterstellar-empty-state attribute', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const emptyState = container.querySelector('[data-enterstellar-empty-state]');
        expect(emptyState).not.toBeNull();
    });

    it('has role="status" for accessibility', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const emptyState = container.querySelector('[data-enterstellar-empty-state]');
        expect(emptyState?.getAttribute('role')).toBe('status');
    });

    it('displays "No content available" message', () => {
        const { container } = render(<EnterstellarEmptyState />);

        expect(container.textContent).toContain('No content available');
    });

    it('contains a decorative icon with aria-hidden="true"', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const emptyState = container.querySelector('[data-enterstellar-empty-state]');
        const icon = emptyState?.querySelector('[aria-hidden="true"]');
        expect(icon).not.toBeNull();
    });

    it('does NOT render a retry button (distinct from error state)', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const retryButton = container.querySelector('[data-enterstellar-retry]');
        expect(retryButton).toBeNull();

        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBe(0);
    });

    it('uses CSS custom properties for message color (L2)', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const emptyState = container.querySelector('[data-enterstellar-empty-state]');
        const message = emptyState?.querySelector('p') as HTMLElement;
        expect(message.style.color).toContain('var(--enterstellar-empty-color');
    });

    it('uses CSS custom properties for container padding (L2)', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const emptyState = container.querySelector('[data-enterstellar-empty-state]') as HTMLElement;
        expect(emptyState.style.padding).toContain('var(--enterstellar-empty-padding');
    });

    it('has centered text alignment', () => {
        const { container } = render(<EnterstellarEmptyState />);

        const emptyState = container.querySelector('[data-enterstellar-empty-state]') as HTMLElement;
        expect(emptyState.style.textAlign).toBe('center');
    });
});
