/**
 * @module @enterstellar-ai/cloud/__tests__/operations/operations.test
 * @description Tests for operations proxies: certify, deleteProjectData,
 * getTraces, getLedger.
 *
 * Covers:
 * - `certify()`: 20 IPU, 90s timeout, `CertifyResult` shape (GI5, CR6).
 * - `deleteProjectData()`: 0 IPU, DELETE method, fire-and-forget (AG9, F16).
 * - `getTraces()`: 0 IPU, GET with query params, pagination (TracePage).
 * - `getLedger()`: 0 IPU, GET with query params, pagination (LedgerPage).
 *
 * @see Design Choice GI5 — certification lifecycle.
 * @see Design Choice CR6 — certification costs 20 IPU.
 * @see Design Choice AG9 — two-phase delete.
 * @see Design Choice AM13 — IPU ledger exposure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCertifyProxy } from '../../src/operations/certify-proxy.js';
import { createDataDeletionProxy } from '../../src/operations/data-deletion-proxy.js';
import { createTracesQueryProxy } from '../../src/operations/traces-query-proxy.js';
import { createLedgerQueryProxy } from '../../src/operations/ledger-query-proxy.js';
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

function mockOkResponse(data: unknown, ipuCost = 0): Record<string, unknown> {
    return {
        ok: true,
        statusCode: 200,
        data,
        ipuUsed: 50,
        ipuRemaining: 950,
        ipuCost,
        requestId: 'req_ops_01',
        error: null,
    };
}

// ---------------------------------------------------------------------------
// certify()
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CertifyProxy', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns CloudResult<CertifyResult> with status=pending (GI5)', async () => {
        const certifyData = { status: 'pending', pollUrl: '/v1/contracts/comp_01HYX/certify' };
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(certifyData, 20),
        );

        const proxy = createCertifyProxy(transport, tracker, false);
        const result = await proxy.certify('comp_01HYX');

        expect(result.data.status).toBe('pending');
        expect(result.data.pollUrl).toContain('/v1/contracts/comp_01HYX');
    });

    it('sends POST with 20 IPU cost (CR6) and 90s timeout (F21)', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ status: 'pending', pollUrl: '/v1/contracts/comp_01' }, 20),
        );

        const proxy = createCertifyProxy(transport, tracker, false);
        await proxy.certify('comp_01');

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['method']).toBe('POST');
        expect(config['ipuCost']).toBe(20);
        expect(config['operationTimeout']).toBe(90_000);
    });

    it('encodes contractId in URL path', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ status: 'pending', pollUrl: '' }, 20),
        );

        const proxy = createCertifyProxy(transport, tracker, false);
        await proxy.certify('comp/special&id');

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        const path = config['path'] as string;
        expect(path).toContain(encodeURIComponent('comp/special&id'));
    });

    it('records 20 IPU in tracker', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ status: 'pending', pollUrl: '' }, 20),
        );

        const proxy = createCertifyProxy(transport, tracker, false);
        await proxy.certify('comp_01');

        expect(tracker.record).toHaveBeenCalledWith(20);
    });

    it('throws CloudError on pre-flight quota exceeded — critical at 20 IPU', async () => {
        const overQuotaTracker = createMockTracker(true);
        const proxy = createCertifyProxy(transport, overQuotaTracker, false);

        await expect(proxy.certify('comp_01')).rejects.toThrow(CloudError);
        expect(transport.request).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// deleteProjectData()
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — DataDeletionProxy', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns CloudResult<{ accepted: true }> on 202 (F16)', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ accepted: true }),
        );

        const proxy = createDataDeletionProxy(transport, tracker, false);
        const result = await proxy.deleteProjectData('proj_01HYX');

        expect(result.data.accepted).toBe(true);
    });

    it('sends DELETE /v1/project/{projectId}/data with 0 IPU', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ accepted: true }),
        );

        const proxy = createDataDeletionProxy(transport, tracker, false);
        await proxy.deleteProjectData('proj_01HYX');

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['method']).toBe('DELETE');
        expect(config['path']).toBe('/v1/project/proj_01HYX/data');
        expect(config['ipuCost']).toBe(0);
    });

    it('does NOT call tracker.isOverQuota — deletion is free', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ accepted: true }),
        );

        const proxy = createDataDeletionProxy(transport, tracker, false);
        await proxy.deleteProjectData('proj_01');

        expect(tracker.isOverQuota).not.toHaveBeenCalled();
    });

    it('encodes projectId in URL path', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse({ accepted: true }),
        );

        const proxy = createDataDeletionProxy(transport, tracker, false);
        await proxy.deleteProjectData('proj/with&special');

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        const path = config['path'] as string;
        expect(path).toContain(encodeURIComponent('proj/with&special'));
    });
});

// ---------------------------------------------------------------------------
// getTraces()
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — TracesQueryProxy', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const MOCK_TRACE_PAGE = {
        items: [{ id: 'trace_01' }, { id: 'trace_02' }],
        cursor: 'cur_abc123',
        hasMore: true,
    };

    it('returns CloudResult<TracePage> with pagination', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_TRACE_PAGE),
        );

        const proxy = createTracesQueryProxy(transport, tracker, false);
        const result = await proxy.getTraces({ limit: 20 });

        expect(result.data.items).toHaveLength(2);
        expect(result.data.cursor).toBe('cur_abc123');
        expect(result.data.hasMore).toBe(true);
    });

    it('sends GET /v1/traces with query params', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_TRACE_PAGE),
        );

        const proxy = createTracesQueryProxy(transport, tracker, false);
        await proxy.getTraces({
            cursor: 'cur_prev',
            limit: 50,
            correlationId: 'corr_01',
            threadId: 'thread_01',
        });

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['method']).toBe('GET');
        const path = config['path'] as string;
        expect(path).toContain('/v1/traces');
        expect(path).toContain('cursor=cur_prev');
        expect(path).toContain('limit=50');
        expect(path).toContain('correlation_id=corr_01');
        expect(path).toContain('thread_id=thread_01');
    });

    it('sends GET /v1/traces without query params when no options', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_TRACE_PAGE),
        );

        const proxy = createTracesQueryProxy(transport, tracker, false);
        await proxy.getTraces();

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['path']).toBe('/v1/traces');
    });

    it('sends ipuCost: 0 — reading traces is free', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_TRACE_PAGE),
        );

        const proxy = createTracesQueryProxy(transport, tracker, false);
        await proxy.getTraces();

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['ipuCost']).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getLedger()
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — LedgerQueryProxy', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const MOCK_LEDGER_PAGE = {
        items: [
            { operation: 'forge', ipu_cost: 10, timestamp: '2026-03-29T00:00:00Z', request_id: 'req_01' },
        ],
        cursor: 'led_cur_01',
        hasMore: false,
    };

    it('returns CloudResult<LedgerPage> with pagination', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_LEDGER_PAGE),
        );

        const proxy = createLedgerQueryProxy(transport, tracker, false);
        const result = await proxy.getLedger({ limit: 50 });

        expect(result.data.items).toHaveLength(1);
        expect(result.data.cursor).toBe('led_cur_01');
        expect(result.data.hasMore).toBe(false);
    });

    it('sends GET /v1/usage/ledger with query params', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_LEDGER_PAGE),
        );

        const proxy = createLedgerQueryProxy(transport, tracker, false);
        await proxy.getLedger({ cursor: 'prev_cursor', limit: 25 });

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['method']).toBe('GET');
        const path = config['path'] as string;
        expect(path).toContain('/v1/usage/ledger');
        expect(path).toContain('cursor=prev_cursor');
        expect(path).toContain('limit=25');
    });

    it('sends ipuCost: 0 — billing transparency is free', async () => {
        (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockOkResponse(MOCK_LEDGER_PAGE),
        );

        const proxy = createLedgerQueryProxy(transport, tracker, false);
        await proxy.getLedger();

        const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
        expect(config['ipuCost']).toBe(0);
    });
});
