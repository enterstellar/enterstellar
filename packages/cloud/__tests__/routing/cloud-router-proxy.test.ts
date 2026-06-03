/**
 * @module @enterstellar-ai/cloud/__tests__/routing/cloud-router-proxy.test
 * @description Tests for the Cloud Router proxy.
 *
 * Covers:
 * - Single `route()` returns `CloudResult<RouterPrediction>` (IR2).
 * - `routeBatch()` returns `CloudResult<readonly RouterPrediction[]>` (IR5).
 * - Batch ordering invariant: `data[i]` ↔ `intentHashes[i]` (F19).
 * - IPU cost: 1 per single route, N per batch.
 * - Pre-flight quota check throws `CloudError` (SD3).
 * - IPU tracker reconciliation on success.
 * - `ipu` is `null` when `isAnonymous = true`.
 *
 * @see Design Choice IR2 — router prediction response shape.
 * @see Design Choice IR5 — batch routing for pre-rendering.
 * @see Audit Finding F19 — batch ordering invariant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudRouterProxy } from '../../src/routing/cloud-router-proxy.js';
import type { CloudRouterProxy } from '../../src/routing/cloud-router-proxy.js';
import type { CloudHttpTransport } from '../../src/transport/cloud-http.js';
import type { IPUTracker } from '../../src/metering/ipu-tracker.js';
import type { RouterPrediction } from '../../src/types.js';
import { CloudError } from '../../src/errors.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockTransport(): CloudHttpTransport {
    return {
        request: vi.fn(),
    };
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

const MOCK_PREDICTION: RouterPrediction = {
    predictions: [
        { componentName: 'VitalsCard', confidence: 0.92, registryUrl: 'https://registry.enterstellar.dev/vitals-card' },
        { componentName: 'MetricsPanel', confidence: 0.45 },
    ],
    metadata: { modelVersion: 'freq-v1', signalCount: 1200 },
};

const MOCK_RESPONSE = {
    ok: true,
    statusCode: 200,
    data: MOCK_PREDICTION,
    ipuUsed: 10,
    ipuRemaining: 990,
    ipuCost: 1,
    requestId: 'req_route_01',
    error: null,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CloudRouterProxy', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;
    let proxy: CloudRouterProxy;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
        proxy = createCloudRouterProxy(transport, tracker, false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // route() — Single Intent (IR2)
    // -----------------------------------------------------------------------

    describe('route() — Single Intent (IR2)', () => {
        it('returns CloudResult<RouterPrediction> on success', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await proxy.route('a1b2c3d4e5f6');

            expect(result.data).toEqual(MOCK_PREDICTION);
            expect(result.ipu).toBeDefined();
            expect(result.ipu?.cost).toBe(1);
        });

        it('sends POST /v1/route with intentHash in body', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.route('abcdef123456');

            const requestConfig = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(requestConfig['method']).toBe('POST');
            expect(requestConfig['path']).toBe('/v1/route');
            expect(requestConfig['body']).toEqual({ intentHash: 'abcdef123456' });
            expect(requestConfig['ipuCost']).toBe(1);
        });

        it('records 1 IPU in tracker after success', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.route('abcdef');

            expect(tracker.record).toHaveBeenCalledWith(1);
        });

        it('reconciles tracker with server headers', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await proxy.route('abcdef');

            expect(tracker.reconcile).toHaveBeenCalledWith(10, 990, 1);
        });

        it('throws CloudError on pre-flight quota exceeded', async () => {
            const overQuotaTracker = createMockTracker(true);
            const quotaProxy = createCloudRouterProxy(transport, overQuotaTracker, false);

            await expect(quotaProxy.route('abcdef')).rejects.toThrow(CloudError);

            // Transport should NOT be called.
            expect(transport.request).not.toHaveBeenCalled();
        });

        it('returns empty predictions for unknown intent (IR3)', async () => {
            const emptyResponse = {
                ...MOCK_RESPONSE,
                data: null,
            };
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(emptyResponse);

            const result = await proxy.route('unknown_hash');

            expect(result.data.predictions).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // routeBatch() — Batch Routing (IR5)
    // -----------------------------------------------------------------------

    describe('routeBatch() — Batch Routing (IR5)', () => {
        const BATCH_HASHES = ['hash_a', 'hash_b', 'hash_c'] as const;

        const BATCH_PREDICTIONS: readonly RouterPrediction[] = [
            { predictions: [{ componentName: 'CardA', confidence: 0.9 }], metadata: { modelVersion: 'freq-v1', signalCount: 100 } },
            { predictions: [{ componentName: 'CardB', confidence: 0.8 }], metadata: { modelVersion: 'freq-v1', signalCount: 200 } },
            { predictions: [{ componentName: 'CardC', confidence: 0.7 }], metadata: { modelVersion: 'freq-v1', signalCount: 300 } },
        ];

        const BATCH_RESPONSE = {
            ...MOCK_RESPONSE,
            data: BATCH_PREDICTIONS,
            ipuCost: 3,
        };

        it('returns CloudResult<readonly RouterPrediction[]> on success', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(BATCH_RESPONSE);

            const result = await proxy.routeBatch(BATCH_HASHES);

            expect(result.data).toHaveLength(3);
            expect(result.data[0]?.predictions[0]?.componentName).toBe('CardA');
            expect(result.data[2]?.predictions[0]?.componentName).toBe('CardC');
        });

        it('preserves input order (F19): data[i] ↔ intentHashes[i]', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(BATCH_RESPONSE);

            const result = await proxy.routeBatch(BATCH_HASHES);

            // Verify order matches.
            for (let i = 0; i < BATCH_HASHES.length; i++) {
                const prediction = result.data[i];
                const expected = BATCH_PREDICTIONS[i];
                expect(prediction?.predictions[0]?.componentName)
                    .toBe(expected?.predictions[0]?.componentName);
            }
        });

        it('sends POST /v1/route/batch with dynamic IPU cost = N × 1', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(BATCH_RESPONSE);

            await proxy.routeBatch(BATCH_HASHES);

            const requestConfig = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(requestConfig['method']).toBe('POST');
            expect(requestConfig['path']).toBe('/v1/route/batch');
            expect(requestConfig['body']).toEqual({ intentHashes: BATCH_HASHES });
            expect(requestConfig['ipuCost']).toBe(3); // 3 intents × 1 IPU
        });

        it('records batch cost in tracker', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(BATCH_RESPONSE);

            await proxy.routeBatch(BATCH_HASHES);

            expect(tracker.record).toHaveBeenCalledWith(3);
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode
    // -----------------------------------------------------------------------

    describe('Anonymous Mode', () => {
        it('returns ipu: null when isAnonymous = true', async () => {
            const anonProxy = createCloudRouterProxy(transport, tracker, true);
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await anonProxy.route('abcdef');

            expect(result.ipu).toBeNull();
        });
    });
});
