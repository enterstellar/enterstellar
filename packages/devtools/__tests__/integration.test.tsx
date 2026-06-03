/**
 * @module @enterstellar-ai/devtools/__tests__/integration
 * @description Integration smoke tests for the `@enterstellar-ai/devtools` module.
 *
 * These tests exercise the **full data flow** from `EnterstellarStore` traces through
 * the DevTools UI, validating the end-to-end lifecycle described in the
 * implementation plan's Manual Verification section:
 *
 * 1. Panel toggles via ⚡ button click
 * 2. Trace Timeline populates when store has traces
 * 3. Clicking a trace opens the Component Inspector with correct data
 * 4. Validation Log shows compilation errors
 * 5. JSON export triggers download
 * 6. Component returns `null` when `NODE_ENV=production`
 *
 * **Data flow under test:**
 * ```
 * mockStoreTraces → useEnterstellarStore(selector) → useDevtoolsTraces()
 *   → Trace Timeline (rows) → click row → Component Inspector (detail)
 *   → Validation Log (fail/corrected only) → Export (JSON download)
 * ```
 *
 * @see Bible §4.4 — DevTools module specification
 * @see Design Choice DT3 — Production guard (tree-shakeable, zero prod bytes)
 * @see Design Choice DT5 — 500 trace ring buffer
 * @see Design Choice DT7 — Data from EnterstellarStore directly
 * @see Design Choice DT8 — JSON export via download
 *
 * @internal
 */

/// <reference path="../env.d.ts" />
/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import { EnterstellarDevTools } from '../src/devtools.js';
import { createEnterstellarContextWrapper } from './helpers/context-wrapper.js';

// ---------------------------------------------------------------------------
// Mock @enterstellar-ai/react — simulates EnterstellarStore trace subscription (DT7)
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
// Environment Helpers — production guard (DT3)
// ---------------------------------------------------------------------------

const originalNodeEnv = process.env['NODE_ENV'];

function setNodeEnv(value: string): void {
    // Cast to mutable record — test-only helper for DT3 production guard tests.
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = value;
}

function restoreNodeEnv(): void {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = originalNodeEnv;
}

// ---------------------------------------------------------------------------
// Trace Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a fully-populated `ZoneTrace` fixture for integration testing.
 *
 * Each fixture exercises the complete type surface:
 * - `id` — unique trace identifier
 * - `timestamp` — ISO 8601 timestamp
 * - `intent` — component name, props, confidence
 * - `compilation` — status, errors array, self-correction attempts
 * - `provenance` — agent, registry, compiledAt, compilerVersion
 * - `metrics` — totalMs for performance display
 */
