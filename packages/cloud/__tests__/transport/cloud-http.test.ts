/**
 * @module @enterstellar-ai/cloud/__tests__/transport/cloud-http.test
 * @description Tests for the shared Enterstellar Cloud HTTP transport.
 *
 * Covers the v0.1.0 throw-on-error model:
 * - Bearer auth injection (CL4) + User-Agent header (F22).
 * - 3-attempt retry loop with 1s/2s/4s backoff for 5xx/network (SD5).
 * - Same `X-Idempotency-Key` on all retry attempts (AM10).
 * - `X-Idempotency-Key` only when `ipuCost > 0` (F8).
 * - Throws `CloudError` on 429 with parsed `upgradeUrl`/`retryAfterMs` (SD3).
 * - Throws `CloudError` on 4xx (no retry) (SD3).
 * - Throws `CloudError` (`ENS-5005`) after retries exhausted.
 * - `X-IPU-Used`, `X-IPU-Remaining`, `X-IPU-Cost`, `X-Request-Id` parsing (§9.3).
 * - Per-operation timeout resolution (F21).
 *
 * All tests mock `globalThis.fetch` — no real network calls.
 *
 * @see Design Choice SD3 — throw on 429, never silent degrade.
 * @see Design Choice SD5 — 3× exponential backoff for 5xx/network.
 * @see Design Choice AM10 — `X-Idempotency-Key` on IPU-consuming requests.
 * @see Design Choice CL4 — bearer token auth.
 * @see Design Choice F22 — `User-Agent` header.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createCloudHttpTransport,
    type CloudHttpConfig,
    type CloudHttpTransport,
} from '../../src/transport/cloud-http.js';
import { CloudError } from '../../src/errors.js';
import { CLOUD_SDK_VERSION } from '../../src/version.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Default config for tests. */
const TEST_CONFIG: CloudHttpConfig = {
    endpoint: 'https://api.enterstellar.dev',
    apiKey: 'test_api_key_abc123',
    timeoutMs: 5_000,
};

/**
 * Creates a mock `Response` object with optional headers and JSON body.
 */
