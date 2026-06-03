/**
 * @module @enterstellar-ai/cloud/__tests__/inference/cloud-index-proxy.test
 * @description Tests for the Cloud Semantic Index proxy.
 *
 * Covers: returns `CloudResult<readonly SemanticSearchResult[]>` (SD7),
 * default topK=5 (SI5), pre-flight quota throws (SD3), anonymous mode
 * ipu=null (AG8), IPU reconciliation (CL1).
 *
 * @see Design Choice CL2 — cloud semantic search = 1 IPU.
 * @see Design Choice SI5 — default topK: 5.
 * @see Design Choice SD7 — universal return wrapper.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudIndexProxy } from '../../src/inference/cloud-index-proxy.js';
import type { CloudIndexProxy } from '../../src/inference/cloud-index-proxy.js';
import type { IPUTracker } from '../../src/metering/ipu-tracker.js';
import { IPU_COSTS } from '../../src/metering/ipu-costs.js';
import type { CloudHttpTransport } from '../../src/transport/cloud-http.js';
import type { CloudResponse } from '../../src/types.js';
import { CloudError } from '../../src/errors.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockTracker(overrides: Partial<IPUTracker> = {}): IPUTracker {
    return {
        record: vi.fn(),
        reconcile: vi.fn(),
        getEstimate: vi.fn().mockReturnValue({
            used: 0, remaining: null, limit: null, lastReconciliationCorrected: false,
        }),
        isOverQuota: vi.fn().mockReturnValue(false),
        getLastIPUCost: vi.fn().mockReturnValue(undefined),
        reset: vi.fn(),
        ...overrides,
    };
}

type SearchServerResponse = { readonly results: readonly { componentName: string; score: number }[] };

function successResponse(): CloudResponse<SearchServerResponse> {
    return {
        ok: true,
        statusCode: 200,
        data: { results: [{ componentName: 'VitalsCard', score: 0.95 }] },
        ipuUsed: 1,
        ipuRemaining: 999,
        ipuCost: 1,
        requestId: 'req_test_search',
        error: null,
    };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CloudIndexProxy', () => {
    let proxy: CloudIndexProxy;
    let tracker: IPUTracker;
    let transport: CloudHttpTransport;

    describe('Success Path', () => {
        beforeEach(() => {
            tracker = createMockTracker();
            transport = { request: vi.fn().mockResolvedValue(successResponse()) };
            proxy = createCloudIndexProxy(transport, tracker, false);
        });

        it('returns CloudResult with search results (SD7)', async () => {
            const result = await proxy.search('patient vitals');

            expect(result.data).toHaveLength(1);
            expect(result.ipu).not.toBeNull();
            expect(result.ipu?.cost).toBe(1);
        });

        it('uses default topK=5 (SI5)', async () => {
            await proxy.search('patient vitals');

            expect(transport.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.objectContaining({ topK: 5 }),
                }),
            );
        });

        it('accepts custom topK', async () => {
            await proxy.search('patient vitals', 10);

            expect(transport.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.objectContaining({ topK: 10 }),
                }),
            );
        });

        it('records 1 IPU on success (CL2)', async () => {
            await proxy.search('patient vitals');

            expect(tracker.record).toHaveBeenCalledWith(IPU_COSTS.SEMANTIC_SEARCH);
        });

        it('reconciles tracker with 3 args (CL1)', async () => {
            await proxy.search('patient vitals');

            expect(tracker.reconcile).toHaveBeenCalledWith(1, 999, 1);
        });

        it('sends POST /v1/semantic-search', async () => {
            await proxy.search('patient vitals');

            expect(transport.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    path: '/v1/semantic-search',
                    ipuCost: IPU_COSTS.SEMANTIC_SEARCH,
                }),
            );
        });
    });

    describe('Pre-Flight Quota (SD3)', () => {
        it('throws CloudError when over quota', async () => {
            tracker = createMockTracker({ isOverQuota: vi.fn().mockReturnValue(true) });
            transport = { request: vi.fn().mockResolvedValue(successResponse()) };
            proxy = createCloudIndexProxy(transport, tracker, false);

            await expect(proxy.search('test')).rejects.toThrow(CloudError);
            expect(transport.request).not.toHaveBeenCalled();
        });
    });

    describe('Anonymous Mode (AG8)', () => {
        it('returns ipu: null when isAnonymous=true', async () => {
            tracker = createMockTracker();
            transport = { request: vi.fn().mockResolvedValue(successResponse()) };
            proxy = createCloudIndexProxy(transport, tracker, true);

            const result = await proxy.search('test');

            expect(result.ipu).toBeNull();
        });
    });

    describe('IPU Reconciliation Edge Cases', () => {
        it('does NOT call reconcile when headers are missing', async () => {
            const noHeaderResp: CloudResponse<SearchServerResponse> = {
                ok: true, statusCode: 200,
                data: { results: [] },
                ipuUsed: undefined, ipuRemaining: undefined,
                ipuCost: undefined, requestId: undefined, error: null,
            };
            tracker = createMockTracker();
            transport = { request: vi.fn().mockResolvedValue(noHeaderResp) };
            proxy = createCloudIndexProxy(transport, tracker, false);

            await proxy.search('test');

            expect(tracker.reconcile).not.toHaveBeenCalled();
        });
    });
});
