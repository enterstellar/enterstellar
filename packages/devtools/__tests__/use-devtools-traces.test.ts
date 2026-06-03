/**
 * @module @enterstellar-ai/devtools/__tests__/use-devtools-traces
 * @description Unit tests for the DevTools trace hook, ring buffer, and filters.
 *
 * Tests cover:
 * - `extractZoneName()` — zone name extraction from trace IDs
 * - `applyTraceFilter()` — multi-field filtering logic
 * - `useDevtoolsTraces()` — ring buffer accumulation, store subscription
 *
 * @see Design Choice DT5 — 500 traces in memory
 * @see Design Choice DT7 — data via EnterstellarStore directly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import type { TraceFilter } from '../src/types.js';
import {
    extractZoneName,
    applyTraceFilter,
    useDevtoolsTraces,
} from '../src/use-devtools-traces.js';
import { createEnterstellarContextWrapper } from './helpers/context-wrapper.js';

// ---------------------------------------------------------------------------
// Mock @enterstellar-ai/react — preserves EnterstellarContext for useContext(EnterstellarContext)
// ---------------------------------------------------------------------------

/**
 * Controlled store traces array. Tests push fixtures here; the mock store's
 * `get('traces')` returns this array.
 */
const mockStoreTraces: ZoneTrace[] = [];

vi.mock('@enterstellar-ai/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@enterstellar-ai/react')>();
    return {
        ...actual,
    };
});

/**
 * Creates a test wrapper providing `EnterstellarContext.Provider` with a mock store.
 */
