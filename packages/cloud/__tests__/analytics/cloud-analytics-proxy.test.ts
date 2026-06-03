/**
 * @module @enterstellar-ai/cloud/__tests__/analytics/cloud-analytics-proxy.test
 * @description Tests for the Cloud Analytics proxy.
 *
 * Covers:
 * - `analytics()` → `POST /v1/traces/analytics` (TA3, TA5).
 * - `businessAnalytics()` → `POST /v1/analytics/query` (TA10).
 * - POST method (not GET) for JSON body (F17).
 * - 30s operation timeout (F21).
 * - 5 IPU cost per invocation (§9.1).
 * - Pre-flight quota check throws `CloudError` (SD3).
 * - `CloudResult<AnalyticsResult>` return shape (SD7).
 *
 * @see Design Choice TA5 — fixed analytics query types.
 * @see Design Choice TA10 — Enterstellar Analytics (BI).
 * @see Audit Finding F17 — POST instead of GET for JSON body.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudAnalyticsProxy } from '../../src/analytics/cloud-analytics-proxy.js';
import type { CloudAnalyticsProxy } from '../../src/analytics/cloud-analytics-proxy.js';
import type { CloudHttpTransport } from '../../src/transport/cloud-http.js';
import type { IPUTracker } from '../../src/metering/ipu-tracker.js';
import { CloudError } from '../../src/errors.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockTransport(): CloudHttpTransport {
    return { request: vi.fn() };
}

function createMockTracker(overQuota = false): IPUTracker {
    return {
        record: vi.fn(),
        reconcile: vi.fn(),
        getEstimate: vi.fn().mockReturnValue({ used: 0, remaining: 1000, limit: 1000, lastReconciliationCorrected: false }),
        isOverQuota: vi.fn().mockReturnValue(overQuota),
        getLastIPUCost: vi.fn().mockReturnValue(undefined),
        reset: vi.fn(),
    };
}

const MOCK_ANALYTICS_RESULT = {
    rows: [
        { intent: 'show vitals', count: 42 },
        { intent: 'patient list', count: 18 },
    ],
    queryType: 'intent_patterns',
};

const MOCK_RESPONSE = {
    ok: true,
    statusCode: 200,
    data: MOCK_ANALYTICS_RESULT,
    ipuUsed: 15,
    ipuRemaining: 985,
    ipuCost: 5,
    requestId: 'req_analytics_01',
    error: null,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CloudAnalyticsProxy', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;
    let proxy: CloudAnalyticsProxy;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
        proxy = createCloudAnalyticsProxy(transport, tracker, false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // analytics() — Trace Analytics (TA3, TA5)
    // -----------------------------------------------------------------------

    describe('analytics() — Trace Analytics (TA3, TA5)', () => {
        it('returns CloudResult<AnalyticsResult> on success', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await proxy.analytics({
                queryType: 'intent_patterns',
                filters: { timeRange: '7d', limit: 100 },
            });

            expect(result.data.rows).toHaveLength(2);
            expect(result.data.queryType).toBe('intent_patterns');
            expect(result.ipu).toBeDefined();
            expect(result.ipu?.cost).toBe(5);
        });

        it('sends POST /v1/traces/analytics (F17)', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.analytics({ queryType: 'intent_patterns' });

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['method']).toBe('POST');
            expect(config['path']).toBe('/v1/traces/analytics');
        });

        it('uses 30s operation timeout (F21)', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.analytics({ queryType: 'intent_patterns' });

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['operationTimeout']).toBe(30_000);
        });

        it('sends ipuCost: 5', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.analytics({ queryType: 'component_performance' });

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['ipuCost']).toBe(5);
        });

        it('records 5 IPU in tracker', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.analytics({ queryType: 'intent_patterns' });

            expect(tracker.record).toHaveBeenCalledWith(5);
        });

        it('throws CloudError on pre-flight quota exceeded', async () => {
            const overQuotaProxy = createCloudAnalyticsProxy(
                transport, createMockTracker(true), false,
            );

            await expect(
                overQuotaProxy.analytics({ queryType: 'intent_patterns' }),
            ).rejects.toThrow(CloudError);

            expect(transport.request).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // businessAnalytics() — Business Intelligence (TA10)
    // -----------------------------------------------------------------------

    describe('businessAnalytics() — Business Intelligence (TA10)', () => {
        it('returns CloudResult<AnalyticsResult> on success', async () => {
            const biResponse = {
                ...MOCK_RESPONSE,
                data: { rows: [{ metric: 'dau', value: 1200 }], queryType: 'anomalies' },
            };
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(biResponse);

            const result = await proxy.businessAnalytics({ queryType: 'anomalies' });

            expect(result.data.rows).toHaveLength(1);
            expect(result.data.queryType).toBe('anomalies');
        });

        it('sends POST /v1/analytics/query', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.businessAnalytics({ queryType: 'anomalies' });

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['method']).toBe('POST');
            expect(config['path']).toBe('/v1/analytics/query');
        });

        it('sends ipuCost: 5 (same as trace analytics)', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.businessAnalytics({ queryType: 'anomalies' });

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['ipuCost']).toBe(5);
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode
    // -----------------------------------------------------------------------

    describe('Anonymous Mode', () => {
        it('returns ipu: null when isAnonymous = true', async () => {
            const anonProxy = createCloudAnalyticsProxy(transport, tracker, true);
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await anonProxy.analytics({ queryType: 'intent_patterns' });

            expect(result.ipu).toBeNull();
        });
    });
});
