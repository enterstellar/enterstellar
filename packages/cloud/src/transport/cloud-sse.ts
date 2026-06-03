/**
 * @module @enterstellar-ai/cloud/transport/cloud-sse
 * @description SSE transport for CloudForge streaming (`forge.stream()`).
 *
 * Opens a `POST /v1/forge` request with `Accept: text/event-stream` and
 * parses the Server-Sent Events stream into typed {@link ForgeFragment}
 * objects, yielded via `AsyncGenerator`.
 *
 * **SSE event type mapping (CF6):**
 *
 * | SSE `event:` field | `ForgeFragment.type` | Description                     |
 * |:-------------------|:---------------------|:--------------------------------|
 * | `meta`             | `meta`               | Provider info, IPU from headers |
 * | `node`             | `node`               | Partial contract structure      |
 * | `property`         | `property`           | Single property update          |
 * | `complete`         | `complete`           | Full contract, IPU from headers |
 * | `error`            | `error`              | Generation failure              |
 *
 * **IPU delivery (F18):** The `X-IPU-Used`, `X-IPU-Remaining`, and `X-IPU-Cost`
 * response headers are available at stream start (before any SSE events).
 * The transport parses them once and injects the `CloudIPU` into the `meta`
 * (first) and `complete` (last) fragments.
 *
 * **Error handling:**
 * - 429 → throw `CloudError` (SD3) before yielding any fragments.
 * - 4xx → throw `CloudError` immediately.
 * - Network error mid-stream → throw `CloudError` (`ENS-5005`). No mid-stream
 *   retry — partial data has already been consumed by the caller.
 * - SSE `error` event → yield `ForgeErrorFragment`, then return.
 *
 * **No retry for SSE streams.** Unlike the HTTP transport (SD5), SSE streams
 * are not retried. The caller (forge proxy) may choose to retry from scratch
 * if the stream fails before yielding a `complete` fragment.
 *
 * @see Design Choice SD6 — `forge.stream()` returns `AsyncGenerator<ForgeFragment>`.
 * @see Design Choice SD9 — `eventsource-parser` (minimal SSE dep).
 * @see Design Choice CF6 — SSE event types.
 * @see Design Choice CF9 — provider identity via `meta` event.
 * @see Design Choice CF14 — SSE streaming format.
 * @see Audit Finding F18 — IPU on `meta` and `complete` fragments.
 * @see Principle L15 — zero framework imports.
 */

import { createParser } from 'eventsource-parser';

import type { EventSourceMessage } from 'eventsource-parser';

import type { ComponentContract } from '@enterstellar-ai/types';

import type {
    CloudIPU,
    ForgeCompleteFragment,
    ForgeErrorFragment,
    ForgeFragment,
    ForgeMetaFragment,
    ForgeNodeFragment,
    ForgePropertyFragment,
} from '../types.js';
import type { CloudErrorBody } from '../errors.js';
import type { CloudHttpConfig } from './cloud-http.js';

import {
    CloudError,
    createQuotaExceededError,
    createRetriesExhaustedError,
} from '../errors.js';
import { CLOUD_SDK_VERSION } from '../version.js';
import { generateIdempotencyKey } from './idempotency.js';
import { OPERATION_TIMEOUTS } from './cloud-http.js';

// ---------------------------------------------------------------------------
// CloudSSEConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for a single SSE streaming request.
 *
 * Passed by the forge proxy to initiate a streaming forge operation.
 *
 * @internal
 */
export type CloudSSEConfig = {
    /** The forge request body to send as JSON. */
    readonly body: unknown;

    /**
     * Whether the client is in anonymous mode (`pk_anon_*`).
     * When `true`, `ipu` on fragments is `null` (AG8).
     */
    readonly isAnonymous: boolean;
};

// ---------------------------------------------------------------------------
// CloudSSETransport Interface
// ---------------------------------------------------------------------------

/**
 * SSE transport interface for streaming forge operations.
 *
 * Returns an `AsyncGenerator` that yields `ForgeFragment` objects
 * as SSE events arrive from the server.
 *
 * @internal — consumed by `cloud-forge-proxy`, not exported publicly.
 */
