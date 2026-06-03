/**
 * @module @enterstellar-ai/migration/enrichment/resolve-provider
 * @description Factory: enrichment configuration → provider instance.
 *
 * Resolves the `EnrichmentProvider` from the enrichment configuration
 * provided by the caller. This factory is the **only** place where
 * provider-specific logic lives outside the provider implementations.
 *
 * **Resolution order (per Correction 3):**
 * 1. If `providerName` is specified → use `BYOKeyEnrichmentProvider`
 *    (requires `apiKey`).
 * 2. If `sessionToken` is available → use `CloudEnrichmentProvider`.
 * 3. If neither → throw with guidance message.
 *
 * **Audit M2:** Anthropic is NOT a supported shortcut. Anthropic's native
 * API uses `/v1/messages` with an incompatible request/response shape:
 * - `system` as top-level param (not in `messages[]`)
 * - `max_tokens` required (we don't set it)
 * - Response uses `content[0].text` (not `choices[0].message.content`)
 * Users who want Anthropic models should route through an OpenAI-compatible
 * proxy (e.g., LiteLLM, Portkey) and pass the proxy URL as `baseUrl`.
 *
 * **Audit M6:** Ollama is not added per bible scope ("No Ollama — add when
 * needed"). Users can point to a local Ollama OpenAI-compatible endpoint
 * via the `baseUrl` config field (e.g., `http://localhost:11434/v1`).
 *
 * **Package boundary note:** This function takes primitive config values
 * (not `MigrateFlags`). The CLI maps `MigrateFlags` → `EnrichmentConfig`
 * before calling this function. This avoids a dependency from
 * `@enterstellar-ai/migration` → `@enterstellar-ai/cli`.
 *
 * @see Correction 3 — Provider Resolution: CLI Flags → Provider Instance
 * @see Audit M2 — Anthropic removed (incompatible request format)
 * @see Audit M6 — Ollama removed (bible scope boundary)
 */

import type { EnrichmentProvider } from './types.js';
import { BYOKeyEnrichmentProvider } from './byo-key-provider.js';
import { CloudEnrichmentProvider } from './cloud-provider.js';

// ---------------------------------------------------------------------------
// Enrichment Config (input to factory)
// ---------------------------------------------------------------------------

/**
 * Configuration for resolving an enrichment provider.
 *
 * Mapped from `MigrateFlags` by the CLI layer — keeps `@enterstellar-ai/migration`
 * independent of CLI-specific flag types.
 */
export type EnrichmentConfig = {
    /**
     * LLM provider shortcut name.
     *
     * Currently supported shortcuts:
     * - `'openai'` → `https://api.openai.com`
     *
     * For other providers (Groq, Together, Anthropic-via-proxy, local
     * Ollama), pass the provider's OpenAI-compatible base URL directly
     * via the `baseUrl` field instead.
     *
     * **Audit M2:** Anthropic is NOT a supported shortcut — its native
     * API uses `/v1/messages` with an incompatible request/response shape.
     */
    readonly providerName?: string;
    /** API key for BYO-key providers. */
    readonly apiKey?: string;
    /** Model identifier (e.g., `'gpt-4o'`, `'llama-3.1-70b-versatile'`). */
    readonly model?: string;
    /**
     * Custom base URL for OpenAI-compatible endpoints.
     *
     * When provided, overrides the URL resolved from `providerName`.
     * Use this for Groq (`https://api.groq.com/openai`), Together
     * (`https://api.together.xyz`), local Ollama
     * (`http://localhost:11434/v1`), or Anthropic-via-proxy endpoints.
     *
     * Must serve `POST /v1/chat/completions` with the standard
     * OpenAI request/response shape.
     */
    readonly baseUrl?: string;
    /** Session token from `enterstellar login` (for Enterstellar Cloud). */
    readonly sessionToken?: string;
    /**
     * Optional callback for Cloud provider IPU tracking.
     * Invoked with the `X-IPU-Remaining` value after successful enrichment.
     */
    readonly onIPU?: (remaining: number) => void;
};

// ---------------------------------------------------------------------------
// Base URL Mapping
// ---------------------------------------------------------------------------

