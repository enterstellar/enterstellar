/**
 * @module @enterstellar-ai/migration/__tests__/cloud-provider
 * @description Unit tests for the Enterstellar Cloud enrichment provider.
 *
 * Tests use mocked `globalThis.fetch` to simulate Enterstellar Cloud API
 * responses. Covers success paths, IPU tracking, error mapping,
 * and defensive validation.
 *
 * @see Correction 3 — CloudEnrichmentProvider spec
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';

import { CloudEnrichmentProvider } from '../src/enrichment/cloud-provider.js';
import { EnrichmentError } from '../src/enrichment/types.js';
import type { StructuralManifest } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixture Factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal manifest with all heuristic-fallback fields.
 */
function createManifest(): StructuralManifest {
    return {
        name: 'TestComponent',
        props: z.object({ label: z.string() }),
        defaultProps: {},
        generics: [],
        existingZodSchemas: [],
        eventHandlers: [],
        description: { value: 'TODO: Add description', source: 'heuristic-fallback' },
        tags: { value: [], source: 'heuristic-fallback' },
        category: { value: 'utility', source: 'heuristic-fallback' },
        intent: { value: 'Render TestComponent', source: 'heuristic-fallback' },
        ariaAttributes: { value: {}, source: 'heuristic-fallback' },
        designTokenRefs: { value: [], source: 'heuristic-fallback' },
        lifecycleStates: { value: [], source: 'heuristic-fallback' },
    };
}

const SOURCE = 'export function TestComponent() { return <div />; }';

/**
 * Creates a valid Cloud enrichment response body.
 */
function createCloudResponse(fields: readonly object[]): object {
    return {
        overlay: {
            fields,
        },
    };
}

/**
 * Creates a mock fetch that returns the given status, body, and headers.
 */
function mockFetch(
    status: number,
    body: object,
    headers?: Record<string, string>,
): void {
    const headerMap = new Map(Object.entries(headers ?? {}));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
        headers: {
            get: (name: string): string | null => headerMap.get(name) ?? null,
        },
    }));
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Successful Enrichment
// ---------------------------------------------------------------------------

describe('CloudEnrichmentProvider — success', () => {
    it('returns a valid SemanticOverlay on success', async () => {
        const responseBody = createCloudResponse([
            { key: 'description', value: 'A test component for testing' },
            { key: 'tags', value: ['test', 'ui'] },
        ]);
        mockFetch(200, responseBody);

        const provider = new CloudEnrichmentProvider('session-token-xxx');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields).toHaveLength(2);
        expect(result.fields[0]).toEqual({ key: 'description', value: 'A test component for testing' });
        expect(result.fields[1]).toEqual({ key: 'tags', value: ['test', 'ui'] });
    });

    it('sends correct request to endpoint', async () => {
        mockFetch(200, createCloudResponse([]));

        const provider = new CloudEnrichmentProvider(
            'my-session-token',
            'https://api.custom.dev/v1/forge/enrich',
        );
        await provider.enrich(createManifest(), SOURCE);

        const fetchMock = vi.mocked(globalThis.fetch);
        expect(fetchMock).toHaveBeenCalledOnce();

        const [url, options] = fetchMock.mock.calls[0]!;
        expect(url).toBe('https://api.custom.dev/v1/forge/enrich');
        expect(options).toHaveProperty('method', 'POST');

        const headers = options?.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer my-session-token');
        expect(headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(options?.body as string) as Record<string, unknown>;
        expect(body).toHaveProperty('manifest');
        expect(body).toHaveProperty('source');
    });

    it('handles empty overlay fields', async () => {
        mockFetch(200, createCloudResponse([]));

        const provider = new CloudEnrichmentProvider('token');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// IPU Tracking
// ---------------------------------------------------------------------------

describe('CloudEnrichmentProvider — IPU tracking', () => {
    it('invokes onIPU callback with X-IPU-Remaining header value', async () => {
        const onIPU = vi.fn();
        mockFetch(200, createCloudResponse([]), { 'X-IPU-Remaining': '42' });

        const provider = new CloudEnrichmentProvider('token', undefined, onIPU);
        await provider.enrich(createManifest(), SOURCE);

        expect(onIPU).toHaveBeenCalledOnce();
        expect(onIPU).toHaveBeenCalledWith(42);
    });

    it('does not invoke onIPU when header is missing', async () => {
        const onIPU = vi.fn();
        mockFetch(200, createCloudResponse([]));

        const provider = new CloudEnrichmentProvider('token', undefined, onIPU);
        await provider.enrich(createManifest(), SOURCE);

        expect(onIPU).not.toHaveBeenCalled();
    });

    it('does not invoke onIPU when callback is not provided', async () => {
        // No onIPU callback — should not throw
        mockFetch(200, createCloudResponse([]), { 'X-IPU-Remaining': '10' });

        const provider = new CloudEnrichmentProvider('token');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields).toEqual([]);
    });

    it('ignores non-numeric X-IPU-Remaining header', async () => {
        const onIPU = vi.fn();
        mockFetch(200, createCloudResponse([]), { 'X-IPU-Remaining': 'invalid' });

        const provider = new CloudEnrichmentProvider('token', undefined, onIPU);
        await provider.enrich(createManifest(), SOURCE);

        expect(onIPU).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Error Mapping
// ---------------------------------------------------------------------------

describe('CloudEnrichmentProvider — error mapping', () => {
    it('throws AUTH_FAILED on 401', async () => {
        mockFetch(401, { error: 'unauthorized' });

        const provider = new CloudEnrichmentProvider('expired-token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('AUTH_FAILED');
            expect((err as EnrichmentError).message).toContain('enterstellar login');
        }
    });

    it('throws QUOTA_EXHAUSTED on 402', async () => {
        mockFetch(402, { error: 'payment required' });

        const provider = new CloudEnrichmentProvider('token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('QUOTA_EXHAUSTED');
        }
    });

    it('throws QUOTA_EXHAUSTED on 429', async () => {
        mockFetch(429, { error: 'rate limited' });

        const provider = new CloudEnrichmentProvider('token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('QUOTA_EXHAUSTED');
        }
    });

    it('throws PROVIDER_ERROR on 500', async () => {
        mockFetch(500, { error: 'internal server error' });

        const provider = new CloudEnrichmentProvider('token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('PROVIDER_ERROR');
        }
    });

    it('throws PROVIDER_ERROR on network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

        const provider = new CloudEnrichmentProvider('token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('PROVIDER_ERROR');
            expect((err as EnrichmentError).message).toContain('fetch failed');
        }
    });
});

// ---------------------------------------------------------------------------
// Defensive Validation
// ---------------------------------------------------------------------------

describe('CloudEnrichmentProvider — defensive validation', () => {
    it('throws PARSE_ERROR for invalid response shape', async () => {
        // Server returns wrong shape — overlay missing
        mockFetch(200, { wrong: 'shape' });

        const provider = new CloudEnrichmentProvider('token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('PARSE_ERROR');
        }
    });

    it('throws PARSE_ERROR for non-JSON response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockRejectedValue(new SyntaxError('not json')),
            headers: {
                get: (): null => null,
            },
        }));

        const provider = new CloudEnrichmentProvider('token');

        try {
            await provider.enrich(createManifest(), SOURCE);
            expect.unreachable('Expected EnrichmentError');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('PARSE_ERROR');
        }
    });
});
