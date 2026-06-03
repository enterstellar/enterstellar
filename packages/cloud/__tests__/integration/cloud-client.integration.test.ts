/**
 * @module @enterstellar-ai/cloud/__tests__/integration/cloud-client.integration.test
 * @description End-to-end integration test for the Enterstellar Cloud client.
 *
 * Tests the full internal wiring through `createEnterstellarCloudClient()` with
 * `globalThis.fetch` mocked. All internal modules (transport, tracker,
 * proxies) run their real code paths.
 *
 * **Scenarios:**
 * 1. Anonymous flow: `create(pk_anon) → submitSignal → dispose`.
 * 2. Full flow: `create(ak_) → forge → search → route → getUsage → getLedger → dispose`.
 * 3. Retry scenario: 5xx → retry → 2xx (same idempotency key).
 * 4. Quota scenario: 429 → throws `CloudError` with `upgradeUrl`.
 * 5. Consent scenario: `traceConsent=false` → submitTrace returns without fetch.
 *
 * @see Bible §9.1–§9.4 — full API surface.
 * @see Design Choices SD1–SD10 — SDK contracts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentTrace } from '@enterstellar-ai/types';

import { createEnterstellarCloudClient } from '../../src/create-cloud-client.js';
import { CloudError } from '../../src/errors.js';
import type { EnterstellarCloudClient, CloudConfig } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Full-mode integration config. */
const FULL_CONFIG: CloudConfig = {
    apiKey: 'ak_integration_test_key_001',
    baseUrl: 'https://test.enterstellar.dev',
    timeoutMs: 5_000,
    traceConsent: true,
    sessionType: 'app',
};

/** Anonymous-mode integration config. */
const ANON_CONFIG: CloudConfig = {
    apiKey: 'pk_anon_install_integration_001',
    baseUrl: 'https://test.enterstellar.dev',
    timeoutMs: 5_000,
};