function createIntegrationTrace(
    id: string,
    overrides?: {
        readonly component?: string;
        readonly status?: 'pass' | 'fail' | 'corrected';
        readonly errorCode?: string;
        readonly errorMessage?: string;
        readonly totalMs?: number;
    },
): ZoneTrace {
    const status = overrides?.status ?? 'pass';
    const hasError = status === 'fail';

    return {
        id,
        timestamp: '2026-02-22T02:20:00.000Z',
        intent: {
            component: overrides?.component ?? 'IntegrationTestComponent',
            props: { testProp: 'value' },
            confidence: 0.92,
        },
        compilation: {
            status,
            errors: hasError
                ? [{
                    code: overrides?.errorCode ?? 'ENS-2001',
                    path: 'props.testProp',
                    message: overrides?.errorMessage ?? 'Invalid prop value',
                }]
                : [],
            selfCorrectionAttempts: status === 'corrected' ? 1 : 0,
        },
        provenance: {
            agent: 'integration-test-agent',
            registry: 'integration-test-registry',
            compiledAt: '2026-02-22T02:20:00.000Z',
            compilerVersion: '0.0.0',
        },
        metrics: {
            totalMs: overrides?.totalMs ?? 25,
            retryAttempt: 0,
        },
        // Cast through `unknown` — fixture is intentionally partial for test
        // brevity. Full ZoneTrace has additional optional fields not needed here.
    } as unknown as ZoneTrace;
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('DevTools Integration', () => {
    beforeEach(() => {
        mockStoreTraces = [];
        setNodeEnv('development');
    });

    afterEach(() => {
        restoreNodeEnv();
    });

    // -------------------------------------------------------------------
    // 1. Panel toggles via ⚡ button click (DT2)
    // -------------------------------------------------------------------

    it('toggles panel open and closed via the ⚡ button', () => {
        renderWithEnterstellar(<EnterstellarDevTools />);

        // Panel should be closed initially
        expect(screen.queryByText('⚡ Enterstellar DevTools')).toBeNull();

        // Open panel
        const toggleButton = screen.getByRole('button', { name: /open enterstellar devtools/i });
        fireEvent.click(toggleButton);
        expect(screen.getByText('⚡ Enterstellar DevTools')).toBeDefined();

        // Close panel via close button
        const closeButton = screen.getByLabelText('Close DevTools panel');
        fireEvent.click(closeButton);
        expect(screen.queryByText('⚡ Enterstellar DevTools')).toBeNull();
    });

    // -------------------------------------------------------------------
    // 2. Trace Timeline populates from store (DT5, DT7)
    // -------------------------------------------------------------------

    it('populates Trace Timeline with traces from the store', () => {
        mockStoreTraces = [
            createIntegrationTrace('int-1', { component: 'PatientVitals', totalMs: 15 }),
            createIntegrationTrace('int-2', { component: 'MedicationList', totalMs: 32 }),
            createIntegrationTrace('int-3', { component: 'LabResults', status: 'fail' }),
        ];

        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);

        // Verify trace count header shows correct numbers
        expect(screen.getByText(/3 \/ 3 traces/)).toBeDefined();

        // Verify trace rows are rendered (component names appear in rows + filter dropdown)
        expect(screen.getAllByText('PatientVitals').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('MedicationList').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('LabResults').length).toBeGreaterThanOrEqual(1);

        // Verify FAIL status badge is visible
        expect(screen.getAllByText('FAIL').length).toBeGreaterThanOrEqual(1);
    });

    // -------------------------------------------------------------------
    // 3. Clicking a trace opens Component Inspector with correct data (DT4)
    // -------------------------------------------------------------------

    it('navigates to Component Inspector with correct data on trace click', () => {
        mockStoreTraces = [
            createIntegrationTrace('int-inspect', {
                component: 'DiagnosisSummary',
                status: 'corrected',
                totalMs: 42,
            }),
        ];

        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);

        // Click the trace row
        const traceRow = screen.getByRole('row');
        fireEvent.click(traceRow);

        // Should auto-switch to Inspector tab
        const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
        expect(inspectorTab.getAttribute('aria-selected')).toBe('true');

        // Inspector should show the trace ID
        expect(screen.getByText('int-inspect')).toBeDefined();

        // Inspector should show the component name
        expect(screen.getAllByText('DiagnosisSummary').length).toBeGreaterThanOrEqual(1);

        // Inspector should show CORRECTED status
        expect(screen.getAllByText('CORRECTED').length).toBeGreaterThanOrEqual(1);

        // Inspector should show provenance details
        expect(screen.getByText('integration-test-agent')).toBeDefined();
        expect(screen.getByText('integration-test-registry')).toBeDefined();

        // Inspector should show performance metric
        expect(screen.getByText('42ms')).toBeDefined();
    });

    // -------------------------------------------------------------------
    // 4. Validation Log shows compilation errors (DT4, C15)
    // -------------------------------------------------------------------

    it('shows compilation errors in the Validation Log', () => {
        mockStoreTraces = [
            createIntegrationTrace('int-pass', { component: 'GoodComponent', status: 'pass' }),
            createIntegrationTrace('int-fail', {
                component: 'FailingComponent',
                status: 'fail',
                errorCode: 'ENS-2001',
                errorMessage: 'Invalid prop value',
            }),
            createIntegrationTrace('int-corrected', {
                component: 'CorrectedComponent',
                status: 'corrected',
            }),
        ];

        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);

        // Navigate to Validation tab
        const validationTab = screen.getByRole('tab', { name: 'Validation' });
        fireEvent.click(validationTab);

        // Validation Log should show the fail + corrected entries (not pass)
        expect(screen.getAllByText('FailingComponent').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('CorrectedComponent').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('GoodComponent')).toBeNull();

        // Should show issue count
        expect(screen.getByText(/2 validation issues/i)).toBeDefined();
    });

    // -------------------------------------------------------------------
    // 5. JSON export triggers download (DT8)
    // -------------------------------------------------------------------

    it('triggers JSON export download when export button is clicked', () => {
        mockStoreTraces = [
            createIntegrationTrace('int-export', { component: 'ExportTestComponent' }),
        ];

        // Render FIRST — before mocking anything DOM-related.
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);

        // Mock URL.createObjectURL — required for Blob download in jsdom.
        const createObjectURLSpy = vi.fn(() => 'blob:mock-url');
        const revokeObjectURLSpy = vi.fn();
        vi.stubGlobal('URL', {
            ...URL,
            createObjectURL: createObjectURLSpy,
            revokeObjectURL: revokeObjectURLSpy,
        });

        // Spy on anchor click via prototype — lets real `document.createElement('a')`
        // return a real Node (so `appendChild` works), while intercepting `click()`.
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
            // no-op in test — prevents jsdom "Not implemented: navigation" warning
        });

        // Click the export button
        const exportButton = screen.getByLabelText('Export traces as JSON');
        fireEvent.click(exportButton);

        // Verify download was triggered
        expect(createObjectURLSpy).toHaveBeenCalledOnce();
        expect(clickSpy).toHaveBeenCalledOnce();

        // Cleanup
        clickSpy.mockRestore();
        vi.unstubAllGlobals();
    });

    // -------------------------------------------------------------------
    // 6. Component returns null when NODE_ENV=production (DT3)
    // -------------------------------------------------------------------

    it('returns null in production mode — zero bytes rendered', () => {
        setNodeEnv('production');
        const { container } = renderWithEnterstellar(<EnterstellarDevTools />);

        // Container should be completely empty — no DOM nodes at all
        expect(container.innerHTML).toBe('');

        // No toggle button, no panel, no tabs — nothing
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('complementary')).toBeNull();
        expect(screen.queryByRole('tablist')).toBeNull();
    });

    // -------------------------------------------------------------------
    // Edge Cases
    // -------------------------------------------------------------------

    it('handles empty store gracefully (no traces)', () => {
        mockStoreTraces = [];

        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);

        // Should show empty state
        expect(screen.getByText(/no traces yet/i)).toBeDefined();

        // Export button should be disabled
        const exportButton = screen.getByLabelText('Export traces as JSON');
        expect(exportButton).toHaveAttribute('disabled');
    });

    it('handles full end-to-end flow: open → view traces → select → inspect → switch to validation', () => {
        mockStoreTraces = [
            createIntegrationTrace('flow-1', { component: 'FlowTest', status: 'fail' }),
        ];

        renderWithEnterstellar(<EnterstellarDevTools />);

        // Step 1: Open panel
        fireEvent.click(screen.getByRole('button', { name: /open enterstellar devtools/i }));
        expect(screen.getByText('⚡ Enterstellar DevTools')).toBeDefined();

        // Step 2: Verify trace in Timeline
        expect(screen.getAllByText('FlowTest').length).toBeGreaterThanOrEqual(1);

        // Step 3: Click trace → auto-switches to Inspector
        fireEvent.click(screen.getByRole('row'));
        const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
        expect(inspectorTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('flow-1')).toBeDefined();

        // Step 4: Switch to Validation Log
        const validationTab = screen.getByRole('tab', { name: 'Validation' });
        fireEvent.click(validationTab);
        expect(validationTab.getAttribute('aria-selected')).toBe('true');

        // Validation log should show the failed trace
        expect(screen.getAllByText('FlowTest').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/1 validation issue/i)).toBeDefined();
    });
});
