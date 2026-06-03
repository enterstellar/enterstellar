/**
 * @module @enterstellar-ai/global-index/errors
 * @description Error factory functions for `@enterstellar-ai/global-index`.
 *
 * Every error follows the Enterstellar error taxonomy:
 * - `EnterstellarError` with machine-readable `code`, originating `module`, and `recoverable` flag.
 * - Module is always `'global-index'`.
 * - Error code range: `ENS-5030`–`ENS-5035`.
 *
 * Error semantics:
 * | Code | Scenario | Recovery |
 * |:---|:---|:---|
 * | `ENS-5030` | Missing or empty `cloudClient` in config | Fatal — dev error |
 * | `ENS-5031` | Client disposed, method called after `dispose()` | Fatal |
 * | `ENS-5032` | Search request failed (network / server error) | Recoverable |
 * | `ENS-5033` | Contract not found at specified registry | Recoverable |
 * | `ENS-5034` | Registry registration failed | Recoverable |
 * | `ENS-5035` | Invalid contract data in API response (Zod parse fail) | Recoverable |
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14 — error code ranges.
 */

import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Module identifier used in all errors from this package. */
const MODULE = 'global-index' as const;

// ---------------------------------------------------------------------------
// ENS-5030 — Configuration Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for configuration validation failures.
 *
 * Thrown at factory creation time (`createGlobalIndex()`) when required
 * config fields are missing or invalid. This is a developer error —
 * **not recoverable** at runtime.
 *
 * @param detail - Human-readable detail about what is misconfigured.
 * @returns A non-recoverable `EnterstellarError` with code `ENS-5030`.
 *
 * @example
 * ```ts
 * throw createConfigError('cloudClient is required.');
 * ```
 */
export function createConfigError(detail: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-5030',
        MODULE,
        `Global Index configuration error: ${detail}`,
        false, // not recoverable — dev error
    );
}

// ---------------------------------------------------------------------------
// ENS-5031 — Disposed Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for method calls after `dispose()`.
 *
 * Thrown when any method is called on a `GlobalIndex` instance that
 * has already been disposed. This is a developer error — **not recoverable**.
 *
 * @returns A non-recoverable `EnterstellarError` with code `ENS-5031`.
 *
 * @example
 * ```ts
 * if (disposed) throw createDisposedError();
 * ```
 */
export function createDisposedError(): EnterstellarError {
    return new EnterstellarError(
        'ENS-5031',
        MODULE,
        'Global Index client has been disposed. Create a new instance via createGlobalIndex().',
        false, // not recoverable — dev error
    );
}

// ---------------------------------------------------------------------------
// ENS-5032 — Search Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for search request failures.
 *
 * Thrown when a search, getContract, or featured request fails due to
 * network errors, server errors, or timeouts. **Recoverable** — callers
 * should handle gracefully (e.g., return empty results, retry later).
 *
 * @param detail - Human-readable detail about the failure.
 * @param cause - Optional underlying error that caused the failure.
 * @returns A recoverable `EnterstellarError` with code `ENS-5032`.
 *
 * @example
 * ```ts
 * throw createSearchError('Search request timed out after 10000ms.', error);
 * ```
 */
export function createSearchError(detail: string, cause?: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-5032',
        MODULE,
        `Global Index search failed: ${detail}`,
        true, // recoverable — infra/network error
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-5033 — Not Found Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for contract-not-found scenarios.
 *
 * Thrown when `getContract()` finds no matching contract at the specified
 * registry. **Recoverable** — callers should handle `null` returns gracefully.
 *
 * @param name - The PascalCase component name that was searched for.
 * @param registryUrl - The registry URL that was queried.
 * @returns A recoverable `EnterstellarError` with code `ENS-5033`.
 *
 * @example
 * ```ts
 * throw createNotFoundError('PatientVitals', 'https://registry.acme.health');
 * ```
 */
export function createNotFoundError(name: string, registryUrl: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-5033',
        MODULE,
        `Contract "${name}" not found in registry "${registryUrl}".`,
        true, // recoverable — expected case
    );
}

// ---------------------------------------------------------------------------
// ENS-5034 — Registration Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for registry registration failures.
 *
 * Thrown when `registerRegistry()` or `refreshRegistry()` fails due to
 * network errors, server errors, or validation rejection. **Recoverable** —
 * callers can retry with corrected input.
 *
 * @param detail - Human-readable detail about the failure.
 * @param cause - Optional underlying error that caused the failure.
 * @returns A recoverable `EnterstellarError` with code `ENS-5034`.
 *
 * @example
 * ```ts
 * throw createRegistrationError('Registry URL is unreachable.', error);
 * ```
 */
export function createRegistrationError(detail: string, cause?: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-5034',
        MODULE,
        `Global Index registry operation failed: ${detail}`,
        true, // recoverable — can retry
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-5035 — Validation Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for API response validation failures.
 *
 * Thrown when the Global Index service returns data that fails Zod
 * schema validation — indicating a server-side bug or API version mismatch.
 * **Recoverable** — callers should log a warning and degrade gracefully.
 *
 * @param detail - Human-readable detail about the parse failure.
 * @param cause - Optional Zod error or underlying error.
 * @returns A recoverable `EnterstellarError` with code `ENS-5035`.
 *
 * @example
 * ```ts
 * throw createValidationError('FederatedRegistry response missing "id" field.', zodError);
 * ```
 */
export function createValidationError(detail: string, cause?: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-5035',
        MODULE,
        `Global Index response validation failed: ${detail}`,
        true, // recoverable — degrade gracefully
        cause,
    );
}
