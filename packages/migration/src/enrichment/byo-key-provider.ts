/**
 * @module @enterstellar-ai/migration/enrichment/byo-key-provider
 * @description BYO-key enrichment provider implementation.
 *
 * Calls any OpenAI-compatible chat completions API (OpenAI, Groq,
 * Together, or any endpoint that accepts the standard
 * `POST /v1/chat/completions` request shape) with the user's API key.
 *
 * The class is named `BYOKey` (not `OpenAI`) because it is
 * provider-agnostic at the transport level — the user selects the
 * model and endpoint via `--provider` and `--model` flags.
 *
 * **Audit M2:** Anthropic is NOT supported — its native API uses
 * `/v1/messages` with an incompatible request/response shape. Users
 * who want Anthropic should use an OpenAI-compatible proxy.
 *
 * **Responsibilities encapsulated:**
 * - Bearer token auth from `--api-key` flag
 * - Model selection (`--model` flag, default: `'gpt-4o-mini'`)
 * - Endpoint resolution (`--provider` flag → base URL mapping)
 * - Prompt construction via `buildEnrichmentPrompt()` (Audit M4)
 * - Source truncation to model's context window
 * - Raw chat completion response → JSON extraction → `SemanticOverlay` parse
 * - Exponential backoff on 429 rate limits (max 3 retries)
 * - Validation of LLM output against `SemanticOverlaySchema`
 *   (LLM may hallucinate fields — invalid fields are silently dropped)
 *
 * **L15 compliance:** Zero framework imports. Native `fetch` only (Node 20+).
 *
 * @see Correction 3 — BYOKeyEnrichmentProvider spec
 * @see Audit M4 — buildEnrichmentPrompt called inside enrich(), not orchestrator
 * @see Audit M5 — response.choices[0] guarded for noUncheckedIndexedAccess
 */

import type { EnrichmentProvider } from './types.js';
import { EnrichmentError } from './types.js';
import type { StructuralManifest, SemanticOverlay, EnrichableFieldKey } from '../types.js';
import { SemanticOverlaySchema } from '../types.js';
import { buildEnrichmentPrompt } from './build-prompt.js';
import { ENRICHABLE_FIELD_KEYS } from './enrich-manifest.js';

// ---------------------------------------------------------------------------
// Internal Types (T1 — type keyword for data shapes)
// ---------------------------------------------------------------------------

/**
 * OpenAI-compatible chat message shape.
 *
 * Maps to a single entry in the `messages` array of a
 * chat completions request.
 */
type ChatMessage = {
    /** The role of the message sender. */
    readonly role: 'system' | 'user' | 'assistant';
    /** The message content. */
    readonly content: string;
};

/**
 * OpenAI-compatible chat completion request body.
 *
 * Subset of the full API spec — includes only the fields we
 * actually use. Provider-specific extensions are ignored.
 */
type ChatCompletionRequest = {
    /** The model identifier (e.g., `'gpt-4o-mini'`). */
    readonly model: string;
    /** The messages to send to the model. */
    readonly messages: readonly ChatMessage[];
    /**
     * Sampling temperature (0-2). Lower = more deterministic.
     * We use 0.2 for metadata extraction — low creativity needed.
     */
    readonly temperature: number;
    /**
     * Response format hint. When supported, `{ type: 'json_object' }`
     * instructs the model to return valid JSON.
     */
    readonly response_format?: { readonly type: string };
};

/**
 * Subset of the OpenAI chat completion response we actually use.
 *
 * The full response includes many fields (usage, fingerprint, etc.)
 * that we don't need. We only extract `choices[0].message.content`.
 */
