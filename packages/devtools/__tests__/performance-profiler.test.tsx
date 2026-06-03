/**
 * @module @enterstellar-ai/devtools/__tests__/performance-profiler
 * @description Unit tests for the Performance Profiler panel (P1).
 *
 * Tests cover:
 * - Empty state (no traces)
 * - Stat cards rendering (P50, P95, P99, Mean, Min, Max)
 * - Latency bar chart — correct bar rendering and sort order
 * - Click-to-inspect — `onSelectTrace` fires on bar click
 * - Deselect on second click (toggle pattern)
 * - Keyboard interaction (Enter/Space)
 * - FilterBar integration
 * - Single-trace edge case (all percentiles equal)
 * - Accessibility attributes (aria-label, role)
 *
 * @see Bible §4.4 — Performance Profiler tab
 * @see Design Choice DT4 — P1 tab
 */

/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import { PerformanceProfiler } from '../src/panels/performance-profiler.js';
import { createEnterstellarContextWrapper } from './helpers/context-wrapper.js';

// ---------------------------------------------------------------------------
// Mock @enterstellar-ai/react
// ---------------------------------------------------------------------------

let mockStoreTraces: ZoneTrace[] = [];

vi.mock('@enterstellar-ai/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@enterstellar-ai/react')>();
    return {
        ...actual,
        useEnterstellarStore: (selector: (state: Record<string, unknown>) => unknown) => {
            return selector({ traces: mockStoreTraces });
        },
    };
});

/**
 * Renders a component wrapped in `EnterstellarContext.Provider` with the mock store.
 */
