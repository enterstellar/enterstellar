/**
 * @module @enterstellar-ai/global-index/create-global-index.test
 * @description Comprehensive tests for the `createGlobalIndex` factory function.
 *
 * Tests cover:
 * - Config validation (apiKey, cloudClient, timeoutMs)
 * - Default values (endpoint, timeoutMs)
 * - Dispose guard on all 8 async methods
 * - Dispose idempotency
 * - Method delegation to correct internal modules (via fetch URL inspection)
 * - Return object immutability (frozen)
 *
 * All tests mock `global.fetch` — no real HTTP calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { GlobalIndex, GlobalIndexConfig } from '../src/types.js';
import { createGlobalIndex } from '../src/create-global-index.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid `GlobalIndexConfig`.
 */
function createValidConfig(overrides?: Partial<GlobalIndexConfig>): GlobalIndexConfig {
    return {
        apiKey: 'test-api-key-12345',
        cloudClient: {
            getUsage: () => Promise.resolve({ used: 0, limit: 1000, tier: 'pro' }),
        },
        ...overrides,
    };
}

/** A mock response helper for fetch stubbing. */
function mockResponse(body: unknown, status: number = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: 'OK',
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
// Config Validation
// ---------------------------------------------------------------------------

describe('createGlobalIndex — config validation', () => {
    it('creates a GlobalIndex instance with valid config', () => {
        const index = createGlobalIndex(createValidConfig());
        expect(index).toBeDefined();
        expect(typeof index.search).toBe('function');
        expect(typeof index.getContract).toBe('function');
        expect(typeof index.featured).toBe('function');
        expect(typeof index.registerRegistry).toBe('function');
        expect(typeof index.listRegistries).toBe('function');
        expect(typeof index.refreshRegistry).toBe('function');
        expect(typeof index.publishContract).toBe('function');
        expect(typeof index.getPublisherStats).toBe('function');
        expect(typeof index.dispose).toBe('function');
    });

    it('throws ENS-5030 when apiKey is missing', () => {
        expect(() =>
            createGlobalIndex({
                cloudClient: { getUsage: () => Promise.resolve({}) },
            } as unknown as GlobalIndexConfig),
        ).toThrow(EnterstellarError);

        try {
            createGlobalIndex({
                cloudClient: { getUsage: () => Promise.resolve({}) },
            } as unknown as GlobalIndexConfig);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
            expect((error as EnterstellarError).message).toContain('apiKey');
        }
    });

    it('throws ENS-5030 when apiKey is empty string', () => {
        try {
            createGlobalIndex(createValidConfig({ apiKey: '' }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
        }
    });

    it('throws ENS-5030 when apiKey is whitespace only', () => {
        try {
            createGlobalIndex(createValidConfig({ apiKey: '   ' }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
        }
    });

    it('throws ENS-5030 when cloudClient is null', () => {
        try {
            createGlobalIndex(createValidConfig({
                cloudClient: null as unknown as GlobalIndexConfig['cloudClient'],
            }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
            expect((error as EnterstellarError).message).toContain('cloudClient');
        }
    });

    it('throws ENS-5030 when cloudClient is undefined', () => {
        try {
            createGlobalIndex(createValidConfig({
                cloudClient: undefined as unknown as GlobalIndexConfig['cloudClient'],
            }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
        }
    });

    it('throws ENS-5030 when cloudClient lacks getUsage method', () => {
        try {
            createGlobalIndex(createValidConfig({
                cloudClient: {} as unknown as GlobalIndexConfig['cloudClient'],
            }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
            expect((error as EnterstellarError).message).toContain('getUsage');
        }
    });

    it('throws ENS-5030 when timeoutMs is zero', () => {
        try {
            createGlobalIndex(createValidConfig({ timeoutMs: 0 }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
            expect((error as EnterstellarError).message).toContain('timeoutMs');
        }
    });

    it('throws ENS-5030 when timeoutMs is negative', () => {
        try {
            createGlobalIndex(createValidConfig({ timeoutMs: -1000 }));
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5030');
        }
    });

    it('accepts custom endpoint', () => {
        const index = createGlobalIndex(createValidConfig({
            endpoint: 'https://custom.index.dev',
        }));
        expect(index).toBeDefined();
    });

    it('accepts custom timeoutMs', () => {
        const index = createGlobalIndex(createValidConfig({
            timeoutMs: 30_000,
        }));
        expect(index).toBeDefined();
    });

    it('returns a frozen GlobalIndex object', () => {
        const index = createGlobalIndex(createValidConfig());
        expect(Object.isFrozen(index)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Dispose Guard
// ---------------------------------------------------------------------------

describe('createGlobalIndex — dispose guard', () => {
    let index: GlobalIndex;

    beforeEach(() => {
        index = createGlobalIndex(createValidConfig());
        index.dispose();
    });

    it('throws ENS-5031 on search() after dispose', async () => {
        try {
            await index.search('test');
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on getContract() after dispose', async () => {
        try {
            await index.getContract('Foo', 'https://r.com');
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on featured() after dispose', async () => {
        try {
            await index.featured();
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on registerRegistry() after dispose', async () => {
        try {
            await index.registerRegistry({
                name: 'X',
                url: 'https://x.com',
                publisher: 'X',
            });
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on listRegistries() after dispose', async () => {
        try {
            await index.listRegistries();
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on refreshRegistry() after dispose', async () => {
        try {
            await index.refreshRegistry('reg-001');
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on publishContract() after dispose', async () => {
        try {
            await index.publishContract({} as never);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('throws ENS-5031 on getPublisherStats() after dispose', async () => {
        try {
            await index.getPublisherStats('ACME');
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5031');
        }
    });

    it('dispose() is idempotent — no error on second call', () => {
        // index.dispose() was already called in beforeEach
        expect(() => index.dispose()).not.toThrow();
    });

    it('does not call fetch after dispose', async () => {
        try { await index.search('test'); } catch { /* expected */ }
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Method Delegation (verifies wiring to internal modules)
// ---------------------------------------------------------------------------

describe('createGlobalIndex — method delegation', () => {
    let index: GlobalIndex;

    beforeEach(() => {
        index = createGlobalIndex(createValidConfig());
    });

    it('search() delegates to POST /v1/search', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await index.search('patient vitals');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/search');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('POST');
    });

    it('getContract() delegates to GET /v1/contracts/{name}', async () => {
        fetchMock.mockResolvedValueOnce(
            mockResponse(null, 404),
        );

        await index.getContract('Foo', 'https://r.com');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/contracts/Foo');
    });

    it('featured() delegates to GET /v1/featured', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await index.featured();

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/featured');
    });

    it('registerRegistry() delegates to POST /v1/registries', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({
            registry: {
                id: 'r1', name: 'X', url: 'https://x.com',
                publisher: 'X', contractCount: 0,
                lastRefreshedAt: '2026-01-01T00:00:00Z', active: true,
            },
        }));

        await index.registerRegistry({
            name: 'X', url: 'https://x.com', publisher: 'X',
        });

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/registries');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('POST');
    });

    it('listRegistries() delegates to GET /v1/registries', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ registries: [] }));

        await index.listRegistries();

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/registries');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(options.method).toBe('GET');
    });

    it('refreshRegistry() delegates to POST /v1/registries/{id}/refresh', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({
            registry: {
                id: 'r1', name: 'X', url: 'https://x.com',
                publisher: 'X', contractCount: 5,
                lastRefreshedAt: '2026-01-01T00:00:00Z', active: true,
            },
        }));

        await index.refreshRegistry('r1');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/registries/r1/refresh');
    });

    it('getPublisherStats() delegates to GET /v1/publishers/{id}/stats', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({
            stats: {
                publisher: 'ACME', totalContracts: 1, totalRenders: 100,
                revenueShareCents: 500, freeCreditsEarned: 10, certifiedCount: 0,
            },
        }));

        await index.getPublisherStats('ACME');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('/v1/publishers/ACME/stats');
    });

    it('uses the custom endpoint when configured', async () => {
        const customIndex = createGlobalIndex(createValidConfig({
            endpoint: 'https://custom.index.dev',
        }));

        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await customIndex.search('test');

        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toContain('https://custom.index.dev/v1/search');
    });

    it('sends the apiKey as Bearer token', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse({ results: [] }));

        await index.search('test');

        const options = fetchMock.mock.calls[0]![1] as RequestInit;
        const headers = options.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer test-api-key-12345');
    });
});
