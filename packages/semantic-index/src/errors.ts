/**
 * @module @enterstellar-ai/semantic-index/errors
 * @description Semantic Index error factory functions.
 *
 * Every error uses `EnterstellarError` from `@enterstellar-ai/types` with the `ENS-502x` code range.
 * Each factory returns a pre-configured `EnterstellarError` with the correct code,
 * module (`'semantic-index'`), message, and recoverability flag.
 *
 * **Error philosophy:**
 * - Embedding/network failures → recoverable (retry or fallback).
 * - Developer errors (bad config, missing build) → non-recoverable (throw immediately).
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14 — ~15 error codes across 5 ranges
 */

import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// ENS-5020: Embedding provider failure
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when the embedding provider fails to produce vectors.
 *
 * This is an infrastructure error — the embedding model or service is
 * unavailable or returned an unexpected result. Recoverable via retry
 * or fallback to another provider.
 *
 * @param reason - Description of what went wrong (e.g., model timeout, invalid response).
 * @param cause - The underlying error from the embedding provider.
 * @returns An `EnterstellarError` with code `ENS-5020`, recoverable.
 */
export function embeddingProviderError(reason: string, cause?: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-5020',
        'semantic-index',
        `[ENS-5020] Embedding provider failed: ${reason}`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-5021: Index not built
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when `search()` is called before `build()`.
 *
 * This is a developer error — the index must be built before it can be
 * searched. Non-recoverable; the developer must call `build()` first.
 *
 * @returns An `EnterstellarError` with code `ENS-5021`, non-recoverable.
 */
export function indexNotBuiltError(): EnterstellarError {
    return new EnterstellarError(
        'ENS-5021',
        'semantic-index',
        '[ENS-5021] Search called before build(). Call index.build() before searching.',
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-5022: Invalid topK value
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when `topK` is outside the valid range [1, 20].
 *
 * This is a developer error — `topK` must be between 1 and 20 per SI5.
 * Non-recoverable; the developer must fix the configuration.
 *
 * @param topK - The invalid topK value that was provided.
 * @returns An `EnterstellarError` with code `ENS-5022`, non-recoverable.
 *
 * @see Design Choice SI5 — default topK: 5, max: 20.
 */
export function invalidTopKError(topK: number): EnterstellarError {
    return new EnterstellarError(
        'ENS-5022',
        'semantic-index',
        `[ENS-5022] Invalid topK: ${String(topK)}. Must be between 1 and 20.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-5023: Cloud endpoint unreachable
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when the cloud semantic search endpoint is unreachable.
 *
 * This is an infrastructure error — the cloud service is down or the
 * network is unavailable. Recoverable via fallback to local provider
 * (hybrid mode) or retry.
 *
 * @param endpoint - The cloud endpoint URL that was unreachable.
 * @param cause - The underlying network error.
 * @returns An `EnterstellarError` with code `ENS-5023`, recoverable.
 *
 * @see Design Choice SI12 — hybrid fallback on cloud unreachable.
 */
export function cloudUnreachableError(endpoint: string, cause?: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-5023',
        'semantic-index',
        `[ENS-5023] Cloud semantic search endpoint unreachable: ${endpoint}`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-5024: Embedding dimension mismatch
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when a vector's dimensionality doesn't match
 * the expected dimensions from the embedding provider.
 *
 * This is a developer/configuration error — the embedding provider
 * returned vectors with unexpected dimensions, or the vector store
 * was built with a different provider than the one performing search.
 * Non-recoverable; the developer must fix the provider configuration.
 *
 * @param expected - The expected dimensionality (from `EmbeddingProvider.dimensions`).
 * @param received - The actual dimensionality of the vector.
 * @returns An `EnterstellarError` with code `ENS-5024`, non-recoverable.
 */
export function dimensionMismatchError(expected: number, received: number): EnterstellarError {
    return new EnterstellarError(
        'ENS-5024',
        'semantic-index',
        `[ENS-5024] Embedding dimension mismatch: expected ${String(expected)}, got ${String(received)}.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-5025: Warmup failure
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when warmup fails for one or more intents.
 *
 * This is an infrastructure error — warmup is a non-blocking optimization.
 * Recoverable; the system continues without cached warmup results.
 * Failed intents are logged for debugging.
 *
 * @param failedCount - Number of intents that failed to warm up.
 * @param totalCount - Total number of intents attempted.
 * @param cause - The underlying error, if available.
 * @returns An `EnterstellarError` with code `ENS-5025`, recoverable.
 *
 * @see Design Choice SI11 — warmup pre-computes embeddings + caches.
 */
export function warmupFailedError(failedCount: number, totalCount: number, cause?: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-5025',
        'semantic-index',
        `[ENS-5025] Warmup failed for ${String(failedCount)}/${String(totalCount)} intents.`,
        true,
        cause,
    );
}
