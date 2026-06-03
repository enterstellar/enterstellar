/**
 * @module @enterstellar-ai/migration/enrichment/cloud-provider
 * @description Enterstellar Cloud enrichment provider implementation.
 *
 * Calls the Enterstellar forge API endpoint (`POST /v1/forge/enrich`).
 * The enrichment prompt lives server-side — Enterstellar can iterate on prompt
 * quality without shipping CLI updates. Response is a structured
 * `SemanticOverlay` directly (no raw chat completion parsing needed).
 *
 * **Key differences from BYO-key provider:**
 * - No client-side prompt construction (server owns the prompt).
 * - Defensive `SemanticOverlaySchema.safeParse()` — server validates, but we
 *   guard against API version mismatches (defense-in-depth).
 * - No retry on quota exhaustion (402/429 are final — IPU limits are hard).
 * - IPU tracking via `X-IPU-Remaining` header (logged to stderr per
 *   `@enterstellar-ai/cloud` metering pattern from `create-cloud-client.ts`).
 *
 * **`@enterstellar-ai/cloud` patterns adopted:**
 * - Bearer token auth (`Authorization: Bearer {sessionToken}`)
 * - `X-IPU-Remaining` header tracking for metering visibility
 * - Error status conventions consistent with Cloud SDK
 * - Native `fetch` for L15 compliance
 *
 * **Responsibilities encapsulated:**
 * - Session token auth from `enterstellar login` (stored in `~/.enterstellar/auth.json`)
 * - Server-side model selection (Enterstellar controls the enrichment model)
 * - Server-side source truncation
 * - Structured `SemanticOverlay` response (server validates before returning)
 * - IPU quota tracking (remaining IPUs returned in response headers)
 * - No retry on quota exhaustion (quota errors are final)
 *
 * @see Correction 3 — CloudEnrichmentProvider spec
 * @see `@enterstellar-ai/cloud/create-cloud-client.ts` — Cloud SDK patterns (auth, IPU, metering)
 */

import type { EnrichmentProvider } from './types.js';
import { EnrichmentError } from './types.js';
import type { StructuralManifest, SemanticOverlay } from '../types.js';
import { SemanticOverlaySchema } from '../types.js';

// ---------------------------------------------------------------------------
// Internal Types (T1)
// ---------------------------------------------------------------------------

/**
 * Request body sent to the Enterstellar Cloud enrichment endpoint.
 *
 * The server extracts heuristic-fallback fields from the manifest,
 * constructs its own prompt, calls the LLM, validates the response,
 * and returns a structured `SemanticOverlay`.
 */
type CloudEnrichmentRequest = {
    /** The Phase 1 structural manifest (serialized as JSON). */
    readonly manifest: StructuralManifest;
    /** The original component source code. */
    readonly source: string;
};

/**
 * Response body from the Enterstellar Cloud enrichment endpoint.
 *
 * The server returns the validated `SemanticOverlay` directly —
 * no client-side parsing or validation needed. We still run a
 * defensive `safeParse()` for defense-in-depth.
 */
type CloudEnrichmentResponse = {
    /** The enriched `SemanticOverlay` produced by the server. */
    readonly overlay: SemanticOverlay;
};

// ---------------------------------------------------------------------------
// Cloud Provider
// ---------------------------------------------------------------------------

/**
 * Enterstellar Cloud enrichment provider — calls the Enterstellar forge API
 * with the user's session token from `enterstellar login`.
 *
 * Follows `@enterstellar-ai/cloud` patterns: bearer auth, `X-IPU-Remaining`
 * header tracking, and consistent error mapping.
 *
 * @see Correction 3 — two providers at launch
 * @see `@enterstellar-ai/cloud/create-cloud-client.ts` — pattern reference
 */
export class CloudEnrichmentProvider implements EnrichmentProvider {
    /** Session token from `enterstellar login`. */
    private readonly sessionToken: string;

    /** Enterstellar Cloud API endpoint URL. */
    private readonly endpoint: string;

    /**
     * Optional callback for IPU tracking.
     *
     * When provided, called with the `X-IPU-Remaining` header value
     * after a successful enrichment call. The CLI uses this to display
     * remaining IPUs to the user (e.g., `ℹ  IPU remaining: 42`).
     *
     * Follows the `@enterstellar-ai/cloud` metering pattern — IPU data is surfaced
     * to the caller, not logged internally by the provider.
     */
    private readonly onIPU?: (remaining: number) => void;

