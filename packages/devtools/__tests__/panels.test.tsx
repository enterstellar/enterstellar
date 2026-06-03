/**
 * @module @enterstellar-ai/devtools/__tests__/panels
 * @description Unit tests for all DevTools panels.
 *
 * Tests cover:
 * - `TraceTimeline` — renders traces, filter integration, export, empty states
 * - `ComponentInspector` — renders sections, empty state, conditional fields
 * - `ValidationLog` — filters to fail/corrected, search, click-to-inspect
 * - `PanelStub` — renders coming soon placeholder for deferred tabs
 *
 * @see Bible §4.4 — DevTools panel specification
 * @see Design Choice DT4 — P0 tabs
 */

/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import { TraceTimeline } from '../src/panels/trace-timeline.js';
import { ComponentInspector } from '../src/panels/component-inspector.js';
import { ValidationLog } from '../src/panels/validation-log.js';
import { PanelStub } from '../src/panels/panel-stub.js';
import { createEnterstellarContextWrapper } from './helpers/context-wrapper.js';

// ---------------------------------------------------------------------------
// Mock @enterstellar-ai/react — preserves EnterstellarContext for useDevtoolsTraces (DT7)
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
 * Required for components that internally call `useDevtoolsTraces`.
 */
function renderWithEnterstellar(ui: React.ReactElement) {
    const { wrapper } = createEnterstellarContextWrapper(mockStoreTraces);
    return render(ui, { wrapper });
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTrace(id: string, overrides?: {
    readonly component?: string;
    readonly status?: 'pass' | 'fail' | 'corrected';
    readonly raw?: string;
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
        // Cast through `unknown` — fixture is intentionally partial for test
        // brevity. Full ZoneTrace has additional optional fields not needed here.
    } as unknown as ZoneTrace;
}

// ---------------------------------------------------------------------------
// TraceTimeline
// ---------------------------------------------------------------------------

describe('TraceTimeline', () => {
    beforeEach(() => {
        mockStoreTraces = [];
    });

    it('renders empty state when no traces exist', () => {
        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByText(/no traces yet/i)).toBeDefined();
    });

    it('renders trace count header', () => {
        mockStoreTraces = [
            createTrace('main-1'),
            createTrace('main-2'),
        ];

        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByText('2 / 2 traces')).toBeDefined();
    });

    it('renders trace rows for each trace', () => {
        mockStoreTraces = [
            createTrace('main-1', { component: 'PatientVitals' }),
            createTrace('main-2', { component: 'MedicationList' }),
        ];

        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        // Component name appears in trace row + filter bar dropdown, so use getAllByText
        expect(screen.getAllByText('PatientVitals').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('MedicationList').length).toBeGreaterThanOrEqual(1);
    });

    it('calls onSelectTrace when a row is clicked', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [createTrace('main-1')];

        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={onSelectTrace}
                selectedTraceId={null}
            />,
        );
        fireEvent.click(screen.getByRole('row'));
        expect(onSelectTrace).toHaveBeenCalledOnce();
        expect(onSelectTrace.mock.calls[0]?.[0]).toHaveProperty('id', 'main-1');
    });

    it('deselects trace when clicking the same row again', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [createTrace('main-1')];

        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={onSelectTrace}
                selectedTraceId="main-1"
            />,
        );
        fireEvent.click(screen.getByRole('row'));
        expect(onSelectTrace).toHaveBeenCalledWith(null);
    });

    it('renders export button', () => {
        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByLabelText('Export traces as JSON')).toBeDefined();
    });

    it('disables export button when no traces', () => {
        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        const exportButton = screen.getByLabelText('Export traces as JSON');
        expect(exportButton).toHaveAttribute('disabled');
    });

    it('renders filter bar with search input', () => {
        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );
        expect(screen.getByPlaceholderText('Search intents, components…')).toBeDefined();
    });

    it('shows "no traces match" when filter yields empty results', () => {
        mockStoreTraces = [createTrace('main-1', { component: 'Card' })];

        renderWithEnterstellar(
            <TraceTimeline
                maxTraces={500}
                onSelectTrace={vi.fn()}
                selectedTraceId={null}
            />,
        );

        // Type a search that won't match
        const input = screen.getByLabelText('Search traces');
        fireEvent.change(input, { target: { value: 'zzzznonexistent' } });

        expect(screen.getByText(/no traces match/i)).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// ComponentInspector
// ---------------------------------------------------------------------------

describe('ComponentInspector', () => {
    it('renders empty state when no trace is selected', () => {
        renderWithEnterstellar(<ComponentInspector selectedTrace={null} />);
        expect(screen.getByText(/select a trace/i)).toBeDefined();
    });

    it('renders trace ID when a trace is selected', () => {
        const trace = createTrace('main-abc123');
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        expect(screen.getByText('main-abc123')).toBeDefined();
    });

    it('renders intent section with component name', () => {
        const trace = createTrace('main-1', { component: 'PatientVitals' });
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        expect(screen.getByText('PatientVitals')).toBeDefined();
    });

    it('renders compilation status badge', () => {
        const trace = createTrace('main-1', { status: 'corrected' });
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        expect(screen.getByText('CORRECTED')).toBeDefined();
    });

    it('renders provenance details', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        expect(screen.getByText('test-agent')).toBeDefined();
        expect(screen.getByText('test-registry')).toBeDefined();
    });

    it('renders performance metrics', () => {
        const trace = createTrace('main-1', { totalMs: 42 });
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        expect(screen.getByText('42ms')).toBeDefined();
    });

    it('renders section headers', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        expect(screen.getByText('Trace')).toBeDefined();
        expect(screen.getByText('Intent')).toBeDefined();
        expect(screen.getByText('Compilation')).toBeDefined();
        expect(screen.getByText('Provenance')).toBeDefined();
        expect(screen.getByText('Performance')).toBeDefined();
    });

    it('renders full trace JSON viewer', () => {
        const trace = createTrace('main-1');
        renderWithEnterstellar(<ComponentInspector selectedTrace={trace} />);
        // The "Full Trace (JSON)" section header should be present
        expect(screen.getByText('Full Trace (JSON)')).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// ValidationLog
// ---------------------------------------------------------------------------

describe('ValidationLog', () => {
    beforeEach(() => {
        mockStoreTraces = [];
    });

    it('renders empty state when no traces exist', () => {
        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(screen.getByText(/no traces yet/i)).toBeDefined();
    });

    it('renders "all passed" message when all traces are pass', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'pass' }),
            createTrace('main-2', { status: 'pass' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(screen.getByText(/all compilations passed/i)).toBeDefined();
    });

    it('renders only fail and corrected traces', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'pass', component: 'Good' }),
            createTrace('main-2', { status: 'fail', component: 'Bad' }),
            createTrace('main-3', { status: 'corrected', component: 'Fixed' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        // Component name appears in entry header + meta, so use getAllByText
        expect(screen.getAllByText('Bad').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Fixed').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Good')).toBeNull();
    });

    it('shows issue count in header', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'fail' }),
            createTrace('main-2', { status: 'corrected' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(screen.getByText('2 validation issues')).toBeDefined();
    });

    it('shows singular "issue" for single issue', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'fail' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(screen.getByText('1 validation issue')).toBeDefined();
    });

    it('renders status badge for each entry', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'fail' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(screen.getByText('FAIL')).toBeDefined();
    });

    it('renders self-correction info for corrected traces', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'corrected' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(screen.getByText(/self-corrected successfully/i)).toBeDefined();
    });

    it('calls onSelectTrace when entry is clicked', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [
            createTrace('main-1', { status: 'fail' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={onSelectTrace} />,
        );
        fireEvent.click(screen.getByRole('listitem'));
        expect(onSelectTrace).toHaveBeenCalledOnce();
        expect(onSelectTrace.mock.calls[0]?.[0]).toHaveProperty('id', 'main-1');
    });

    it('filters entries by search text', () => {
        mockStoreTraces = [
            createTrace('main-1', { status: 'fail', component: 'PatientVitals' }),
            createTrace('main-2', { status: 'fail', component: 'MedicationList' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );

        const input = screen.getByLabelText('Search validation issues');
        fireEvent.change(input, { target: { value: 'Patient' } });

        // Component name appears in entry header + meta, so use getAllByText
        expect(screen.getAllByText('PatientVitals').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('MedicationList')).toBeNull();
    });

    it('renders search input with placeholder', () => {
        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={vi.fn()} />,
        );
        expect(
            screen.getByPlaceholderText('Search by component, intent, or zone…'),
        ).toBeDefined();
    });

    it('supports keyboard interaction on entries', () => {
        const onSelectTrace = vi.fn();
        mockStoreTraces = [
            createTrace('main-1', { status: 'fail' }),
        ];

        renderWithEnterstellar(
            <ValidationLog maxTraces={500} onSelectTrace={onSelectTrace} />,
        );
        fireEvent.keyDown(screen.getByRole('listitem'), { key: 'Enter' });
        expect(onSelectTrace).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// PanelStub
// ---------------------------------------------------------------------------

describe('PanelStub', () => {
    it('renders tab label for cache-dashboard', () => {
        renderWithEnterstellar(<PanelStub tab="cache-dashboard" />);
        expect(screen.getByText('Cache')).toBeDefined();
    });

    it('renders tab label for performance-profiler', () => {
        renderWithEnterstellar(<PanelStub tab="performance-profiler" />);
        expect(screen.getByText('Performance')).toBeDefined();
    });

    it('renders "coming in a future release" message', () => {
        renderWithEnterstellar(<PanelStub tab="replay-mode" />);
        expect(screen.getByText('Coming in a future release.')).toBeDefined();
    });

    it('has accessible aria-label', () => {
        renderWithEnterstellar(<PanelStub tab="cache-dashboard" />);
        expect(screen.getByRole('status')).toHaveAttribute(
            'aria-label',
            'Cache — coming soon',
        );
    });
});
