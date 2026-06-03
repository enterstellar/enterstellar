/**
 * @module @enterstellar-ai/devtools/__tests__/cache-dashboard
 * @description Unit tests for the Cache Dashboard panel (P1).
 *
 * Tests cover:
 * - Empty state (null cache)
 * - Stats grid rendering (hits, misses, entries, hit rate)
 * - Hit rate progress bar
 * - "Clear Cache" button fires `invalidateAll()`
 * - "Clear Cache" disabled when entries === 0
 * - Polling updates stats on interval
 * - Accessibility attributes (aria-label, role)
 *
 * @see Bible §4.4 — Cache Dashboard tab
 * @see Design Choice DT4 — P1 tab
 */

/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CacheDashboard } from '../src/panels/cache-dashboard.js';
import type { DevToolsCacheAdapter } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a mock `DevToolsCacheAdapter` with configurable stats.
 *
 * @param overrides - Optional stat overrides.
 * @returns A mock adapter with `getStats()` and `invalidateAll()` spies.
 *
 * @internal
 */
function createMockCache(overrides?: {
    readonly hits?: number;
    readonly misses?: number;
    readonly entries?: number;
    readonly hitRate?: number;
}): DevToolsCacheAdapter {
    return {
        getStats: vi.fn().mockReturnValue({
            hits: overrides?.hits ?? 42,
            misses: overrides?.misses ?? 8,
            entries: overrides?.entries ?? 15,
            hitRate: overrides?.hitRate ?? 0.84,
        }),
        invalidateAll: vi.fn(),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CacheDashboard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Empty State
    // -----------------------------------------------------------------------

    it('renders empty state when cache is null', () => {
        render(<CacheDashboard cache={null} />);
        expect(screen.getByText(/no cache configured/i)).toBeDefined();
    });

    it('renders instruction text in empty state', () => {
        render(<CacheDashboard cache={null} />);
        expect(screen.getByText(/pass a/i)).toBeDefined();
    });

    it('does not render stat cards when cache is null', () => {
        render(<CacheDashboard cache={null} />);
        expect(screen.queryByText('Hits')).toBeNull();
        expect(screen.queryByText('Misses')).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Stats Grid
    // -----------------------------------------------------------------------

    it('renders stat card labels', () => {
        const cache = createMockCache();
        render(<CacheDashboard cache={cache} />);

        expect(screen.getByText('Hits')).toBeDefined();
        expect(screen.getByText('Misses')).toBeDefined();
        expect(screen.getByText('Entries')).toBeDefined();
        expect(screen.getByText('Hit Rate')).toBeDefined();
    });

    it('renders correct stat values', () => {
        const cache = createMockCache({
            hits: 100,
            misses: 20,
            entries: 50,
            hitRate: 0.83,
        });
        render(<CacheDashboard cache={cache} />);

        expect(screen.getByText('100')).toBeDefined();
        expect(screen.getByText('20')).toBeDefined();
        expect(screen.getByText('50')).toBeDefined();
        expect(screen.getByText('83%')).toBeDefined();
    });

    it('renders 0% hit rate for zero hitRate', () => {
        const cache = createMockCache({ hitRate: 0 });
        render(<CacheDashboard cache={cache} />);

        expect(screen.getByText('0%')).toBeDefined();
    });

    it('renders 100% hit rate for perfect cache', () => {
        const cache = createMockCache({ hitRate: 1.0 });
        render(<CacheDashboard cache={cache} />);

        expect(screen.getByText('100%')).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Progress Bar
    // -----------------------------------------------------------------------

    it('renders hit rate progress bar with role=progressbar', () => {
        const cache = createMockCache({ hitRate: 0.75 });
        render(<CacheDashboard cache={cache} />);

        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '75');
        expect(progressBar).toHaveAttribute('aria-valuemin', '0');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    // -----------------------------------------------------------------------
    // Clear Cache Button
    // -----------------------------------------------------------------------

    it('renders "Clear Cache" button', () => {
        const cache = createMockCache();
        render(<CacheDashboard cache={cache} />);

        expect(screen.getByLabelText('Clear all cache entries')).toBeDefined();
    });

    it('calls invalidateAll() when "Clear Cache" is clicked', () => {
        const cache = createMockCache({ entries: 10 });
        render(<CacheDashboard cache={cache} />);

        fireEvent.click(screen.getByLabelText('Clear all cache entries'));
        expect(cache.invalidateAll).toHaveBeenCalledOnce();
    });

    it('refreshes stats immediately after clearing', () => {
        const cache = createMockCache({ entries: 10 });
        render(<CacheDashboard cache={cache} />);

        fireEvent.click(screen.getByLabelText('Clear all cache entries'));

        // getStats called: 1 on mount + 1 after clear = 2
        expect(cache.getStats).toHaveBeenCalledTimes(2);
    });

    it('disables "Clear Cache" when entries is 0', () => {
        const cache = createMockCache({ entries: 0 });
        render(<CacheDashboard cache={cache} />);

        const button = screen.getByLabelText('Clear all cache entries');
        expect(button).toHaveAttribute('disabled');
    });

    // -----------------------------------------------------------------------
    // Polling
    // -----------------------------------------------------------------------

    it('calls getStats() on mount', () => {
        const cache = createMockCache();
        render(<CacheDashboard cache={cache} />);

        expect(cache.getStats).toHaveBeenCalledOnce();
    });

    it('polls getStats() at configured interval', () => {
        const cache = createMockCache();
        render(<CacheDashboard cache={cache} />);

        // Fast-forward by 2 seconds (CACHE_POLL_INTERVAL_MS)
        act(() => {
            vi.advanceTimersByTime(2000);
        });

        // 1 on mount + 1 after interval = 2
        expect(cache.getStats).toHaveBeenCalledTimes(2);

        // Fast-forward another 2 seconds
        act(() => {
            vi.advanceTimersByTime(2000);
        });

        // 1 on mount + 2 intervals = 3
        expect(cache.getStats).toHaveBeenCalledTimes(3);
    });

    it('cleans up interval on unmount', () => {
        const cache = createMockCache();
        const { unmount } = render(<CacheDashboard cache={cache} />);

        unmount();

        // Fast-forward — should not call getStats after unmount
        act(() => {
            vi.advanceTimersByTime(4000);
        });

        // Only the initial mount call
        expect(cache.getStats).toHaveBeenCalledOnce();
    });

    // -----------------------------------------------------------------------
    // Accessibility
    // -----------------------------------------------------------------------

    it('has accessible aria-label on stats group', () => {
        const cache = createMockCache();
        render(<CacheDashboard cache={cache} />);

        const group = screen.getByRole('group');
        expect(group).toHaveAttribute('aria-label', 'Cache performance statistics');
    });

    it('renders data-enterstellar-devtools-panel attribute', () => {
        const cache = createMockCache();
        const { container } = render(<CacheDashboard cache={cache} />);

        const panel = container.querySelector('[data-enterstellar-devtools-panel="cache-dashboard"]');
        expect(panel).not.toBeNull();
    });

    // -----------------------------------------------------------------------
    // Header
    // -----------------------------------------------------------------------

    it('renders "Cache Statistics" header', () => {
        const cache = createMockCache();
        render(<CacheDashboard cache={cache} />);

        expect(screen.getByText('Cache Statistics')).toBeDefined();
    });
});
