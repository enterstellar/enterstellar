/**
 * @module @enterstellar-ai/cloud/__tests__/signals/signal-submitter.test
 * @description Tests for the Cloud Signal submitter.
 *
 * Covers:
 * - `submitSignal()` returns `CloudResult<{ accepted: boolean }>` (SD7).
 * - 0 IPU cost — no idempotency key (F8).
 * - No pre-flight quota check — signals are free.
 * - `sessionType` included in request body (D111).
 * - Works in anonymous mode (SD1) — no throw.
 * - Tracker reconciles but does NOT record cost.
 *
 * @see Design Choice SD1 — anonymous mode: only `submitSignal()` available.
 * @see Design Choice SD4 — `@enterstellar-ai/telemetry` uses SDK with `pk_anon`.
 * @see Principle L12 — ForgeSignal is mandatory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSignalSubmitter } from '../../src/signals/signal-submitter.js';
import type { SignalSubmitter } from '../../src/signals/signal-submitter.js';
import type { CloudHttpTransport } from '../../src/transport/cloud-http.js';
import type { IPUTracker } from '../../src/metering/ipu-tracker.js';
import type { ForgeSignal } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockTransport(): CloudHttpTransport {
    return { request: vi.fn() };
}

function createMockTracker(): IPUTracker {
    return {
        record: vi.fn(),
        reconcile: vi.fn(),
        getEstimate: vi.fn().mockReturnValue({ used: 0, remaining: 1000, limit: 1000, lastReconciliationCorrected: false }),
        isOverQuota: vi.fn().mockReturnValue(false),
        getLastIPUCost: vi.fn().mockReturnValue(undefined),
        reset: vi.fn(),
    };
}

const MOCK_SIGNAL: ForgeSignal = {
    intentHash: 'sha256_abc123',
    componentName: 'VitalsCard',
    resolved: true,
    timestamp: Date.now(),
} as ForgeSignal;

const MOCK_RESPONSE = {
    ok: true,
    statusCode: 200,
    data: { accepted: true },
    ipuUsed: 0,
    ipuRemaining: 1000,
    ipuCost: 0,
    requestId: 'req_signal_01',
    error: null,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — SignalSubmitter', () => {
    let transport: CloudHttpTransport;
    let tracker: IPUTracker;
    let submitter: SignalSubmitter;

    beforeEach(() => {
        transport = createMockTransport();
        tracker = createMockTracker();
        submitter = createSignalSubmitter(transport, tracker, false, 'app');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Success Path
    // -----------------------------------------------------------------------

    describe('Success Path', () => {
        it('returns CloudResult<{ accepted: boolean }> on success', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await submitter.submitSignal(MOCK_SIGNAL);

            expect(result.data.accepted).toBe(true);
        });

        it('sends POST /v1/signals with signal data + sessionType', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await submitter.submitSignal(MOCK_SIGNAL);

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['method']).toBe('POST');
            expect(config['path']).toBe('/v1/signals');

            const body = config['body'] as Record<string, unknown>;
            expect(body['sessionType']).toBe('app');
        });

        it('sends ipuCost: 0 — no idempotency key (F8)', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await submitter.submitSignal(MOCK_SIGNAL);

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['ipuCost']).toBe(0);
        });

        it('does NOT call tracker.record — signals are free', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await submitter.submitSignal(MOCK_SIGNAL);

            expect(tracker.record).not.toHaveBeenCalled();
        });

        it('does NOT call tracker.isOverQuota — no pre-flight check', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await submitter.submitSignal(MOCK_SIGNAL);

            expect(tracker.isOverQuota).not.toHaveBeenCalled();
        });

        it('reconciles tracker when server provides headers', async () => {
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            await submitter.submitSignal(MOCK_SIGNAL);

            expect(tracker.reconcile).toHaveBeenCalledWith(0, 1000, 0);
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode (SD1, SD4)
    // -----------------------------------------------------------------------

    describe('Anonymous Mode (SD1, SD4)', () => {
        it('works in anonymous mode — no throw', async () => {
            const anonSubmitter = createSignalSubmitter(
                transport, tracker, true, 'app',
            );
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await anonSubmitter.submitSignal(MOCK_SIGNAL);

            // No CloudError thrown — signal submission works for pk_anon.
            expect(result.data.accepted).toBe(true);
        });

        it('returns ipu: null in anonymous mode (AG8)', async () => {
            const anonSubmitter = createSignalSubmitter(
                transport, tracker, true, 'app',
            );
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);

            const result = await anonSubmitter.submitSignal(MOCK_SIGNAL);

            expect(result.ipu).toBeNull();
        });
    });
});
