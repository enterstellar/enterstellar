/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/analyze-traces
 * @description Unit tests for `executeAnalyzeTraces()`.
 *
 * Verifies the `enterstellar_analyze_traces` MCP tool:
 * - Store dependency validation.
 * - GroupBy dimension validation.
 * - Time range filtering (keywords and ISO 8601).
 * - Aggregation logic (count, avgLatencyMs, successRate).
 * - Group sorting by count descending.
 *
 * Uses a mock `AgentSDKStore` injected as a parameter.
 *
 * @see Design Choice AS5 — local traces from `EnterstellarStore`.
 * @see Error ENS-8005 — trace analysis failures.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { AgentSDKStore } from '../../src/types.js';
import { executeAnalyzeTraces } from '../../src/tools/analyze-traces.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal trace object matching `AnalyzableTrace` shape.
 */
function createTrace(overrides: {
    timestamp?: string;
    component?: string;
    zone?: string;
    status?: string;
    strategy?: string;
    totalMs?: number;
} = {}): Record<string, unknown> {
    return {
        timestamp: overrides.timestamp ?? new Date().toISOString(),
        resolution: {
            strategy: overrides.strategy ?? 'exact',
            resolvedComponent: overrides.component ?? 'PatientVitals',
        },
        compilation: {
            status: overrides.status ?? 'pass',
        },
        determinism: {
            zone: overrides.zone ?? 'main',
        },
        metrics: {
            totalMs: overrides.totalMs ?? 50,
        },
    };
}

/**
 * Creates a mock `AgentSDKStore` populated with given traces.
 */