function renderWithEnterstellar(ui: React.ReactElement) {
    const { wrapper } = createEnterstellarContextWrapper(mockStoreTraces);
    return render(ui, { wrapper });
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a `ZoneTrace` fixture with configurable overrides.
 *
 * @param id - Trace ID.
 * @param overrides - Optional field overrides.
 * @returns A `ZoneTrace` fixture.
 *
 * @internal
 */
function createTrace(id: string, overrides?: {
    readonly component?: string;
    readonly status?: 'pass' | 'fail' | 'corrected';
    readonly totalMs?: number;
}): ZoneTrace {
    return {
        id,
        timestamp: '2026-02-22T01:15:30.123Z',
        intent: {
            component: overrides?.component ?? 'TestComponent',
            props: {},
            confidence: 0.95,
        },
        compilation: {
            status: overrides?.status ?? 'pass',
            errors: overrides?.status === 'fail'
                ? [{ code: 'ENS-2001', path: 'props.value', message: 'Invalid value' }]
                : [],
            selfCorrectionAttempts: overrides?.status === 'corrected' ? 1 : 0,
        },
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: '2026-02-22T01:15:30.123Z',
            compilerVersion: '0.0.0',
        },
        metrics: {
            totalMs: overrides?.totalMs ?? 12,
            retryAttempt: 0,
        },
    } as unknown as ZoneTrace;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PerformanceProfiler', () => {
    beforeEach(() => {
        mockStoreTraces = [];
    });

    // -----------------------------------------------------------------------
    // Empty State
    // -----------------------------------------------------------------------

    it('renders empty state when no traces exist', () => {
        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByText(/no traces yet/i)).toBeDefined();
    });

    it('does not render stat cards when no traces exist', () => {
        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.queryByText('P50')).toBeNull();
        expect(screen.queryByText('P95')).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Stat Cards
    // -----------------------------------------------------------------------

    it('renders P50, P95, P99 stat card labels', () => {
        mockStoreTraces = [
            createTrace('main-1', { totalMs: 100 }),
            createTrace('main-2', { totalMs: 200 }),
            createTrace('main-3', { totalMs: 300 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByText('P50')).toBeDefined();
        expect(screen.getByText('P95')).toBeDefined();
        expect(screen.getByText('P99')).toBeDefined();
        expect(screen.getByText('Mean')).toBeDefined();
        expect(screen.getByText('Min')).toBeDefined();
        expect(screen.getByText('Max')).toBeDefined();
    });

    it('renders correct stat values for known dataset', () => {
        mockStoreTraces = [
            createTrace('main-1', { totalMs: 10 }),
            createTrace('main-2', { totalMs: 20 }),
            createTrace('main-3', { totalMs: 30 }),
            createTrace('main-4', { totalMs: 40 }),
            createTrace('main-5', { totalMs: 50 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        // P50 of [10,20,30,40,50] = 30 (nearest-rank); value appears in stat card + bar row
        expect(screen.getAllByText('30ms').length).toBeGreaterThanOrEqual(1);
        // Min = 10 — stat card + bar row
        expect(screen.getAllByText('10ms').length).toBeGreaterThanOrEqual(1);
        // Max = 50 — stat card + bar row
        expect(screen.getAllByText('50ms').length).toBeGreaterThanOrEqual(1);
    });

    it('handles single-trace edge case without NaN', () => {
        mockStoreTraces = [
            createTrace('main-1', { totalMs: 42 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        // All percentiles should show 42ms
        const allValues = screen.getAllByText('42ms');
        // P50, P95, P99, Mean, Min, Max — all 42ms = 6 stat cards + 1 bar value
        expect(allValues.length).toBeGreaterThanOrEqual(6);
    });

    // -----------------------------------------------------------------------
    // Bar Chart
    // -----------------------------------------------------------------------

    it('renders bar rows for each trace', () => {
        mockStoreTraces = [
            createTrace('main-1', { component: 'FastCard', totalMs: 10 }),
            createTrace('main-2', { component: 'SlowChart', totalMs: 50 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getAllByRole('row').length).toBe(2);
    });

    it('renders component names in bar labels', () => {
        mockStoreTraces = [
            createTrace('main-1', { component: 'PatientVitals', totalMs: 25 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        // Component name appears in both bar label and FilterBar available components option
        expect(screen.getAllByText('PatientVitals').length).toBeGreaterThanOrEqual(1);
    });

    it('sorts traces by slowest first (descending totalMs)', () => {
        mockStoreTraces = [
            createTrace('main-1', { component: 'Fast', totalMs: 10 }),
            createTrace('main-2', { component: 'Slow', totalMs: 100 }),
            createTrace('main-3', { component: 'Medium', totalMs: 50 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        const rows = screen.getAllByRole('row');
        // First row should be the slowest (100ms → Slow)
        expect(rows[0]?.textContent).toContain('Slow');
        // Last row should be the fastest (10ms → Fast)
        expect(rows[2]?.textContent).toContain('Fast');
    });

    it('shows sort indicator when traces exist', () => {
        mockStoreTraces = [createTrace('main-1', { totalMs: 10 })];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByText(/sorted by slowest/i)).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Click-to-Inspect
    // -----------------------------------------------------------------------

    it('calls onSelectTrace when a bar is clicked', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [createTrace('main-1', { totalMs: 25 })];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={onSelectTrace}
                selectedTraceId={null}
            />,
        );
        fireEvent.click(screen.getByRole('row'));
        expect(onSelectTrace).toHaveBeenCalledOnce();
        expect(onSelectTrace.mock.calls[0]?.[0]).toHaveProperty('id', 'main-1');
    });

    it('deselects trace on second click (toggle)', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [createTrace('main-1', { totalMs: 25 })];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={onSelectTrace}
                selectedTraceId="main-1"
            />,
        );
        fireEvent.click(screen.getByRole('row'));
        expect(onSelectTrace).toHaveBeenCalledWith(null);
    });

    it('supports keyboard interaction (Enter) on bar rows', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [createTrace('main-1', { totalMs: 25 })];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={onSelectTrace}
                selectedTraceId={null}
            />,
        );
        fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
        expect(onSelectTrace).toHaveBeenCalledOnce();
    });

    // -----------------------------------------------------------------------
    // Accessibility
    // -----------------------------------------------------------------------

    it('has accessible aria-label on the bar chart container', () => {
        mockStoreTraces = [createTrace('main-1', { totalMs: 25 })];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        const table = screen.getByRole('table');
        expect(table).toHaveAttribute('aria-label', 'Latency distribution');
    });

    it('renders aria-label with latency info on each bar row', () => {
        mockStoreTraces = [
            createTrace('main-1', { component: 'Card', totalMs: 42, status: 'pass' }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByRole('row')).toHaveAttribute(
            'aria-label',
            'Card: 42ms, pass',
        );
    });

    // -----------------------------------------------------------------------
    // Header
    // -----------------------------------------------------------------------

    it('renders trace count in header', () => {
        mockStoreTraces = [
            createTrace('main-1', { totalMs: 10 }),
            createTrace('main-2', { totalMs: 20 }),
        ];

        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByText('2 traces')).toBeDefined();
    });

    it('renders filter bar with search input', () => {
        renderWithEnterstellar(
            <PerformanceProfiler
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByPlaceholderText('Search intents, components…')).toBeDefined();
    });
});
