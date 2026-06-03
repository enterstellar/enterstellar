/**
 * @module @enterstellar-ai/global-index/transport.test
 * @description Unit tests for the internal HTTP transport layer.
 *
 * Tests cover:
 * - URL construction (`buildUrl`) — path joining, query params, edge cases
 * - `execute()` — success, HTTP errors, network errors, timeouts, Zod failures
 * - `executeOptional()` — 404 → null, success, error passthrough
 * - Auth header injection (Bearer token)
 * - JSON body serialization
 * - Response object freezing
 *
 * All tests mock `global.fetch` — no real HTTP calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { TransportConfig } from '../src/transport.js';
import { buildUrl, execute, executeOptional } from '../src/transport.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/** Standard transport config used across tests. */
const TEST_CONFIG: TransportConfig = {
    endpoint: 'https://index.enterstellar.dev',
    apiKey: 'test-api-key-12345',
    timeoutMs: 5000,
};

/** Simple Zod schema for test responses. */
const TestSchema = z.object({
    id: z.string(),
    name: z.string(),
});

type TestData = z.infer<typeof TestSchema>;

/**
 * Creates a mock `Response` object for `fetch` stubbing.
 */
function mockResponse(
    body: unknown,
    init?: { status?: number; statusText?: string },
): Response {
    const status = init?.status ?? 200;
    const statusText = init?.statusText ?? 'OK';

    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        json: () => Promise.resolve(body),
        headers: new Headers(),
    } as unknown as Response;
}

/**
 * Creates a mock `Response` that fails on `.json()`.
 */
function mockNonJsonResponse(
    status: number = 200,
    statusText: string = 'OK',
): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        headers: new Headers(),
    } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// buildUrl
// ---------------------------------------------------------------------------

describe('buildUrl', () => {
    it('joins endpoint and path', () => {
        const url = buildUrl('https://index.enterstellar.dev', '/v1/search');
        expect(url).toBe('https://index.enterstellar.dev/v1/search');
    });

    it('strips trailing slash from endpoint', () => {
        const url = buildUrl('https://index.enterstellar.dev/', '/v1/search');
        expect(url).toBe('https://index.enterstellar.dev/v1/search');
    });

    it('strips multiple trailing slashes from endpoint', () => {
        const url = buildUrl('https://index.enterstellar.dev///', '/v1/search');
        expect(url).toBe('https://index.enterstellar.dev/v1/search');
    });

    it('adds leading slash to path if missing', () => {
        const url = buildUrl('https://index.enterstellar.dev', 'v1/search');
        expect(url).toBe('https://index.enterstellar.dev/v1/search');
    });

    it('appends query parameters', () => {
        const url = buildUrl('https://index.enterstellar.dev', '/v1/contracts/Foo', {
            registry: 'https://r.example.com',
        });
        expect(url).toContain('registry=https');
        expect(url).toContain('v1/contracts/Foo');
    });

    it('skips empty-string query values', () => {
        const url = buildUrl('https://index.enterstellar.dev', '/v1/search', {
            q: 'test',
            empty: '',
        });
        expect(url).toContain('q=test');
        expect(url).not.toContain('empty=');
    });

    it('encodes special characters in query values', () => {
        const url = buildUrl('https://index.enterstellar.dev', '/v1/search', {
            q: 'patient vitals & labs',
        });
        expect(url).toContain('q=patient+vitals+%26+labs');
    });

    it('returns URL without query string when no query provided', () => {
        const url = buildUrl('https://index.enterstellar.dev', '/v1/featured');
        expect(url).toBe('https://index.enterstellar.dev/v1/featured');
    });
});

// ---------------------------------------------------------------------------
// execute() — Success Path
// ---------------------------------------------------------------------------

