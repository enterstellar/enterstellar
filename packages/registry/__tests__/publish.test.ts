/**
 * @module @enterstellar-ai/registry/__tests__/publish
 * @description Integration tests for `registry.publish()` — the remote
 * contract publishing API.
 *
 * Exercises the full `fetch`-based publish flow:
 * - Happy path: 200 + valid response → `PublishResult`
 * - HTTP errors: non-2xx → `EnterstellarError('ENS-5001')`, `recoverable: true`
 * - Malformed response: 200 but invalid body → `EnterstellarError('ENS-5001')`
 * - Validation failure: invalid contract → `EnterstellarError('ENS-1002')` before fetch
 * - Auth header: verifies `Authorization: Bearer <key>` is sent
 *
 * Uses `vi.stubGlobal('fetch', ...)` for deterministic, side-effect-free
 * network mocking — no real HTTP requests are made.
 *
 * @see Implementation Bible §5.1
 * @see Design Choice R15 — REST POST /v1/contracts
 * @see P0 Gate Checklist — Gate 7
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { EnterstellarError } from '@enterstellar-ai/types';
import type { ComponentContract } from '@enterstellar-ai/types';

import { createRegistry } from '../src/create-registry.js';
import { defineComponent } from '../src/define-component.js';
import type { PublishTarget, ComponentContractInput } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a valid `ComponentContract` via `defineComponent()`.
 * Uses minimal but fully compliant fields.
 *
 * @param name - PascalCase component name.
 * @returns A frozen, validated `ComponentContract`.
 */