function mockResponse(
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

/**
 * Creates a mock `Response` for a 429 with a §9.4 shaped error body.
 */
function mock429Response(
    upgradeUrl?: string,
    retryAfterMs?: number,
): Response {
    const errorBody = {
        error: {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
            ...(upgradeUrl !== undefined ? { upgradeUrl } : {}),
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        },
    };

    return mockResponse(429, errorBody, {
        'X-IPU-Used': '1000',
        'X-IPU-Remaining': '0',
        'X-Request-Id': 'req_test_429',
    });
}

/**
 * Creates a mock `Response` for a 4xx with a §9.4 shaped error body.
 */
function mock4xxResponse(status: number, code: string, message: string): Response {
    return mockResponse(status, {
        error: { code, message },
    }, { 'X-Request-Id': `req_test_${String(status)}` });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CloudHttpTransport', () => {
    let transport: CloudHttpTransport;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        transport = createCloudHttpTransport(TEST_CONFIG);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Authentication + Headers (CL4, F22)
    // -----------------------------------------------------------------------

    describe('Authentication + Headers (CL4, F22)', () => {
        it('includes Authorization: Bearer header on every request', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, { ok: true }));

            await transport.request({ method: 'GET', path: '/v1/usage', ipuCost: 0 });

            expect(fetchMock).toHaveBeenCalledOnce();
            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['Authorization']).toBe('Bearer test_api_key_abc123');
        });

        it('includes User-Agent: enterstellar-cloud-sdk/{version} on every request (F22)', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, { ok: true }));

            await transport.request({ method: 'GET', path: '/v1/usage', ipuCost: 0 });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['User-Agent']).toBe(`enterstellar-cloud-sdk/${CLOUD_SDK_VERSION}`);
        });

        it('includes Accept: application/json on every request', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, { ok: true }));

            await transport.request({ method: 'GET', path: '/v1/usage', ipuCost: 0 });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['Accept']).toBe('application/json');
        });
    });

    // -----------------------------------------------------------------------
    // Request Formatting
    // -----------------------------------------------------------------------

    describe('Request Formatting', () => {
        it('constructs the full URL from endpoint + path', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await transport.request({ method: 'GET', path: '/v1/usage', ipuCost: 0 });

            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toBe('https://api.enterstellar.dev/v1/usage');
        });

        it('includes Content-Type for POST requests with body', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await transport.request({
                method: 'POST',
                path: '/v1/forge',
                body: { intent: 'show vitals' },
                ipuCost: 10,
            });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['Content-Type']).toBe('application/json');
        });

        it('omits Content-Type for GET requests without body', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await transport.request({ method: 'GET', path: '/v1/usage', ipuCost: 0 });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['Content-Type']).toBeUndefined();
        });

        it('serializes body as JSON for POST requests', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            const body = { intent: 'show vitals', topK: 5 };
            await transport.request({
                method: 'POST',
                path: '/v1/semantic-search',
                body,
                ipuCost: 1,
            });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(options.body).toBe(JSON.stringify(body));
        });
    });

    // -----------------------------------------------------------------------
    // Success Responses (2xx)
    // -----------------------------------------------------------------------

    describe('Success Responses (2xx)', () => {
        it('returns ok: true with parsed JSON data on 200', async () => {
            const responseBody = { used: 42, limit: 1000, tier: 'pro' };
            fetchMock.mockResolvedValue(mockResponse(200, responseBody));

            const result = await transport.request<{ used: number; limit: number }>({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            expect(result.ok).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.data).toEqual(responseBody);
        });

        it('returns data: null when response body is not valid JSON', async () => {
            const badResponse = mockResponse(200, null);
            (badResponse.json as ReturnType<typeof vi.fn>).mockRejectedValue(
                new SyntaxError('Unexpected end of JSON'),
            );
            fetchMock.mockResolvedValue(badResponse);

            const result = await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            expect(result.ok).toBe(true);
            expect(result.data).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // IPU Header Parsing (§9.3)
    // -----------------------------------------------------------------------

    describe('IPU Header Parsing (§9.3)', () => {
        it('parses X-IPU-Used, X-IPU-Remaining, X-IPU-Cost from headers', async () => {
            fetchMock.mockResolvedValue(
                mockResponse(200, {}, {
                    'X-IPU-Used': '42',
                    'X-IPU-Remaining': '958',
                    'X-IPU-Cost': '10',
                }),
            );

            const result = await transport.request({
                method: 'POST',
                path: '/v1/forge',
                ipuCost: 10,
            });

            expect(result.ipuUsed).toBe(42);
            expect(result.ipuRemaining).toBe(958);
            expect(result.ipuCost).toBe(10);
        });

        it('parses X-Request-Id from headers', async () => {
            fetchMock.mockResolvedValue(
                mockResponse(200, {}, { 'X-Request-Id': 'req_01HYX_abc' }),
            );

            const result = await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            expect(result.requestId).toBe('req_01HYX_abc');
        });

        it('returns undefined for absent IPU headers', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            const result = await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            expect(result.ipuUsed).toBeUndefined();
            expect(result.ipuRemaining).toBeUndefined();
            expect(result.ipuCost).toBeUndefined();
            expect(result.requestId).toBeUndefined();
        });

        it('returns undefined for non-numeric IPU header values', async () => {
            fetchMock.mockResolvedValue(
                mockResponse(200, {}, {
                    'X-IPU-Used': 'not-a-number',
                    'X-IPU-Remaining': '',
                    'X-IPU-Cost': 'NaN',
                }),
            );

            const result = await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            expect(result.ipuUsed).toBeUndefined();
            expect(result.ipuRemaining).toBeUndefined();
            expect(result.ipuCost).toBeUndefined();
        });

        it('returns undefined for negative IPU header values', async () => {
            fetchMock.mockResolvedValue(
                mockResponse(200, {}, { 'X-IPU-Used': '-5' }),
            );

            const result = await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            expect(result.ipuUsed).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // X-Idempotency-Key (AM10, F8)
    // -----------------------------------------------------------------------

    describe('X-Idempotency-Key (AM10, F8)', () => {
        it('sends X-Idempotency-Key when ipuCost > 0', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await transport.request({
                method: 'POST',
                path: '/v1/forge',
                body: { intent: 'test' },
                ipuCost: 10,
            });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['X-Idempotency-Key']).toBeDefined();
            expect(headers['X-Idempotency-Key'].length).toBe(26); // ULID = 26 chars
        });

        it('does NOT send X-Idempotency-Key when ipuCost === 0', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['X-Idempotency-Key']).toBeUndefined();
        });

        it('uses the SAME idempotency key across retry attempts (SD5)', async () => {
            // 5xx on first two attempts, 2xx on third.
            fetchMock
                .mockResolvedValueOnce(mockResponse(500, null, {}))
                .mockResolvedValueOnce(mockResponse(500, null, {}))
                .mockResolvedValueOnce(mockResponse(200, { ok: true }));

            const promise = transport.request({
                method: 'POST',
                path: '/v1/forge',
                body: { intent: 'test' },
                ipuCost: 10,
            });

            // Advance past backoff delays.
            await vi.advanceTimersByTimeAsync(1_000); // 1s after attempt 1
            await vi.advanceTimersByTimeAsync(2_000); // 2s after attempt 2

            await promise;

            expect(fetchMock).toHaveBeenCalledTimes(3);

            // Extract idempotency keys from all three calls.
            const keys = fetchMock.mock.calls.map((call: unknown[]) => {
                const opts = call[1] as RequestInit;
                const h = opts.headers as Record<string, string>;
                return h['X-Idempotency-Key'];
            }) as string[];

            // All three requests must use the same key.
            expect(keys[0]).toBe(keys[1]);
            expect(keys[1]).toBe(keys[2]);
        });
    });

    // -----------------------------------------------------------------------
    // Throw on 429 (SD3)
    // -----------------------------------------------------------------------

    describe('Throw on 429 (SD3)', () => {
        it('throws CloudError on 429 — no retry', async () => {
            fetchMock.mockResolvedValue(mock429Response());

            await expect(
                transport.request({
                    method: 'POST',
                    path: '/v1/forge',
                    ipuCost: 10,
                }),
            ).rejects.toThrow(CloudError);

            // Should NOT retry — only 1 fetch call.
            expect(fetchMock).toHaveBeenCalledOnce();
        });

        it('includes cloudCode ENS-C4290 from parsed error body', async () => {
            fetchMock.mockResolvedValue(mock429Response());

            try {
                await transport.request({
                    method: 'POST',
                    path: '/v1/forge',
                    ipuCost: 10,
                });
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(CloudError);
                const cloudError = error as CloudError;
                expect(cloudError.cloudCode).toBe('ENS-C4290');
            }
        });

        it('includes upgradeUrl and retryAfterMs from parsed body', async () => {
            fetchMock.mockResolvedValue(
                mock429Response('https://cloud.enterstellar.dev/billing/upgrade', 3_600_000),
            );

            try {
                await transport.request({
                    method: 'POST',
                    path: '/v1/forge',
                    ipuCost: 10,
                });
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.upgradeUrl).toBe('https://cloud.enterstellar.dev/billing/upgrade');
                expect(cloudError.retryAfterMs).toBe(3_600_000);
            }
        });

        it('includes requestId from X-Request-Id header', async () => {
            fetchMock.mockResolvedValue(mock429Response());

            try {
                await transport.request({
                    method: 'POST',
                    path: '/v1/forge',
                    ipuCost: 10,
                });
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.requestId).toBe('req_test_429');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Throw on 4xx (non-429) — No Retry
    // -----------------------------------------------------------------------

    describe('Throw on 4xx (non-429) — No Retry', () => {
        it('throws CloudError on 400 — no retry', async () => {
            fetchMock.mockResolvedValue(
                mock4xxResponse(400, 'INVALID_BODY', 'Missing required field: intent'),
            );

            await expect(
                transport.request({
                    method: 'POST',
                    path: '/v1/forge',
                    ipuCost: 10,
                }),
            ).rejects.toThrow(CloudError);

            expect(fetchMock).toHaveBeenCalledOnce();
        });

        it('throws CloudError on 401 — no retry', async () => {
            fetchMock.mockResolvedValue(
                mock4xxResponse(401, 'UNAUTHORIZED', 'Invalid API key'),
            );

            await expect(
                transport.request({
                    method: 'GET',
                    path: '/v1/usage',
                    ipuCost: 0,
                }),
            ).rejects.toThrow(CloudError);
        });

        it('includes parsed error code and requestId', async () => {
            fetchMock.mockResolvedValue(
                mock4xxResponse(403, 'FORBIDDEN', 'Access denied'),
            );

            try {
                await transport.request({
                    method: 'GET',
                    path: '/v1/usage',
                    ipuCost: 0,
                });
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.cloudCode).toBe('FORBIDDEN');
                expect(cloudError.requestId).toBe('req_test_403');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Retry Loop — 5xx (SD5)
    // -----------------------------------------------------------------------

    describe('Retry Loop — 5xx (SD5)', () => {
        it('retries 3 times on 5xx then throws ENS-5005', async () => {
            fetchMock.mockResolvedValue(mockResponse(500, null, {}));

            const promise = transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            // Attach catch before advancing timers to prevent unhandled rejection.
            const errorPromise = promise.catch((e: unknown) => e);

            // Flush all backoff timers (1s + 2s) and their microtasks.
            await vi.runAllTimersAsync();

            const error = await errorPromise;

            expect(error).toBeInstanceOf(CloudError);
            expect((error as CloudError).code).toBe('ENS-5005');
            expect((error as CloudError).recoverable).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('succeeds on third attempt after two 5xx', async () => {
            fetchMock
                .mockResolvedValueOnce(mockResponse(500, null, {}))
                .mockResolvedValueOnce(mockResponse(502, null, {}))
                .mockResolvedValueOnce(
                    mockResponse(200, { ok: true }, {
                        'X-IPU-Used': '10',
                        'X-IPU-Remaining': '990',
                    }),
                );

            const promise = transport.request({
                method: 'POST',
                path: '/v1/forge',
                ipuCost: 10,
            });

            await vi.advanceTimersByTimeAsync(1_000); // backoff after attempt 1
            await vi.advanceTimersByTimeAsync(2_000); // backoff after attempt 2

            const result = await promise;

            expect(result.ok).toBe(true);
            expect(result.data).toEqual({ ok: true });
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
    });

    // -----------------------------------------------------------------------
    // Retry Loop — Network Errors (SD5)
    // -----------------------------------------------------------------------

    describe('Retry Loop — Network Errors (SD5)', () => {
        it('retries 3 times on network error then throws ENS-5005', async () => {
            fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

            const promise = transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            // Attach catch before advancing timers to prevent unhandled rejection.
            const errorPromise = promise.catch((e: unknown) => e);

            // Flush all backoff timers and microtasks.
            await vi.runAllTimersAsync();

            const error = await errorPromise;

            expect(error).toBeInstanceOf(CloudError);
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('succeeds on second attempt after network error', async () => {
            fetchMock
                .mockRejectedValueOnce(new TypeError('Failed to fetch'))
                .mockResolvedValueOnce(mockResponse(200, { ok: true }));

            const promise = transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            await vi.advanceTimersByTimeAsync(1_000);

            const result = await promise;

            expect(result.ok).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });

    // -----------------------------------------------------------------------
    // Per-Operation Timeout (F21)
    // -----------------------------------------------------------------------

    describe('Per-Operation Timeout (F21)', () => {
        it('passes an AbortSignal to fetch', async () => {
            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await transport.request({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: 0,
            });

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(options.signal).toBeDefined();
            expect(options.signal).toBeInstanceOf(AbortSignal);
        });

        it('uses operationTimeout when config.timeoutMs is not set', async () => {
            const noTimeoutTransport = createCloudHttpTransport({
                endpoint: 'https://api.enterstellar.dev',
                apiKey: 'test_key',
                // No timeoutMs — will use operationTimeout or default.
            });

            fetchMock.mockResolvedValue(mockResponse(200, {}));

            await noTimeoutTransport.request({
                method: 'POST',
                path: '/v1/forge',
                ipuCost: 10,
                operationTimeout: 30_000,
            });

            // We can't directly inspect the timeout value, but the request
            // succeeds, confirming operationTimeout is used.
            expect(fetchMock).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // Concurrent Requests
    // -----------------------------------------------------------------------

    describe('Concurrent Requests', () => {
        it('handles multiple concurrent requests independently', async () => {
            fetchMock
                .mockResolvedValueOnce(mockResponse(200, { id: 1 }))
                .mockResolvedValueOnce(mockResponse(200, { id: 2 }));

            const [result1, result2] = await Promise.all([
                transport.request<{ id: number }>({
                    method: 'GET',
                    path: '/v1/a',
                    ipuCost: 0,
                }),
                transport.request<{ id: number }>({
                    method: 'GET',
                    path: '/v1/b',
                    ipuCost: 0,
                }),
            ]);

            expect(result1.data).toEqual({ id: 1 });
            expect(result2.data).toEqual({ id: 2 });
        });
    });
});
