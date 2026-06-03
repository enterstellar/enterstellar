/**
 * @module @enterstellar-ai/telemetry/__tests__/transport/cloud-transport
 * @description Tests for the HTTP cloud transport.
 *
 * Verifies POST with JSON body (TL6), 429/Retry-After handling,
 * exponential backoff on 5xx (TL7), 4xx permanent failure,
 * network errors, retry counter reset, and 60s backoff cap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForgeSignal } from '@enterstellar-ai/types';

import { createCloudTransport } from '../../src/transport/cloud-transport.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://api.enterstellar.dev/v1/signals';

function createStubSignal(intentHash: string): ForgeSignal {
    return {
        intentHash,
        componentName: 'TestComponent',
        intentCategory: 'clinical',
        compilationStatus: 'pass',
        forgeMode: 'none',
        forgeUsed: false,
        latencyMs: 10,
        selfCorrectionAttempts: 0,
        correctionTokensUsed: 0,
        timestamp: new Date().toISOString(),
        sdkVersion: '0.1.0',
        registrySize: 5,
        platform: 'web',
    };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCloudTransport', () => {
    // -------------------------------------------------------------------------
    // Success (2xx)
    // -------------------------------------------------------------------------

    it('sends a POST request with JSON body to the endpoint', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const signals = [createStubSignal('aaa')];
        await transport.send(signals);

        expect(fetchMock).toHaveBeenCalledOnce();

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(ENDPOINT);
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(JSON.parse(init.body as string)).toEqual(signals);
    });

    it('returns success on 200 response', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.retryAfterMs).toBeUndefined();
    });

    it('returns success for empty batch without calling fetch', async () => {
        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([]);

        expect(result.success).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Rate limiting (429 — TL7)
    // -------------------------------------------------------------------------

    it('returns failure with retryAfterMs from Retry-After header on 429', async () => {
        const headers = new Headers({ 'Retry-After': '5' });
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(429);
        expect(result.retryAfterMs).toBe(5_000); // 5 seconds in ms
    });

    it('falls back to exponential backoff when Retry-After header is missing on 429', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 429 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });

        // First 429 → 1s backoff
        const result1 = await transport.send([createStubSignal('a')]);
        expect(result1.retryAfterMs).toBe(1_000);

        // Second 429 → 2s backoff
        const result2 = await transport.send([createStubSignal('b')]);
        expect(result2.retryAfterMs).toBe(2_000);

        // Third 429 → 4s backoff
        const result3 = await transport.send([createStubSignal('c')]);
        expect(result3.retryAfterMs).toBe(4_000);
    });

    // -------------------------------------------------------------------------
    // Server error (5xx)
    // -------------------------------------------------------------------------

    it('returns failure with exponential backoff on 500', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(500);
        expect(result.retryAfterMs).toBe(1_000);
    });

    it('returns failure with exponential backoff on 503', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(503);
        expect(result.retryAfterMs).toBe(1_000);
    });

    // -------------------------------------------------------------------------
    // Client error (4xx non-429)
    // -------------------------------------------------------------------------

    it('returns permanent failure on 400 with no retryAfterMs', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(400);
        expect(result.retryAfterMs).toBeUndefined();
    });

    // -------------------------------------------------------------------------
    // Network errors
    // -------------------------------------------------------------------------

    it('returns failure with backoff on network error', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        const transport = createCloudTransport({ endpoint: ENDPOINT });
        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(false);
        expect(result.retryAfterMs).toBe(1_000);
    });

    // -------------------------------------------------------------------------
    // Retry counter reset
    // -------------------------------------------------------------------------

    it('resets retry counter after a successful send', async () => {
        // First: 500 → backoff 1s
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
        // Second: 200 → success, reset
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
        // Third: 500 → backoff should be 1s again (reset)
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });

        const r1 = await transport.send([createStubSignal('a')]);
        expect(r1.retryAfterMs).toBe(1_000);

        await transport.send([createStubSignal('b')]); // success

        const r3 = await transport.send([createStubSignal('c')]);
        expect(r3.retryAfterMs).toBe(1_000); // Reset, not 4_000
    });

    // -------------------------------------------------------------------------
    // Backoff cap (TL7)
    // -------------------------------------------------------------------------

    it('caps backoff at 60s after many failures', async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

        const transport = createCloudTransport({ endpoint: ENDPOINT });

        // Exhaust the backoff schedule: 1s, 2s, 4s, 8s, 16s, 60s, 60s...
        for (let i = 0; i < 6; i++) {
            await transport.send([createStubSignal(`sig-${String(i)}`)]);
        }

        // 7th call — should still be 60s (capped)
        const result = await transport.send([createStubSignal('capped')]);
        expect(result.retryAfterMs).toBe(60_000);
    });

    // -------------------------------------------------------------------------
    // Request timeout (AbortController)
    // -------------------------------------------------------------------------

    it('returns failure with statusCode 408 when request exceeds timeoutMs', async () => {
        // Mock fetch that never resolves — simulates a hung server.
        fetchMock.mockImplementationOnce(
            (_input: RequestInfo | URL, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    // Listen for abort signal and reject with AbortError.
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('The operation was aborted.', 'AbortError'));
                    });
                }),
        );

        const transport = createCloudTransport({
            endpoint: ENDPOINT,
            timeoutMs: 50, // 50ms timeout for fast test.
        });

        const result = await transport.send([createStubSignal('timeout')]);

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(408);
        expect(result.retryAfterMs).toBe(1_000); // First backoff.
    });
});