function createMockStore(
    traces: readonly Record<string, unknown>[] = [],
): AgentSDKStore {
    return {
        get: vi.fn().mockReturnValue(traces) as AgentSDKStore['get'],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeAnalyzeTraces', () => {
    // -----------------------------------------------------------------------
    // Dependency validation
    // -----------------------------------------------------------------------

    describe('dependency validation', () => {
        it('throws ENS-8005 when store is undefined', async () => {
            try {
                await executeAnalyzeTraces(undefined, 'all', 'component');
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8005');
                expect(enterstellarError.module).toBe('agent-sdk');
                expect(enterstellarError.recoverable).toBe(true);
                expect(enterstellarError.message).toContain('EnterstellarStore');
            }
        });
    });

    // -----------------------------------------------------------------------
    // GroupBy validation
    // -----------------------------------------------------------------------

    describe('groupBy validation', () => {
        it('throws ENS-8005 for invalid groupBy', async () => {
            const store = createMockStore();

            try {
                await executeAnalyzeTraces(store, 'all', 'invalid');
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8005');
                expect(enterstellarError.message).toContain('invalid');
            }
        });

        it('accepts component as valid groupBy', async () => {
            const store = createMockStore([]);
            const result = await executeAnalyzeTraces(store, 'all', 'component');
            expect(result.groupBy).toBe('component');
        });

        it('accepts zone as valid groupBy', async () => {
            const store = createMockStore([]);
            const result = await executeAnalyzeTraces(store, 'all', 'zone');
            expect(result.groupBy).toBe('zone');
        });

        it('accepts status as valid groupBy', async () => {
            const store = createMockStore([]);
            const result = await executeAnalyzeTraces(store, 'all', 'status');
            expect(result.groupBy).toBe('status');
        });

        it('accepts strategy as valid groupBy', async () => {
            const store = createMockStore([]);
            const result = await executeAnalyzeTraces(store, 'all', 'strategy');
            expect(result.groupBy).toBe('strategy');
        });
    });

    // -----------------------------------------------------------------------
    // Time range filtering
    // -----------------------------------------------------------------------

    describe('time range filtering', () => {
        it('returns all traces for timeRange "all"', async () => {
            const traces = [
                createTrace({ component: 'A' }),
                createTrace({ component: 'B' }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'all', 'component');

            expect(result.totalTraces).toBe(2);
        });

        it('filters traces by "last-hour" time range', async () => {
            const now = Date.now();
            const traces = [
                createTrace({ component: 'Recent', timestamp: new Date(now - 30 * 60 * 1000).toISOString() }),
                createTrace({ component: 'Old', timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString() }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'last-hour', 'component');

            expect(result.totalTraces).toBe(1);
            expect(result.groups[0]?.key).toBe('Recent');
        });

        it('filters traces by "last-day" time range', async () => {
            const now = Date.now();
            const traces = [
                createTrace({ component: 'Recent', timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString() }),
                createTrace({ component: 'Old', timestamp: new Date(now - 48 * 60 * 60 * 1000).toISOString() }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'last-day', 'component');

            expect(result.totalTraces).toBe(1);
            expect(result.groups[0]?.key).toBe('Recent');
        });
    });

    // -----------------------------------------------------------------------
    // Empty traces
    // -----------------------------------------------------------------------

    describe('empty traces', () => {
        it('returns totalTraces: 0 and empty groups for no traces', async () => {
            const store = createMockStore([]);

            const result = await executeAnalyzeTraces(store, 'all', 'component');

            expect(result.totalTraces).toBe(0);
            expect(result.groups).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // Aggregation logic
    // -----------------------------------------------------------------------

    describe('aggregation', () => {
        it('groups traces by component name', async () => {
            const traces = [
                createTrace({ component: 'PatientVitals', totalMs: 40 }),
                createTrace({ component: 'PatientVitals', totalMs: 60 }),
                createTrace({ component: 'MedicationList', totalMs: 100 }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'all', 'component');

            expect(result.groups).toHaveLength(2);

            const pvGroup = result.groups.find((g) => g.key === 'PatientVitals');
            expect(pvGroup?.count).toBe(2);
            expect(pvGroup?.avgLatencyMs).toBe(50); // (40+60)/2

            const mlGroup = result.groups.find((g) => g.key === 'MedicationList');
            expect(mlGroup?.count).toBe(1);
        });

        it('groups traces by compilation status', async () => {
            const traces = [
                createTrace({ status: 'pass' }),
                createTrace({ status: 'pass' }),
                createTrace({ status: 'fail' }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'all', 'status');

            expect(result.groups).toHaveLength(2);
            const passGroup = result.groups.find((g) => g.key === 'pass');
            expect(passGroup?.count).toBe(2);
        });

        it('calculates success rate correctly', async () => {
            const traces = [
                createTrace({ component: 'A', status: 'pass' }),
                createTrace({ component: 'A', status: 'pass' }),
                createTrace({ component: 'A', status: 'fail' }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'all', 'component');

            const group = result.groups[0];
            expect(group?.successRate).toBeCloseTo(2 / 3, 5);
        });

        it('sorts groups by count descending', async () => {
            const traces = [
                createTrace({ component: 'A' }),
                createTrace({ component: 'B' }),
                createTrace({ component: 'B' }),
                createTrace({ component: 'C' }),
                createTrace({ component: 'C' }),
                createTrace({ component: 'C' }),
            ];
            const store = createMockStore(traces);

            const result = await executeAnalyzeTraces(store, 'all', 'component');

            expect(result.groups[0]?.key).toBe('C');
            expect(result.groups[0]?.count).toBe(3);
            expect(result.groups[1]?.key).toBe('B');
            expect(result.groups[1]?.count).toBe(2);
            expect(result.groups[2]?.key).toBe('A');
            expect(result.groups[2]?.count).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Response shape
    // -----------------------------------------------------------------------

    describe('response shape', () => {
        it('returns correct timeRange and groupBy in response', async () => {
            const store = createMockStore([]);

            const result = await executeAnalyzeTraces(store, 'last-hour', 'strategy');

            expect(result.timeRange).toBe('last-hour');
            expect(result.groupBy).toBe('strategy');
        });
    });
});