export interface CloudSSETransport {
    /**
     * Opens a streaming forge connection and yields fragments.
     *
     * @param config - SSE request configuration.
     * @yields {ForgeFragment} Typed SSE fragments in lifecycle order.
     *
     * @throws {CloudError} `ENS-C4290` on 429 (before any fragments).
     * @throws {CloudError} On 4xx (before any fragments).
     * @throws {CloudError} `ENS-5005` on network error mid-stream.
     */
    stream(config: CloudSSEConfig): AsyncGenerator<ForgeFragment, void, undefined>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a numeric header value from the response.
 * Duplicated from `cloud-http.ts` to avoid circular imports.
 *
 * @param headers - The response `Headers` object.
 * @param name - Header name to parse.
 * @returns Parsed non-negative number, or `undefined` if absent/invalid.
 */
function parseNumericHeader(headers: Headers, name: string): number | undefined {
    const raw = headers.get(name);
    if (raw === null || raw.trim().length === 0) {
        return undefined;
    }

    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) {
        return value;
    }

    return undefined;
}

/**
 * Parses IPU headers from the HTTP response into a {@link CloudIPU} object.
 *
 * Returns `null` if the request is anonymous (AG8: all `X-IPU-*` headers
 * omitted) or if headers are absent/unparseable.
 *
 * @param headers - Response headers containing `X-IPU-*` values.
 * @param isAnonymous - Whether the client is in anonymous mode.
 * @returns Parsed `CloudIPU` or `null`.
 */
function parseIPUHeaders(headers: Headers, isAnonymous: boolean): CloudIPU | null {
    if (isAnonymous) {
        return null;
    }

    const used = parseNumericHeader(headers, 'X-IPU-Used');
    const remaining = parseNumericHeader(headers, 'X-IPU-Remaining');
    const cost = parseNumericHeader(headers, 'X-IPU-Cost');

    // If all three headers are present, construct a CloudIPU object.
    // If any are missing, return null — partial IPU data is unreliable.
    if (used !== undefined && remaining !== undefined && cost !== undefined) {
        return { used, remaining, cost };
    }

    return null;
}

/**
 * Parses the error body from a non-2xx response (§9.4).
 *
 * @param response - The non-2xx `Response` object.
 * @returns Parsed `CloudErrorBody`, or `null`.
 */
