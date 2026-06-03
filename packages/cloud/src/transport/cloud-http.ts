/**
 * @module @enterstellar-ai/cloud/transport/cloud-http
 * @description Shared HTTP transport for all Enterstellar Cloud API calls.
 *
 * Provides a factory function that creates a typed HTTP client for
 * communicating with `api.enterstellar.dev`. All cloud proxy modules
 * (`cloud-forge-proxy`, `cloud-index-proxy`, `trace-submitter`,
 * `cloud-router-proxy`, `cloud-analytics-proxy`, etc.) route through
 * this transport.
 *
 * **Key responsibilities (v0.1.0):**
 * - `Authorization: Bearer {apiKey}` on every request (CL4).
 * - `User-Agent: enterstellar-cloud-sdk/{version}` on every request (F22).
 * - `X-Idempotency-Key: {ulid}` on IPU-consuming requests (AM10/F8).
 * - `AbortController` timeout per request, with per-operation defaults (F21).
 * - 3-attempt retry loop with exponential backoff (1s, 2s, 4s) for
 *   5xx/network errors (SD5). Same idempotency key on all retries.
 * - Parses `X-IPU-Used`, `X-IPU-Remaining`, `X-IPU-Cost`, and
 *   `X-Request-Id` from response headers (§9.3).
 * - **Throws** `CloudError` on 429 (SD3), 4xx, and retries exhausted.
 *
 * **Changes from v0.0.x:**
 * - `degraded` pattern removed — operational errors now throw (SD3).
 * - Retry loop added (SD5) — 3 attempts for 5xx/network.
 * - `X-Idempotency-Key` added (AM10) — only when `ipuCost > 0`.
 * - `User-Agent` header added (F22).
 * - `X-IPU-Cost` and `X-Request-Id` parsing added (§9.3).
 * - Error body parsing added (§9.4).
 * - Per-operation timeout defaults added (F21).
 * - Instance-level `retryAttempt` state removed — retry is per-request.
 *
 * @see Design Choice SD3 — throw on 429 with `upgradeUrl` + `retryAfterMs`.
 * @see Design Choice SD5 — blanket 3× exponential backoff for 5xx/network.
 * @see Design Choice AM10 — `X-Idempotency-Key` on IPU-consuming requests.
 * @see Design Choice CL1 — hybrid IPU metering with `X-IPU-*` headers.
 * @see Design Choice CL4 — bearer token auth.
 * @see Bible §9.3 — response header format.
 * @see Bible §9.4 — error response shape.
 * @see Principle L15 — zero framework imports.
 */

import type { CloudErrorBody } from '../errors.js';
import type { CloudRequestConfig, CloudResponse } from '../types.js';

import {
    CloudError,
    createQuotaExceededError,
    createRetriesExhaustedError,
} from '../errors.js';
import { CLOUD_SDK_VERSION } from '../version.js';
import { generateIdempotencyKey } from './idempotency.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default HTTP request timeout in milliseconds.
 * Used when neither `CloudConfig.timeoutMs` nor `CloudRequestConfig.operationTimeout`
 * is specified. 10s is sufficient for most endpoints (GET /v1/usage, etc.).
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Maximum number of request attempts before throwing `ENS-5005`.
 * Attempt 1 = initial request. Attempts 2 and 3 = retries.
 *
 * @see Design Choice SD5 — 3 attempts total, exponential backoff.
 */
const MAX_ATTEMPTS = 3;

/**
 * Exponential backoff delays between retry attempts in milliseconds.
 * Index 0 = delay after attempt 1 fails. Index 1 = delay after attempt 2 fails.
 *
 * @see Design Choice SD5 — 1s, 2s, 4s backoff schedule.
 */
const RETRY_BACKOFF_MS: readonly number[] = [1_000, 2_000, 4_000];

/**
 * Per-operation timeout defaults in milliseconds.
 *
 * These are used when `CloudConfig.timeoutMs` is not set (global override).
 * Each proxy module passes its operation-specific timeout via
 * `CloudRequestConfig.operationTimeout`. If neither is set,
 * `DEFAULT_TIMEOUT_MS` (10s) is used.
 *
 * @see Audit Finding F21 — per-operation timeout defaults.
 */
