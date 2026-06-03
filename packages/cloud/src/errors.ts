/**
 * @module @enterstellar-ai/cloud/errors
 * @description Cloud SDK error class and deterministic factory functions.
 *
 * `CloudError` extends `EnterstellarError` (from `@enterstellar-ai/types`) with Cloud-specific
 * metadata: the server's error code (`cloudCode`), an optional upgrade URL
 * for quota-exceeded scenarios, a retry-after duration, and the server's
 * request ID for correlation.
 *
 * **Error code taxonomy:**
 *
 * | Namespace       | Origin           | Examples                           |
 * |:----------------|:-----------------|:-----------------------------------|
 * | `ENS-5xxx`      | SDK-originated   | `ENS-5001` (config), `ENS-5004`    |
 * | `ENS-C{NNNN}`   | Server-originated| `ENS-C4290` (quota exceeded)       |
 *
 * SDK-originated errors use `EnterstellarErrorCode` values directly (`ENS-5001`–
 * `ENS-5005`). Server-originated errors store the cloud code in the
 * `cloudCode` field and use `ENS-5003` as the base `EnterstellarError.code`
 * (since `ENS-C{NNNN}` is not in the `EnterstellarErrorCode` union).
 *
 * Six factory functions provide deterministic, documented construction
 * for every known error scenario — consumers never call `new CloudError()`
 * directly.
 *
 * @see Design Choice SD3 — throw `CloudError` on 429 with `upgradeUrl`.
 * @see Design Choice AG10 — `ENS-C{NNNN}` server error code format.
 * @see Bible §9.4 — Cloud error response shape.
 */

import { EnterstellarError } from '@enterstellar-ai/types';

import type { EnterstellarErrorCode } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// CloudErrorBody — parsed from server error responses (§9.4)
// ---------------------------------------------------------------------------

/**
 * The structured error body returned by Enterstellar Cloud API endpoints.
 *
 * Parsed from the JSON response on non-2xx status codes. The `code` field
 * uses the `ENS-C{NNNN}` format (AG10). Optional fields `retryAfterMs`
 * and `upgradeUrl` are present only on `ENS-C4290` (quota exceeded).
 *
 * @example
 * ```json
 * {
 *   "code": "ENS-C4290",
 *   "message": "IPU quota exceeded",
 *   "retryAfterMs": 3600000,
 *   "upgradeUrl": "https://cloud.enterstellar.dev/billing/upgrade"
 * }
 * ```
 *
 * @see Bible §9.4 — Error response shape.
 * @see Design Choice AG10 — `ENS-C{NNNN}` code format.
 */
export type CloudErrorBody = {
    readonly code: string;
    readonly message: string;
    readonly retryAfterMs?: number | undefined;
    readonly upgradeUrl?: string | undefined;
};

// ---------------------------------------------------------------------------
// CloudError Class
// ---------------------------------------------------------------------------

/**
 * Cloud SDK error — extends `EnterstellarError` with Cloud-specific metadata.
 *
 * All `@enterstellar-ai/cloud` SDK errors are instances of both `CloudError` and
 * `EnterstellarError`. Consumer catch blocks can narrow on either:
 *
 * ```ts
 * try {
 *     await client.forge({ intent: 'patient vitals' });
 * } catch (error) {
 *     if (error instanceof CloudError && error.upgradeUrl) {
 *         showUpgradePrompt(error.upgradeUrl);
 *     }
 * }
 * ```
 *
 * **Do not construct directly** — use the factory functions below.
 *
 * @see Design Choice SD3 — throw on 429 with `upgradeUrl` + `retryAfterMs`.
 */
export class CloudError extends EnterstellarError {
    /**
     * The Cloud-specific error code.
     *
     * For SDK-originated errors, this mirrors `EnterstellarError.code` (e.g., `'ENS-5001'`).
     * For server-originated errors, this is the `ENS-C{NNNN}` code from the
     * response body (e.g., `'ENS-C4290'`).
     */
    public readonly cloudCode: string;

    /**
     * URL for the billing upgrade page.
     * Present only on `ENS-C4290` (IPU quota exceeded) errors.
     *
     * @see Design Choice SD3 — app decides how to surface the upgrade prompt.
     */
    public readonly upgradeUrl: string | undefined;

    /**
     * Milliseconds until the quota resets or rate limit expires.
     * Present only on `ENS-C4290` errors.
     *
     * Use this to schedule a retry or display a countdown to the user.
     */
    public readonly retryAfterMs: number | undefined;

    /**
     * The `X-Request-Id` header value from the server response.
     * A bare ULID (AG16) for support ticket correlation.
     * `undefined` if the error occurred before a server response was received
     * (e.g., network failure, config validation).
     */
    public readonly requestId: string | undefined;

