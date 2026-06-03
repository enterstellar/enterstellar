/**
 * @module @enterstellar-ai/react/__tests__/defaults/enterstellar-error-card.test
 * @description Unit tests for `<EnterstellarErrorCard>`.
 *
 * Covers:
 * - Renders error container with `data-enterstellar-error-card` attribute.
 * - Has `role="alert"` and `aria-live="assertive"` for accessibility.
 * - Displays the error message text.
 * - Shows error code badge for `EnterstellarError` instances.
 * - Hides error code badge for generic `Error` instances.
 * - Renders retry button with `data-enterstellar-retry` attribute.
 * - Clicking retry button fires `onRetry` callback (LC9).
 * - Retry button has `aria-label` for accessibility.
 * - Uses CSS custom properties for theming (L2).
 *
 * @see Design Choice LC8 — default state components.
 * @see Design Choice LC9 — error card receives `onRetry`.
 * @see Principle L2 — CSS custom properties for all visual values.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { EnterstellarErrorCard } from '../../src/defaults/error-card.js';
import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<EnterstellarErrorCard>', () => {
    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    it('renders a container with data-enterstellar-error-card attribute', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test error')} onRetry={vi.fn()} />,
        );

        const card = container.querySelector('[data-enterstellar-error-card]');
        expect(card).not.toBeNull();
    });

    it('has role="alert" for accessibility', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test error')} onRetry={vi.fn()} />,
        );

        const card = container.querySelector('[data-enterstellar-error-card]');
        expect(card?.getAttribute('role')).toBe('alert');
    });

    it('has aria-live="assertive" for screen reader announcements', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test error')} onRetry={vi.fn()} />,
        );

        const card = container.querySelector('[data-enterstellar-error-card]');
        expect(card?.getAttribute('aria-live')).toBe('assertive');
    });

    // -----------------------------------------------------------------------
    // Error Message Display
    // -----------------------------------------------------------------------

    it('displays the error message text', () => {
        const { container } = render(
            <EnterstellarErrorCard
                error={new Error('Something went terribly wrong')}
                onRetry={vi.fn()}
            />,
        );

        expect(container.textContent).toContain('Something went terribly wrong');
    });

    // -----------------------------------------------------------------------
    // Error Code Badge (EnterstellarError vs Error)
    // -----------------------------------------------------------------------

    it('shows error code badge for EnterstellarError instances', () => {
        const enterstellarError = new EnterstellarError(
            'ENS-3004',
            'react',
            'Compilation failed for "PatientVitals".',
            true,
        );

        const { container } = render(
            <EnterstellarErrorCard error={enterstellarError} onRetry={vi.fn()} />,
        );

        expect(container.textContent).toContain('ENS-3004');
    });

    it('hides error code badge for generic Error instances', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Generic failure')} onRetry={vi.fn()} />,
        );

        // Should NOT contain any ENS-prefixed error codes
        const textContent = container.textContent ?? '';
        const hasAurCode = /ENS-\d{4}/.test(textContent);
        expect(hasAurCode).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Retry Button (LC9)
    // -----------------------------------------------------------------------

    it('renders retry button with data-enterstellar-retry attribute', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test')} onRetry={vi.fn()} />,
        );

        const retryButton = container.querySelector('[data-enterstellar-retry]');
        expect(retryButton).not.toBeNull();
        expect(retryButton?.tagName.toLowerCase()).toBe('button');
    });

    it('clicking retry button fires onRetry callback exactly once (LC9)', () => {
        const onRetry = vi.fn();

        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test')} onRetry={onRetry} />,
        );

        const retryButton = container.querySelector('[data-enterstellar-retry]') as HTMLElement;
        fireEvent.click(retryButton);

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('retry button has aria-label for accessibility', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test')} onRetry={vi.fn()} />,
        );

        const retryButton = container.querySelector('[data-enterstellar-retry]');
        expect(retryButton?.getAttribute('aria-label')).toBe('Retry compilation');
    });

    it('retry button has type="button" to prevent form submission', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test')} onRetry={vi.fn()} />,
        );

        const retryButton = container.querySelector('[data-enterstellar-retry]');
        expect(retryButton?.getAttribute('type')).toBe('button');
    });

    // -----------------------------------------------------------------------
    // CSS Custom Properties (L2)
    // -----------------------------------------------------------------------

    it('uses CSS custom properties for container background (L2)', () => {
        const { container } = render(
            <EnterstellarErrorCard error={new Error('Test')} onRetry={vi.fn()} />,
        );

        const card = container.querySelector('[data-enterstellar-error-card]') as HTMLElement;
        expect(card.style.backgroundColor).toContain('var(--enterstellar-error-bg');
    });
});