function createTestWrapper() {
    const { wrapper } = createEnterstellarContextWrapper(mockStoreTraces);
    return wrapper;
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `ZoneTrace` fixture for testing.
 *
 * @param overrides - Partial overrides for the trace fields.
 * @returns A complete `ZoneTrace` object.
 */
function createTrace(overrides: {
    readonly id: string;
    readonly component?: string;
    readonly status?: 'pass' | 'fail' | 'corrected';
}): ZoneTrace {
    return {
        id: overrides.id,
        timestamp: new Date().toISOString(),
        intent: {
            component: overrides.component ?? 'TestComponent',
            props: {},
            confidence: 0.95,
        },
        compilation: {
            status: overrides.status ?? 'pass',
            errors: overrides.status === 'fail'
                ? [{ code: 'ENS-2001', path: 'props.value', message: 'Invalid value' }]
                : [],
            selfCorrectionAttempts: overrides.status === 'corrected' ? 1 : 0,
        },
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: new Date().toISOString(),
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
// extractZoneName
// ---------------------------------------------------------------------------

describe('extractZoneName', () => {
    it('extracts zone name from zone-prefixed trace ID', () => {
        expect(extractZoneName('main-abc123')).toBe('main');
    });

    it('extracts zone name with multi-word kebab-case zone', () => {
        // Only the first segment before the first dash is the zone name
        expect(extractZoneName('patient-details-abc123')).toBe('patient');
    });

    it('returns full ID when no separator is present', () => {
        expect(extractZoneName('noseparator')).toBe('noseparator');
    });

    it('handles empty string', () => {
        expect(extractZoneName('')).toBe('');
    });
});

// ---------------------------------------------------------------------------
// applyTraceFilter
// ---------------------------------------------------------------------------

describe('applyTraceFilter', () => {
    const traces: readonly ZoneTrace[] = [
        createTrace({ id: 'main-1', component: 'PatientVitals', status: 'pass' }),
        createTrace({ id: 'main-2', component: 'MedicationList', status: 'fail' }),
        createTrace({ id: 'sidebar-3', component: 'AlertBanner', status: 'corrected' }),
        createTrace({ id: 'sidebar-4', component: 'PatientVitals', status: 'pass' }),
    ];

    it('returns all traces when no filter is active', () => {
        const filter: TraceFilter = {};
        expect(applyTraceFilter(traces, filter)).toEqual(traces);
    });

    it('filters by zone name', () => {
        const filter: TraceFilter = { zone: 'main' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toHaveLength(2);
        expect(result.every((t) => t.id.startsWith('main'))).toBe(true);
    });

    it('filters by component name', () => {
        const filter: TraceFilter = { component: 'PatientVitals' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toHaveLength(2);
        expect(result.every((t) => t.intent.component === 'PatientVitals')).toBe(true);
    });

    it('filters by compilation status', () => {
        const filter: TraceFilter = { status: 'fail' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toHaveLength(1);
        expect(result[0]?.intent.component).toBe('MedicationList');
    });

    it('filters by text search (case-insensitive)', () => {
        const filter: TraceFilter = { search: 'VITALS' };
        const result = applyTraceFilter(traces, filter);
        // Matches 'PatientVitals' component name (2 traces)
        expect(result).toHaveLength(2);
        expect(result.every((t) => t.intent.component === 'PatientVitals')).toBe(true);
    });

    it('text search matches component name', () => {
        const filter: TraceFilter = { search: 'alert' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toHaveLength(1);
        expect(result[0]?.intent.component).toBe('AlertBanner');
    });

    it('combines multiple filters with AND logic', () => {
        const filter: TraceFilter = { zone: 'sidebar', status: 'pass' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe('sidebar-4');
    });

    it('returns empty array when no traces match', () => {
        const filter: TraceFilter = { zone: 'nonexistent' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toHaveLength(0);
    });

    it('ignores empty search string', () => {
        const filter: TraceFilter = { search: '' };
        const result = applyTraceFilter(traces, filter);
        expect(result).toEqual(traces);
    });
});

// ---------------------------------------------------------------------------
// useDevtoolsTraces
// ---------------------------------------------------------------------------

describe('useDevtoolsTraces', () => {
    beforeEach(() => {
        mockStoreTraces.length = 0;
    });

    it('returns empty results when store has no traces', () => {
        const { result } = renderHook(() =>
            useDevtoolsTraces({}, 500),
            { wrapper: createTestWrapper() },
        );

        expect(result.current.allTraces).toEqual([]);
        expect(result.current.filteredTraces).toEqual([]);
        expect(result.current.availableZones).toEqual([]);
        expect(result.current.availableComponents).toEqual([]);
    });

    it('accumulates traces from the store', () => {
        mockStoreTraces.push(
            createTrace({ id: 'main-1', component: 'Card' }),
            createTrace({ id: 'main-2', component: 'List' }),
        );

        const { result } = renderHook(() =>
            useDevtoolsTraces({}, 500),
            { wrapper: createTestWrapper() },
        );

        expect(result.current.allTraces).toHaveLength(2);
    });

    it('extracts available zones from buffered traces', () => {
        mockStoreTraces.push(
            createTrace({ id: 'main-1' }),
            createTrace({ id: 'sidebar-2' }),
            createTrace({ id: 'main-3' }),
        );

        const { result } = renderHook(() =>
            useDevtoolsTraces({}, 500),
            { wrapper: createTestWrapper() },
        );

        expect(result.current.availableZones).toEqual(['main', 'sidebar']);
    });

    it('extracts available component names', () => {
        mockStoreTraces.push(
            createTrace({ id: 'z-1', component: 'Beta' }),
            createTrace({ id: 'z-2', component: 'Alpha' }),
            createTrace({ id: 'z-3', component: 'Beta' }),
        );

        const { result } = renderHook(() =>
            useDevtoolsTraces({}, 500),
            { wrapper: createTestWrapper() },
        );

        // Sorted alphabetically, deduplicated
        expect(result.current.availableComponents).toEqual(['Alpha', 'Beta']);
    });

    it('applies filters to buffered traces', () => {
        mockStoreTraces.push(
            createTrace({ id: 'main-1', status: 'pass' }),
            createTrace({ id: 'main-2', status: 'fail' }),
        );

        const { result } = renderHook(() =>
            useDevtoolsTraces({ status: 'fail' }, 500),
            { wrapper: createTestWrapper() },
        );

        expect(result.current.filteredTraces).toHaveLength(1);
        expect(result.current.allTraces).toHaveLength(2);
    });

    it('enforces ring buffer max size', () => {
        for (let i = 0; i < 10; i++) {
            mockStoreTraces.push(createTrace({ id: `z-${String(i)}` }));
        }

        const { result } = renderHook(() =>
            useDevtoolsTraces({}, 5),
            { wrapper: createTestWrapper() },
        );

        expect(result.current.allTraces).toHaveLength(5);
        // Should keep the latest 5 traces (evict oldest)
        expect(result.current.allTraces[0]?.id).toBe('z-5');
        expect(result.current.allTraces[4]?.id).toBe('z-9');
    });
});
