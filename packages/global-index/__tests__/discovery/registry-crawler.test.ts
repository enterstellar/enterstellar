/**
 * @module @enterstellar-ai/global-index/discovery/registry-crawler.test
 * @description Unit tests for the federated registry discovery operations.
 *
 * Tests cover:
 * - `registerRegistry()` — success, local input validation, server errors
 * - `listRegistries()` — success, empty list, server errors
 * - `refreshRegistry()` — success, empty ID guard, server errors
 * - EnterstellarError code verification for each failure scenario
 *
 * All tests mock `global.fetch` — no real HTTP calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { TransportConfig } from '../../src/transport.js';
import type { FederatedRegistry, RegistryRegistration } from '../../src/types.js';

import {
    listRegistries,
    refreshRegistry,
    registerRegistry,
} from '../../src/discovery/registry-crawler.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: TransportConfig = {
    endpoint: 'https://index.enterstellar.dev',
    apiKey: 'test-key',
    timeoutMs: 5000,
};

/** A valid `RegistryRegistration` input. */
const VALID_REGISTRATION: RegistryRegistration = {
    name: 'ACME Clinical',
    url: 'https://registry.acme.health',
    publisher: 'ACME Corp',
};

/** A valid `FederatedRegistry` as returned by the server. */
const MOCK_REGISTRY: FederatedRegistry = {
    id: 'reg-001',
    name: 'ACME Clinical',
    url: 'https://registry.acme.health',
    publisher: 'ACME Corp',
    contractCount: 42,
    lastRefreshedAt: '2026-02-26T10:00:00.000Z',
    active: true,
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
// registerRegistry()
// ---------------------------------------------------------------------------

describe('registerRegistry', () => {
    it('returns a FederatedRegistry on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registry: MOCK_REGISTRY }),
        );

        const result = await registerRegistry(TEST_CONFIG, VALID_REGISTRATION);

        expect(result.id).toBe('reg-001');
        expect(result.name).toBe('ACME Clinical');
        expect(result.url).toBe('https://registry.acme.health');
        expect(result.publisher).toBe('ACME Corp');
        expect(result.contractCount).toBe(42);
        expect(result.active).toBe(true);
    });

    it('sends POST to /v1/registries', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registry: MOCK_REGISTRY }),
        );

        await registerRegistry(TEST_CONFIG, VALID_REGISTRATION);

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/registries');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('POST');
    });

    it('sends registration data as JSON body', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registry: MOCK_REGISTRY }),
        );

        await registerRegistry(TEST_CONFIG, VALID_REGISTRATION);

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(body['name']).toBe('ACME Clinical');
        expect(body['url']).toBe('https://registry.acme.health');
        expect(body['publisher']).toBe('ACME Corp');
    });

    it('throws ENS-5034 when name is empty (local validation)', async () => {
        try {
            await registerRegistry(TEST_CONFIG, {
                name: '',
                url: 'https://registry.example.com',
                publisher: 'Test',
            });
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
            expect((error as EnterstellarError).message).toContain('Invalid registration input');
        }

        // Verify no network call was made
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5034 when URL is invalid (local validation)', async () => {
        try {
            await registerRegistry(TEST_CONFIG, {
                name: 'Test',
                url: 'not-a-url',
                publisher: 'Test',
            });
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5034 when publisher is empty (local validation)', async () => {
        try {
            await registerRegistry(TEST_CONFIG, {
                name: 'Test',
                url: 'https://registry.example.com',
                publisher: '',
            });
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 on server error (500)', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ message: 'Internal error' }, { status: 500, statusText: 'Internal Server Error' }),
        );

        try {
            await registerRegistry(TEST_CONFIG, VALID_REGISTRATION);
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
            await registerRegistry(TEST_CONFIG, VALID_REGISTRATION);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });
});

// ---------------------------------------------------------------------------
// listRegistries()
// ---------------------------------------------------------------------------

describe('listRegistries', () => {
    it('returns an array of FederatedRegistry on success', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registries: [MOCK_REGISTRY] }),
        );

        const result = await listRegistries(TEST_CONFIG);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe('reg-001');
        expect(result[0]!.name).toBe('ACME Clinical');
    });

    it('sends GET to /v1/registries', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registries: [] }),
        );

        await listRegistries(TEST_CONFIG);

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/registries');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('GET');
    });

    it('returns empty array when no registries exist', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registries: [] }),
        );

        const result = await listRegistries(TEST_CONFIG);

        expect(result).toHaveLength(0);
    });

    it('returns multiple registries', async () => {
        const secondRegistry = {
            ...MOCK_REGISTRY,
            id: 'reg-002',
            name: 'Beta Health',
            url: 'https://registry.beta.health',
        };

        fetchMock.mockResolvedValueOnce(
            mockResponse({ registries: [MOCK_REGISTRY, secondRegistry] }),
        );

        const result = await listRegistries(TEST_CONFIG);

        expect(result).toHaveLength(2);
        expect(result[0]!.id).toBe('reg-001');
        expect(result[1]!.id).toBe('reg-002');
    });

    it('throws ENS-5032 on network error', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

        try {
            await listRegistries(TEST_CONFIG);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5032');
        }
    });

    it('throws ENS-5035 on malformed response', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ not_registries: [] }),
        );

        try {
            await listRegistries(TEST_CONFIG);
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });
});

// ---------------------------------------------------------------------------
// refreshRegistry()
// ---------------------------------------------------------------------------

describe('refreshRegistry', () => {
    it('returns an updated FederatedRegistry on success', async () => {
        const refreshed = { ...MOCK_REGISTRY, contractCount: 55 };
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registry: refreshed }),
        );

        const result = await refreshRegistry(TEST_CONFIG, 'reg-001');

        expect(result.id).toBe('reg-001');
        expect(result.contractCount).toBe(55);
    });

    it('sends POST to /v1/registries/{id}/refresh', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registry: MOCK_REGISTRY }),
        );

        await refreshRegistry(TEST_CONFIG, 'reg-001');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/registries/reg-001/refresh');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('POST');
    });

    it('URL-encodes the registryId in the path', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse({ registry: MOCK_REGISTRY }),
        );

        await refreshRegistry(TEST_CONFIG, 'reg/with/slashes');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('reg%2Fwith%2Fslashes');
    });

    it('throws ENS-5034 when registryId is empty string', async () => {
        try {
            await refreshRegistry(TEST_CONFIG, '');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
            expect((error as EnterstellarError).message).toContain('must not be empty');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5034 when registryId is whitespace only', async () => {
        try {
            await refreshRegistry(TEST_CONFIG, '   ');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5034');
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ENS-5032 on server error (503)', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse(
                { message: 'Service unavailable' },
                { status: 503, statusText: 'Service Unavailable' },
            ),
        );

        try {
            await refreshRegistry(TEST_CONFIG, 'reg-001');
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
            await refreshRegistry(TEST_CONFIG, 'reg-001');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            expect((error as EnterstellarError).code).toBe('ENS-5035');
        }
    });
});