type ChatCompletionResponse = {
    /** Array of completion choices. Usually contains exactly one. */
    readonly choices: readonly {
        /** The assistant's response message. */
        readonly message: {
            /** The text content of the response. */
            readonly content: string;
        };
    }[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of retry attempts for rate-limited (429) responses. */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (milliseconds). Sequence: 1s, 2s, 4s. */
const BASE_RETRY_DELAY_MS = 1000;

/** Default maximum source characters for prompt truncation. */
const DEFAULT_MAX_SOURCE_CHARS = 12_000;

/**
 * Sampling temperature for metadata extraction.
 * Low temperature (0.2) produces more consistent, deterministic output
 * which is ideal for structured JSON extraction.
 */
const TEMPERATURE = 0.2;

// ---------------------------------------------------------------------------
// BYO-Key Provider
// ---------------------------------------------------------------------------

/**
 * BYO-key enrichment provider — calls an OpenAI-compatible API
 * with the user's API key and model selection.
 *
 * Internally builds the enrichment prompt by scanning the manifest
 * for `heuristic-fallback` fields (Audit M4), sends it to the chat
 * completions API, parses and validates the JSON response, and returns
 * a typed `SemanticOverlay`.
 *
 * @see Correction 3 — two providers at launch
 * @see Audit M4 — prompt built inside enrich(), not by orchestrator
 */
export class BYOKeyEnrichmentProvider implements EnrichmentProvider {
    /** The user's API key for authentication. */
    private readonly apiKey: string;

    /** Model identifier (e.g., `'gpt-4o-mini'`, `'llama-3.1-70b-versatile'`). */
    private readonly model: string;

    /** Base URL for the API endpoint. */
    private readonly baseUrl: string;

    /** Maximum source characters for prompt truncation. */
    private readonly maxSourceChars: number;

    /**
     * Creates a new `BYOKeyEnrichmentProvider`.
     *
     * @param apiKey - The user's API key (from `--api-key` flag or `ENTERSTELLAR_API_KEY` env).
     * @param model - Model identifier. Defaults to `'gpt-4o-mini'`.
     * @param baseUrl - Base URL for the API. Defaults to `'https://api.openai.com'`.
     * @param maxSourceChars - Maximum source chars in prompt. Defaults to 12,000.
     */
    constructor(
        apiKey: string,
        model: string = 'gpt-4o-mini',
        baseUrl: string = 'https://api.openai.com',
        maxSourceChars: number = DEFAULT_MAX_SOURCE_CHARS,
    ) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
        this.maxSourceChars = maxSourceChars;
    }

    /**
     * Enrich heuristic-fallback fields via an OpenAI-compatible API.
     *
     * **Internal workflow:**
     * 1. Scan manifest for `heuristic-fallback` fields (Audit M4).
     * 2. Build prompt via `buildEnrichmentPrompt()`.
     * 3. Send to `/v1/chat/completions` with Bearer auth.
     * 4. Extract JSON from response (handle markdown fences).
     * 5. Validate via `SemanticOverlaySchema.safeParse()`.
     * 6. Return validated `SemanticOverlay`.
     *
     * @param manifest - The full `StructuralManifest` from Phase 1.
     * @param source - The original component source code.
     * @returns A `SemanticOverlay` with enriched field values.
     * @throws {EnrichmentError} On auth/rate/parse/provider failures.
     */
    async enrich(
        manifest: StructuralManifest,
        source: string,
    ): Promise<SemanticOverlay> {
        // --- Step 1: Identify heuristic-fallback fields (Audit M4) ---
        const fieldsToEnrich: EnrichableFieldKey[] = [];
        for (const key of ENRICHABLE_FIELD_KEYS) {
            if (manifest[key].source === 'heuristic-fallback') {
                fieldsToEnrich.push(key);
            }
        }

        // --- Step 2: Build prompt ---
        const prompt = buildEnrichmentPrompt(
            manifest,
            source,
            fieldsToEnrich,
            this.maxSourceChars,
        );

        // --- Step 3: Build request ---
        const requestBody: ChatCompletionRequest = {
            model: this.model,
            messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
            ],
            temperature: TEMPERATURE,
            response_format: { type: 'json_object' },
        };

        // --- Step 4: Send request with retry ---
        const responseBody = await this.fetchWithRetry(requestBody);

        // --- Step 5: Extract content (Audit M5 — guard choices[0]) ---
        const firstChoice = responseBody.choices[0];
        if (firstChoice === undefined) {
            throw new EnrichmentError(
                'PARSE_ERROR',
                'LLM response contained no choices.',
            );
        }
        const rawContent = firstChoice.message.content;

        // --- Step 6: Extract JSON (handle markdown fences) ---
        const jsonString = extractJSON(rawContent);

        // --- Step 7: Parse and validate ---
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonString);
        } catch {
            throw new EnrichmentError(
                'PARSE_ERROR',
                `Failed to parse LLM response as JSON: ${jsonString.slice(0, 200)}`,
            );
        }

        const result = SemanticOverlaySchema.safeParse(parsed);
        if (!result.success) {
            throw new EnrichmentError(
                'PARSE_ERROR',
                `LLM response failed schema validation: ${result.error.message}`,
            );
        }

        return result.data;
    }

    // -----------------------------------------------------------------------
    // HTTP Transport (Private)
    // -----------------------------------------------------------------------

    /**
     * Sends a chat completion request with exponential backoff on 429.
     *
     * Retries up to `MAX_RETRIES` times on rate-limited (429) responses.
     * Non-429 error responses throw immediately.
     *
     * @param body - The request body to send.
     * @returns The parsed response body.
     * @throws {EnrichmentError} On auth, rate limit (after retries), or provider errors.
     */
    private async fetchWithRetry(body: ChatCompletionRequest): Promise<ChatCompletionResponse> {
        const url = `${this.baseUrl}/v1/chat/completions`;
        let lastError: EnrichmentError | undefined;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            // Wait before retry (not on first attempt)
            if (attempt > 0) {
                const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                await sleep(delay);
            }

            let response: Response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify(body),
                });
            } catch (err: unknown) {
                // Network error — no response received
                const message = err instanceof Error
                    ? err.message
                    : 'Network request failed';
                throw new EnrichmentError('PROVIDER_ERROR', `Network error: ${message}`);
            }

            // --- Handle error responses ---
            if (!response.ok) {
                const status = response.status;

                // Auth failure — no retry
                if (status === 401 || status === 403) {
                    throw new EnrichmentError(
                        'AUTH_FAILED',
                        `Authentication failed (HTTP ${String(status)}). Check your API key.`,
                    );
                }

                // Rate limited — retry with backoff
                if (status === 429) {
                    const retryAfterMs = parseRetryAfter(response);
                    lastError = new EnrichmentError(
                        'RATE_LIMITED',
                        `Rate limited (HTTP 429). Attempt ${String(attempt + 1)}/${String(MAX_RETRIES + 1)}.`,
                        retryAfterMs,
                    );
                    continue;
                }

                // Server error (5xx) — no retry
                if (status >= 500) {
                    throw new EnrichmentError(
                        'PROVIDER_ERROR',
                        `Server error (HTTP ${String(status)}).`,
                    );
                }

                // Other client errors — no retry
                throw new EnrichmentError(
                    'PROVIDER_ERROR',
                    `Unexpected HTTP ${String(status)} response.`,
                );
            }

            // --- Success: parse response body ---
            let responseBody: unknown;
            try {
                responseBody = await response.json();
            } catch {
                throw new EnrichmentError(
                    'PARSE_ERROR',
                    'Failed to parse API response body as JSON.',
                );
            }

            // We trust the shape loosely — the important validation happens
            // on the LLM content (SemanticOverlaySchema), not on the envelope.
            return responseBody as ChatCompletionResponse;
        }

        // All retries exhausted — throw the last rate-limit error
        throw lastError ?? new EnrichmentError(
            'RATE_LIMITED',
            `Rate limited after ${String(MAX_RETRIES)} retries.`,
        );
    }
}