/**
 * Maps provider shortcut names to their base API URLs.
 *
 * Only `'openai'` is a supported shortcut. For other providers,
 * users should pass a custom `baseUrl` directly in the config.
 *
 * **Audit M2 (CONFIRMED):** Anthropic removed. Its native API at
 * `https://api.anthropic.com` uses `/v1/messages` — incompatible with
 * our `POST /v1/chat/completions` transport. Concrete incompatibilities:
 * 1. Endpoint path: `/v1/messages` vs `/v1/chat/completions`
 * 2. System prompt: top-level `system` field vs `messages[{role:'system'}]`
 * 3. `max_tokens`: required vs optional
 * 4. Response: `content[0].text` vs `choices[0].message.content`
 *
 * @param providerName - The provider shortcut from `--provider` flag.
 * @returns The base URL for the provider's API.
 * @throws {Error} If the provider name is not recognized.
 */
function resolveBaseUrl(providerName: string): string {
    switch (providerName) {
        case 'openai':
            return 'https://api.openai.com';
        default:
            throw new Error(
                `Unknown enrichment provider shortcut: '${providerName}'. ` +
                `Supported shortcuts: 'openai'. ` +
                `For other OpenAI-compatible providers (Groq, Together, Ollama, ` +
                `Anthropic-via-proxy), pass --base-url <url> instead.`,
            );
    }
}

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

/**
 * Resolves an `EnrichmentProvider` from the enrichment configuration.
 *
 * **Resolution order:**
 * 1. If `config.providerName` or `config.baseUrl` is set → BYO-key
 *    (requires `config.apiKey`)
 * 2. If `config.sessionToken` is set → Enterstellar Cloud
 * 3. If neither → throws with guidance message
 *
 * @param config - The enrichment configuration mapped from CLI flags.
 * @returns An `EnrichmentProvider` instance ready for `provider.enrich()`.
 * @throws {Error} If `--provider` is specified without `--api-key`.
 * @throws {Error} If no provider and no auth — guides user to configure.
 *
 * @example
 * ```ts
 * // BYO-key with shortcut:
 * const provider = resolveProvider({
 *     providerName: 'openai',
 *     apiKey: 'sk-xxx',
 *     model: 'gpt-4o',
 * });
 *
 * // BYO-key with custom URL (Groq):
 * const groqProvider = resolveProvider({
 *     baseUrl: 'https://api.groq.com/openai',
 *     apiKey: 'gsk-xxx',
 *     model: 'llama-3.1-70b-versatile',
 * });
 *
 * // Enterstellar Cloud path:
 * const cloudProvider = resolveProvider({
 *     sessionToken: 'eyJ...',
 * });
 * ```
 *
 * @see Correction 3 — Provider Resolution
 */
export function resolveProvider(config: EnrichmentConfig): EnrichmentProvider {
    // Path 1: BYO-key provider (explicit provider name or custom base URL)
    if (config.providerName !== undefined || config.baseUrl !== undefined) {
        if (config.apiKey === undefined) {
            const providerLabel = config.providerName ?? 'custom endpoint';
            throw new Error(
                `--provider ${providerLabel} requires --api-key. ` +
                `Usage: enterstellar migrate <path> --enrich --provider ${providerLabel} --api-key <key>`,
            );
        }

        // Custom baseUrl takes precedence over providerName shortcut.
        // If baseUrl is absent, providerName is guaranteed defined by the
        // enclosing `if` guard — but we avoid `!` assertion per lint rules.
        const baseUrl = config.baseUrl
            ?? (config.providerName !== undefined
                ? resolveBaseUrl(config.providerName)
                : 'https://api.openai.com');
        return new BYOKeyEnrichmentProvider(config.apiKey, config.model, baseUrl);
    }

    // Path 2: Enterstellar Cloud provider
    if (config.sessionToken !== undefined) {
        return new CloudEnrichmentProvider(
            config.sessionToken,
            undefined, // default endpoint
            config.onIPU,
        );
    }

    // Path 3: No provider configured
    throw new Error(
        'No LLM provider configured for enrichment. Options:\n' +
        "  • Run 'enterstellar login' for Enterstellar Cloud (recommended)\n" +
        '  • Use --provider openai --api-key <key> for OpenAI\n' +
        '  • Use --base-url <url> --api-key <key> for any OpenAI-compatible endpoint',
    );
}