describe('execute — success path', () => {
    it('returns parsed and validated response data', async () => {
        const body: TestData = { id: '1', name: 'TestComponent' };
        fetchMock.mockResolvedValueOnce(mockResponse(body));

        const result = await execute(TEST_CONFIG, {
            method: 'GET',
            path: '/v1/test',
        }, TestSchema);

        expect(result.data).toEqual(body);
        expect(result.status).toBe(200);
    });

    it('sends Authorization Bearer header', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);

        const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = callArgs[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer test-api-key-12345');
    });

    it('sends Accept: application/json header', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);

        const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = callArgs[1].headers as Record<string, string>;
        expect(headers['Accept']).toBe('application/json');
    });

    it('serializes request body as JSON for POST requests', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        await execute(TEST_CONFIG, {
            method: 'POST',
            path: '/v1/test',
            body: { query: 'patient vitals' },
        }, TestSchema);

        const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = callArgs[1].headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/json');
        expect(callArgs[1].body).toBe(JSON.stringify({ query: 'patient vitals' }));
    });

    it('does NOT set Content-Type for GET requests (no body)', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);

        const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = callArgs[1].headers as Record<string, string>;
        expect(headers['Content-Type']).toBeUndefined();
    });

    it('constructs URL with query parameters', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        await execute(TEST_CONFIG, {
            method: 'GET',
            path: '/v1/contracts/Foo',
            query: { registry: 'https://r.com' },
        }, TestSchema);

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/contracts/Foo');
        expect(calledUrl).toContain('registry=');
    });

    it('returns a frozen response object', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        const result = await execute(TEST_CONFIG, {
            method: 'GET',
            path: '/v1/test',
        }, TestSchema);

        expect(Object.isFrozen(result)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// execute() — HTTP Error Path
// ---------------------------------------------------------------------------

describe('execute — HTTP errors', () => {
    it('throws ENS-5032 on 500 Internal Server Error', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ message: 'Internal error' }, { status: 500, statusText: 'Internal Server Error' }),
        );

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('extracts error message from JSON response body', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ message: 'Quota exceeded' }, { status: 429, statusText: 'Too Many Requests' }),
        );

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).message).toContain('Quota exceeded');
        }
    });

    it('extracts error from "error" field in JSON body', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ error: 'Bad request data' }, { status: 400, statusText: 'Bad Request' }),
        );

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).message).toContain('Bad request data');
        }
    });

    it('falls back to HTTP status text when body is not JSON', async () => {
        fetchMock.mockResolvedValueOnce(
            mockNonJsonResponse(502, 'Bad Gateway'),
        );

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).message).toContain('502');
            expect((error as EnterstellarError).message).toContain('Bad Gateway');
        }
    });
});

// ---------------------------------------------------------------------------
// execute() — Network Error Path
// ---------------------------------------------------------------------------

describe('execute — network errors', () => {
    it('throws ENS-5032 on fetch TypeError (network failure)', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
            expect((error as EnterstellarError).message).toContain('Network error');
            expect((error as EnterstellarError).cause).toBeInstanceOf(TypeError);
        }
    });

    it('throws ENS-5032 with AbortError message on timeout', async () => {
        const abortError = new DOMException('The operation was aborted.', 'AbortError');
        fetchMock.mockRejectedValueOnce(abortError);

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
            expect((error as EnterstellarError).message).toContain('timed out');
        }
    });
});

// ---------------------------------------------------------------------------
// execute() — Zod Validation Error Path
// ---------------------------------------------------------------------------

describe('execute — Zod validation errors', () => {
    it('throws ENS-5035 when response does not match schema', async () => {
        // Response has wrong shape (number instead of string)
        fetchMock.mockResolvedValueOnce(mockResponse({ id: 123, name: true }));

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
            expect((error as EnterstellarError).message).toContain('schema mismatch');
        }
    });

    it('throws ENS-5035 when response body is not valid JSON', async () => {
        fetchMock.mockResolvedValueOnce(mockNonJsonResponse(200, 'OK'));

        try {
            await execute(TEST_CONFIG, { method: 'GET', path: '/v1/test' }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
            expect((error as EnterstellarError).message).toContain('parse JSON');
        }
    });
});

// ---------------------------------------------------------------------------
// executeOptional() — 404 Path
// ---------------------------------------------------------------------------

describe('executeOptional — 404 handling', () => {
    it('returns null on 404 Not Found', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse(null, { status: 404, statusText: 'Not Found' }),
        );

        const result = await executeOptional(TEST_CONFIG, {
            method: 'GET',
            path: '/v1/contracts/Missing',
        }, TestSchema);

        expect(result).toBeNull();
    });

    it('returns parsed data on 200 OK', async () => {
        const body: TestData = { id: '1', name: 'Found' };
        fetchMock.mockResolvedValueOnce(mockResponse(body));

        const result = await executeOptional(TEST_CONFIG, {
            method: 'GET',
            path: '/v1/contracts/Found',
        }, TestSchema);

        expect(result).not.toBeNull();
        expect(result!.data).toEqual(body);
        expect(result!.status).toBe(200);
    });

    it('throws ENS-5032 on non-404 error (e.g., 500)', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ message: 'server error' }, { status: 500, statusText: 'Internal Server Error' }),
        );

        try {
            await executeOptional(TEST_CONFIG, {
                method: 'GET',
                path: '/v1/test',
            }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5032 on network error', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        try {
            await executeOptional(TEST_CONFIG, {
                method: 'GET',
                path: '/v1/test',
            }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5035 on Zod validation failure', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ invalid: true }));

        try {
            await executeOptional(TEST_CONFIG, {
                method: 'GET',
                path: '/v1/test',
            }, TestSchema);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });

    it('returns a frozen response object on success', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ id: '1', name: 'X' }));

        const result = await executeOptional(TEST_CONFIG, {
            method: 'GET',
            path: '/v1/test',
        }, TestSchema);

        expect(result).not.toBeNull();
        expect(Object.isFrozen(result!)).toBe(true);
    });
});