async function parseErrorBody(response: Response): Promise<CloudErrorBody | null> {
    try {
        const raw: unknown = await response.json();

        if (
            typeof raw === 'object' &&
            raw !== null &&
            'error' in raw
        ) {
            const envelope = raw;
            const errorObj = envelope.error;

            if (
                typeof errorObj === 'object' &&
                errorObj !== null &&
                'code' in errorObj &&
                'message' in errorObj &&
                typeof (errorObj as { code: unknown }).code === 'string' &&
                typeof (errorObj as { message: unknown }).message === 'string'
            ) {
                const typed = errorObj as {
                    code: string;
                    message: string;
                    retryAfterMs?: unknown;
                    upgradeUrl?: unknown;
                };

                return {
                    code: typed.code,
                    message: typed.message,
                    retryAfterMs: typeof typed.retryAfterMs === 'number'
                        ? typed.retryAfterMs
                        : undefined,
                    upgradeUrl: typeof typed.upgradeUrl === 'string'
                        ? typed.upgradeUrl
                        : undefined,
                };
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Safely parses a JSON string into a typed value.
 *
 * Returns `null` if the string is empty or unparseable. Never throws.
 *
 * @typeParam T - Expected parsed type.
 * @param data - The raw JSON string from an SSE `data:` field.
 * @returns Parsed value as `T`, or `null` on failure.
 */
function safeParseJsonString(data: string): unknown {
    try {
        return JSON.parse(data) as unknown;
    } catch {
        return null;
    }
}

/**
 * Creates a typed {@link ForgeFragment} from a parsed SSE event.
 *
 * Maps the SSE `event:` field to the `ForgeFragment.type` discriminant
 * and parses the `data:` field as JSON. Returns `null` for unrecognized
 * event types or unparseable data.
 *
 * @param event - The parsed SSE event from `eventsource-parser`.
 * @param ipu - Pre-parsed IPU data from HTTP response headers (F18).
 * @returns A typed `ForgeFragment`, or `null` if the event is unrecognized.
 */
function mapEventToFragment(
    event: EventSourceMessage,
    ipu: CloudIPU | null,
): ForgeFragment | null {
    const eventType = event.event ?? 'message';

    switch (eventType) {
        case 'meta': {
            const data = safeParseJsonString(event.data) as { provider: string; model: string } | null;
            if (data === null) {
                return null;
            }

            const fragment: ForgeMetaFragment = {
                type: 'meta',
                data: { provider: data.provider, model: data.model },
                ipu,
            };
            return fragment;
        }

        case 'node': {
            const data = safeParseJsonString(event.data) as Partial<ComponentContract> | null;
            if (data === null) {
                return null;
            }

            const fragment: ForgeNodeFragment = {
                type: 'node',
                data,
            };
            return fragment;
        }

        case 'property': {
            const data = safeParseJsonString(event.data) as { path: string; value: unknown } | null;
            if (data === null) {
                return null;
            }

            const fragment: ForgePropertyFragment = {
                type: 'property',
                data: { path: data.path, value: data.value },
            };
            return fragment;
        }

        case 'complete': {
            const data = safeParseJsonString(event.data) as ComponentContract | null;
            if (data === null) {
                return null;
            }

            const fragment: ForgeCompleteFragment = {
                type: 'complete',
                data,
                ipu,
            };
            return fragment;
        }

        case 'error': {
            const data = safeParseJsonString(event.data) as { code: string; message: string } | null;
            if (data === null) {
                return null;
            }

            const fragment: ForgeErrorFragment = {
                type: 'error',
                data: { code: data.code, message: data.message },
            };
            return fragment;
        }

        default:
            // Unrecognized event type — skip silently.
            // The server may add new event types in the future (forward compatibility).
            return null;
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a {@link CloudSSETransport} for streaming forge operations.
 *
 * **Stream lifecycle:**
 * 1. Build request with `Accept: text/event-stream`, `Authorization`,
 *    `User-Agent`, `X-Idempotency-Key`, and JSON body.
 * 2. Execute `fetch()` with `AbortController` timeout (30s default).
 * 3. On non-2xx: parse error body, throw `CloudError`.
 * 4. Parse `X-IPU-*` headers from response (F18).
 * 5. Read `ReadableStream` body as text chunks.
 * 6. Feed chunks into `eventsource-parser`.
 * 7. Map parsed events to `ForgeFragment` objects, yield via generator.
 * 8. On `complete` or `error` event: generator returns.
 * 9. On network error mid-stream: throw `ENS-5005`.
 *
 * @param config - HTTP transport configuration (endpoint, API key, timeout).
 * @returns A `CloudSSETransport` instance.
 *
 * @see Design Choice SD6 — streaming forge via SSE.
 * @see Design Choice SD9 — `eventsource-parser` as the only runtime dep.
 * @see Design Choice CF6 — SSE event types.
 * @internal — not part of the public API barrel.
 */
export function createCloudSSETransport(config: CloudHttpConfig): CloudSSETransport {
    const { endpoint, apiKey, timeoutMs: globalTimeoutMs } = config;

    return {
        async *stream(sseConfig: CloudSSEConfig): AsyncGenerator<ForgeFragment, void, undefined> {
            const effectiveTimeout = globalTimeoutMs ?? OPERATION_TIMEOUTS.forge;
            const url = `${endpoint}/v1/forge`;

            // ---------------------------------------------------------------
            // Step 1: Build request
            // ---------------------------------------------------------------
            const idempotencyKey = generateIdempotencyKey();

            const headers: Record<string, string> = {
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': `enterstellar-cloud-sdk/${CLOUD_SDK_VERSION}`,
                'Accept': 'text/event-stream',
                'Content-Type': 'application/json',
                'X-Idempotency-Key': idempotencyKey,
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, effectiveTimeout);

            // ---------------------------------------------------------------
            // Step 2: Execute fetch
            // ---------------------------------------------------------------
            let response: Response;

            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(sseConfig.body),
                    signal: controller.signal,
                });
            } catch {
                clearTimeout(timeoutId);

                // Network error or timeout before response —
                // no retry for SSE (partial data cannot be retried).
                throw createRetriesExhaustedError(
                    1,
                    undefined,
                    undefined,
                );
            }

            // ---------------------------------------------------------------
            // Step 3: Handle non-2xx before streaming starts
            // ---------------------------------------------------------------
            if (!response.ok) {
                clearTimeout(timeoutId);

                if (response.status === 429) {
                    const errorBody = await parseErrorBody(response);
                    const requestId = response.headers.get('X-Request-Id') ?? undefined;
                    const body: CloudErrorBody = errorBody ?? {
                        code: 'ENS-C4290',
                        message: 'IPU quota exceeded',
                    };

                    throw createQuotaExceededError(body, requestId);
                }

                const errorBody = await parseErrorBody(response);
                const requestId = response.headers.get('X-Request-Id') ?? undefined;

                throw new CloudError(
                    'ENS-5003',
                    errorBody?.code ?? `HTTP-${String(response.status)}`,
                    `@enterstellar-ai/cloud: Forge stream failed — ${errorBody?.message ?? `HTTP ${String(response.status)}`}.`,
                    false,
                    { requestId },
                );
            }

            // ---------------------------------------------------------------
            // Step 4: Parse IPU headers (F18)
            // ---------------------------------------------------------------
            const ipu = parseIPUHeaders(response.headers, sseConfig.isAnonymous);

            // ---------------------------------------------------------------
            // Step 5: Set up SSE parsing pipeline
            // ---------------------------------------------------------------
            const body = response.body;

            if (body === null) {
                clearTimeout(timeoutId);
                throw createRetriesExhaustedError(1, response.status);
            }

            // Buffer for fragments produced by the parser.
            // The parser's `onEvent` callback pushes fragments here,
            // and the generator loop below yields them.
            const fragmentBuffer: ForgeFragment[] = [];
            const streamState = { done: false };

            const parser = createParser({
                onEvent(event: EventSourceMessage): void {
                    const fragment = mapEventToFragment(event, ipu);
                    if (fragment !== null) {
                        fragmentBuffer.push(fragment);

                        // `complete` and `error` events signal end of stream.
                        if (fragment.type === 'complete' || fragment.type === 'error') {
                            streamState.done = true;
                        }
                    }
                },
            });

            /**
             * Drains all buffered fragments and returns them as a new array.
             * Empties the buffer in-place via `splice(0)`.
             */
            function drainBuffer(): ForgeFragment[] {
                return fragmentBuffer.splice(0);
            }

            // ---------------------------------------------------------------
            // Step 6: Read stream and yield fragments
            // ---------------------------------------------------------------
            const reader = body.getReader();
            const decoder = new TextDecoder();

            try {
                // Read chunks until the stream ends or a terminal event fires.
                let readerDone = false;

                while (!readerDone) {
                    const readResult = await reader.read();
                    readerDone = readResult.done;

                    if (readResult.value !== undefined) {
                        // Decode the chunk and feed it to the SSE parser.
                        const text = decoder.decode(readResult.value, { stream: true });
                        parser.feed(text);
                    }

                    // Yield all fragments produced by the parser for this chunk.
                    for (const fragment of drainBuffer()) {
                        yield fragment;
                    }

                    // `streamDone` is mutated synchronously inside the `onEvent`
                    // callback during `parser.feed()` above.
                    if (streamState.done) {
                        break;
                    }
                }

                // Yield any remaining buffered fragments after stream ends.
                for (const fragment of drainBuffer()) {
                    yield fragment;
                }
            } catch (error: unknown) {
                // Re-throw CloudError (from internal handling).
                if (error instanceof CloudError) {
                    throw error;
                }

                // Network error mid-stream — AbortError (timeout), etc.
                throw createRetriesExhaustedError(1, undefined, undefined);
            } finally {
                clearTimeout(timeoutId);

                // Always release the reader to prevent memory leaks.
                try {
                    reader.releaseLock();
                } catch {
                    // `releaseLock()` can throw if the reader is already released
                    // or the stream is in an error state. Safe to ignore.
                }
            }
        },
    };
}