    /**
     * @internal Use factory functions instead of constructing directly.
     *
     * @param code - The `EnterstellarErrorCode` for the base `EnterstellarError` class.
     * @param cloudCode - The Cloud-specific error code (`ENS-5xxx` or `ENS-C{NNNN}`).
     * @param message - Human-readable error description.
     * @param recoverable - Whether the caller can meaningfully retry.
     * @param options - Optional Cloud-specific metadata.
     */
    constructor(
        code: EnterstellarErrorCode,
        cloudCode: string,
        message: string,
        recoverable: boolean,
        options?: {
            readonly upgradeUrl?: string | undefined;
            readonly retryAfterMs?: number | undefined;
            readonly requestId?: string | undefined;
            readonly cause?: unknown;
        },
    ) {
        super(code, 'cloud', message, recoverable, options?.cause);
        this.name = 'CloudError';
        this.cloudCode = cloudCode;
        this.upgradeUrl = options?.upgradeUrl;
        this.retryAfterMs = options?.retryAfterMs;
        this.requestId = options?.requestId;

        // Preserve proper stack trace in V8 environments.
        // Points the stack to the factory function call site, not the constructor.
        if ('captureStackTrace' in Error) {
            (Error as unknown as {
                captureStackTrace: (
                    target: object,
                    ctor: (...args: unknown[]) => unknown,
                ) => void;
            }).captureStackTrace(
                this,
                CloudError as unknown as (...args: unknown[]) => unknown,
            );
        }
    }

    /**
     * Serializes the error to a plain object for logging, telemetry, or DevTools.
     *
     * Extends `EnterstellarError.toJSON()` with Cloud-specific fields.
     *
     * @returns A plain object representation including all Cloud metadata.
     */
    public override toJSON(): {
        name: string;
        code: EnterstellarErrorCode;
        cloudCode: string;
        module: 'cloud';
        message: string;
        recoverable: boolean;
        timestamp: string;
        upgradeUrl: string | undefined;
        retryAfterMs: number | undefined;
        requestId: string | undefined;
        stack: string | undefined;
    } {
        return {
            ...super.toJSON(),
            name: this.name,
            cloudCode: this.cloudCode,
            module: 'cloud',
            upgradeUrl: this.upgradeUrl,
            retryAfterMs: this.retryAfterMs,
            requestId: this.requestId,
        };
    }
}

// ---------------------------------------------------------------------------
// Factory Functions — SDK-Originated Errors (ENS-5xxx)
// ---------------------------------------------------------------------------

/**
 * Creates a `CloudError` for invalid or missing configuration.
 *
 * Thrown during `createEnterstellarCloudClient()` when a required config field
 * is empty, missing, or malformed. This is a developer error — non-recoverable.
 *
 * @param field - The config field that failed validation (e.g., `'apiKey'`).
 * @returns A non-recoverable `CloudError` with code `ENS-5001`.
 *
 * @example
 * ```ts
 * throw createConfigError('apiKey');
 * // → CloudError { code: 'ENS-5001', message: '@enterstellar-ai/cloud: Invalid config — "apiKey" ...' }
 * ```
 */
export function createConfigError(field: string): CloudError {
    return new CloudError(
        'ENS-5001',
        'ENS-5001',
        `@enterstellar-ai/cloud: Invalid config — "${field}" is required and must be a non-empty string.`,
        false,
    );
}

/**
 * Creates a `CloudError` for method calls after `dispose()`.
 *
 * Thrown when any method on `EnterstellarCloudClient` is called after the client
 * has been disposed. This is a developer error — non-recoverable.
 * `dispose()` itself is idempotent and never throws.
 *
 * @returns A non-recoverable `CloudError` with code `ENS-5002`.
 *
 * @example
 * ```ts
 * client.dispose();
 * await client.forge({ intent: 'card' });
 * // → throws CloudError { code: 'ENS-5002' }
 * ```
 */
export function createDisposedError(): CloudError {
    return new CloudError(
        'ENS-5002',
        'ENS-5002',
        '@enterstellar-ai/cloud: Client has been disposed. Create a new client with createEnterstellarCloudClient().',
        false,
    );
}

/**
 * Creates a `CloudError` for failed usage/operational queries.
 *
 * Thrown when a server request fails with a non-429, non-5xx error that
 * does not trigger the retry loop. Recoverable — the caller can retry
 * or fall back to cached data.
 *
 * @param statusCode - The HTTP status code returned by the server, or
 *   `undefined` if the request never reached the server (e.g., DNS failure).
 * @param requestId - The `X-Request-Id` from the response, if available.
 * @returns A recoverable `CloudError` with code `ENS-5003`.
 */
