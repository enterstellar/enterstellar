/**
 * @module @enterstellar-ai/cloud/__tests__/inference/cloud-forge-proxy.test
 * @description Tests for the Cloud Forge proxy — dual API (SD6).
 *
 * Covers: Promise API returns `CloudResult<ComponentContract>` (SD7),
 * stream API yields `ForgeFragment` sequence, pre-flight quota throws
 * `CloudError` (SD3), transport errors propagate, `ipu` is `null` when
 * anonymous (AG8), IPU reconciliation from headers (CL1).
 *
 * @see Design Choice SD6 — dual API: `forge()` + `forge.stream()`.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Design Choice CL2 — CloudForge = 10 IPU.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudForgeProxy } from '../../src/inference/cloud-forge-proxy.js';
import type { CloudForgeProxy } from '../../src/inference/cloud-forge-proxy.js';
import type { IPUTracker } from '../../src/metering/ipu-tracker.js';
import { IPU_COSTS } from '../../src/metering/ipu-costs.js';
import type { CloudHttpTransport } from '../../src/transport/cloud-http.js';
import type { CloudSSETransport } from '../../src/transport/cloud-sse.js';
import type { CloudResponse, ForgeFragment } from '../../src/types.js';
import type { ComponentContract } from '@enterstellar-ai/types';
import { CloudError } from '../../src/errors.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Minimal valid ComponentContract for testing. */
const TEST_CONTRACT: ComponentContract = {
    name: 'VitalsCard',
    type: 'component',
    version: '1.0.0',
} as ComponentContract;

/** Creates a mock IPUTracker with spy methods. */
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

/** Creates a mock CloudHttpTransport. */
function createMockTransport(
    response: CloudResponse<ComponentContract>,
): CloudHttpTransport {
    return {
        request: vi.fn().mockResolvedValue(response),
    };
}

/** Creates a mock CloudSSETransport. */
function createMockSSETransport(
    fragments: ForgeFragment[] = [],
): CloudSSETransport {
    return {
        stream: vi.fn().mockReturnValue((async function* (): AsyncGenerator<ForgeFragment, void, undefined> {
            for (const f of fragments) {
                yield f;
            }
        })()),
    };
}

/** Builds a successful CloudResponse. */
function successResponse(): CloudResponse<ComponentContract> {
    return {
        ok: true,
        statusCode: 200,
        data: TEST_CONTRACT,
        ipuUsed: 42,
        ipuRemaining: 958,
        ipuCost: 10,
        requestId: 'req_test_forge',
        error: null,
    };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CloudForgeProxy', () => {
    let proxy: CloudForgeProxy;
    let tracker: IPUTracker;
    let transport: CloudHttpTransport;
    let sseTransport: CloudSSETransport;

    // -----------------------------------------------------------------------
    // Promise API — Success
    // -----------------------------------------------------------------------

    describe('Promise API — Success', () => {
        beforeEach(() => {
            tracker = createMockTracker();
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');
        });

        it('returns CloudResult<ComponentContract> on success (SD7)', async () => {
            const result = await proxy.forge({ intent: 'patient vitals' });

            expect(result.data).toEqual(TEST_CONTRACT);
            expect(result.ipu).not.toBeNull();
            expect(result.ipu?.used).toBe(42);
            expect(result.ipu?.remaining).toBe(958);
            expect(result.ipu?.cost).toBe(10);
        });

        it('records 10 IPU on success (CL2)', async () => {
            await proxy.forge({ intent: 'patient vitals' });

            expect(tracker.record).toHaveBeenCalledWith(IPU_COSTS.FORGE);
        });

        it('reconciles tracker from response headers (CL1)', async () => {
            await proxy.forge({ intent: 'patient vitals' });

            expect(tracker.reconcile).toHaveBeenCalledWith(42, 958, 10);
        });

        it('sends POST /v1/forge with correct body', async () => {
            await proxy.forge({ intent: 'patient vitals', constraints: { maxProps: 5 } });

            expect(transport.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    path: '/v1/forge',
                    ipuCost: IPU_COSTS.FORGE,
                }),
            );
        });
    });

    // -----------------------------------------------------------------------
    // Promise API — Pre-Flight Quota (SD3)
    // -----------------------------------------------------------------------

    describe('Pre-Flight Quota (SD3)', () => {
        it('throws CloudError when over quota — not returns degraded', async () => {
            tracker = createMockTracker({ isOverQuota: vi.fn().mockReturnValue(true) });
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');

            await expect(proxy.forge({ intent: 'test' })).rejects.toThrow(CloudError);
        });

        it('does NOT make a network call when over quota', async () => {
            tracker = createMockTracker({ isOverQuota: vi.fn().mockReturnValue(true) });
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');

            try { await proxy.forge({ intent: 'test' }); } catch { /* expected */ }

            expect(transport.request).not.toHaveBeenCalled();
        });

        it('does NOT charge IPU when over quota', async () => {
            tracker = createMockTracker({ isOverQuota: vi.fn().mockReturnValue(true) });
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');

            try { await proxy.forge({ intent: 'test' }); } catch { /* expected */ }

            expect(tracker.record).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode (AG8)
    // -----------------------------------------------------------------------

    describe('Anonymous Mode (AG8)', () => {
        it('returns ipu: null when isAnonymous=true', async () => {
            tracker = createMockTracker();
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, true, 'app');

            const result = await proxy.forge({ intent: 'test' });

            expect(result.ipu).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Stream API (SD6)
    // -----------------------------------------------------------------------

    describe('Stream API (SD6)', () => {
        it('yields ForgeFragment sequence from SSE transport', async () => {
            const fragments: ForgeFragment[] = [
                { type: 'meta', data: { provider: 'openai', model: 'gpt-4o' }, ipu: null },
                { type: 'node', data: { name: 'VitalsCard' } as Partial<ComponentContract> },
                { type: 'complete', data: TEST_CONTRACT, ipu: null },
            ];

            tracker = createMockTracker();
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport(fragments);
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');

            const collected: ForgeFragment[] = [];
            for await (const f of proxy.stream({ intent: 'vitals' })) {
                collected.push(f);
            }

            expect(collected).toHaveLength(3);
            expect(collected[0]?.type).toBe('meta');
            expect(collected[1]?.type).toBe('node');
            expect(collected[2]?.type).toBe('complete');
        });

        it('throws CloudError on pre-flight quota for stream', async () => {
            tracker = createMockTracker({ isOverQuota: vi.fn().mockReturnValue(true) });
            transport = createMockTransport(successResponse());
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');

            const gen = proxy.stream({ intent: 'test' });

            await expect(gen.next()).rejects.toThrow(CloudError);
        });
    });

    // -----------------------------------------------------------------------
    // IPU Reconciliation Edge Cases
    // -----------------------------------------------------------------------

    describe('IPU Reconciliation', () => {
        it('does NOT call reconcile when headers are missing', async () => {
            const noHeaderResponse: CloudResponse<ComponentContract> = {
                ok: true,
                statusCode: 200,
                data: TEST_CONTRACT,
                ipuUsed: undefined,
                ipuRemaining: undefined,
                ipuCost: undefined,
                requestId: undefined,
                error: null,
            };
            tracker = createMockTracker();
            transport = createMockTransport(noHeaderResponse);
            sseTransport = createMockSSETransport();
            proxy = createCloudForgeProxy(transport, sseTransport, tracker, false, 'app');

            await proxy.forge({ intent: 'test' });

            expect(tracker.reconcile).not.toHaveBeenCalled();
        });
    });
});