// ---------------------------------------------------------------------------
// Utility Functions (Module-Level)
// ---------------------------------------------------------------------------

/**
 * Extracts JSON from an LLM response that may be wrapped in markdown fences.
 *
 * LLMs frequently wrap JSON output in markdown code fences like:
 * ````
 * ```json
 * { "fields": [...] }
 * ```
 * ````
 *
 * This function strips those fences to extract the raw JSON string.
 * If no fences are found, the raw content is returned as-is.
 *
 * @param content - The raw response content from the LLM.
 * @returns The extracted JSON string.
 */
function extractJSON(content: string): string {
    const trimmed = content.trim();

    // Match ```json ... ``` or ``` ... ```
    const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i.exec(trimmed);
    if (fenceMatch?.[1] !== undefined) {
        return fenceMatch[1].trim();
    }

    return trimmed;
}

/**
 * Parses the `Retry-After` header value from a 429 response.
 *
 * The header may contain seconds (integer) or an HTTP-date.
 * We only support the seconds format — HTTP-date is uncommon
 * for API rate-limit responses.
 *
 * @param response - The 429 HTTP response.
 * @returns Retry delay in milliseconds, or `undefined` if not parseable.
 */
function parseRetryAfter(response: Response): number | undefined {
    const header = response.headers.get('Retry-After');
    if (header === null) {
        return undefined;
    }

    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
    }

    return undefined;
}

/**
 * Async sleep utility for retry backoff.
 *
 * @param ms - Milliseconds to sleep.
 * @returns A promise that resolves after the specified delay.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
