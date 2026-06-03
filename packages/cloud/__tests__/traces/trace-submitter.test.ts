/**
 * @module @enterstellar-ai/cloud/__tests__/traces/trace-submitter.test
 * @description Tests for the consent-gated AgentTrace submitter.
 *
 * Covers the v0.1.0 rewrite:
 * - **Triple consent gate (TA2, F13):**
 *   - Gate 1: `traceConsent` factory param defaults to `false` → skip.
 *   - Gate 2: `trace.consent.anonymizedAggregation` → skip if `false`.
 *   - Both must be `true` for any network call.
 * - **0 IPU (§9.1 correction):** `TRACE_SUBMIT = 0` (was 5). No `tracker.record()`.
 * - `CloudResult<{ accepted: boolean }>` return shape (SD7).
 * - `sessionType` included in request body (D111).
 * - No pre-flight quota check (0 IPU).
 * - Consent-before-everything ordering.
 *
 * @see Design Choice TA2 — dual-consent: client flag + per-trace flag.
 * @see Audit Finding F13 — mandatory client consent flag.
 * @see Principle L12 — ForgeSignal mandatory; AgentTrace opt-in.
 * @see Bible §9.1 — POST /v1/traces (0 IPU, corrected from 5).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTraceSubmitter, type TraceSubmitter } from '../../src/traces/trace-submitter.js';
import type { IPUTracker } from '../../src/metering/ipu-tracker.js';
import type { CloudHttpTransport } from '../../src/transport/cloud-http.js';
import type { AgentTrace } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid AgentTrace with consent control. */
function createTestTrace(consentGranted: boolean): AgentTrace {
    return {
        id: 'trace-001' as AgentTrace['id'],
        timestamp: '2026-02-26T18:00:00Z',
        intent: {
            raw: 'show patient vitals',
            component: 'PatientVitals',
            confidence: 0.95,
        },
        resolution: {
            strategy: 'semantic',
            resolvedComponent: 'PatientVitals',
            candidatesConsidered: 3,
        },
        compilation: {
            status: 'pass',
            errorCount: 0,
            selfCorrectionAttempts: 0,
            tokensValidated: true,
            accessibilityInjected: false,
        },
        determinism: {
            level: 0.8,
            cacheHit: false,
            zone: 'main-dashboard',
        },
        metrics: {
            totalMs: 45,
            resolutionMs: 10,
            compilationMs: 5,
            renderMs: 30,
        },
        consent: {
            anonymizedAggregation: consentGranted,
        },
    };
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

function createMockTransport(): CloudHttpTransport {
    return { request: vi.fn() };
}

const MOCK_RESPONSE = {
    ok: true,
    statusCode: 200,
    data: { accepted: true },
    ipuUsed: 0,
    ipuRemaining: 1000,
    ipuCost: 0,
    requestId: 'req_trace_01',
    error: null,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — TraceSubmitter', () => {
    let submitter: TraceSubmitter;
    let tracker: IPUTracker;
    let transport: CloudHttpTransport;

    // -----------------------------------------------------------------------
    // Consent Gate 1: traceConsent = false (TA2, F13)
    // -----------------------------------------------------------------------

    describe('Consent Gate 1: traceConsent = false (TA2, F13)', () => {
        beforeEach(() => {
            tracker = createMockTracker();
            transport = createMockTransport();
            // traceConsent = false → all submissions skipped.
            submitter = createTraceSubmitter(transport, tracker, false, false, 'app');
        });

        it('returns { data: { accepted: false }, ipu: null } immediately', async () => {
            const trace = createTestTrace(true); // Per-trace consent is TRUE.
            const result = await submitter.submitTrace(trace);

            expect(result.data.accepted).toBe(false);
            expect(result.ipu).toBeNull();
        });

        it('makes NO network call', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            expect(transport.request).not.toHaveBeenCalled();
        });

        it('does NOT call tracker.record or tracker.reconcile', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            expect(tracker.record).not.toHaveBeenCalled();
            expect(tracker.reconcile).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Consent Gate 2: trace.consent.anonymizedAggregation = false (L12)
    // -----------------------------------------------------------------------

    describe('Consent Gate 2: trace.consent.anonymizedAggregation = false (L12)', () => {
        beforeEach(() => {
            tracker = createMockTracker();
            transport = createMockTransport();
            // traceConsent = true, but per-trace consent will be false.
            submitter = createTraceSubmitter(transport, tracker, false, true, 'app');
        });

        it('returns { data: { accepted: false }, ipu: null } immediately', async () => {
            const trace = createTestTrace(false); // Per-trace consent is FALSE.
            const result = await submitter.submitTrace(trace);

            expect(result.data.accepted).toBe(false);
            expect(result.ipu).toBeNull();
        });

        it('makes NO network call', async () => {
            const trace = createTestTrace(false);
            await submitter.submitTrace(trace);

            expect(transport.request).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Consent-Before-Everything Ordering
    // -----------------------------------------------------------------------

    describe('Consent-Before-Everything Ordering', () => {
        it('checks consent BEFORE any tracker interaction', async () => {
            tracker = createMockTracker();
            transport = createMockTransport();
            submitter = createTraceSubmitter(transport, tracker, false, false, 'app');

            const trace = createTestTrace(false);
            await submitter.submitTrace(trace);

            // Neither tracker nor transport should be touched.
            expect(tracker.isOverQuota).not.toHaveBeenCalled();
            expect(tracker.record).not.toHaveBeenCalled();
            expect(transport.request).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Success Path (Both Consents Granted)
    // -----------------------------------------------------------------------

    describe('Success Path (Both Consents Granted)', () => {
        beforeEach(() => {
            tracker = createMockTracker();
            transport = createMockTransport();
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);
            // Both consents = true.
            submitter = createTraceSubmitter(transport, tracker, false, true, 'app');
        });

        it('returns CloudResult<{ accepted: true }> on success', async () => {
            const trace = createTestTrace(true);
            const result = await submitter.submitTrace(trace);

            expect(result.data.accepted).toBe(true);
        });

        it('returns ipu metadata from server headers', async () => {
            const responseWithIPU = {
                ...MOCK_RESPONSE,
                ipuUsed: 50,
                ipuRemaining: 950,
                ipuCost: 0,
            };
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(responseWithIPU);

            const trace = createTestTrace(true);
            const result = await submitter.submitTrace(trace);

            expect(result.ipu).toBeDefined();
            expect(result.ipu?.used).toBe(50);
            expect(result.ipu?.remaining).toBe(950);
            expect(result.ipu?.cost).toBe(0); // §9.1: trace submit = 0 IPU.
        });

        it('sends POST /v1/traces with { trace, sessionType }', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['method']).toBe('POST');
            expect(config['path']).toBe('/v1/traces');

            const body = config['body'] as Record<string, unknown>;
            expect(body['trace']).toEqual(trace);
            expect(body['sessionType']).toBe('app');
        });

        it('sends ipuCost: 0 (§9.1 correction from 5→0)', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            const config = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
            expect(config['ipuCost']).toBe(0);
        });

        it('does NOT call tracker.record — traces are free (§9.1 regression test)', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            expect(tracker.record).not.toHaveBeenCalled();
        });

        it('does NOT call tracker.isOverQuota — no pre-flight check for 0 IPU', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            expect(tracker.isOverQuota).not.toHaveBeenCalled();
        });

        it('reconciles tracker with server headers', async () => {
            const trace = createTestTrace(true);
            await submitter.submitTrace(trace);

            expect(tracker.reconcile).toHaveBeenCalledWith(0, 1000, 0);
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode
    // -----------------------------------------------------------------------

    describe('Anonymous Mode', () => {
        it('returns ipu: null when isAnonymous = true', async () => {
            transport = createMockTransport();
            tracker = createMockTracker();
            (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_RESPONSE);
            const anonSubmitter = createTraceSubmitter(transport, tracker, true, true, 'app');

            const trace = createTestTrace(true);
            const result = await anonSubmitter.submitTrace(trace);

            expect(result.ipu).toBeNull();
        });
    });
});
