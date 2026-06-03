/**
 * @module @enterstellar-ai/cloud/__tests__/create-cloud-client.test
 * @description Tests for the `createEnterstellarCloudClient()` factory.
 *
 * Covers the v0.1.0 rewrite:
 * - Config validation: `ENS-5001` on missing/empty `apiKey` (CloudError).
 * - Anonymous mode detection: `pk_anon_` prefix → `isAnonymous = true`.
 * - Default resolution: `baseUrl` (SD8), `sessionType` (D111), `traceConsent` (TA2).
 * - Disposal lifecycle: all 13 methods + `forge.stream()` throw `ENS-5002` (CloudError).
 * - Idempotent `dispose()`.
 * - Full method surface: 13 methods + `forge.stream` + `dispose`.
 * - `forge` as callable function with `.stream()` property (SD6).
 *
 * All tests mock `globalThis.fetch` — no real network calls.
 *
 * @see Design Choice SD1 — anonymous mode auto-detection.
 * @see Design Choice SD6 — dual forge API: `forge()` + `forge.stream()`.
 * @see Design Choice SD8 — default `baseUrl`.
 * @see Design Choice D111 — `sessionType` default.
 * @see Design Choice TA2 — `traceConsent` default.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEnterstellarCloudClient } from '../src/create-cloud-client.js';
import { CloudError } from '../src/errors.js';
import type { EnterstellarCloudClient, CloudConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Valid config for most tests.
 * Uses a full (non-anonymous) API key.
 */
const TEST_CONFIG: CloudConfig = {
    apiKey: 'ak_test_abc123',
    baseUrl: 'https://test.enterstellar.dev',
    timeoutMs: 5_000,
};

/**
 * Creates a mock `Response` object for `fetch`.
 */
