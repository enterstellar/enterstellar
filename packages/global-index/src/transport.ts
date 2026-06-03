/**
 * @module @enterstellar-ai/global-index/transport
 * @description Internal HTTP transport for the Global Index client.
 *
 * Provides a thin, type-safe wrapper around `fetch` for communicating
 * with the Global Index service at `index.enterstellar.dev`. All internal modules
 * (`registry-crawler`, `search-index`, `publish-handler`) delegate HTTP
 * calls through this transport, ensuring:
 *
 * 1. **Consistent URL construction** — base endpoint + path joining.
 * 2. **JSON serialization** — request body → JSON, response → parsed object.
 * 3. **Error wrapping** — network/HTTP errors → `EnterstellarError` via error factories.
 * 4. **Timeout handling** — `AbortController` with configurable deadline.
 * 5. **Zod validation** — response data validated against caller-provided schema.
 *
 * This module is NOT exported from the public API. It is an internal
 * implementation detail of `@enterstellar-ai/global-index`.
 *
 * @see Design Choice CL3 — graceful degradation (never hard-stop).
 * @internal
 */

import type { z } from 'zod';

import { createSearchError, createValidationError } from './errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default request timeout in milliseconds (10 seconds). */
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// TransportConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the internal HTTP transport.
 *
 * Created once by the factory (`createGlobalIndex`) and shared across
 * all internal modules. Immutable after creation.
 *
 * @internal
 */
export type TransportConfig = {
    /** Base URL of the Global Index service (e.g., `'https://index.enterstellar.dev'`). */
    readonly endpoint: string;

    /**
     * API key for authenticating requests.
     * Sent as `Authorization: Bearer {apiKey}` header.
     */
    readonly apiKey: string;

    /** Request timeout in milliseconds. */
    readonly timeoutMs: number;
};

// ---------------------------------------------------------------------------
// TransportRequest
// ---------------------------------------------------------------------------

/**
 * A single HTTP request to be executed by the transport.
 *
 * @internal
 */
export type TransportRequest = {
    /** HTTP method. */
    readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';

    /** URL path relative to the transport endpoint (e.g., `'/v1/search'`). */
    readonly path: string;

    /** Optional JSON request body. Serialized automatically. */
    readonly body?: Readonly<Record<string, unknown>> | undefined;

    /** Optional query parameters appended to the URL. */
    readonly query?: Readonly<Record<string, string>> | undefined;
};

// ---------------------------------------------------------------------------
// TransportResponse
// ---------------------------------------------------------------------------

/**
 * Parsed and validated response from the Global Index service.
 *
 * @typeParam T - The expected shape of the response data after Zod validation.
 * @internal
 */
export type TransportResponse<T> = {
    /** Parsed and validated response data. */
    readonly data: T;

    /** HTTP status code from the response. */
    readonly status: number;
};

// ---------------------------------------------------------------------------
// URL Construction
// ---------------------------------------------------------------------------

/**
 * Constructs a full URL from the transport endpoint, request path,
 * and optional query parameters.
 *
 * @param endpoint - Base URL (e.g., `'https://index.enterstellar.dev'`).
 * @param path - Path segment (e.g., `'/v1/search'`).
 * @param query - Optional query parameters.
 * @returns Fully constructed URL string.
 *
 * @internal
 */
