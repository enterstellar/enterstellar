/**
 * @module @enterstellar-ai/migration/__tests__/byo-key-provider
 * @description Unit tests for the BYO-key enrichment provider.
 *
 * Tests use mocked `globalThis.fetch` to simulate OpenAI-compatible
 * API responses. Covers success paths, JSON extraction, rate limiting,
 * error mapping, and response validation.
 *
 * @see Correction 3 — BYOKeyEnrichmentProvider spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { BYOKeyEnrichmentProvider } from '../src/enrichment/byo-key-provider.js';
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
        name: 'TestWidget',
        props: z.object({ title: z.string() }),
        defaultProps: {},
        generics: [],
        existingZodSchemas: [],
        eventHandlers: [],
        description: { value: 'TODO: Add description', source: 'heuristic-fallback' },
        tags: { value: [], source: 'heuristic-fallback' },
        category: { value: 'utility', source: 'heuristic-fallback' },
        intent: { value: 'Render TestWidget', source: 'heuristic-fallback' },
        ariaAttributes: { value: {}, source: 'heuristic-fallback' },
        designTokenRefs: { value: [], source: 'heuristic-fallback' },
        lifecycleStates: { value: [], source: 'heuristic-fallback' },
    };
}

const SOURCE = 'export function TestWidget() { return <div />; }';

/**
 * Creates a valid OpenAI chat completion response body containing
 * a SemanticOverlay JSON in the content.
 */
function createSuccessResponse(overlayJson: string): object {
    return {
        choices: [{ message: { content: overlayJson } }],
    };
}

/**
 * Creates a mock fetch that returns the given status and body.
 */
function mockFetch(status: number, body: object, headers?: Record<string, string>): void {
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

/**
 * Creates a mock fetch that always returns 429 (for retry testing).
 */
function mockFetchAlways429(): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: vi.fn().mockResolvedValue({}),
        headers: {
            get: (): null => null,
        },
    }));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Successful Enrichment
// ---------------------------------------------------------------------------

describe('BYOKeyEnrichmentProvider — success', () => {
    it('returns a valid SemanticOverlay on success', async () => {
        const overlay = JSON.stringify({
            fields: [
                { key: 'description', value: 'A test widget for testing' },
                { key: 'tags', value: ['test', 'widget'] },
            ],
        });
        mockFetch(200, createSuccessResponse(overlay));

        const provider = new BYOKeyEnrichmentProvider('test-key');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields).toHaveLength(2);
        expect(result.fields[0]).toEqual({ key: 'description', value: 'A test widget for testing' });
    });

    it('sends correct request to /v1/chat/completions', async () => {
        const overlay = JSON.stringify({ fields: [] });
        mockFetch(200, createSuccessResponse(overlay));

        const provider = new BYOKeyEnrichmentProvider('my-key', 'gpt-4o', 'https://api.example.com');
        await provider.enrich(createManifest(), SOURCE);

        const fetchMock = vi.mocked(globalThis.fetch);
        expect(fetchMock).toHaveBeenCalledOnce();

        const [url, options] = fetchMock.mock.calls[0]!;
        expect(url).toBe('https://api.example.com/v1/chat/completions');
        expect(options).toHaveProperty('method', 'POST');

        const headers = options?.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer my-key');
        expect(headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(options?.body as string) as Record<string, unknown>;
        expect(body['model']).toBe('gpt-4o');
    });
});

// ---------------------------------------------------------------------------
// JSON Extraction (Markdown Fences)
// ---------------------------------------------------------------------------

describe('BYOKeyEnrichmentProvider — JSON extraction', () => {
    it('extracts JSON from markdown code fences', async () => {
        const jsonContent = '{ "fields": [{ "key": "description", "value": "Fenced" }] }';
        const fencedContent = '```json\n' + jsonContent + '\n```';
        mockFetch(200, createSuccessResponse(fencedContent));

        const provider = new BYOKeyEnrichmentProvider('test-key');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields[0]).toEqual({ key: 'description', value: 'Fenced' });
    });

    it('extracts JSON from bare code fences (no language)', async () => {
        const jsonContent = '{ "fields": [{ "key": "intent", "value": "Show a widget" }] }';
        const fencedContent = '```\n' + jsonContent + '\n```';
        mockFetch(200, createSuccessResponse(fencedContent));

        const provider = new BYOKeyEnrichmentProvider('test-key');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields[0]).toEqual({ key: 'intent', value: 'Show a widget' });
    });

    it('handles raw JSON without fences', async () => {
        const overlay = JSON.stringify({ fields: [{ key: 'category', value: 'clinical' }] });
        mockFetch(200, createSuccessResponse(overlay));

        const provider = new BYOKeyEnrichmentProvider('test-key');
        const result = await provider.enrich(createManifest(), SOURCE);

        expect(result.fields[0]).toEqual({ key: 'category', value: 'clinical' });
    });
});

// ---------------------------------------------------------------------------
// Validation (Hallucination Handling)
// ---------------------------------------------------------------------------