export const OPERATION_TIMEOUTS = Object.freeze({
    /** Forge P99 = 10s (§8.9), 3× safety margin. */
    forge: 30_000,

    /** CR5: max 60s runtime + network/queue overhead. */
    certify: 90_000,

    /** OLAP queries can be slow depending on data volume. */
    analytics: 30_000,

    /** Business analytics — same profile as trace analytics. */
    businessAnalytics: 30_000,

    /** Default for all other operations. */
    default: 10_000,
} as const);

// ---------------------------------------------------------------------------
// CloudHttpConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the cloud HTTP transport.
 *
 * Constructed by `createEnterstellarCloudClient()` from the public `CloudConfig`.
 * Not exported from the barrel — internal to `@enterstellar-ai/cloud`.
 *
 * @internal
 */
export type CloudHttpConfig = {
    /**
     * Base URL of the Enterstellar Cloud API.
     * Path segments (`/v1/forge`, etc.) are appended by proxy modules.
     *
     * @example 'https://api.enterstellar.dev'
     */
    readonly endpoint: string;

    /** Bearer token for `Authorization` header (CL4). */
    readonly apiKey: string;

    /**
     * Global HTTP request timeout in milliseconds.
     * When set, overrides ALL per-operation timeout defaults.
     * When `undefined`, each request uses its own `operationTimeout`.
     *
     * @see Audit Finding F21 — per-operation timeout defaults.
     */
    readonly timeoutMs?: number | undefined;
};

// ---------------------------------------------------------------------------
// CloudHttpTransport Interface
// ---------------------------------------------------------------------------

/**
 * The HTTP transport interface returned by {@link createCloudHttpTransport}.
 *
 * Provides a single `request()` method for all cloud API calls.
 * Each call returns a structured {@link CloudResponse} on success,
 * or throws {@link CloudError} on failure (SD3, SD5).
 *
 * **Error policy (v0.1.0):**
 * - 2xx → return `CloudResponse<T>`.
 * - 429 → throw `CloudError` with `upgradeUrl`/`retryAfterMs` (SD3).
 * - 4xx (non-429) → throw `CloudError` immediately, no retry.
 * - 5xx → retry up to 3× (SD5). If all fail, throw `ENS-5005`.
 * - Network error → retry up to 3× (SD5). If all fail, throw `ENS-5005`.
 *
 * @internal — consumed by proxy modules, not exported publicly.
 */
