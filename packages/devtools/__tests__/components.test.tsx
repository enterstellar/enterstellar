/**
 * @module @enterstellar-ai/devtools/__tests__/components
 * @description Unit tests for all shared DevTools components.
 *
 * Tests cover:
 * - `ToggleButton` — renders ⚡, fires click, respects position
 * - `StatusBadge` — correct color/label for each status
 * - `JsonViewer` — collapse/expand, primitives, nested objects, null
 * - `FilterBar` — filter controls render, emit change events
 * - `TraceRow` — renders trace data, click handler, keyboard access
 *
 * @see Bible §4.4 — DevTools component specification
 */

/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import { ToggleButton } from '../src/components/toggle-button.js';
import { StatusBadge } from '../src/components/status-badge.js';
import { JsonViewer } from '../src/components/json-viewer.js';
import { FilterBar } from '../src/components/filter-bar.js';
import { TraceRow } from '../src/components/trace-row.js';

// ---------------------------------------------------------------------------
// Test Fixture
// ---------------------------------------------------------------------------

function createTrace(id: string, overrides?: {
    readonly component?: string;
    readonly status?: 'pass' | 'fail' | 'corrected';
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
            selfCorrectionAttempts: 0,
        },
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: '2026-02-22T01:15:30.123Z',
            compilerVersion: '0.0.0',
        },
        metrics: {
            totalMs: 12,
            retryAttempt: 0,
        },
        // Cast through `unknown` — fixture is intentionally partial for test
        // brevity. Full ZoneTrace has additional optional fields not needed here.
    } as unknown as ZoneTrace;
}

// ---------------------------------------------------------------------------
// ToggleButton
// ---------------------------------------------------------------------------