describe('BYOKeyEnrichmentProvider — validation', () => {
    it('throws PARSE_ERROR for invalid JSON', async () => {
        mockFetch(200, createSuccessResponse('not valid json {{{'));

        const provider = new BYOKeyEnrichmentProvider('test-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);

        try {
            await provider.enrich(createManifest(), SOURCE);
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('PARSE_ERROR');
        }
    });

    it('throws PARSE_ERROR for invalid schema shape', async () => {
        // Valid JSON but wrong shape — missing "fields" key
        const invalidOverlay = JSON.stringify({ wrong: 'shape' });
        mockFetch(200, createSuccessResponse(invalidOverlay));

        const provider = new BYOKeyEnrichmentProvider('test-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);
    });

    it('throws PARSE_ERROR when choices array is empty', async () => {
        mockFetch(200, { choices: [] });

        const provider = new BYOKeyEnrichmentProvider('test-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);
    });
});

// ---------------------------------------------------------------------------
// Error Mapping (HTTP Status → EnrichmentError)
// ---------------------------------------------------------------------------

describe('BYOKeyEnrichmentProvider — error mapping', () => {
    it('throws AUTH_FAILED on 401', async () => {
        mockFetch(401, { error: 'unauthorized' });

        const provider = new BYOKeyEnrichmentProvider('bad-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);

        try {
            await provider.enrich(createManifest(), SOURCE);
        } catch (err: unknown) {
            expect((err as EnrichmentError).code).toBe('AUTH_FAILED');
        }
    });

    it('throws AUTH_FAILED on 403', async () => {
        mockFetch(403, { error: 'forbidden' });

        const provider = new BYOKeyEnrichmentProvider('bad-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);

        try {
            await provider.enrich(createManifest(), SOURCE);
        } catch (err: unknown) {
            expect((err as EnrichmentError).code).toBe('AUTH_FAILED');
        }
    });

    it('throws PROVIDER_ERROR on 500', async () => {
        mockFetch(500, { error: 'internal server error' });

        const provider = new BYOKeyEnrichmentProvider('test-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);

        try {
            await provider.enrich(createManifest(), SOURCE);
        } catch (err: unknown) {
            expect((err as EnrichmentError).code).toBe('PROVIDER_ERROR');
        }
    });

    it('throws PROVIDER_ERROR on network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

        const provider = new BYOKeyEnrichmentProvider('test-key');

        await expect(provider.enrich(createManifest(), SOURCE))
            .rejects
            .toThrow(EnrichmentError);

        try {
            await provider.enrich(createManifest(), SOURCE);
        } catch (err: unknown) {
            expect((err as EnrichmentError).code).toBe('PROVIDER_ERROR');
            expect((err as EnrichmentError).message).toContain('fetch failed');
        }
    });
});

// ---------------------------------------------------------------------------
// Rate Limiting (429 Retry Logic)
// ---------------------------------------------------------------------------

describe('BYOKeyEnrichmentProvider — rate limiting', () => {
    it('throws RATE_LIMITED after max retries on persistent 429', async () => {
        // Use real timers for this test — fake timers cause unhandled
        // rejections when the promise rejects across timer boundaries.
        vi.useRealTimers();

        // Mock setTimeout to resolve instantly (no real delay)
        vi.stubGlobal('setTimeout', (cb: () => void) => {
            cb();
            return 0;
        });

        mockFetchAlways429();

        const provider = new BYOKeyEnrichmentProvider('test-key');

        try {
            await provider.enrich(createManifest(), SOURCE);
            // Should not reach here
            expect.unreachable('Expected EnrichmentError to be thrown');
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(EnrichmentError);
            expect((err as EnrichmentError).code).toBe('RATE_LIMITED');
        }

        // Verify fetch was called MAX_RETRIES + 1 times (initial + 3 retries)
        const fetchMock = vi.mocked(globalThis.fetch);
        expect(fetchMock).toHaveBeenCalledTimes(4);

        // Re-enable fake timers for afterEach cleanup
        vi.useFakeTimers();
    });

    it('succeeds on retry after transient 429', async () => {
        vi.useRealTimers();

        vi.stubGlobal('setTimeout', (cb: () => void) => {
            cb();
            return 0;
        });

        const overlay = JSON.stringify({ fields: [{ key: 'description', value: 'Retried' }] });
        let callCount = 0;

        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // First call: 429
                return Promise.resolve({
                    ok: false,
                    status: 429,
                    json: vi.fn().mockResolvedValue({}),
                    headers: { get: (): null => null },
                });
            }
            // Second call: success
            return Promise.resolve({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(createSuccessResponse(overlay)),
                headers: { get: (): null => null },
            });
        }));

        const provider = new BYOKeyEnrichmentProvider('test-key');

        const result = await provider.enrich(createManifest(), SOURCE);
        expect(result.fields[0]).toEqual({ key: 'description', value: 'Retried' });
        expect(callCount).toBe(2);

        vi.useFakeTimers();
    });
});

// ---------------------------------------------------------------------------
// Source Truncation
// ---------------------------------------------------------------------------

describe('BYOKeyEnrichmentProvider — source truncation', () => {
    it('includes truncation marker in prompt for long source', async () => {
        const longSource = 'x'.repeat(50);
        const overlay = JSON.stringify({ fields: [] });
        mockFetch(200, createSuccessResponse(overlay));

        // Use very small maxSourceChars to trigger truncation
        const provider = new BYOKeyEnrichmentProvider('test-key', 'gpt-4o-mini', 'https://api.openai.com', 10);
        await provider.enrich(createManifest(), longSource);

        // Verify the request body contains the truncated source
        const fetchMock = vi.mocked(globalThis.fetch);
        const body = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string) as {
            messages: readonly { content: string }[];
        };
        const userMessage = body.messages[1]!.content;
        expect(userMessage).toContain('[truncated');
    });
});