function makeContract(
    name: string,
    overrides: Partial<ComponentContractInput> = {},
): ComponentContract {
    return defineComponent({
        name,
        description: `Test component ${name}`,
        category: 'data-display',
        tags: ['test'],
        props: z.object({ value: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [],
        ...overrides,
    });
}

/**
 * Standard publish target with test credentials.
 * Uses a well-known test URL and API key.
 */
const TEST_TARGET: PublishTarget = {
    registryUrl: 'https://registry.enterstellar.dev',
    credentials: {
        apiKey: 'enterstellar-test-api-key-12345',
    },
};

/**
 * Creates a mock `fetch` implementation that returns a configurable response.
 *
 * @param status - HTTP status code.
 * @param body - Response body (serialized via JSON.stringify).
 * @param ok - Whether the response is considered successful. Defaults based on status.
 * @returns A `vi.fn()` mock matching the `fetch` signature.
 */
function createMockFetch(
    status: number,
    body: unknown,
    ok?: boolean,
): ReturnType<typeof vi.fn> {
    return vi.fn(() =>
        Promise.resolve({
            ok: ok ?? (status >= 200 && status < 300),
            status,
            statusText: status === 200 ? 'OK' : 'Internal Server Error',
            json: () => Promise.resolve(body),
        }),
    );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registry.publish()', () => {
    // --- Happy Path ---

    it('publishes a valid contract and returns PublishResult', async () => {
        const mockFetch = createMockFetch(200, {
            registryUrl: 'https://registry.enterstellar.dev/v1/contracts/TestCard',
        });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('TestCard', {
            origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'ci-test' },
        });

        const result = await registry.publish(contract, TEST_TARGET);

        expect(result.published).toBe(true);
        expect(result.url).toBe('https://registry.enterstellar.dev/v1/contracts/TestCard');
    });

    // --- Authorization Header ---

    it('sends Authorization: Bearer <apiKey> header', async () => {
        const mockFetch = createMockFetch(200, {
            registryUrl: 'https://registry.enterstellar.dev/v1/contracts/AuthCard',
        });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('AuthCard');

        await registry.publish(contract, TEST_TARGET);

        expect(mockFetch).toHaveBeenCalledOnce();

        // Verify the fetch call arguments
        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

        // Verify URL matches target
        expect(url).toBe('https://registry.enterstellar.dev/v1/contracts');

        // Verify Authorization header
        const headers = options.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer enterstellar-test-api-key-12345');

        // Verify Content-Type
        expect(headers['Content-Type']).toBe('application/json');

        // Verify method
        expect(options.method).toBe('POST');
    });

    // --- Request Body ---

    it('sends contract, publisher, and sdkVersion in request body', async () => {
        const mockFetch = createMockFetch(200, {
            registryUrl: 'https://registry.enterstellar.dev/v1/contracts/BodyCard',
        });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('BodyCard', {
            origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'body-test' },
        });

        await registry.publish(contract, TEST_TARGET);

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as Record<string, unknown>;

        // Verify request body structure
        expect(body['publisher']).toBe('body-test');
        expect(body['sdkVersion']).toBeDefined();
        expect(typeof body['sdkVersion']).toBe('string');
        expect(body['contract']).toBeDefined();

        // Verify contract name is preserved in body
        const sentContract = body['contract'] as Record<string, unknown>;
        expect(sentContract['name']).toBe('BodyCard');
    });

    // --- HTTP Error → EnterstellarError('ENS-5001'), recoverable ---

    it('throws EnterstellarError ENS-5001 on HTTP 500 with recoverable: true', async () => {
        const mockFetch = createMockFetch(500, { error: 'Internal Server Error' });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('FailCard');

        try {
            await registry.publish(contract, TEST_TARGET);
            // Should not reach here
            expect.fail('Expected EnterstellarError to be thrown');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);

            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.code).toBe('ENS-5001');
            expect(enterstellarErr.module).toBe('registry');
            expect(enterstellarErr.recoverable).toBe(true);
            expect(enterstellarErr.message).toContain('FailCard');
            expect(enterstellarErr.message).toContain('500');
        }
    });

    it('throws EnterstellarError ENS-5001 on HTTP 403 (forbidden)', async () => {
        const mockFetch = createMockFetch(403, { error: 'Forbidden' });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('ForbiddenCard');

        await expect(
            registry.publish(contract, TEST_TARGET),
        ).rejects.toThrow(EnterstellarError);

        await expect(
            registry.publish(contract, TEST_TARGET),
        ).rejects.toThrow(/ForbiddenCard/);
    });

    // --- Malformed Response → EnterstellarError('ENS-5001') ---

    it('throws EnterstellarError ENS-5001 when response body is missing registryUrl', async () => {
        const mockFetch = createMockFetch(200, { id: 'some-id', status: 'ok' });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('MalformedCard');

        try {
            await registry.publish(contract, TEST_TARGET);
            expect.fail('Expected EnterstellarError to be thrown');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);

            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.code).toBe('ENS-5001');
            expect(enterstellarErr.module).toBe('registry');
            expect(enterstellarErr.recoverable).toBe(true);
            expect(enterstellarErr.message).toContain('unexpected shape');
        }
    });

    it('throws EnterstellarError ENS-5001 when response body is null', async () => {
        const mockFetch = createMockFetch(200, null);
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('NullResponseCard');

        await expect(
            registry.publish(contract, TEST_TARGET),
        ).rejects.toThrow(EnterstellarError);
    });

    it('throws EnterstellarError ENS-5001 when registryUrl is not a string', async () => {
        const mockFetch = createMockFetch(200, { registryUrl: 42 });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('BadUrlCard');

        await expect(
            registry.publish(contract, TEST_TARGET),
        ).rejects.toThrow(EnterstellarError);
    });

    // --- Validation Failure → EnterstellarError('ENS-1002'), before fetch ---

    it('throws EnterstellarError ENS-1002 for invalid contract (empty name) before calling fetch', async () => {
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });

        // Create a contract manually (bypassing defineComponent validation)
        // to test the publish-side validation
        const invalidContract = {
            name: '',
            id: '',
            description: 'Invalid test',
            category: 'data-display',
            tags: ['test'],
            props: z.object({}),
            tokens: {},
            accessibility: { role: 'region', ariaLabel: 'test', announceOnUpdate: false },
            states: { loading: 'L', error: 'E', empty: 'Em', ready: 'R' },
            examples: [],
            _meta: { forged: false, version: '1.0.0', createdAt: new Date().toISOString() },
        } as unknown as ComponentContract;

        try {
            await registry.publish(invalidContract, TEST_TARGET);
            expect.fail('Expected EnterstellarError to be thrown');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);

            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.code).toBe('ENS-1002');
            expect(enterstellarErr.module).toBe('registry');
            expect(enterstellarErr.recoverable).toBe(false);
        }

        // Verify fetch was NEVER called — validation fails before network
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // --- Publisher Fallback ---

    it('defaults publisher to "unknown" when origin is undefined', async () => {
        const mockFetch = createMockFetch(200, {
            registryUrl: 'https://registry.enterstellar.dev/v1/contracts/NoOrigin',
        });
        vi.stubGlobal('fetch', mockFetch);

        const registry = createRegistry({ components: [] });
        const contract = makeContract('NoOriginCard');

        await registry.publish(contract, TEST_TARGET);

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(options.body as string) as Record<string, unknown>;

        // No origin → publisher falls back to 'unknown'
        expect(body['publisher']).toBe('unknown');
    });
});
