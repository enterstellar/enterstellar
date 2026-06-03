/**
 * @module @enterstellar-ai/devtools/__tests__/replay-mode
 * @description Unit tests for the Replay Mode panel (P2).
 *
 * Tests cover:
 * - Empty state (no trace selected)
 * - 6 pipeline steps render with correct labels
 * - Step status indicators (completed, failed)
 * - Step navigation (Previous/Next)
 * - Step expansion via click
 * - Keyboard interaction
 * - Failed compilation produces failed step indicators
 * - Accessibility attributes
 *
 * @see Design Choice DT6 — log viewer, step-by-step replay
 * @see Bible §4.4 — Replay Mode tab
 */

/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import { ReplayMode } from '../src/panels/replay-mode.js';
import { createEnterstellarContextWrapper } from './helpers/context-wrapper.js';

// ---------------------------------------------------------------------------
// Mock @enterstellar-ai/react (required by JsonViewer's dependency chain)
// ---------------------------------------------------------------------------

vi.mock('@enterstellar-ai/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@enterstellar-ai/react')>();
    return {
        ...actual,
        useEnterstellarStore: (selector: (state: Record<string, unknown>) => unknown) => {
            return selector({ traces: [] });
        },
    };
});

/**
 * Renders a component wrapped in `EnterstellarContext.Provider` with the mock store.
 */
function renderWithEnterstellar(ui: React.ReactElement) {
    const { wrapper } = createEnterstellarContextWrapper([]);
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
            props: { value: 42 },
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

describe('ReplayMode', () => {
    // -----------------------------------------------------------------------
    // Empty State
    // -----------------------------------------------------------------------

    it('renders empty state when no trace is selected', () => {
        renderWithEnterstellar(<ReplayMode selectedTrace={null} />);
        expect(screen.getByText(/select a trace from the timeline/i)).toBeDefined();
    });

    it('does not render step list when no trace is selected', () => {
        renderWithEnterstellar(<ReplayMode selectedTrace={null} />);
        expect(screen.queryByRole('list')).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Pipeline Steps
    // -----------------------------------------------------------------------

    it('renders all 6 pipeline step labels', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        // 'Intent Received' appears in both step header and expanded JsonViewer label
        expect(screen.getAllByText('Intent Received').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Component Resolved')).toBeDefined();
        expect(screen.getByText('Compilation')).toBeDefined();
        expect(screen.getByText('Validation')).toBeDefined();
        expect(screen.getByText('Final Output')).toBeDefined();
        expect(screen.getByText('Performance')).toBeDefined();
    });

    it('renders 6 list items', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        expect(screen.getAllByRole('listitem').length).toBe(6);
    });

    it('renders component name in header', () => {
        const trace = createTrace('main-1', { component: 'PatientVitals' });
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        expect(screen.getByText(/replay: patientvitals/i)).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Step Status Indicators
    // -----------------------------------------------------------------------

    it('shows "completed" status for all steps on pass trace', () => {
        const trace = createTrace('main-1', { status: 'pass' });
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        // All 6 steps should show "completed" status text
        const completedLabels = screen.getAllByText('completed');
        expect(completedLabels.length).toBe(6);
    });

    it('shows "failed" status for compilation and validation on fail trace', () => {
        const trace = createTrace('main-1', { status: 'fail' });
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        // Steps 3 (Compilation) and 4 (Validation) should be "failed"
        const failedLabels = screen.getAllByText('failed');
        expect(failedLabels.length).toBe(2);

        // Remaining 4 steps should be "completed"
        const completedLabels = screen.getAllByText('completed');
        expect(completedLabels.length).toBe(4);
    });

    // -----------------------------------------------------------------------
    // Step Navigation
    // -----------------------------------------------------------------------

    it('renders step counter showing "Step 1 / 6" initially', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        expect(screen.getByText('Step 1 / 6')).toBeDefined();
    });

    it('disables "Previous" button on first step', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        const prevButton = screen.getByLabelText('Previous step');
        expect(prevButton).toHaveAttribute('disabled');
    });

    it('enables "Next" button on first step', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        const nextButton = screen.getByLabelText('Next step');
        expect(nextButton).not.toHaveAttribute('disabled');
    });

    it('advances step counter on "Next" click', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        fireEvent.click(screen.getByLabelText('Next step'));
        expect(screen.getByText('Step 2 / 6')).toBeDefined();
    });

    it('decrements step counter on "Previous" click', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        // Advance to step 2, then go back
        fireEvent.click(screen.getByLabelText('Next step'));
        fireEvent.click(screen.getByLabelText('Previous step'));
        expect(screen.getByText('Step 1 / 6')).toBeDefined();
    });

    it('navigates to step on header click', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        // Click on step 3 header (Compilation)
        const step3Button = screen.getByLabelText(/step 3: compilation/i);
        fireEvent.click(step3Button);
        expect(screen.getByText('Step 3 / 6')).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Keyboard Interaction
    // -----------------------------------------------------------------------

    it('supports Enter key on step headers', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        const step2Button = screen.getByLabelText(/step 2: component resolved/i);
        fireEvent.keyDown(step2Button, { key: 'Enter' });
        expect(screen.getByText('Step 2 / 6')).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Accessibility
    // -----------------------------------------------------------------------

    it('has accessible aria-label on step list', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        const list = screen.getByRole('list');
        expect(list).toHaveAttribute('aria-label', 'Pipeline replay steps');
    });

    it('sets aria-expanded on active step header', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        // First step should be expanded
        const step1Button = screen.getByLabelText(/step 1: intent received/i);
        expect(step1Button).toHaveAttribute('aria-expanded', 'true');

        // Second step should be collapsed
        const step2Button = screen.getByLabelText(/step 2: component resolved/i);
        expect(step2Button).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders data-enterstellar-devtools-panel attribute', () => {
        const trace = createTrace('main-1');
        const { container } = renderWithEnterstellar(<ReplayMode selectedTrace={trace} />);

        const panel = container.querySelector('[data-enterstellar-devtools-panel="replay-mode"]');
        expect(panel).not.toBeNull();
    });
});
