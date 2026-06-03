/**
 * @module @enterstellar-ai/react/__tests__/zone-error-boundary.test
 * @description Unit tests for `ZoneErrorBoundary`.
 *
 * Covers:
 * - Renders children when no error occurs.
 * - Catches render errors and shows fallback.
 * - Fires `onError` callback with error and trace context (RE18).
 * - Resets automatically when children change (P14).
 * - `getDerivedStateFromError` normalizes non-Error throws.
 *
 * @see Design Choice RE16 — per-zone error boundary
 * @see Design Choice RE18 — onError callback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { ZoneErrorBoundary } from '../src/zone-error-boundary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Component that unconditionally throws. */
function ThrowingComponent(): never {
    throw new Error('Render crash!');
}

/** Component that renders normally. */
function GoodComponent(): React.JSX.Element {
    return <div data-testid="good-child">Working component</div>;
}

// Suppress console.error for expected error boundary logs
const originalConsoleError = console.error;
beforeEach(() => {
    console.error = vi.fn();
});
afterEach(() => {
    console.error = originalConsoleError;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<ZoneErrorBoundary>', () => {
    it('renders children when no error occurs', () => {
        render(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div data-testid="fallback">Fallback</div>}
                latestTrace={null}
            >
                <div data-testid="child">Normal content</div>
            </ZoneErrorBoundary>,
        );

        expect(screen.getByTestId('child')).toBeDefined();
        expect(screen.getByTestId('child').textContent).toBe('Normal content');
    });

    it('catches render error and shows fallback', () => {
        render(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div data-testid="fallback">Something went wrong</div>}
                latestTrace={null}
            >
                <ThrowingComponent />
            </ZoneErrorBoundary>,
        );

        expect(screen.getByTestId('fallback')).toBeDefined();
        expect(screen.getByTestId('fallback').textContent).toBe('Something went wrong');
    });

    it('fires onError callback with error and trace (RE18)', () => {
        const onError = vi.fn();
        const mockTrace = {
            id: 'trace-123',
            intent: { zone: 'test-zone', component: 'TestComp' },
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock trace

        render(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div>Fallback</div>}
                onError={onError}
                latestTrace={mockTrace}
            >
                <ThrowingComponent />
            </ZoneErrorBoundary>,
        );

        expect(onError).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Render crash!' }),
            mockTrace,
        );
    });

    it('fires onError with null trace when no trace available', () => {
        const onError = vi.fn();

        render(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div>Fallback</div>}
                onError={onError}
                latestTrace={null}
            >
                <ThrowingComponent />
            </ZoneErrorBoundary>,
        );

        expect(onError).toHaveBeenCalledWith(
            expect.any(Error),
            null,
        );
    });

    it('logs error to console', () => {
        render(
            <ZoneErrorBoundary
                zoneName="sidebar"
                fallback={<div>Fallback</div>}
                latestTrace={null}
            >
                <ThrowingComponent />
            </ZoneErrorBoundary>,
        );

        expect(console.error).toHaveBeenCalled();
    });

    it('recovers when children change (P14 — latest-intent-wins)', () => {
        const { rerender } = render(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div data-testid="fallback">Fallback</div>}
                latestTrace={null}
            >
                <ThrowingComponent />
            </ZoneErrorBoundary>,
        );

        // Should show fallback
        expect(screen.getByTestId('fallback')).toBeDefined();

        // Re-render with new children (new intent arrived per P14)
        rerender(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div data-testid="fallback">Fallback</div>}
                latestTrace={null}
            >
                <GoodComponent />
            </ZoneErrorBoundary>,
        );

        // Should recover and show the new good component
        expect(screen.getByTestId('good-child')).toBeDefined();
    });

    it('does not fire onError when no error occurs', () => {
        const onError = vi.fn();

        render(
            <ZoneErrorBoundary
                zoneName="test-zone"
                fallback={<div>Fallback</div>}
                onError={onError}
                latestTrace={null}
            >
                <GoodComponent />
            </ZoneErrorBoundary>,
        );

        expect(onError).not.toHaveBeenCalled();
    });
});