export function createUsageFetchError(
    statusCode: number | undefined,
    requestId?: string,
): CloudError {
    const statusSuffix = statusCode !== undefined
        ? ` (HTTP ${String(statusCode)})`
        : ' (no response)';

    return new CloudError(
        'ENS-5003',
        'ENS-5003',
        `@enterstellar-ai/cloud: Usage query failed${statusSuffix}.`,
        true,
        { requestId },
    );
}

/**
 * Creates a `CloudError` for non-signal method calls in anonymous mode.
 *
 * Thrown when a method other than `submitSignal()` or `dispose()` is called
 * on a client initialized with a `pk_anon_*` API key (SD1). Anonymous mode
 * only supports signal submission — all other operations require a project
 * API key (`ak_*`).
 *
 * @param method - The method name that was called (e.g., `'forge'`, `'search'`).
 * @returns A non-recoverable `CloudError` with code `ENS-5004`.
 *
 * @see Design Choice SD1 — auto-detect `pk_anon` prefix → anonymous mode.
 *
 * @example
 * ```ts
 * const client = createEnterstellarCloudClient({ apiKey: 'pk_anon_abc123' });
 * await client.forge({ intent: 'card' });
 * // → throws CloudError { code: 'ENS-5004', message: '...forge()...' }
 * ```
 */
export function createAnonymousModeError(method: string): CloudError {
    return new CloudError(
        'ENS-5004',
        'ENS-5004',
        `@enterstellar-ai/cloud: ${method}() is not available in anonymous mode. `
        + 'Anonymous clients (pk_anon_*) can only call submitSignal(). '
        + 'Use a project API key (ak_*) for full access.',
        false,
    );
}

/**
 * Creates a `CloudError` for exhausted retries.
 *
 * Thrown after all 3 retry attempts fail for 5xx or network errors (SD5).
 * Recoverable — the caller may want to retry later, queue the request,
 * or fall back to a local alternative.
 *
 * @param attempts - The total number of attempts made (always 3 per SD5).
 * @param lastStatusCode - The HTTP status code from the last attempt, or
 *   `undefined` if the last failure was a network error.
 * @param requestId - The `X-Request-Id` from the last response, if available.
 * @returns A recoverable `CloudError` with code `ENS-5005`.
 *
 * @see Design Choice SD5 — blanket exponential backoff, 3 retries.
 */
export function createRetriesExhaustedError(
    attempts: number,
    lastStatusCode?: number,
    requestId?: string,
): CloudError {
    const statusSuffix = lastStatusCode !== undefined
        ? ` Last status: ${String(lastStatusCode)}.`
        : ' Last error: network failure.';

    return new CloudError(
        'ENS-5005',
        'ENS-5005',
        `@enterstellar-ai/cloud: All ${String(attempts)} retry attempts failed.${statusSuffix}`,
        true,
        { requestId },
    );
}

// ---------------------------------------------------------------------------
// Factory Function — Server-Originated Error (ENS-C{NNNN})
// ---------------------------------------------------------------------------

/**
 * Creates a `CloudError` from a server `ENS-C4290` (quota exceeded) response.
 *
 * This is the primary billing error (SD3). The server returns a structured
 * body with `upgradeUrl` (link to the billing page) and `retryAfterMs`
 * (milliseconds until quota resets). The SDK throws this instead of silently
 * degrading — the application's error boundary decides what to do.
 *
 * The `retryAfterMs` field differentiates quota exhaustion (hours) from
 * rate limiting (seconds). The `upgradeUrl` is present only for quota
 * exhaustion.
 *
 * @param body - The parsed error body from the server response (§9.4).
 * @param requestId - The `X-Request-Id` from the response headers.
 * @returns A recoverable `CloudError` with the server's `ENS-C4290` code.
 *
 * @see Design Choice SD3 — throw with `upgradeUrl` and `retryAfterMs`.
 * @see Bible §9.4 — error response shape.
 *
 * @example
 * ```ts
 * // Server response:
 * // { "error": { "code": "ENS-C4290", "message": "IPU quota exceeded",
 * //              "retryAfterMs": 3600000, "upgradeUrl": "https://..." } }
 * throw createQuotaExceededError(parsedBody, '01HYX...');
 * ```
 */
export function createQuotaExceededError(
    body: CloudErrorBody,
    requestId?: string,
): CloudError {
    return new CloudError(
        'ENS-5003', // Base EnterstellarErrorCode — server errors map to ENS-5003
        body.code,  // Cloud code — 'ENS-C4290' (or 'ENS-C4291' if server sends it)
        `@enterstellar-ai/cloud: ${body.message}`,
        true,       // Recoverable — caller can upgrade tier or wait for reset
        {
            upgradeUrl: body.upgradeUrl,
            retryAfterMs: body.retryAfterMs,
            requestId,
        },
    );
}