/** Creates a mock Response for fetch. */
function mockFetchResponse(
    status: number,
    body: unknown = null,
    headers: Record<string, string> = {},
): Response {
    const responseHeaders = new Headers(headers);

    return {
        ok: status >= 200 && status < 300,
        status,
        headers: responseHeaders,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}

/** Standard IPU headers for a successful response. */
function ipuHeaders(used: number, remaining: number, cost: number): Record<string, string> {
    return {
        'X-IPU-Used': String(used),
        'X-IPU-Remaining': String(remaining),
        'X-IPU-Cost': String(cost),
        'X-Request-Id': `req_integ_${String(used)}`,
    };
}

/** Creates a minimal valid AgentTrace. */
function createTestTrace(consentGranted: boolean): AgentTrace {
    return {
        id: 'trace-integration-001' as AgentTrace['id'],
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

// ---------------------------------------------------------------------------
// Integration Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — Integration: Full Client Lifecycle', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Scenario 1: Anonymous Flow (SD1, SD4)
    // -----------------------------------------------------------------------

    describe('Scenario 1: Anonymous Flow', () => {
        it('create(pk_anon) → submitSignal → dispose', async () => {
            const client = createEnterstellarCloudClient(ANON_CONFIG);

            // ----- submitSignal (0 IPU) ---------------------------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, { accepted: true }, ipuHeaders(0, 0, 0)),
            );

            const signalResult = await client.submitSignal({
                intentHash: 'sha256_test_integration',
                componentName: 'VitalsCard',
                resolved: true,
                timestamp: Date.now(),
            } as never);

            expect(signalResult.data.accepted).toBe(true);
            // ipu is null in anonymous mode.
            expect(signalResult.ipu).toBeNull();

            // ----- Verify other methods blocked -------------------------
            await expect(client.forge({ intent: 'test' })).rejects.toThrow(CloudError);
            await expect(client.search('test')).rejects.toThrow(CloudError);

            // ----- Dispose ----------------------------------------------
            client.dispose();

            // ----- Post-dispose: even submitSignal throws ----------------
            await expect(
                client.submitSignal({ intentHash: 'x' } as never),
            ).rejects.toThrow(CloudError);
        });
    });

    // -----------------------------------------------------------------------
    // Scenario 2: Full Flow (all methods)
    // -----------------------------------------------------------------------

    describe('Scenario 2: Full Flow', () => {
        let client: EnterstellarCloudClient;

        beforeEach(() => {
            client = createEnterstellarCloudClient(FULL_CONFIG);
        });

        it('forge → search → route → submitTrace → getUsage → getLedger → dispose', async () => {
            // ----- Step 1: Forge (10 IPU) --------------------------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    name: 'VitalsCard',
                    type: 'component',
                    version: '1.0.0',
                    props: { patientId: 'p-001' },
                }, ipuHeaders(10, 990, 10)),
            );

            const forgeResult = await client.forge({ intent: 'show patient vitals' });

            expect(forgeResult.data).toBeDefined();
            expect(forgeResult.ipu).toBeDefined();
            expect(forgeResult.ipu?.used).toBe(10);
            expect(forgeResult.ipu?.remaining).toBe(990);
            expect(forgeResult.ipu?.cost).toBe(10);

            // ----- Step 2: Search (1 IPU) --------------------------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    results: [
                        { componentName: 'VitalsCard', similarity: 0.92, contract: {} },
                    ],
                }, ipuHeaders(11, 989, 1)),
            );

            const searchResult = await client.search('patient vitals display', 5);

            expect(searchResult.data).toBeDefined();
            expect(searchResult.ipu?.used).toBe(11);
            expect(searchResult.ipu?.cost).toBe(1);

            // ----- Step 3: Route (1 IPU) ---------------------------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    predictions: [
                        { componentName: 'VitalsCard', confidence: 0.92 },
                    ],
                    metadata: { modelVersion: 'freq-v1', signalCount: 500 },
                }, ipuHeaders(12, 988, 1)),
            );

            const routeResult = await client.route('sha256_vitals');

            expect(routeResult.data.predictions).toHaveLength(1);
            expect(routeResult.ipu?.used).toBe(12);

            // ----- Step 4: Submit Trace (0 IPU, consent=true) ------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, { accepted: true }, ipuHeaders(12, 988, 0)),
            );

            const trace = createTestTrace(true);
            const traceResult = await client.submitTrace(trace);

            expect(traceResult.data.accepted).toBe(true);
            expect(traceResult.ipu?.cost).toBe(0); // §9.1: trace submit = 0 IPU

            // ----- Step 5: Get Usage (0 IPU) -----------------------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    used: 12,
                    limit: 1000,
                    tier: 'pro',
                }, ipuHeaders(12, 988, 0)),
            );

            const usageResult = await client.getUsage();

            expect(usageResult.data.used).toBe(12);
            expect(usageResult.data.limit).toBe(1000);
            expect(usageResult.data.tier).toBe('pro');

            // ----- Step 6: Get Ledger (0 IPU) ----------------------------
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    items: [
                        { operation: 'forge', ipu_cost: 10, timestamp: '2026-03-29T12:00:00Z' },
                    ],
                    cursor: null,
                    hasMore: false,
                }, ipuHeaders(12, 988, 0)),
            );

            const ledgerResult = await client.getLedger({ limit: 10 });

            expect(ledgerResult.data.items).toHaveLength(1);
            expect(ledgerResult.data.hasMore).toBe(false);

            // ----- Step 7: Dispose ---------------------------------------
            client.dispose();

            // Post-dispose: all methods throw.
            await expect(client.forge({ intent: 'x' })).rejects.toThrow(CloudError);
            await expect(client.getUsage()).rejects.toThrow(CloudError);
        });
    });

    // -----------------------------------------------------------------------
    // Scenario 3: Retry — 5xx → Retry → 2xx
    // -----------------------------------------------------------------------

    describe('Scenario 3: Retry — 5xx → Retry → 2xx', () => {
        it('retries 5xx and succeeds, preserving same idempotency key', async () => {
            vi.useFakeTimers();

            const client = createEnterstellarCloudClient(FULL_CONFIG);

            // First attempt: 500.
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(500, null, {}),
            );

            // Second attempt: 200.
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    predictions: [{ componentName: 'TestCard', confidence: 0.8 }],
                    metadata: { modelVersion: 'freq-v1', signalCount: 100 },
                }, ipuHeaders(1, 999, 1)),
            );

            const promise = client.route('sha256_retry_test');

            // Advance past 1s backoff after first attempt.
            await vi.advanceTimersByTimeAsync(1_000);

            const result = await promise;

            expect(result.data.predictions).toHaveLength(1);
            expect(result.ipu?.cost).toBe(1);

            // Verify same idempotency key across both calls.
            expect(fetchMock).toHaveBeenCalledTimes(2);

            const key1 = (
                (fetchMock.mock.calls[0] as [string, RequestInit])[1]
                    .headers as Record<string, string>
            )['X-Idempotency-Key'];

            const key2 = (
                (fetchMock.mock.calls[1] as [string, RequestInit])[1]
                    .headers as Record<string, string>
            )['X-Idempotency-Key'];

            expect(key1).toBeDefined();
            expect(key1).toBe(key2);

            vi.useRealTimers();
        });
    });

    // -----------------------------------------------------------------------
    // Scenario 4: Quota — 429 → CloudError with upgradeUrl
    // -----------------------------------------------------------------------

    describe('Scenario 4: Quota — 429 → CloudError', () => {
        it('throws CloudError with upgradeUrl on 429', async () => {
            const client = createEnterstellarCloudClient(FULL_CONFIG);

            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(429, {
                    error: {
                        code: 'ENS-C4290',
                        message: 'IPU quota exceeded for this billing period',
                        upgradeUrl: 'https://cloud.enterstellar.dev/billing/upgrade',
                        retryAfterMs: 3_600_000,
                    },
                }, {
                    'X-IPU-Used': '1000',
                    'X-IPU-Remaining': '0',
                    'X-Request-Id': 'req_429_integ',
                }),
            );

            try {
                await client.forge({ intent: 'show vitals' });
                expect.fail('Should have thrown CloudError');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(CloudError);
                const cloudError = error as CloudError;
                expect(cloudError.cloudCode).toBe('ENS-C4290');
                expect(cloudError.upgradeUrl).toBe('https://cloud.enterstellar.dev/billing/upgrade');
                expect(cloudError.retryAfterMs).toBe(3_600_000);
                expect(cloudError.requestId).toBe('req_429_integ');
                expect(cloudError.recoverable).toBe(true);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Scenario 5: Consent — traceConsent=false → No Fetch
    // -----------------------------------------------------------------------

    describe('Scenario 5: Consent — traceConsent=false', () => {
        it('submitTrace returns without fetch when traceConsent=false', async () => {
            const noConsentClient = createEnterstellarCloudClient({
                ...FULL_CONFIG,
                traceConsent: false,
            });

            const trace = createTestTrace(true); // Per-trace consent is true.
            const result = await noConsentClient.submitTrace(trace);

            // Config-level traceConsent=false takes precedence.
            expect(result.data.accepted).toBe(false);
            expect(result.ipu).toBeNull();

            // No fetch call should have been made.
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('submitTrace returns without fetch when per-trace consent=false', async () => {
            const client = createEnterstellarCloudClient(FULL_CONFIG); // traceConsent=true

            const trace = createTestTrace(false); // Per-trace consent is false.
            const result = await client.submitTrace(trace);

            expect(result.data.accepted).toBe(false);
            expect(result.ipu).toBeNull();

            // No fetch call.
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Scenario 6: IPU Headers Propagate Through Stack
    // -----------------------------------------------------------------------

    describe('Scenario 6: IPU Header Propagation', () => {
        it('ipu metadata flows from transport → proxy → CloudResult', async () => {
            const client = createEnterstellarCloudClient(FULL_CONFIG);

            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    results: [
                        { componentName: 'VitalsCard', similarity: 0.95, contract: {} },
                    ],
                }, {
                    'X-IPU-Used': '42',
                    'X-IPU-Remaining': '958',
                    'X-IPU-Cost': '1',
                    'X-Request-Id': 'req_propagation_01',
                }),
            );

            const result = await client.search('vitals');

            // Verify the full CloudIPU object is populated from response headers.
            expect(result.ipu).not.toBeNull();
            expect(result.ipu?.used).toBe(42);
            expect(result.ipu?.remaining).toBe(958);
            expect(result.ipu?.cost).toBe(1);
        });

        it('ipu is null when headers are absent (0-IPU endpoint)', async () => {
            const client = createEnterstellarCloudClient(FULL_CONFIG);

            // Response with no IPU headers at all.
            fetchMock.mockResolvedValueOnce(
                mockFetchResponse(200, {
                    items: [],
                    cursor: null,
                    hasMore: false,
                }, {}),
            );

            const result = await client.getTraces();

            // No IPU headers → ipu is null.
            expect(result.ipu).toBeNull();
        });
    });
});