export interface CloudHttpTransport {
    /**
     * Execute an HTTP request against the Enterstellar Cloud API.
     *
     * @typeParam T - Expected JSON body type on success.
     * @param config - Request configuration (method, path, body, ipuCost, operationTimeout).
     * @returns Structured response with parsed headers on 2xx.
     *
     * @throws {CloudError} `ENS-C4290` on 429 (quota exceeded).
     * @throws {CloudError} Parsed server error on 4xx (non-429).
     * @throws {CloudError} `ENS-5005` after 3 failed retry attempts.
     */
    request<T>(config: CloudRequestConfig): Promise<CloudResponse<T>>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a numeric header value from the response.
 *
 * Returns `undefined` if the header is absent, empty, or non-numeric.
 * Used for `X-IPU-Used`, `X-IPU-Remaining`, and `X-IPU-Cost` (§9.3).
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
 * Safely parses a JSON response body.
 *
 * Returns `null` if the body cannot be parsed (empty, malformed,
 * or non-JSON content type). Never throws.
 *
 * @typeParam T - Expected parsed type.
 * @param response - The `Response` object from `fetch()`.
 * @returns Parsed body as `T`, or `null` on failure.
 */
async function safeParseJson<T>(response: Response): Promise<T | null> {
    try {
        const data: unknown = await response.json();
        return data as T;
    } catch {
        return null;
    }
}

/**
 * Parses the error body from non-2xx responses per §9.4.
 *
 * Expected shape: `{ error: { code, message, retryAfterMs?, upgradeUrl? } }`.
 * Returns `null` if the body is absent, unparseable, or doesn't match
 * the expected shape.
 *
 * @param response - The non-2xx `Response` object.
 * @returns Parsed `CloudErrorBody`, or `null` if parsing fails.
 */
async function parseErrorBody(response: Response): Promise<CloudErrorBody | null> {
    try {
        const raw: unknown = await response.json();

        // Validate the expected §9.4 shape: { error: { code, message, ... } }
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
 * Sleeps for the specified number of milliseconds.
 *
 * Used for exponential backoff delays between retry attempts. Non-blocking.
 *
 * @param ms - Duration in milliseconds.
 * @returns A promise that resolves after the delay.
 */
function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Resolves the effective request timeout in milliseconds.
 *
 * Priority: global config override → per-operation default → 10s fallback.
 *
 * @param globalTimeout - `CloudConfig.timeoutMs` (global override), or `undefined`.
 * @param operationTimeout - `CloudRequestConfig.operationTimeout`, or `undefined`.
 * @returns Effective timeout in milliseconds.
 */
function resolveTimeout(
    globalTimeout: number | undefined,
    operationTimeout: number | undefined,
): number {
    return globalTimeout ?? operationTimeout ?? DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a {@link CloudHttpTransport} for communicating with the
 * Enterstellar Cloud API.
 *
 * **Request lifecycle per call (v0.1.0):**
 * 1. Generate `X-Idempotency-Key` (ULID) if `ipuCost > 0` (AM10/F8).
 * 2. Build headers: `Authorization`, `User-Agent`, `Accept`, `Content-Type`,
 *    `X-Idempotency-Key` (conditional).
 * 3. Attempt loop (max 3):
 *    a. Execute `fetch()` with `AbortController` timeout.
 *    b. 2xx → parse response, return `CloudResponse<T>`.
 *    c. 429 → parse error body, **throw** `CloudError` (SD3). No retry.
 *    d. 4xx → parse error body, **throw** `CloudError`. No retry.
 *    e. 5xx → sleep (backoff), retry next attempt.
 *    f. Network/timeout error → sleep (backoff), retry next attempt.
 * 4. All 3 attempts failed → **throw** `ENS-5005`.
 *
 * **No mutable instance state.** All retry state is local to each
 * `request()` invocation. Concurrent requests are fully independent.
 *
 * @param config - Transport configuration (endpoint, API key, timeout).
 * @returns A `CloudHttpTransport` instance.
 *
 * @example
 * ```ts
 * const transport = createCloudHttpTransport({
 *     endpoint: 'https://api.enterstellar.dev',
 *     apiKey: 'ak_my_key',
 * });
 *
 * const response = await transport.request<UsageData>({
 *     method: 'GET',
 *     path: '/v1/usage',
 *     ipuCost: 0,
 * });
 *
 * console.log(response.data); // UsageData
 * ```
 *
 * @see Design Choice SD3 — throw on 429.
 * @see Design Choice SD5 — 3× exponential backoff for 5xx/network.
 * @see Design Choice AM10 — `X-Idempotency-Key` on IPU-consuming requests.
 * @see Design Choice CL4 — bearer token auth.
 * @see Design Choice CL1 — `X-IPU-*` header reconciliation.
 * @internal — not part of the public API barrel.
 */
export function createCloudHttpTransport(config: CloudHttpConfig): CloudHttpTransport {
    const { endpoint, apiKey, timeoutMs: globalTimeoutMs } = config;

    return {
        async request<T>(reqConfig: CloudRequestConfig): Promise<CloudResponse<T>> {
            const effectiveTimeout = resolveTimeout(
                globalTimeoutMs,
                reqConfig.operationTimeout,
            );
            const url = `${endpoint}${reqConfig.path}`;

            // ---------------------------------------------------------------
            // Step 1: Generate idempotency key (AM10, F8)
            // Generated ONCE per request. All retry attempts reuse the same key.
            // Only generated for IPU-consuming requests (ipuCost > 0).
            // ---------------------------------------------------------------
            const idempotencyKey = reqConfig.ipuCost > 0
                ? generateIdempotencyKey()
                : undefined;

            // ---------------------------------------------------------------
            // Step 2: Build request headers
            // These are the same for all retry attempts.
            // ---------------------------------------------------------------
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': `enterstellar-cloud-sdk/${CLOUD_SDK_VERSION}`,
                'Accept': 'application/json',
            };

            // Content-Type only for requests with a body (POST).
            if (reqConfig.body !== undefined) {
                headers['Content-Type'] = 'application/json';
            }

            // Idempotency key only when IPU > 0 (AM10/F8).
            if (idempotencyKey !== undefined) {
                headers['X-Idempotency-Key'] = idempotencyKey;
            }

            // ---------------------------------------------------------------
            // Step 3: Attempt loop (max 3 attempts — SD5)
            // ---------------------------------------------------------------
            let lastStatusCode: number | undefined;
            let lastRequestId: string | undefined;

            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                }, effectiveTimeout);

                try {
                    // -----------------------------------------------------------
                    // Execute fetch
                    // -----------------------------------------------------------
                    const response = await fetch(url, {
                        method: reqConfig.method,
                        headers,
                        ...(reqConfig.body !== undefined
                            ? { body: JSON.stringify(reqConfig.body) }
                            : {}),
                        signal: controller.signal,
                    });

                    clearTimeout(timeoutId);

                    // -----------------------------------------------------------
                    // Parse response headers (§9.3)
                    // -----------------------------------------------------------
                    const ipuUsed = parseNumericHeader(response.headers, 'X-IPU-Used');
                    const ipuRemaining = parseNumericHeader(response.headers, 'X-IPU-Remaining');
                    const ipuCost = parseNumericHeader(response.headers, 'X-IPU-Cost');
                    const requestId = response.headers.get('X-Request-Id') ?? undefined;

                    lastStatusCode = response.status;
                    lastRequestId = requestId;

                    // -----------------------------------------------------------
                    // 2xx — Success. Return structured response.
                    // -----------------------------------------------------------
                    if (response.ok) {
                        const data = await safeParseJson<T>(response);

                        return {
                            ok: true,
                            statusCode: response.status,
                            data,
                            ipuUsed,
                            ipuRemaining,
                            ipuCost,
                            requestId,
                            error: null,
                        };
                    }

                    // -----------------------------------------------------------
                    // 429 — Quota exceeded / rate limited (SD3).
                    // THROW immediately. Never retry 429.
                    // Parse error body for upgradeUrl and retryAfterMs.
                    // -----------------------------------------------------------
                    if (response.status === 429) {
                        const errorBody = await parseErrorBody(response);

                        // Use parsed body if available, otherwise build a fallback.
                        const body: CloudErrorBody = errorBody ?? {
                            code: 'ENS-C4290',
                            message: 'IPU quota exceeded',
                        };

                        throw createQuotaExceededError(body, requestId);
                    }

                    // -----------------------------------------------------------
                    // 5xx — Server error. Retry with backoff (SD5).
                    // Only retry — do NOT throw yet. Let the loop continue.
                    // -----------------------------------------------------------
                    if (response.status >= 500) {
                        // Consume the body to release the connection (prevents memory leak).
                        await response.text().catch(() => undefined);

                        // If this is NOT the last attempt, sleep before next retry.
                        if (attempt < MAX_ATTEMPTS - 1) {
                            // RETRY_BACKOFF_MS has 3 entries — index is always in bounds.
                            const backoffMs = RETRY_BACKOFF_MS[attempt] as number;
                            await sleep(backoffMs);
                        }

                        continue;
                    }

                    // -----------------------------------------------------------
                    // 4xx (non-429) — Client error. THROW immediately, no retry.
                    // These indicate a permanent error (bad request, not found,
                    // unauthorized, etc.) — retrying won't help.
                    // -----------------------------------------------------------
                    const errorBody = await parseErrorBody(response);

                    throw new CloudError(
                        'ENS-5003',
                        errorBody?.code ?? `HTTP-${String(response.status)}`,
                        `@enterstellar-ai/cloud: Request failed — ${errorBody?.message ?? `HTTP ${String(response.status)}`}.`,
                        false,
                        { requestId },
                    );
                } catch (error: unknown) {
                    clearTimeout(timeoutId);

                    // -----------------------------------------------------------
                    // Re-throw CloudError (from 429 or 4xx handling above).
                    // These are intentional throws — not network errors.
                    // -----------------------------------------------------------
                    if (error instanceof CloudError) {
                        throw error;
                    }

                    // -----------------------------------------------------------
                    // Network / timeout error — retry with backoff (SD5).
                    // AbortError (timeout), TypeError (DNS, TLS), etc.
                    // -----------------------------------------------------------
                    lastStatusCode = undefined;
                    lastRequestId = undefined;

                    // If this is NOT the last attempt, sleep before next retry.
                    if (attempt < MAX_ATTEMPTS - 1) {
                        // RETRY_BACKOFF_MS has 3 entries — index is always in bounds.
                        const backoffMs = RETRY_BACKOFF_MS[attempt] as number;
                        await sleep(backoffMs);
                    }

                    // Let the loop continue to the next attempt.
                }
            }

            // ---------------------------------------------------------------
            // All attempts exhausted — throw ENS-5005.
            // ---------------------------------------------------------------
            throw createRetriesExhaustedError(MAX_ATTEMPTS, lastStatusCode, lastRequestId);
        },
    };
}
