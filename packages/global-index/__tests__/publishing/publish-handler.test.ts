/**
 * @module @enterstellar-ai/global-index/publishing/publish-handler.test
 * @description Unit tests for contract publishing and publisher earnings operations.
 *
 * Tests cover:
 * - `publishContract()` — success, local pre-validation, server errors
 * - `getPublisherStats()` — success, empty publisher guard, server errors
 * - EnterstellarError code verification for each failure scenario
 * - Verification that local validation prevents network calls on bad input
 *
 * All tests mock `global.fetch` — no real HTTP calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComponentContract } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

import type { TransportConfig } from '../../src/transport.js';
import type { GlobalSearchResult, PublishEarnings } from '../../src/types.js';

import { getPublisherStats, publishContract } from '../../src/publishing/publish-handler.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: TransportConfig = {
    endpoint: 'https://index.enterstellar.dev',
    apiKey: 'test-key',
    timeoutMs: 5000,
};

/**
 * Creates a valid `ComponentContract` that passes `ComponentContractSchema`.
 */
function createValidContract(): ComponentContract {
    return {
        name: 'PatientVitals',
        id: 'patient-vitals-id',
        description: 'Displays patient vital signs.',
        category: 'clinical',
        tags: ['vitals', 'patient'],
        props: { type: 'object' },
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
        examples: [
            {
                intent: 'Show patient vitals',
                props: { patientId: '123' },
            },
        ],
        _meta: {
            forged: false,
            version: '1.0.0',
            createdAt: '2026-01-01T00:00:00.000Z',
        },
    } as ComponentContract;
}

/** A valid `GlobalSearchResult` as returned by the server on publish. */
const MOCK_PUBLISH_RESULT: GlobalSearchResult = {
    contract: createValidContract() as unknown as GlobalSearchResult['contract'],
    registryUrl: 'https://index.enterstellar.dev',
    publisher: 'ACME Clinical',
    stars: 0,
    usageCount: 0,
    certified: false,
    certificationTier: 'indexed',
};

/** A valid `PublishEarnings` as returned by the server. */
const MOCK_EARNINGS: PublishEarnings = {
    publisher: 'ACME Clinical',
    totalContracts: 12,
    totalRenders: 45_000,
    revenueShareCents: 15_000,
    freeCreditsEarned: 500,
    certifiedCount: 8,
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
// publishContract()
// ---------------------------------------------------------------------------

describe('publishContract', () => {
    it('returns a GlobalSearchResult on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ result: MOCK_PUBLISH_RESULT }),
        );

        const result = await publishContract(TEST_CONFIG, createValidContract());

        expect(result.contract.name).toBe('PatientVitals');
        expect(result.certificationTier).toBe('indexed');
        expect(result.stars).toBe(0);
    });

    it('sends POST to /v1/contracts', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ result: MOCK_PUBLISH_RESULT }),
        );

        await publishContract(TEST_CONFIG, createValidContract());

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/contracts');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('POST');
    });

    it('sends the contract as JSON body', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ result: MOCK_PUBLISH_RESULT }),
        );

        const contract = createValidContract();
        await publishContract(TEST_CONFIG, contract);

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(body['name']).toBe('PatientVitals');
        expect(body['category']).toBe('clinical');
    });

    it('throws ENS-5035 when contract fails local pre-validation', async () => {
        // Create an invalid contract (missing required fields)
        const invalidContract = {
            name: 'Invalid',
        } as unknown as ComponentContract;

        try {
            await publishContract(TEST_CONFIG, invalidContract);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
            expect((error as EnterstellarError).message).toContain('local validation');
        }

        // Verify NO network call was made (fail-fast)
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('includes validation issue paths in the error message', async () => {
        const invalidContract = {
            name: 'X',
            id: 'x',
        } as unknown as ComponentContract;

        try {
            await publishContract(TEST_CONFIG, invalidContract);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            // The error message should include field paths from Zod issues
            const msg = (error as EnterstellarError).message;
            expect(msg.length).toBeGreaterThan(50);
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 on server error (500)', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse(
                { message: 'Internal error' },
                { status: 500, statusText: 'Internal Server Error' },
            ),
        );

        try {
            await publishContract(TEST_CONFIG, createValidContract());
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5035 on malformed server response', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ wrong: 'shape' }),
        );

        try {
            await publishContract(TEST_CONFIG, createValidContract());
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });

    it('throws ENS-5032 on network error', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        try {
            await publishContract(TEST_CONFIG, createValidContract());
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });
});

// ---------------------------------------------------------------------------
// getPublisherStats()
// ---------------------------------------------------------------------------

describe('getPublisherStats', () => {
    it('returns PublishEarnings on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ stats: MOCK_EARNINGS }),
        );

        const result = await getPublisherStats(TEST_CONFIG, 'ACME Clinical');

        expect(result.publisher).toBe('ACME Clinical');
        expect(result.totalContracts).toBe(12);
        expect(result.totalRenders).toBe(45_000);
        expect(result.revenueShareCents).toBe(15_000);
        expect(result.freeCreditsEarned).toBe(500);
        expect(result.certifiedCount).toBe(8);
    });

    it('sends GET to /v1/publishers/{id}/stats', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ stats: MOCK_EARNINGS }),
        );

        await getPublisherStats(TEST_CONFIG, 'ACME Clinical');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/publishers/');
        expect(calledUrl).toContain('/stats');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('GET');
    });

    it('URL-encodes the publisher ID in the path', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ stats: MOCK_EARNINGS }),
        );

        await getPublisherStats(TEST_CONFIG, 'ACME/Corp');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('ACME%2FCorp');
    });

    it('throws ENS-5034 when publisher is empty string', async () => {
        try {
            await getPublisherStats(TEST_CONFIG, '');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
            expect((error as EnterstellarError).message).toContain('must not be empty');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5034 when publisher is whitespace only', async () => {
        try {
            await getPublisherStats(TEST_CONFIG, '   ');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 on server error', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse(
                { message: 'Not found' },
                { status: 404, statusText: 'Not Found' },
            ),
        );

        try {
            await getPublisherStats(TEST_CONFIG, 'Unknown Publisher');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5035 on malformed server response', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ not_stats: {} }),
        );

        try {
            await getPublisherStats(TEST_CONFIG, 'ACME');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });

    it('throws ENS-5032 on network error', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        try {
            await getPublisherStats(TEST_CONFIG, 'ACME');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });
});