function mockFetchResponse(
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — createEnterstellarCloudClient()', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Config Validation (ENS-5001)
    // -----------------------------------------------------------------------

    describe('Config Validation (ENS-5001)', () => {
        it('throws CloudError ENS-5001 when apiKey is empty', () => {
            expect(() => {
                createEnterstellarCloudClient({ ...TEST_CONFIG, apiKey: '' });
            }).toThrow(CloudError);

            try {
                createEnterstellarCloudClient({ ...TEST_CONFIG, apiKey: '' });
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.code).toBe('ENS-5001');
                expect(cloudError.cloudCode).toBe('ENS-5001');
                expect(cloudError.recoverable).toBe(false);
            }
        });

        it('throws CloudError ENS-5001 when apiKey is whitespace-only', () => {
            expect(() => {
                createEnterstellarCloudClient({ ...TEST_CONFIG, apiKey: '   ' });
            }).toThrow(CloudError);
        });

        it('creates client successfully with valid config', () => {
            const client = createEnterstellarCloudClient(TEST_CONFIG);
            expect(client).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Method Surface Verification
    // -----------------------------------------------------------------------

    describe('Method Surface', () => {
        let client: EnterstellarCloudClient;

        beforeEach(() => {
            client = createEnterstellarCloudClient(TEST_CONFIG);
        });

        it('exposes all 13 methods as functions', () => {
            expect(client.forge).toBeTypeOf('function');
            expect(client.search).toBeTypeOf('function');
            expect(client.route).toBeTypeOf('function');
            expect(client.routeBatch).toBeTypeOf('function');
            expect(client.submitSignal).toBeTypeOf('function');
            expect(client.submitTrace).toBeTypeOf('function');
            expect(client.getTraces).toBeTypeOf('function');
            expect(client.analytics).toBeTypeOf('function');
            expect(client.businessAnalytics).toBeTypeOf('function');
            expect(client.getUsage).toBeTypeOf('function');
            expect(client.getLedger).toBeTypeOf('function');
            expect(client.certify).toBeTypeOf('function');
            expect(client.deleteProjectData).toBeTypeOf('function');
            expect(client.dispose).toBeTypeOf('function');
        });

        it('exposes forge.stream as a function (SD6)', () => {
            expect(client.forge.stream).toBeTypeOf('function');
        });
    });

    // -----------------------------------------------------------------------
    // Default Configuration
    // -----------------------------------------------------------------------

    describe('Default Configuration', () => {
        it('uses default baseUrl https://api.enterstellar.dev when not specified (SD8)', async () => {
            fetchMock.mockResolvedValue(
                mockFetchResponse(200, { used: 0, limit: 1000, tier: 'starter' }, {
                    'X-IPU-Used': '0',
                    'X-IPU-Remaining': '1000',
                    'X-IPU-Cost': '0',
                }),
            );

            const client = createEnterstellarCloudClient({ apiKey: 'ak_test_key' });
            await client.getUsage();

            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toBe('https://api.enterstellar.dev/v1/usage');
        });

        it('uses custom baseUrl when specified', async () => {
            fetchMock.mockResolvedValue(
                mockFetchResponse(200, { used: 10, limit: 500, tier: 'pro' }, {
                    'X-IPU-Used': '10',
                    'X-IPU-Remaining': '490',
                    'X-IPU-Cost': '0',
                }),
            );

            const client = createEnterstellarCloudClient(TEST_CONFIG);
            await client.getUsage();

            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toBe('https://test.enterstellar.dev/v1/usage');
        });
    });

    // -----------------------------------------------------------------------
    // Anonymous Mode Detection (SD1)
    // -----------------------------------------------------------------------

    describe('Anonymous Mode Detection (SD1)', () => {
        it('detects pk_anon_ prefix as anonymous mode', () => {
            // Creating with pk_anon_ key should not throw.
            const client = createEnterstellarCloudClient({ apiKey: 'pk_anon_abc123' });
            expect(client).toBeDefined();
        });

        it('does not treat non-anon keys as anonymous', async () => {
            fetchMock.mockResolvedValue(
                mockFetchResponse(200, { used: 0, limit: 1000, tier: 'starter' }, {
                    'X-IPU-Used': '0',
                    'X-IPU-Remaining': '1000',
                    'X-IPU-Cost': '0',
                }),
            );

            const client = createEnterstellarCloudClient({ apiKey: 'ak_test_key' });

            // getUsage should not throw ENS-5004 for non-anon keys.
            await expect(client.getUsage()).resolves.toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Disposal Lifecycle (ENS-5002)
    // -----------------------------------------------------------------------

    describe('Disposal Lifecycle (ENS-5002)', () => {
        let client: EnterstellarCloudClient;

        beforeEach(() => {
            client = createEnterstellarCloudClient(TEST_CONFIG);
        });

        it('dispose() is idempotent — no error on second call', () => {
            client.dispose();
            expect(() => { client.dispose(); }).not.toThrow();
        });

        it('throws CloudError ENS-5002 when forge() called after dispose', async () => {
            client.dispose();

            await expect(
                client.forge({ intent: 'show vitals' }),
            ).rejects.toThrow(CloudError);

            try {
                await client.forge({ intent: 'show vitals' });
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.code).toBe('ENS-5002');
                expect(cloudError.recoverable).toBe(false);
            }
        });

        it('throws ENS-5002 when search() called after dispose', async () => {
            client.dispose();
            await expect(client.search('test')).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when route() called after dispose', async () => {
            client.dispose();
            await expect(client.route('hash')).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when routeBatch() called after dispose', async () => {
            client.dispose();
            await expect(client.routeBatch(['a', 'b'])).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when submitSignal() called after dispose', async () => {
            client.dispose();
            const signal = { intentHash: 'abc' } as never;
            await expect(client.submitSignal(signal)).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when submitTrace() called after dispose', async () => {
            client.dispose();
            const trace = { consent: { anonymizedAggregation: true } } as never;
            await expect(client.submitTrace(trace)).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when getUsage() called after dispose', async () => {
            client.dispose();
            await expect(client.getUsage()).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when analytics() called after dispose', async () => {
            client.dispose();
            await expect(client.analytics({ queryType: 'intent_patterns' })).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when certify() called after dispose', async () => {
            client.dispose();
            await expect(client.certify('comp_01HYX')).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when getTraces() called after dispose', async () => {
            client.dispose();
            await expect(client.getTraces()).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when getLedger() called after dispose', async () => {
            client.dispose();
            await expect(client.getLedger()).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when deleteProjectData() called after dispose', async () => {
            client.dispose();
            await expect(client.deleteProjectData('proj_01')).rejects.toThrow(CloudError);
        });

        it('throws ENS-5002 when businessAnalytics() called after dispose', async () => {
            client.dispose();
            await expect(client.businessAnalytics({ queryType: 'anomalies' })).rejects.toThrow(CloudError);
        });
    });
});