export function buildUrl(
    endpoint: string,
    path: string,
    query?: Readonly<Record<string, string>>,
): string {
    // Strip trailing slash from endpoint, ensure leading slash on path
    const base = endpoint.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${base}${normalizedPath}`);

    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== '') {
                url.searchParams.set(key, value);
            }
        }
    }

    return url.toString();
}

// ---------------------------------------------------------------------------
// Error Detail Extraction
// ---------------------------------------------------------------------------

/**
 * Attempts to extract an error detail message from an HTTP response body.
 *
 * If the response contains JSON with a `message` or `error` field,
 * that value is returned. Otherwise falls back to the HTTP status text.
 *
 * @param response - The `Response` object from `fetch`.
 * @returns A human-readable error detail string.
 *
 * @internal
 */
async function extractErrorDetail(response: Response): Promise<string> {
    try {
        const body: unknown = await response.json();

        if (typeof body === 'object' && body !== null) {
            const record = body as Readonly<Record<string, unknown>>;
            if (typeof record['message'] === 'string') {
                return record['message'];
            }
            if (typeof record['error'] === 'string') {
                return record['error'];
            }
        }
    } catch {
        // Response body is not JSON — fall through to status text
    }

    return `HTTP ${String(response.status)} ${response.statusText}`;
}

// ---------------------------------------------------------------------------
// execute() — Core Transport Function
// ---------------------------------------------------------------------------

/**
 * Executes an HTTP request against the Global Index service.
 *
 * This is the single point of contact for all HTTP communication.
 * It handles:
 * - URL construction from endpoint + path + query
 * - JSON request body serialization
 * - Bearer token authentication
 * - Timeout via `AbortController`
 * - HTTP error detection (non-2xx status codes)
 * - Response JSON parsing
 * - Zod schema validation on the parsed response
 * - Error wrapping — all failures produce `EnterstellarError` instances
 *
 * @typeParam T - The expected response shape after Zod validation.
 * @param config - Transport configuration (endpoint, apiKey, timeoutMs).
 * @param request - The HTTP request to execute.
 * @param schema - Zod schema for validating the response body.
 * @returns Parsed and validated response.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` on response validation failures.
 *
 * @internal
 */
export async function execute<T>(
    config: TransportConfig,
    request: TransportRequest,
    schema: z.ZodType<T>,
): Promise<TransportResponse<T>> {
    const url = buildUrl(config.endpoint, request.path, request.query);
    const timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;

    // -----------------------------------------------------------------------
    // AbortController for timeout enforcement
    // -----------------------------------------------------------------------
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        // -------------------------------------------------------------------
        // Build fetch options
        // -------------------------------------------------------------------
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${config.apiKey}`,
            'Accept': 'application/json',
        };

        if (request.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        const fetchOptions: RequestInit = {
            method: request.method,
            headers,
            signal: controller.signal,
        };

        if (request.body !== undefined) {
            fetchOptions.body = JSON.stringify(request.body);
        }

        // -------------------------------------------------------------------
        // Execute fetch
        // -------------------------------------------------------------------
        let response: Response;

        try {
            response = await fetch(url, fetchOptions);
        } catch (error: unknown) {
            // AbortError = timeout; TypeError = network failure
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw createSearchError(
                    `Request timed out after ${String(timeoutMs)}ms: ${request.method} ${request.path}`,
                    error,
                );
            }

            throw createSearchError(
                `Network error: ${request.method} ${request.path}`,
                error,
            );
        }

        // -------------------------------------------------------------------
        // HTTP error detection (non-2xx)
        // -------------------------------------------------------------------
        if (!response.ok) {
            const detail = await extractErrorDetail(response);
            throw createSearchError(
                `${request.method} ${request.path} returned ${String(response.status)}: ${detail}`,
            );
        }

        // -------------------------------------------------------------------
        // Parse JSON response
        // -------------------------------------------------------------------
        let rawBody: unknown;

        try {
            rawBody = await response.json();
        } catch (error: unknown) {
            throw createValidationError(
                `Failed to parse JSON response: ${request.method} ${request.path}`,
                error,
            );
        }

        // -------------------------------------------------------------------
        // Zod schema validation
        // -------------------------------------------------------------------
        const parseResult = schema.safeParse(rawBody);

        if (!parseResult.success) {
            throw createValidationError(
                `Response schema mismatch: ${request.method} ${request.path} — ${parseResult.error.message}`,
                parseResult.error,
            );
        }

        // -------------------------------------------------------------------
        // Return validated response
        // -------------------------------------------------------------------
        return Object.freeze({
            data: parseResult.data,
            status: response.status,
        });
    } finally {
        // Always clear the timeout timer to prevent resource leaks
        clearTimeout(timeoutId);
    }
}

// ---------------------------------------------------------------------------
// executeOptional() — Returns null on 404
// ---------------------------------------------------------------------------

/**
 * Executes an HTTP request, returning `null` when the server responds
 * with `404 Not Found` instead of throwing.
 *
 * Used by `getContract()` where a missing contract is an expected case,
 * not an exception.
 *
 * @typeParam T - The expected response shape after Zod validation.
 * @param config - Transport configuration.
 * @param request - The HTTP request to execute.
 * @param schema - Zod schema for validating the response body.
 * @returns Parsed response, or `null` if the server returned 404.
 * @throws {EnterstellarError} `ENS-5032` on non-404 HTTP/network errors.
 * @throws {EnterstellarError} `ENS-5035` on response validation failures.
 *
 * @internal
 */
export async function executeOptional<T>(
    config: TransportConfig,
    request: TransportRequest,
    schema: z.ZodType<T>,
): Promise<TransportResponse<T> | null> {
    const url = buildUrl(config.endpoint, request.path, request.query);
    const timeoutMs = config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${config.apiKey}`,
            'Accept': 'application/json',
        };

        const fetchOptions: RequestInit = {
            method: request.method,
            headers,
            signal: controller.signal,
        };

        let response: Response;

        try {
            response = await fetch(url, fetchOptions);
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw createSearchError(
                    `Request timed out after ${String(timeoutMs)}ms: ${request.method} ${request.path}`,
                    error,
                );
            }

            throw createSearchError(
                `Network error: ${request.method} ${request.path}`,
                error,
            );
        }

        // 404 = not found — expected case, return null
        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            const detail = await extractErrorDetail(response);
            throw createSearchError(
                `${request.method} ${request.path} returned ${String(response.status)}: ${detail}`,
            );
        }

        let rawBody: unknown;

        try {
            rawBody = await response.json();
        } catch (error: unknown) {
            throw createValidationError(
                `Failed to parse JSON response: ${request.method} ${request.path}`,
                error,
            );
        }

        const parseResult = schema.safeParse(rawBody);

        if (!parseResult.success) {
            throw createValidationError(
                `Response schema mismatch: ${request.method} ${request.path} — ${parseResult.error.message}`,
                parseResult.error,
            );
        }

        return Object.freeze({
            data: parseResult.data,
            status: response.status,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}
