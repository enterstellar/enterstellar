/**
 * @module @enterstellar-ai/migration/enrichment/types
 * @description Provider interface and error types for Phase 2 LLM enrichment.
 *
 * Phase 2 of the migration pipeline sends `heuristic-fallback` fields to an
 * LLM for semantic enrichment. The `EnrichmentProvider` interface decouples
 * the orchestration logic (which fields to send, how to merge results) from
 * the transport logic (which API to call, how to authenticate, how to parse
 * responses).
 *
 * **Design constraints:**
 * - The interface has ONE method (`enrich`). Not two, not three. One.
 * - All provider-specific concerns (auth, retry, response parsing, cost
 *   tracking) are encapsulated inside the implementation.
 * - The orchestrator never knows which provider it's talking to.
 *
 * `EnrichmentError` is intentionally a **separate class** from `EnterstellarError`.
 * It does NOT extend `EnterstellarError` and does NOT use `ENS-XXXX` error codes.
 * It models transient operational failures (API rate limits, auth expiry,
 * quota exhaustion) with retry semantics (`retryAfterMs`) — a concern
 * that `EnterstellarError`'s shape (`{ code, message, module, recoverable }`) does
 * not support.
 *
 * @see Correction 3 — Minimal EnrichmentProvider Interface (migration-02-enrichment.md)
 * @see Correction 2 — StructuralManifest and SemanticOverlay types
 * @see Design Choice T1 — `type` for data shapes
 * @see Design Choice T5 — every field documented
 */

import type { StructuralManifest, SemanticOverlay } from '../types.js';

// ---------------------------------------------------------------------------
// Enrichment Provider Interface (Correction 3)
// ---------------------------------------------------------------------------

/**
 * Phase 2 enrichment provider — the only abstraction in the enrichment layer.
 *
 * Implementations encapsulate:
 * - Authentication (API key vs. session token)
 * - HTTP transport (endpoint, headers, TLS)
 * - Response parsing (raw chat completion vs. structured response)
 * - Error handling and retry policy
 * - Cost/quota tracking
 *
 * The orchestrator calls `provider.enrich()` and receives a typed
 * `SemanticOverlay` — or a thrown `EnrichmentError` with a
 * machine-readable code.
 *
 * Two implementations ship at launch:
 * 1. `BYOKeyEnrichmentProvider` — user provides their own API key
 *    (OpenAI, Anthropic, or any chat-completions-compatible API)
 * 2. `CloudEnrichmentProvider` — Enterstellar Cloud (authenticated via `enterstellar login`)
 *
 * @see Correction 3 — why an interface vs. function type
 */
export type EnrichmentProvider = {
    /**
     * Enrich heuristic-fallback fields using an LLM.
     *
     * @param manifest - The full `StructuralManifest` from Phase 1.
     *   The provider uses structural fields (name, props, eventHandlers)
     *   as prompt context, and enrichable fields to identify which
     *   fields need enrichment (`source === 'heuristic-fallback'`).
     * @param source - The original component source code (truncated
     *   to a provider-appropriate token limit). Used as primary context
     *   in the enrichment prompt. The manifest tells the LLM *what was
     *   already extracted*; the source tells it *what the component does*.
     * @returns A `SemanticOverlay` containing enriched values for
     *   heuristic-fallback fields. Only fields that were actually
     *   enriched are included — the overlay is a sparse patch.
     * @throws {EnrichmentError} On auth failure, quota exhaustion,
     *   rate limiting, or provider unavailability. The error includes
     *   a machine-readable `code` for the orchestrator to decide
     *   whether to retry, fall back, or abort.
     */
    enrich(
        manifest: StructuralManifest,
        source: string,
    ): Promise<SemanticOverlay>;
};

// ---------------------------------------------------------------------------
// Enrichment Error Codes (Correction 3)
// ---------------------------------------------------------------------------

/**
 * Machine-readable error codes for enrichment failures.
 *
 * The orchestrator uses these to decide the recovery strategy:
 *
 * | Code               | Recovery                                    |
 * |:-------------------|:--------------------------------------------|
 * | `AUTH_FAILED`      | Prompt user to re-authenticate (no retry)   |
 * | `QUOTA_EXHAUSTED`  | Inform user of limit (no retry)             |
 * | `RATE_LIMITED`     | Provider already retried — retries exhausted |
 * | `PROVIDER_ERROR`   | Log and fall back to heuristic values       |
 * | `PARSE_ERROR`      | LLM returned unparseable output — fall back |
 *
 * @see Correction 3 — Error Type
 */
export type EnrichmentErrorCode =
    | 'AUTH_FAILED'
    | 'QUOTA_EXHAUSTED'
    | 'RATE_LIMITED'
    | 'PROVIDER_ERROR'
    | 'PARSE_ERROR';

// ---------------------------------------------------------------------------
// Enrichment Error Class (Correction 3)
// ---------------------------------------------------------------------------

/**
 * Structured error for enrichment failures.
 *
 * Extends `Error` (NOT `EnterstellarError`) — separate error hierarchy with
 * transport-specific fields (`retryAfterMs`) that don't belong on
 * engine-level errors.
 *
 * | Concern         | `EnterstellarError` (engine)           | `EnrichmentError` (migration) |
 * |:----------------|:-------------------------------|:------------------------------|
 * | **Domain**      | Compiler, registry, lifecycle  | Migration enrichment only     |
 * | **Code format** | `ENS-XXXX` string codes        | 5 semantic string literals    |
 * | **Shape**       | `{ code, message, recoverable }` | `{ code, message, retryAfterMs }` |
 * | **Propagation** | Telemetry, DevTools, compile   | Caught in `migrate.ts`, stderr |
 *
 * **Implementation guard:** Do not refactor into `EnterstellarError`. If future
 * CLI errors need retry semantics, extend this pattern instead.
 *
 * @see Correction 3 — Bible Note: Error class separation
 */
export class EnrichmentError extends Error {
    /** Machine-readable error code for programmatic recovery decisions. */
    readonly code: EnrichmentErrorCode;

    /**
     * Milliseconds to wait before retry.
     *
     * Only meaningful for `RATE_LIMITED` errors — the provider sets
     * this from the API response's `Retry-After` header. For all
     * other error codes, this field is absent.
     */
    readonly retryAfterMs?: number;

    /**
     * Creates a new `EnrichmentError`.
     *
     * @param code - The machine-readable error code.
     * @param message - Human-readable error description.
     * @param retryAfterMs - Optional retry delay (only for `RATE_LIMITED`).
     */
    constructor(code: EnrichmentErrorCode, message: string, retryAfterMs?: number) {
        super(message);
        this.name = 'EnrichmentError';
        this.code = code;
        if (retryAfterMs !== undefined) {
            this.retryAfterMs = retryAfterMs;
        }
    }
}