    /**
     * Creates a new `CloudEnrichmentProvider`.
     *
     * @param sessionToken - Session token from `enterstellar login` (read from `~/.enterstellar/auth.json`).
     * @param endpoint - Cloud API endpoint. Defaults to `'https://api.enterstellar.dev/v1/forge/enrich'`.
     * @param onIPU - Optional callback invoked with `X-IPU-Remaining` value after success.
     */
    constructor(
        sessionToken: string,
        endpoint: string = 'https://api.enterstellar.dev/v1/forge/enrich',
        onIPU?: (remaining: number) => void,
    ) {
        this.sessionToken = sessionToken;
        this.endpoint = endpoint;
        if (onIPU !== undefined) {
            this.onIPU = onIPU;
        }
    }

    /**
     * Enrich heuristic-fallback fields via the Enterstellar Cloud forge API.
     *
     * **Workflow:**
     * 1. POST `{ manifest, source }` to the enrichment endpoint.
     * 2. Server handles prompt construction, model selection, and validation.
     * 3. Parse the structured `SemanticOverlay` response.
     * 4. Log `X-IPU-Remaining` header via `onIPU` callback (if provided).
     * 5. Run defensive `safeParse()` — server should always return valid data,
     *    but defense-in-depth protects against API version mismatches.
     *
     * @param manifest - The full `StructuralManifest` from Phase 1.
     * @param source - The original component source code.
     * @returns A `SemanticOverlay` with enriched field values.
     * @throws {EnrichmentError} On auth expiry, quota exhaustion, or server error.
     */
    async enrich(
        manifest: StructuralManifest,
        source: string,
    ): Promise<SemanticOverlay> {
        // --- Step 1: Build request ---
        const requestBody: CloudEnrichmentRequest = { manifest, source };

        // --- Step 2: Send request ---
        let response: Response;
        try {
            response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.sessionToken}`,
                },
                body: JSON.stringify(requestBody),
            });
        } catch (err: unknown) {
            const message = err instanceof Error
                ? err.message
                : 'Network request failed';
            throw new EnrichmentError('PROVIDER_ERROR', `Network error: ${message}`);
        }

        // --- Step 3: Handle error responses ---
        if (!response.ok) {
            const status = response.status;

            // Auth expired or invalid session
            if (status === 401) {
                throw new EnrichmentError(
                    'AUTH_FAILED',
                    "Session expired. Run 'enterstellar login' to re-authenticate.",
                );
            }

            // Quota exhausted — 402 (Payment Required) or 429 (Rate Limited).
            // Both are treated as QUOTA_EXHAUSTED for Cloud — IPU limits are
            // hard limits, not transient rate limits. No retry.
            if (status === 402 || status === 429) {
                throw new EnrichmentError(
                    'QUOTA_EXHAUSTED',
                    'IPU quota exhausted. Upgrade your plan or wait for the next billing cycle.',
                );
            }

            // Server error (5xx)
            if (status >= 500) {
                throw new EnrichmentError(
                    'PROVIDER_ERROR',
                    `Enterstellar Cloud server error (HTTP ${String(status)}).`,
                );
            }

            // Other client errors
            throw new EnrichmentError(
                'PROVIDER_ERROR',
                `Enterstellar Cloud returned HTTP ${String(status)}.`,
            );
        }

        // --- Step 4: Parse response body ---
        let responseBody: unknown;
        try {
            responseBody = await response.json();
        } catch {
            throw new EnrichmentError(
                'PARSE_ERROR',
                'Failed to parse Enterstellar Cloud response as JSON.',
            );
        }

        // --- Step 5: Extract overlay and log IPU ---
        const ipuRemainingHeader = response.headers.get('X-IPU-Remaining');
        if (ipuRemainingHeader !== null && this.onIPU !== undefined) {
            const remaining = Number(ipuRemainingHeader);
            if (Number.isFinite(remaining)) {
                this.onIPU(remaining);
            }
        }

        // --- Step 6: Defensive validation (defense-in-depth) ---
        // The server should always return a valid SemanticOverlay, but
        // we validate anyway to guard against API version mismatches or
        // server bugs. We extract the `overlay` field from the response.
        const cloudResponse = responseBody as CloudEnrichmentResponse;
        const overlayData: unknown = cloudResponse.overlay;

        const result = SemanticOverlaySchema.safeParse(overlayData);
        if (!result.success) {
            throw new EnrichmentError(
                'PARSE_ERROR',
                `Enterstellar Cloud response failed schema validation: ${result.error.message}`,
            );
        }

        return result.data;
    }
}
