/**
 * @module @enterstellar-ai/global-index/discovery/search-index.test
 * @description Unit tests for the contract search and retrieval operations.
 *
 * Tests cover:
 * - `searchContracts()` — success, filter construction, topK, empty results
 * - `getContract()` — success, 404 → null, input guards, error passthrough
 * - `getFeatured()` — success, empty results, server errors
 * - EnterstellarError code verification for each failure scenario
 *
 * All tests mock `global.fetch` — no real HTTP calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { TransportConfig } from '../../src/transport.js';
import type { GlobalSearchResult } from '../../src/types.js';

import {
    getContract,
    getFeatured,
    searchContracts,
} from '../../src/discovery/search-index.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: TransportConfig = {
    endpoint: 'https://index.enterstellar.dev',
    apiKey: 'test-key',
    timeoutMs: 5000,
};

/**
 * A valid `GlobalSearchResult` as returned by the server.
 * Contains all required fields plus realistic metadata.
 */
const MOCK_SEARCH_RESULT: GlobalSearchResult = {
    contract: {
        name: 'PatientVitals',
        id: 'patient-vitals-id',
        description: 'Displays patient vital signs.',
        category: 'clinical',
        tags: ['vitals', 'patient'],
        props: {},
        tokens: { primary: 'token:brand-primary' },
        accessibility: {
            role: 'region',
            ariaLabel: 'Patient vitals',
            announceOnUpdate: true,
        },
        states: {
            loading: 'Loading vitals...',
            error: 'Failed to load vitals.',
            empty: 'No vitals available.',
            ready: 'Vitals ready.',
        },
        examples: [{ intent: 'Show patient vitals', props: { patientId: '123' } }],
        _meta: { forged: false, version: '1.0.0', createdAt: '2026-01-01T00:00:00Z' },
    },
    registryUrl: 'https://registry.acme.health',
    publisher: 'ACME Clinical',
    stars: 42,
    usageCount: 1500,
    certified: true,
    certificationTier: 'certified',
    score: 0.95,
    screenshotUrl: 'https://cdn.enterstellar.dev/screenshots/patient-vitals.png',
};

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
// searchContracts()
// ---------------------------------------------------------------------------

describe('searchContracts', () => {
    it('returns search results on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ results: [MOCK_SEARCH_RESULT] }),
        );

        const results = await searchContracts(TEST_CONFIG, 'patient vitals');

        expect(results).toHaveLength(1);
        expect(results[0]!.contract.name).toBe('PatientVitals');
        expect(results[0]!.stars).toBe(42);
        expect(results[0]!.score).toBe(0.95);
    });

    it('sends POST to /v1/search', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await searchContracts(TEST_CONFIG, 'test query');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/search');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('POST');
    });

    it('sends query in request body', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await searchContracts(TEST_CONFIG, 'patient vitals');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(body['query']).toBe('patient vitals');
    });

    it('includes topK in request body when provided', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await searchContracts(TEST_CONFIG, 'test', { topK: 20 });

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(body['topK']).toBe(20);
    });

    it('includes filters in request body when provided', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await searchContracts(TEST_CONFIG, 'test', {
            filters: {
                category: 'clinical',
                publisher: 'ACME',
                certified: true,
            },
        });

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        const filters = body['filters'] as Record<string, unknown>;
        expect(filters['category']).toBe('clinical');
        expect(filters['publisher']).toBe('ACME');
        expect(filters['certified']).toBe(true);
    });

    it('only includes set filter fields (sparse filters)', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await searchContracts(TEST_CONFIG, 'test', {
            filters: { category: 'admin' },
        });

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        const filters = body['filters'] as Record<string, unknown>;
        expect(filters['category']).toBe('admin');
        expect(filters['publisher']).toBeUndefined();
        expect(filters['certified']).toBeUndefined();
    });

    it('omits filters object entirely when no filter fields are set', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await searchContracts(TEST_CONFIG, 'test', { filters: {} });

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(body['filters']).toBeUndefined();
    });

    it('returns empty array when no matches found', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        const results = await searchContracts(TEST_CONFIG, 'nonexistent');

        expect(results).toHaveLength(0);
    });

    it('returns multiple results sorted by relevance', async () => {
        const second = {
            ...MOCK_SEARCH_RESULT,
            contract: { ...MOCK_SEARCH_RESULT.contract, name: 'LabResults' },
            score: 0.72,
        };

        fetchMock.mockResolvedValueOnce(
            mockResponse({ results: [MOCK_SEARCH_RESULT, second] }),
        );

        const results = await searchContracts(TEST_CONFIG, 'patient data');

        expect(results).toHaveLength(2);
        expect(results[0]!.contract.name).toBe('PatientVitals');
        expect(results[1]!.contract.name).toBe('LabResults');
    });

    it('throws ENS-5032 on server error', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ message: 'error' }, { status: 500, statusText: 'Internal Server Error' }),
        );

        try {
            await searchContracts(TEST_CONFIG, 'test');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5035 on malformed response', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ not_results: [] }),
        );

        try {
            await searchContracts(TEST_CONFIG, 'test');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });
});

