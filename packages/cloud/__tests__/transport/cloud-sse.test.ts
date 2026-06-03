/**
 * @module @enterstellar-ai/cloud/__tests__/transport/cloud-sse.test
 * @description Tests for the Enterstellar Cloud SSE transport (forge streaming).
 *
 * Covers:
 * - SSE event parsing via `eventsource-parser` integration.
 * - Fragment type discrimination: `meta`, `node`, `property`, `complete`, `error`.
 * - `ipu` present on `meta` and `complete` fragments, absent on others (F18).
 * - `ipu` is `null` in anonymous mode (AG8).
 * - 429 response throws `CloudError` before any fragments yielded (SD3).
 * - Stream terminates after `complete` or `error` event.
 * - `X-Idempotency-Key` sent on streaming requests (AM10).
 *
 * All tests mock `globalThis.fetch` — no real network calls.
 *
 * @see Design Choice SD6 — streaming forge via SSE.
 * @see Design Choice SD9 — `eventsource-parser` as only runtime dep.
 * @see Design Choice CF6 — SSE event types.
 * @see Audit Finding F18 — IPU on `meta` and `complete` fragments.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCloudSSETransport } from '../../src/transport/cloud-sse.js';
import type { CloudSSETransport } from '../../src/transport/cloud-sse.js';
import { CloudError } from '../../src/errors.js';
import type { ForgeFragment, CloudIPU } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a `ReadableStream` that emits SSE-formatted text chunks.
 *
 * @param events - Array of SSE event strings (each should end with `\n\n`).
 * @returns A ReadableStream<Uint8Array> suitable for mocking `response.body`.
 */
function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
        start(controller): void {
            for (const event of events) {
                controller.enqueue(encoder.encode(event));
            }
            controller.close();
        },
    });
}

/**
 * Formats an SSE event string.
 *
 * @param eventType - The SSE `event:` field value.
 * @param data - The JSON data to include in the `data:` field.
 * @returns Formatted SSE event string ending with `\n\n`.
 */