describe('ToggleButton', () => {
    it('renders the ⚡ icon', () => {
        render(
            <ToggleButton isOpen={false} onToggle={vi.fn()} position="bottom-right" />,
        );
        expect(screen.getByRole('button')).toHaveTextContent('⚡');
    });

    it('fires onToggle when clicked', () => {
        const onToggle = vi.fn();
        render(
            <ToggleButton isOpen={false} onToggle={onToggle} position="bottom-right" />,
        );
        fireEvent.click(screen.getByRole('button'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('sets aria-expanded to true when open', () => {
        render(
            <ToggleButton isOpen={true} onToggle={vi.fn()} position="bottom-right" />,
        );
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('sets aria-expanded to false when closed', () => {
        render(
            <ToggleButton isOpen={false} onToggle={vi.fn()} position="bottom-right" />,
        );
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('has correct aria-label when closed', () => {
        render(
            <ToggleButton isOpen={false} onToggle={vi.fn()} position="bottom-right" />,
        );
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Open Enterstellar DevTools');
    });

    it('has correct aria-label when open', () => {
        render(
            <ToggleButton isOpen={true} onToggle={vi.fn()} position="bottom-right" />,
        );
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Close Enterstellar DevTools');
    });
});

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

describe('StatusBadge', () => {
    it('renders PASS text for pass status', () => {
        render(<StatusBadge status="pass" />);
        expect(screen.getByRole('status')).toHaveTextContent('PASS');
    });

    it('renders CORRECTED text for corrected status', () => {
        render(<StatusBadge status="corrected" />);
        expect(screen.getByRole('status')).toHaveTextContent('CORRECTED');
    });

    it('renders FAIL text for fail status', () => {
        render(<StatusBadge status="fail" />);
        expect(screen.getByRole('status')).toHaveTextContent('FAIL');
    });

    it('sets aria-label with status name', () => {
        render(<StatusBadge status="pass" />);
        expect(screen.getByRole('status')).toHaveAttribute(
            'aria-label',
            'Compilation status: pass',
        );
    });

    it('sets data-enterstellar-devtools-status attribute', () => {
        render(<StatusBadge status="fail" />);
        expect(screen.getByRole('status')).toHaveAttribute(
            'data-enterstellar-devtools-status',
            'fail',
        );
    });
});

// ---------------------------------------------------------------------------
// JsonViewer
// ---------------------------------------------------------------------------

describe('JsonViewer', () => {
    it('renders null value', () => {
        render(<JsonViewer data={null} label="test" />);
        expect(screen.getByRole('tree')).toHaveTextContent('null');
    });

    it('renders string value', () => {
        render(<JsonViewer data="hello" label="test" />);
        expect(screen.getByRole('tree')).toHaveTextContent('"hello"');
    });

    it('renders number value', () => {
        render(<JsonViewer data={42} label="test" />);
        expect(screen.getByRole('tree')).toHaveTextContent('42');
    });

    it('renders boolean value', () => {
        render(<JsonViewer data={true} label="test" />);
        expect(screen.getByRole('tree')).toHaveTextContent('true');
    });

    it('renders collapsed object by default', () => {
        render(<JsonViewer data={{ key: 'value' }} label="obj" />);
        // Should show item count when collapsed
        expect(screen.getByRole('tree')).toHaveTextContent('1 item');
    });

    it('expands object when defaultExpanded is true', () => {
        render(<JsonViewer data={{ key: 'value' }} label="obj" defaultExpanded={true} />);
        // Should show the key when expanded
        expect(screen.getByRole('tree')).toHaveTextContent('key');
        expect(screen.getByRole('tree')).toHaveTextContent('"value"');
    });

    it('toggles collapse on click', () => {
        render(<JsonViewer data={{ key: 'value' }} label="obj" />);
        const toggle = screen.getByRole('button', { name: /expand obj/i });
        fireEvent.click(toggle);
        // After expanding, should show key
        expect(screen.getByRole('tree')).toHaveTextContent('key');
    });

    it('has aria-label on the tree container', () => {
        render(<JsonViewer data={{}} label="myData" />);
        expect(screen.getByRole('tree')).toHaveAttribute('aria-label', 'JSON viewer: myData');
    });
});

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

describe('FilterBar', () => {
    it('renders search input with placeholder', () => {
        render(
            <FilterBar
                filter={{}}
                onFilterChange={vi.fn()}
                availableZones={[]}
                availableComponents={[]}
            />,
        );
        expect(screen.getByPlaceholderText('Search intents, components…')).toBeDefined();
    });

    it('renders zone dropdown with options', () => {
        render(
            <FilterBar
                filter={{}}
                onFilterChange={vi.fn()}
                availableZones={['main', 'sidebar']}
                availableComponents={[]}
            />,
        );
        const select = screen.getByLabelText('Filter by zone');
        expect(select).toBeDefined();
        expect(select.querySelectorAll('option')).toHaveLength(3); // All + 2 zones
    });

    it('calls onFilterChange when search text changes', () => {
        const onChange = vi.fn();
        render(
            <FilterBar
                filter={{}}
                onFilterChange={onChange}
                availableZones={[]}
                availableComponents={[]}
            />,
        );
        const input = screen.getByLabelText('Search traces');
        fireEvent.change(input, { target: { value: 'vitals' } });
        expect(onChange).toHaveBeenCalledWith({ search: 'vitals' });
    });

    it('calls onFilterChange when zone changes', () => {
        const onChange = vi.fn();
        render(
            <FilterBar
                filter={{}}
                onFilterChange={onChange}
                availableZones={['main']}
                availableComponents={[]}
            />,
        );
        const select = screen.getByLabelText('Filter by zone');
        fireEvent.change(select, { target: { value: 'main' } });
        expect(onChange).toHaveBeenCalledWith({ zone: 'main' });
    });

    it('toggles status filter on click', () => {
        const onChange = vi.fn();
        render(
            <FilterBar
                filter={{}}
                onFilterChange={onChange}
                availableZones={[]}
                availableComponents={[]}
            />,
        );
        const passButton = screen.getByLabelText('Filter by status: pass');
        fireEvent.click(passButton);
        expect(onChange).toHaveBeenCalledWith({ status: 'pass' });
    });

    it('deactivates status filter when clicking same status', () => {
        const onChange = vi.fn();
        render(
            <FilterBar
                filter={{ status: 'pass' }}
                onFilterChange={onChange}
                availableZones={[]}
                availableComponents={[]}
            />,
        );
        const passButton = screen.getByLabelText('Filter by status: pass');
        fireEvent.click(passButton);
        expect(onChange).toHaveBeenCalledWith({ status: undefined });
    });
});

// ---------------------------------------------------------------------------
// TraceRow
// ---------------------------------------------------------------------------

describe('TraceRow', () => {
    it('renders the component name', () => {
        const trace = createTrace('main-abc', { component: 'PatientVitals' });
        render(<TraceRow trace={trace} isSelected={false} onSelect={vi.fn()} />);
        expect(screen.getByText('PatientVitals')).toBeDefined();
    });

    it('renders the latency in ms', () => {
        const trace = createTrace('main-abc');
        render(<TraceRow trace={trace} isSelected={false} onSelect={vi.fn()} />);
        expect(screen.getByText('12ms')).toBeDefined();
    });

    it('renders the status badge', () => {
        const trace = createTrace('main-abc', { status: 'fail' });
        render(<TraceRow trace={trace} isSelected={false} onSelect={vi.fn()} />);
        expect(screen.getByRole('status')).toHaveTextContent('FAIL');
    });

    it('calls onSelect with trace ID when clicked', () => {
        const onSelect = vi.fn();
        const trace = createTrace('main-abc');
        render(<TraceRow trace={trace} isSelected={false} onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('row'));
        expect(onSelect).toHaveBeenCalledWith('main-abc');
    });

    it('calls onSelect on Enter key press', () => {
        const onSelect = vi.fn();
        const trace = createTrace('main-abc');
        render(<TraceRow trace={trace} isSelected={false} onSelect={onSelect} />);
        fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('main-abc');
    });

    it('sets aria-selected when selected', () => {
        const trace = createTrace('main-abc');
        render(<TraceRow trace={trace} isSelected={true} onSelect={vi.fn()} />);
        expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'true');
    });

    it('renders zone name extracted from trace ID', () => {
        const trace = createTrace('sidebar-xyz');
        render(<TraceRow trace={trace} isSelected={false} onSelect={vi.fn()} />);
        expect(screen.getByTitle('sidebar')).toBeDefined();
    });
});