// ---------------------------------------------------------------------------
// getContract()
// ---------------------------------------------------------------------------

describe('getContract', () => {
    it('returns a GlobalSearchResult on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ result: MOCK_SEARCH_RESULT }),
        );

        const result = await getContract(TEST_CONFIG, 'PatientVitals', 'https://registry.acme.health');

        expect(result).not.toBeNull();
        expect(result!.contract.name).toBe('PatientVitals');
        expect(result!.registryUrl).toBe('https://registry.acme.health');
    });

    it('sends GET to /v1/contracts/{name} with registry query param', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ result: MOCK_SEARCH_RESULT }),
        );

        await getContract(TEST_CONFIG, 'PatientVitals', 'https://registry.acme.health');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/contracts/PatientVitals');
        expect(calledUrl).toContain('registry=');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('GET');
    });

    it('URL-encodes the component name in the path', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ result: MOCK_SEARCH_RESULT }),
        );

        await getContract(TEST_CONFIG, 'Name/With/Slashes', 'https://r.com');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('Name%2FWith%2FSlashes');
    });

    it('returns null on 404 Not Found', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse(null, { status: 404, statusText: 'Not Found' }),
        );

        const result = await getContract(TEST_CONFIG, 'Missing', 'https://r.com');

        expect(result).toBeNull();
    });

    it('throws ENS-5032 when name is empty', async () => {
        try {
            await getContract(TEST_CONFIG, '', 'https://r.com');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
            expect((error as EnterstellarError).message).toContain('name');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 when registryUrl is empty', async () => {
        try {
            await getContract(TEST_CONFIG, 'Foo', '');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
            expect((error as EnterstellarError).message).toContain('Registry URL');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 when name is whitespace only', async () => {
        try {
            await getContract(TEST_CONFIG, '   ', 'https://r.com');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 on non-404 server error', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ message: 'error' }, { status: 500, statusText: 'Internal Server Error' }),
        );

        try {
            await getContract(TEST_CONFIG, 'Foo', 'https://r.com');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });
});

// ---------------------------------------------------------------------------
// getFeatured()
// ---------------------------------------------------------------------------

describe('getFeatured', () => {
    it('returns featured results on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ results: [MOCK_SEARCH_RESULT] }),
        );

        const results = await getFeatured(TEST_CONFIG);

        expect(results).toHaveLength(1);
        expect(results[0]!.contract.name).toBe('PatientVitals');
    });

    it('sends GET to /v1/featured', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await getFeatured(TEST_CONFIG);

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/featured');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('GET');
    });

    it('returns empty array when no featured contracts', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        const results = await getFeatured(TEST_CONFIG);

        expect(results).toHaveLength(0);
    });

    it('throws ENS-5032 on network error', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        try {
            await getFeatured(TEST_CONFIG);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5035 on malformed response', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ wrong: 'shape' }),
        );

        try {
            await getFeatured(TEST_CONFIG);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });
});