function formatSSEEvent(eventType: string, data: unknown): string {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates a mock `Response` for a successful SSE stream.
 */
function mockSSEResponse(
    events: string[],
    ipuHeaders: Record<string, string> = {},
): Response {
    const defaultHeaders: Record<string, string> = {
        'X-IPU-Used': '10',
        'X-IPU-Remaining': '990',
        'X-IPU-Cost': '10',
        'X-Request-Id': 'req_sse_test',
        ...ipuHeaders,
    };

    const responseHeaders = new Headers(defaultHeaders);

    return {
        ok: true,
        status: 200,
        headers: responseHeaders,
        body: createSSEStream(events),
    } as unknown as Response;
}

/**
 * Creates a mock `Response` for a 429 error (non-SSE).
 */
function mock429Response(): Response {
    const responseHeaders = new Headers({
        'X-Request-Id': 'req_429_sse',
    });

    const errorBody = {
        error: {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
            upgradeUrl: 'https://cloud.enterstellar.dev/billing/upgrade',
        },
    };

    return {
        ok: false,
        status: 429,
        headers: responseHeaders,
        json: vi.fn().mockResolvedValue(errorBody),
    } as unknown as Response;
}

/**
 * Collects all fragments from an async generator.
 */
async function collectFragments(
    gen: AsyncGenerator<ForgeFragment, void, undefined>,
): Promise<ForgeFragment[]> {
    const fragments: ForgeFragment[] = [];
    for await (const fragment of gen) {
        fragments.push(fragment);
    }
    return fragments;
}

// ---------------------------------------------------------------------------
// Test Config
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
    endpoint: 'https://api.enterstellar.dev',
    apiKey: 'test_api_key_abc123',
    timeoutMs: 30_000,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — CloudSSETransport', () => {
    let sseTransport: CloudSSETransport;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        sseTransport = createCloudSSETransport(TEST_CONFIG);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // SSE Event Parsing (CF6)
    // -----------------------------------------------------------------------

    describe('SSE Event Parsing (CF6)', () => {
        it('yields meta, node, complete fragments in lifecycle order', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('node', { name: 'VitalsCard', type: 'component' }),
                formatSSEEvent('complete', {
                    name: 'VitalsCard',
                    type: 'component',
                    version: '1.0.0',
                }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            expect(fragments).toHaveLength(3);
            expect(fragments[0]?.type).toBe('meta');
            expect(fragments[1]?.type).toBe('node');
            expect(fragments[2]?.type).toBe('complete');
        });

        it('yields property fragments', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'anthropic', model: 'claude-3' }),
                formatSSEEvent('property', { path: 'props.label', value: 'Heart Rate' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            const propFragment = fragments.find((f) => f.type === 'property');
            expect(propFragment).toBeDefined();
            expect(propFragment?.type).toBe('property');
            if (propFragment?.type === 'property') {
                expect(propFragment.data.path).toBe('props.label');
                expect(propFragment.data.value).toBe('Heart Rate');
            }
        });

        it('yields error fragment and terminates stream', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('error', { code: 'GENERATION_FAILED', message: 'Model error' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            expect(fragments).toHaveLength(2);
            expect(fragments[1]?.type).toBe('error');
            if (fragments[1]?.type === 'error') {
                expect(fragments[1].data.code).toBe('GENERATION_FAILED');
                expect(fragments[1].data.message).toBe('Model error');
            }
        });

        it('skips unrecognized SSE event types (forward compatibility)', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('heartbeat', { ts: 12345 }), // Unknown type.
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            // Should skip 'heartbeat' — only meta + complete.
            expect(fragments).toHaveLength(2);
            expect(fragments[0]?.type).toBe('meta');
            expect(fragments[1]?.type).toBe('complete');
        });
    });

    // -----------------------------------------------------------------------
    // IPU on Fragments (F18)
    // -----------------------------------------------------------------------

    describe('IPU on Fragments (F18)', () => {
        it('injects ipu on meta and complete fragments', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('node', { name: 'VitalsCard' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events, {
                'X-IPU-Used': '42',
                'X-IPU-Remaining': '958',
                'X-IPU-Cost': '10',
            }));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            // meta fragment has ipu.
            const metaFragment = fragments[0];
            expect(metaFragment?.type).toBe('meta');
            if (metaFragment?.type === 'meta') {
                const ipu = metaFragment.ipu as CloudIPU;
                expect(ipu.used).toBe(42);
                expect(ipu.remaining).toBe(958);
                expect(ipu.cost).toBe(10);
            }

            // complete fragment has ipu.
            const completeFragment = fragments[2];
            expect(completeFragment?.type).toBe('complete');
            if (completeFragment?.type === 'complete') {
                const ipu = completeFragment.ipu as CloudIPU;
                expect(ipu.used).toBe(42);
                expect(ipu.remaining).toBe(958);
                expect(ipu.cost).toBe(10);
            }
        });

        it('node and property fragments do NOT have ipu', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('node', { name: 'VitalsCard' }),
                formatSSEEvent('property', { path: 'props.label', value: 'HR' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            const nodeFragment = fragments.find((f) => f.type === 'node');
            const propFragment = fragments.find((f) => f.type === 'property');

            // node and property fragments should NOT have an ipu property.
            expect(nodeFragment).toBeDefined();
            expect(propFragment).toBeDefined();
            expect('ipu' in (nodeFragment ?? {})).toBe(false);
            expect('ipu' in (propFragment ?? {})).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode (AG8)
    // -----------------------------------------------------------------------

    describe('Anonymous Mode (AG8)', () => {
        it('sets ipu to null on meta and complete when isAnonymous=true', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            const fragments = await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: true }),
            );

            if (fragments[0]?.type === 'meta') {
                expect(fragments[0].ipu).toBeNull();
            }
            if (fragments[1]?.type === 'complete') {
                expect(fragments[1].ipu).toBeNull();
            }
        });
    });

    // -----------------------------------------------------------------------
    // 429 Pre-Stream (SD3)
    // -----------------------------------------------------------------------

    describe('429 Pre-Stream (SD3)', () => {
        it('throws CloudError on 429 before yielding any fragments', async () => {
            fetchMock.mockResolvedValue(mock429Response());

            await expect(
                collectFragments(
                    sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
                ),
            ).rejects.toThrow(CloudError);
        });

        it('includes cloudCode ENS-C4290 on 429', async () => {
            fetchMock.mockResolvedValue(mock429Response());

            try {
                await collectFragments(
                    sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
                );
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.cloudCode).toBe('ENS-C4290');
                expect(cloudError.upgradeUrl).toBe('https://cloud.enterstellar.dev/billing/upgrade');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Request Headers
    // -----------------------------------------------------------------------

    describe('Request Headers', () => {
        it('sends Accept: text/event-stream', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['Accept']).toBe('text/event-stream');
        });

        it('sends X-Idempotency-Key (forge is 10 IPU)', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;
            expect(headers['X-Idempotency-Key']).toBeDefined();
            expect(headers['X-Idempotency-Key'].length).toBe(26);
        });

        it('sends POST to /v1/forge', async () => {
            const events = [
                formatSSEEvent('meta', { provider: 'openai', model: 'gpt-4o' }),
                formatSSEEvent('complete', { name: 'VitalsCard' }),
            ];

            fetchMock.mockResolvedValue(mockSSEResponse(events));

            await collectFragments(
                sseTransport.stream({ body: { intent: 'vitals' }, isAnonymous: false }),
            );

            const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.enterstellar.dev/v1/forge');
            expect(options.method).toBe('POST');
        });
    });
});
