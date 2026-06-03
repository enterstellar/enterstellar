/**
 * @module @enterstellar-ai/cloud/types
 * @description Public and internal type definitions for the `@enterstellar-ai/cloud` SDK.
 *
 * This file defines the complete API surface of `@enterstellar-ai/cloud`:
 *
 * **Public types** (re-exported from barrel):
 * - {@link CloudConfig} — client configuration (SD1, SD8, TA2, D111).
 * - {@link EnterstellarCloudClient} — 13 methods + `forge.stream()` (SD2, SD6, §9.2).
 * - {@link CloudResult} — universal return wrapper `{ data, ipu }` (SD7).
 * - {@link CloudIPU} — IPU consumption metadata from response headers (§9.3).
 * - {@link ForgeFragment} — SSE streaming fragment types (SD6, CF6).
 * - {@link RouterPrediction} — intent routing prediction (IR2).
 * - {@link AnalyticsQuery} / {@link AnalyticsResult} — trace/business analytics (TA5).
 * - Pagination types: {@link TracePage}, {@link LedgerPage}.
 * - {@link CertifyResult} — certification lifecycle (GI5, CR10).
 *
 * **Internal types** (not re-exported):
 * - {@link CloudRequestConfig} — per-request transport configuration.
 * - {@link CloudResponse} — parsed HTTP response from the transport layer.
 *
 * **Design philosophy:**
 * - Types for data shapes (no methods).
 * - Interfaces for objects with methods (`EnterstellarCloudClient`).
 * - All fields `readonly` — immutable data structures.
 * - Optional fields explicitly typed `T | undefined` (`exactOptionalPropertyTypes`).
 * - Phase 1: types defined locally. Phase 2: migrated to `@enterstellar-cloud/types` (SD10).
 *
 * @see Bible §9.1–§9.4 — API surface, response headers, error shape.
 * @see Design Choices SD1–SD10 — SDK locked decisions.
 * @see Design Choice CL1 — hybrid IPU metering.
 */

import type {
    AgentTrace,
    ComponentContract,
    ForgeSignal,
    SemanticSearchResult,
} from '@enterstellar-ai/types';

import type { CloudErrorBody } from './errors.js';

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC TYPES — Re-exported from barrel (index.ts)
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// SessionType (D111)
// ---------------------------------------------------------------------------

/**
 * The Enterstellar product surface that originated the current SDK session.
 *
 * Set once on {@link CloudConfig.sessionType} and applied to all requests
 * as a body field. The server stores this on `forge_signals`, `traces`,
 * and `ipu_ledger` rows (D111). Used for stratified Router models at
 * Phase 3 — different product surfaces generate different intent patterns.
 *
 * @see Design Choice D111 — `session_type TEXT DEFAULT 'app'`.
 */
export type SessionType =
    | 'app'
    | 'browser'
    | 'os'
    | 'connect'
    | 'agent'
    | 'other';

// ---------------------------------------------------------------------------
// CloudConfig (SD1, SD8, TA2, D111, F21)
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createEnterstellarCloudClient}.
 *
 * **Minimal usage:**
 * ```ts
 * const client = createEnterstellarCloudClient({ apiKey: 'ak_my_project_key' });
 * ```
 *
 * **Anonymous mode (SD1):**
 * ```ts
 * const client = createEnterstellarCloudClient({ apiKey: 'pk_anon_abc123' });
 * // → Only submitSignal() is available. All other methods throw ENS-5004.
 * ```
 *
 * **Changes from v0.0.x:**
 * - `tier` removed — the server determines the tier from the API key.
 * - `endpoint` renamed to `baseUrl` (SD8).
 * - `traceConsent` added (TA2 dual-consent gate).
 * - `sessionType` added (D111 product surface tag).
 *
 * @see Design Choice SD1 — auto-detect `pk_anon_` prefix → anonymous mode.
 * @see Design Choice SD8 — default `baseUrl` = `https://api.enterstellar.dev`.
 * @see Design Choice TA2 — dual-consent: client flag + server flag.
 * @see Design Choice D111 — `session_type` on all request payloads.
 */
export type CloudConfig = {
    /**
     * API key for authenticating with Enterstellar Cloud.
     *
     * Two formats are supported:
     * - `ak_<project_key>` — full mode, all methods available.
     * - `pk_anon_<install_id>` — anonymous mode, only `submitSignal()` (SD1).
     *
     * The SDK auto-detects the key type by prefix. No separate mode parameter.
     *
     * @see Design Choice SD1 — auto-detect anonymous mode.
     * @see Design Choice AG1 — key format: `ak_<uuid>`, `pk_anon_<uuid>`.
     */
    readonly apiKey: string;

    /**
     * Base URL of the Enterstellar Cloud API.
     *
     * Path segments (`/v1/forge`, `/v1/usage`, etc.) are appended automatically.
     * Override for staging, self-hosted, or local development environments.
     *
     * @default 'https://api.enterstellar.dev'
     *
     * @see Design Choice SD8 — default with override.
     */
    readonly baseUrl?: string | undefined;

    /**
     * Global HTTP request timeout in milliseconds.
     *
     * When set, overrides ALL per-operation timeout defaults. When omitted,
     * each operation uses its own default:
     * - `forge` / `forge.stream()`: 30,000ms (P99 = 10s, 3× safety margin)
     * - `certify`: 90,000ms (CR5: max 60s runtime + overhead)
     * - `analytics` / `businessAnalytics`: 30,000ms (OLAP queries)
     * - All other operations: 10,000ms
     *
     * Applied per-request via `AbortController`.
     *
     * @see Audit Finding F21 — per-operation timeout defaults.
     */
    readonly timeoutMs?: number | undefined;

    /**
     * Client-side trace consent flag (TA2 dual-consent gate).
     *
     * When `false` (default), `submitTrace()` returns immediately without
     * making a network call — `{ data: { accepted: false }, ipu: null }`.
     *
     * Both this flag AND the per-trace `consent.anonymizedAggregation` field
     * AND the server-side `projects.trace_consent` column must be `true`
     * for a trace to reach the Cloud. Defense-in-depth.
     *
     * @default false
     *
     * @see Design Choice TA2 — dual-consent: client flag + server flag.
     * @see Audit Finding F13 — mandatory client consent flag.
     */
    readonly traceConsent?: boolean | undefined;

    /**
     * The Enterstellar product surface originating this SDK session (D111).
     *
     * Applied to all request payloads. The server stores this value on
     * `forge_signals.session_type`, `traces.session_type`, and
     * `ipu_ledger.session_type` columns for stratified analytics.
     *
     * @default 'app'
     *
     * @see Design Choice D111 — `session_type TEXT DEFAULT 'app'`.
     * @see Audit Finding F15 — session type on all submissions.
     */
    readonly sessionType?: SessionType | undefined;
};

// ---------------------------------------------------------------------------
// CloudIPU (SD7, §9.3)
// ---------------------------------------------------------------------------

/**
 * IPU (Intent Processing Unit) consumption metadata from a single API call.
 *
 * Parsed from the `X-IPU-Used`, `X-IPU-Remaining`, and `X-IPU-Cost`
 * response headers (§9.3). Part of every {@link CloudResult} wrapper.
 *
 * @see Design Choice SD7 — every method returns `{ data, ipu }`.
 * @see Bible §9.3 — response header format.
 */
export type CloudIPU = {
    /** Total IPUs consumed in the current billing period (`X-IPU-Used`). */
    readonly used: number;

    /** IPUs remaining in the current billing period (`X-IPU-Remaining`). */
    readonly remaining: number;

    /** IPUs charged for THIS specific request (`X-IPU-Cost`). */
    readonly cost: number;
};

// ---------------------------------------------------------------------------
// CloudResult<T> (SD7)
// ---------------------------------------------------------------------------

/**
 * Universal return wrapper for all `EnterstellarCloudClient` methods.
 *
 * Every SDK method returns `{ data: T, ipu: CloudIPU | null }`.
 * The `ipu` field is `null` for `pk_anon` requests — anonymous users
 * have no IPU concept (AG8: all `X-IPU-*` headers omitted).
 *
 * **Changes from v0.0.x:**
 * Replaces the bespoke `CloudForgeResult`, `CloudSearchResult`, and
 * `CloudTraceResult` types. The `degraded` field is removed — operational
 * errors now throw `CloudError` (SD3).
 *
 * @typeParam T - The payload type specific to the endpoint.
 *
 * @see Design Choice SD7 — universal return wrapper.
 * @see Design Choice AG8 — `X-IPU-*` headers omitted for `pk_anon`.
 *
 * @example
 * ```ts
 * const { data: contract, ipu } = await client.forge({ intent: 'card' });
 *
 * if (ipu !== null) {
 *     console.log(`Remaining IPU: ${ipu.remaining}`);
 * }
 * ```
 */
export type CloudResult<T> = {
    /** The endpoint-specific payload. */
    readonly data: T;

    /**
     * IPU consumption metadata from response headers.
     * `null` for `pk_anon` requests (no IPU concept in anonymous mode).
     */
    readonly ipu: CloudIPU | null;
};

// ---------------------------------------------------------------------------
// CloudUsage
// ---------------------------------------------------------------------------

/**
 * IPU usage summary for the current billing period.
 *
 * Returned by `EnterstellarCloudClient.getUsage()` (`GET /v1/usage`).
 * The server is authoritative — these values reconcile the local
 * IPU tracker (CL1 hybrid tracking).
 *
 * @see Design Choice CL1 — hybrid metering, server authoritative.
 * @see Design Choice CL2 — weighted IPU costs per operation.
 * @see Design Choice AM11 — billing period is anniversary-based.
 */
export type CloudUsage = {
    /** Total IPUs consumed in the current billing period. */
    readonly used: number;

    /** IPU limit for the current billing period (tier-dependent). */
    readonly limit: number;

    /**
     * The project's service tier as reported by the server.
     *
     * A `string` (not a fixed union) to avoid breaking when new tiers
     * are added server-side. Known values: `'free'`, `'starter'`,
     * `'pro'`, `'enterprise'`.
     */
    readonly tier: string;
};

// ---------------------------------------------------------------------------
// ForgeOptions (SD6)
// ---------------------------------------------------------------------------

/**
 * Options for `EnterstellarCloudClient.forge()` and `forge.stream()`.
 *
 * The `intent` field is the natural-language description of the desired
 * component. Optional `constraints` allow the caller to pass additional
 * generation hints (allowed tokens, max props, required states, etc.)
 * to the CloudForge LLM prompt.
 *
 * @see Design Choice SD6 — dual forge API: `forge()` + `forge.stream()`.
 * @see Design Choice F5 — LLM with system prompt constraints.
 */
export type ForgeOptions = {
    /** Natural-language description of the desired component. */
    readonly intent: string;

    /**
     * Additional generation constraints passed to the CloudForge prompt.
     *
     * These are forwarded as-is to the server's prompt builder. Known
     * keys include `designTokens`, `maxComplexity`, `requiredStates`,
     * `accessibility`. Unknown keys are silently ignored by the server.
     */
    readonly constraints?: Readonly<Record<string, unknown>> | undefined;
};

// ---------------------------------------------------------------------------
// ForgeFragment (SD6, CF6, F18)
// ---------------------------------------------------------------------------

/**
 * A single fragment yielded by `forge.stream()` during SSE streaming.
 *
 * The CloudForge endpoint (`POST /v1/forge`) streams Server-Sent Events
 * (SSE) with typed `event:` fields (CF6). The SDK's SSE transport parses
 * these into `ForgeFragment` objects and yields them via `AsyncGenerator`.
 *
 * **Fragment lifecycle:**
 * 1. `meta` — first fragment, contains provider info and IPU data (F18).
 * 2. `node` / `property` — zero or more data fragments as the LLM streams.
 * 3. `complete` — final fragment with the full `ComponentContract` and IPU (F18).
 * 4. `error` — emitted instead of `complete` if the generation fails.
 *
 * **IPU delivery (F18):** The `ipu` field is present on `meta` and `complete`
 * fragments only. It is parsed from the HTTP response headers (available at
 * stream start). Callers who only care about billing info can read it from
 * either the first or last fragment.
 *
 * @see Design Choice SD6 — `forge.stream()` returns `AsyncGenerator<ForgeFragment>`.
 * @see Design Choice CF6 — SSE event types: `node`, `property`, `complete`, `error`, `meta`.
 * @see Design Choice CF9 — provider identity via SSE `meta` event.
 * @see Audit Finding F18 — IPU delivery on `meta` and `complete` fragments.
 *
 * @example
 * ```ts
 * for await (const fragment of client.forge.stream({ intent: 'card' })) {
 *     switch (fragment.type) {
 *         case 'meta':
 *             console.log(`Provider: ${fragment.data.provider}`);
 *             break;
 *         case 'complete':
 *             registerContract(fragment.data);
 *             break;
 *         case 'error':
 *             console.error(`Forge error: ${fragment.data.message}`);
 *             break;
 *     }
 * }
 * ```
 */
export type ForgeFragment =
    | ForgeMetaFragment
    | ForgeNodeFragment
    | ForgePropertyFragment
    | ForgeCompleteFragment
    | ForgeErrorFragment;

/**
 * SSE `meta` event — first fragment in the stream.
 *
 * Contains the LLM provider and model information (CF9), and IPU
 * consumption data parsed from the HTTP response headers.
 */
export type ForgeMetaFragment = {
    readonly type: 'meta';
    /** Provider and model metadata delivered via SSE `meta` event (CF9). */
    readonly data: {
        /** The LLM provider used for this generation (e.g., `'anthropic'`, `'openai'`). */
        readonly provider: string;
        /** The specific model used (e.g., `'claude-sonnet-4-20250514'`). */
        readonly model: string;
    };
    /** IPU consumption from HTTP response headers. `null` for `pk_anon`. */
    readonly ipu: CloudIPU | null;
};

/**
 * SSE `node` event — partial contract structure.
 *
 * Emitted as the LLM streams structural components of the contract.
 * Contains a partial `ComponentContract` that can be used for
 * progressive rendering of the generation process.
 */
export type ForgeNodeFragment = {
    readonly type: 'node';
    /** Partial contract data for progressive rendering. */
    readonly data: Partial<ComponentContract>;
};

/**
 * SSE `property` event — individual property update.
 *
 * Emitted as the LLM resolves specific contract properties.
 * The `path` field uses dot notation for nested properties
 * (e.g., `'tokens.background'`, `'accessibility.role'`).
 */
export type ForgePropertyFragment = {
    readonly type: 'property';
    /** Property path and value for incremental updates. */
    readonly data: {
        /** Dot-notation path to the property within the contract. */
        readonly path: string;
        /** The resolved property value. */
        readonly value: unknown;
    };
};

/**
 * SSE `complete` event — final fragment with the full contract.
 *
 * Emitted once when the LLM finishes generation. Contains the complete,
 * validated `ComponentContract` and IPU consumption data.
 */
export type ForgeCompleteFragment = {
    readonly type: 'complete';
    /** The complete, validated `ComponentContract` from the CloudForge LLM. */
    readonly data: ComponentContract;
    /** IPU consumption from HTTP response headers. `null` for `pk_anon`. */
    readonly ipu: CloudIPU | null;
};

/**
 * SSE `error` event — generation failure.
 *
 * Emitted instead of `complete` when the generation fails (LLM error,
 * validation failure, provider timeout). The stream terminates after
 * this fragment.
 */
export type ForgeErrorFragment = {
    readonly type: 'error';
    /** Error details from the server. */
    readonly data: {
        /** The `ENS-C{NNNN}` error code from the server. */
        readonly code: string;
        /** Human-readable error description. */
        readonly message: string;
    };
};

// ---------------------------------------------------------------------------
// ForgeFunction (SD6)
// ---------------------------------------------------------------------------

/**
 * The callable type for `EnterstellarCloudClient.forge`.
 *
 * `forge` is both directly callable (returns a `Promise`) and has a
 * `.stream()` method (returns an `AsyncGenerator`). This is achieved
 * via TypeScript intersection: `ForgeFunction & { stream: ... }`.
 *
 * @see Design Choice SD6 — dual API: `forge()` + `forge.stream()`.
 */
export type ForgeFunction = (
    options: ForgeOptions,
) => Promise<CloudResult<ComponentContract>>;

// ---------------------------------------------------------------------------
// RouterPrediction (IR2, F10, F19)
// ---------------------------------------------------------------------------

/**
 * Response shape for `POST /v1/route` — intent routing prediction.
 *
 * Contains an array of component predictions ranked by confidence, plus
 * metadata about the model that produced them. For unknown intents,
 * `predictions` is empty and metadata reflects the lookup context (IR3).
 *
 * **Batch ordering guarantee (F19):** When returned from `routeBatch()`,
 * the array index matches the input index: `result.data[i]` corresponds
 * to `intentHashes[i]`.
 *
 * @see Design Choice IR2 — response shape with predictions + metadata.
 * @see Design Choice IR3 — empty predictions for unknown intents.
 * @see Audit Finding F10 — type defined per IR2 shape.
 * @see Audit Finding F19 — batch ordering documented as invariant.
 *
 * @example
 * ```ts
 * const { data } = await client.route('a1b2c3...');
 *
 * if (data.predictions.length > 0 && data.predictions[0].confidence >= 0.8) {
 *     // Use Router prediction — skip Forge.
 *     useComponent(data.predictions[0].componentName);
 * }
 * ```
 */
export type RouterPrediction = {
    /** Ranked component predictions, highest confidence first. */
    readonly predictions: readonly {
        /** The predicted component name (PascalCase). */
        readonly componentName: string;

        /**
         * Confidence score (0.0–1.0).
         * Based on frequency data (Phase 2) or ML model (Phase 3, IR4).
         */
        readonly confidence: number;

        /**
         * URL of the federated registry where this contract is published.
         * Present only for contracts from federated registries (GI1).
         * `undefined` for contracts in the Global Index.
         */
        readonly registryUrl?: string | undefined;
    }[];

    /** Metadata about the prediction model and data quality. */
    readonly metadata: {
        /**
         * Version identifier for the routing model or frequency table.
         * Used for debugging and A/B testing (IR6).
         */
        readonly modelVersion: string;

        /**
         * Number of ForgeSignals backing this prediction.
         * Higher count → higher statistical confidence.
         */
        readonly signalCount: number;
    };
};

// ---------------------------------------------------------------------------
// AnalyticsQuery / AnalyticsResult (TA5, F17)
// ---------------------------------------------------------------------------

/**
 * Query payload for `analytics()` and `businessAnalytics()`.
 *
 * Fixed query types map to pre-built, optimized ClickHouse queries.
 * Each type has a known cost profile: 5 IPU per analytics call (§9.1).
 *
 * **Note (F17):** Bible §9.1 specifies `GET` for analytics endpoints,
 * but this payload requires a JSON body. The SDK uses `POST` — a Bible
 * §9.1 amendment has been flagged.
 *
 * @see Design Choice TA5 — fixed query types with filters.
 * @see Audit Finding F17 — POST instead of GET for JSON body.
 */
export type AnalyticsQuery = {
    /**
     * The type of analytics query to execute.
     * Each maps to a pre-built ClickHouse query with known cost (5 IPU).
     */
    readonly queryType:
        | 'intent_patterns'
        | 'component_performance'
        | 'journey_reconstruction'
        | 'anomalies';

    /**
     * Query filters applied to the ClickHouse query.
     *
     * Known filter keys: `timeRange`, `projectId`, `intentCategory`, `limit`.
     * Unknown keys are silently ignored by the server.
     */
    readonly filters?: Readonly<Record<string, unknown>> | undefined;
};

/**
 * Result payload from `analytics()` and `businessAnalytics()`.
 *
 * Contains the query results as an array of rows, plus the query type
 * that produced them (for client-side discrimination).
 */
export type AnalyticsResult = {
    /** Query result rows. Schema varies by `queryType`. */
    readonly rows: readonly Readonly<Record<string, unknown>>[];

    /** The query type that produced these results (echoed from the request). */
    readonly queryType: string;
};

// ---------------------------------------------------------------------------
// TraceListOptions / TracePage
// ---------------------------------------------------------------------------

/**
 * Options for `EnterstellarCloudClient.getTraces()` — paginated trace listing.
 *
 * All fields are optional. When omitted, returns the most recent traces
 * for the authenticated project.
 */
export type TraceListOptions = {
    /** Filter by correlation ID (groups related traces across operations). */
    readonly correlationId?: string | undefined;

    /** Filter by thread ID (groups traces within a single conversation). */
    readonly threadId?: string | undefined;

    /**
     * Pagination cursor from a previous response's `TracePage.cursor`.
     * Omit for the first page.
     */
    readonly cursor?: string | undefined;

    /**
     * Maximum number of traces to return per page.
     *
     * @default 50
     */
    readonly limit?: number | undefined;
};

/**
 * Paginated response for `getTraces()`.
 *
 * Uses cursor-based pagination — pass `cursor` to `TraceListOptions`
 * to fetch the next page. When `hasMore` is `false`, all traces have
 * been returned.
 */
export type TracePage = {
    /** Trace records for this page. */
    readonly items: readonly Readonly<Record<string, unknown>>[];

    /**
     * Cursor for fetching the next page.
     * `null` when there are no more results.
     */
    readonly cursor: string | null;

    /** Whether more pages are available after this one. */
    readonly hasMore: boolean;
};

// ---------------------------------------------------------------------------
// LedgerListOptions / LedgerPage
// ---------------------------------------------------------------------------

/**
 * Options for `EnterstellarCloudClient.getLedger()` — paginated IPU ledger listing.
 *
 * Returns per-operation IPU charges for audit and billing verification.
 * lookback period is tier-dependent (§9.1).
 */
export type LedgerListOptions = {
    /**
     * Pagination cursor from a previous response's `LedgerPage.cursor`.
     * Omit for the first page.
     */
    readonly cursor?: string | undefined;

    /**
     * Maximum number of ledger entries to return per page.
     *
     * @default 50
     */
    readonly limit?: number | undefined;
};

/**
 * Paginated response for `getLedger()`.
 *
 * Each item is an IPU ledger entry with `operation`, `ipu_cost`,
 * `timestamp`, and `request_id` fields.
 */
export type LedgerPage = {
    /** Ledger entries for this page. */
    readonly items: readonly Readonly<Record<string, unknown>>[];

    /**
     * Cursor for fetching the next page.
     * `null` when there are no more results.
     */
    readonly cursor: string | null;

    /** Whether more pages are available after this one. */
    readonly hasMore: boolean;
};

// ---------------------------------------------------------------------------
// CertifyResult (GI5, CR10, F14)
// ---------------------------------------------------------------------------

/**
 * Result of `EnterstellarCloudClient.certify()` — "Enterstellar Certified" lifecycle initiation.
 *
 * The certification process is asynchronous:
 * 1. `POST /v1/contracts/:id/certify` → `pending` (20 IPU charge, GI5).
 * 2. Certification Runner executes tests on Fly.io microVM (CR5: max 60s).
 * 3. Publisher polls `GET /v1/contracts/:id` and checks `certification_status`.
 *
 * The SDK returns the initial `pending` state with the polling URL.
 * The caller is responsible for polling via the Global Index package.
 *
 * @see Design Choice GI5 — `pending → running → certified | failed`.
 * @see Design Choice CR10 — polling on `GET /v1/contracts/:id`.
 * @see Audit Finding F14 — type defined per GI5 shape.
 */
export type CertifyResult = {
    /**
     * The initial certification status. Always `'pending'` at creation time.
     * The full lifecycle is: `none → pending → running → certified | failed`.
     */
    readonly status: 'pending';

    /**
     * URL path for polling certification status.
     * Typically `'/v1/contracts/{contractId}'`. The caller polls this
     * endpoint and checks the `certification_status` field.
     *
     * @see Design Choice CR10 — polling-based notification.
     */
    readonly pollUrl: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC INTERFACE — EnterstellarCloudClient (SD2, §9.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Enterstellar Cloud SDK client — primary public API of `@enterstellar-ai/cloud`.
 *
 * Created via {@link createEnterstellarCloudClient}. Provides access to all
 * Cloud-hosted capabilities: forge generation, semantic search, intent
 * routing, trace analytics, IPU metering, and contract certification.
 *
 * **13 methods + `forge.stream()`** (per Bible §9.2):
 *
 * | Category         | Methods                                         | IPU        |
 * |:-----------------|:------------------------------------------------|:-----------|
 * | **Generation**   | `forge()`, `forge.stream()`                     | 10         |
 * | **Search**       | `search()`                                      | 1          |
 * | **Routing**      | `route()`, `routeBatch()`                       | 1, 1×N     |
 * | **Signals**      | `submitSignal()`                                | 0 (pk_anon)|
 * | **Traces**       | `submitTrace()`, `getTraces()`                  | 0          |
 * | **Analytics**    | `analytics()`, `businessAnalytics()`            | 5          |
 * | **Billing**      | `getUsage()`, `getLedger()`                     | 0          |
 * | **Operations**   | `certify()`, `deleteProjectData()`              | 20, 0      |
 * | **Lifecycle**    | `dispose()`                                     | —          |
 *
 * **Error policy (SD3):**
 * - 429 (quota exceeded) → throw `CloudError` with `upgradeUrl` + `retryAfterMs`.
 * - 5xx / network → retry 3× (SD5), then throw `CloudError` (`ENS-5005`).
 * - 4xx (non-429) → throw `CloudError` immediately, no retry.
 * - Post-dispose → throw `CloudError` (`ENS-5002`).
 * - Anonymous mode → non-signal methods throw `CloudError` (`ENS-5004`).
 *
 * **Anonymous mode (SD1):**
 * Clients created with `pk_anon_*` keys can only call `submitSignal()`
 * and `dispose()`. All other methods throw `ENS-5004`.
 *
 * @see Bible §9.2 — SDK ↔ Cloud endpoint mapping.
 * @see Design Choice SD2 — 8 new methods added (minor version bump).
 * @see Design Choice SD3 — throw `CloudError` on 429.
 * @see Design Choice SD6 — dual forge API: `forge()` + `forge.stream()`.
 * @see Design Choice SD7 — every method returns `CloudResult<T>`.
 *
 * @example
 * ```ts
 * import { createEnterstellarCloudClient, CloudError } from '@enterstellar-ai/cloud';
 *
 * const client = createEnterstellarCloudClient({ apiKey: 'ak_my_key' });
 *
 * try {
 *     const { data: contract, ipu } = await client.forge({ intent: 'patient vitals card' });
 *     console.log(`Generated: ${contract.name}, IPU remaining: ${ipu?.remaining}`);
 * } catch (error) {
 *     if (error instanceof CloudError && error.upgradeUrl) {
 *         showUpgradePrompt(error.upgradeUrl);
 *     }
 * } finally {
 *     client.dispose();
 * }
 * ```
 */
export interface EnterstellarCloudClient {
    // -------------------------------------------------------------------
    // Generation (SD6)
    // -------------------------------------------------------------------

    /**
     * Generate a `ComponentContract` via CloudForge.
     *
     * Callable and has a `.stream()` method for SSE streaming:
     * - `forge(options)` → `Promise<CloudResult<ComponentContract>>` (buffers full stream).
     * - `forge.stream(options)` → `AsyncGenerator<ForgeFragment>` (yields fragments).
     *
     * **IPU cost:** 10 per invocation (§9.1).
     * **Timeout:** 30s default (P99 = 10s, §8.9).
     * **Idempotency:** `X-Idempotency-Key` sent (AM10).
     *
     * @throws {CloudError} `ENS-C4290` if IPU quota exceeded (SD3).
     * @throws {CloudError} `ENS-5005` if all 3 retries fail (SD5).
     * @throws {CloudError} `ENS-5002` if client is disposed.
     * @throws {CloudError} `ENS-5004` if in anonymous mode.
     *
     * @see Design Choice SD6 — dual API: `forge()` + `forge.stream()`.
     * @see Design Choice CL2 — CloudForge = 10 IPU.
     */
    forge: ForgeFunction & {
        /**
         * Stream CloudForge generation via Server-Sent Events.
         *
         * Yields {@link ForgeFragment} objects as the LLM generates the
         * contract. Use this for progressive rendering. The generator
         * completes when a `complete` or `error` fragment is yielded.
         *
         * @param options - Forge generation options.
         * @yields {ForgeFragment} Typed SSE fragments.
         *
         * @see Design Choice CF6 — SSE event types.
         * @see Design Choice CF14 — SSE streaming format.
         */
        stream(options: ForgeOptions): AsyncGenerator<ForgeFragment, void, undefined>;
    };

    // -------------------------------------------------------------------
    // Search
    // -------------------------------------------------------------------

    /**
     * Search for components via Cloud Semantic Index.
     *
     * Proxies to `POST /v1/semantic-search`. Uses the authenticated
     * project's private Vectorize index (optionally including the
     * Global Index — see §9.1 note on search scope).
     *
     * **IPU cost:** 1 per invocation (§9.1).
     * **Timeout:** 10s default.
     * **Idempotency:** `X-Idempotency-Key` sent (AM10).
     *
     * @param query - Natural language search query (intent string).
     * @param topK - Maximum number of results. Defaults to 5 (SI5).
     * @returns Semantic search results with IPU metadata.
     *
     * @throws {CloudError} `ENS-C4290` if IPU quota exceeded.
     * @throws {CloudError} `ENS-5005` if all retries fail.
     * @throws {CloudError} `ENS-5002` if disposed. `ENS-5004` if anonymous.
     *
     * @see Design Choice CL2 — semantic search = 1 IPU.
     */
    search(
        query: string,
        topK?: number,
    ): Promise<CloudResult<readonly SemanticSearchResult[]>>;

    // -------------------------------------------------------------------
    // Routing (IR2, IR5)
    // -------------------------------------------------------------------

    /**
     * Predict the component for a single intent hash.
     *
     * Proxies to `POST /v1/route`. Returns ranked predictions with
     * confidence scores and metadata. For unknown intents, returns
     * empty predictions (IR3) — the caller should fall through to Forge.
     *
     * **IPU cost:** 1 per invocation (§9.1).
     * **Timeout:** 10s default.
     *
     * @param intentHash - SHA-256 hash of the intent string.
     * @returns Ranked predictions with model metadata.
     *
     * @throws {CloudError} On quota, retry exhaustion, disposal, or anonymous mode.
     *
     * @see Design Choice IR2 — response shape.
     * @see Design Choice IR3 — empty predictions for unknown intents.
     */
    route(intentHash: string): Promise<CloudResult<RouterPrediction>>;

    /**
     * Predict components for a batch of intent hashes (pre-rendering).
     *
     * Proxies to `POST /v1/route/batch`. Send likely next intents
     * (e.g., from visible buttons) to pre-resolve contracts ahead of time.
     *
     * **IPU cost:** 1 × N per invocation (§9.1), where N = `intentHashes.length`.
     * **Timeout:** 10s default.
     *
     * **Ordering guarantee (F19):** `result.data[i]` corresponds to
     * `intentHashes[i]`. The server preserves input order.
     *
     * @param intentHashes - Array of SHA-256 intent hashes to resolve.
     * @returns Array of predictions in the same order as input.
     *
     * @throws {CloudError} On quota, retry exhaustion, disposal, or anonymous mode.
     *
     * @see Design Choice IR5 — batch routing for pre-rendering.
     * @see Audit Finding F19 — batch ordering invariant.
     */
    routeBatch(
        intentHashes: readonly string[],
    ): Promise<CloudResult<readonly RouterPrediction[]>>;

    // -------------------------------------------------------------------
    // Signals (SD1, SD4)
    // -------------------------------------------------------------------

    /**
     * Submit a `ForgeSignal` to the Cloud corpus.
     *
     * Proxies to `POST /v1/signals`. This is the **only method that works
     * in anonymous mode** (`pk_anon_*` keys). The SDK transparently sets
     * `Authorization: Bearer pk_anon_<install_id>` (SD4).
     *
     * **IPU cost:** 0 — signal ingestion is free (§9.1: "data collection
     * is our #1 strategic asset — never charge for it").
     * **No idempotency key** — 0 IPU, not required (AM10/F8).
     *
     * @param signal - The `ForgeSignal` to submit (from `@enterstellar-ai/telemetry`).
     * @returns Acceptance confirmation.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail. `ENS-5002` if disposed.
     *
     * @see Design Choice SD1 — anonymous mode: only `submitSignal()` available.
     * @see Design Choice SD4 — `@enterstellar-ai/telemetry` uses SDK with `pk_anon`.
     */
    submitSignal(
        signal: ForgeSignal,
    ): Promise<CloudResult<{ readonly accepted: boolean }>>;

    // -------------------------------------------------------------------
    // Traces (TA2)
    // -------------------------------------------------------------------

    /**
     * Submit an `AgentTrace` for cloud aggregation and analytics.
     *
     * Proxies to `POST /v1/traces`. **Triple consent gate (TA2, F13):**
     * 1. `CloudConfig.traceConsent` must be `true` (client SDK flag).
     * 2. `trace.consent.anonymizedAggregation` must be `true` (per-trace).
     * 3. Server-side `projects.trace_consent` must be `true` (project flag).
     *
     * If either client-side check fails, returns immediately with
     * `{ data: { accepted: false }, ipu: null }` — no network call.
     *
     * **IPU cost:** 0 — trace submission is free (§9.1 corrected).
     *
     * @param trace - The `AgentTrace` to submit. Must have consent fields.
     * @returns Acceptance confirmation.
     *
     * @throws {CloudError} `ENS-5005` if all retries fail.
     * @throws {CloudError} `ENS-5002` if disposed. `ENS-5004` if anonymous.
     *
     * @see Design Choice TA2 — dual-consent gate.
     * @see Design Choice CL2 — trace submission = 0 IPU (corrected from 5).
     */
    submitTrace(
        trace: AgentTrace,
    ): Promise<CloudResult<{ readonly accepted: boolean }>>;

    /**
     * Query traces for the authenticated project.
     *
     * Proxies to `GET /v1/traces`. Returns paginated results filtered
     * by `correlation_id` and/or `thread_id`.
     *
     * **IPU cost:** 0 (§9.1).
     *
     * @param options - Pagination and filter options. All optional.
     * @returns Paginated trace listing.
     *
     * @throws {CloudError} `ENS-5002` if disposed. `ENS-5004` if anonymous.
     */
    getTraces(
        options?: TraceListOptions,
    ): Promise<CloudResult<TracePage>>;

    // -------------------------------------------------------------------
    // Analytics (TA3, TA5, TA10)
    // -------------------------------------------------------------------

    /**
     * Query trace analytics from ClickHouse.
     *
     * Proxies to `POST /v1/traces/analytics` (dedicated analytics Worker,
     * TA3). Fixed query types with filters (TA5).
     *
     * **IPU cost:** 5 per invocation (§9.1).
     * **Timeout:** 30s default (OLAP queries).
     *
     * @param query - The analytics query with `queryType` and optional `filters`.
     * @returns Analytics result rows.
     *
     * @throws {CloudError} On quota, retry exhaustion, disposal, or anonymous mode.
     *
     * @see Design Choice TA3 — dedicated analytics Worker.
     * @see Design Choice TA5 — fixed query types.
     */
    analytics(
        query: AnalyticsQuery,
    ): Promise<CloudResult<AnalyticsResult>>;

    /**
     * Query business/product analytics from ClickHouse.
     *
     * Proxies to `POST /v1/analytics/query`. Separate from trace analytics
     * — this powers the Business Intelligence dashboard features (TA10).
     *
     * **IPU cost:** 5 per invocation (§9.1).
     * **Timeout:** 30s default.
     *
     * @param query - The analytics query with `queryType` and optional `filters`.
     * @returns Analytics result rows.
     *
     * @throws {CloudError} On quota, retry exhaustion, disposal, or anonymous mode.
     *
     * @see Design Choice TA10 — Enterstellar Analytics (separate from Trace Analytics).
     */
    businessAnalytics(
        query: AnalyticsQuery,
    ): Promise<CloudResult<AnalyticsResult>>;

    // -------------------------------------------------------------------
    // Billing (CL1)
    // -------------------------------------------------------------------

    /**
     * Query IPU usage for the current billing period.
     *
     * Proxies to `GET /v1/usage`. The returned values are server-authoritative
     * and reconcile the local IPU tracker (CL1 hybrid tracking).
     *
     * **IPU cost:** 0 (§9.1).
     *
     * @returns Current IPU usage, limit, and tier.
     *
     * @throws {CloudError} `ENS-5003` on fetch failure.
     * @throws {CloudError} `ENS-5002` if disposed. `ENS-5004` if anonymous.
     *
     * @see Design Choice CL1 — hybrid metering, server authoritative.
     */
    getUsage(): Promise<CloudResult<CloudUsage>>;

    /**
     * Query the per-operation IPU ledger.
     *
     * Proxies to `GET /v1/usage/ledger`. Returns paginated IPU charges
     * for audit and billing verification. Lookback period is tier-dependent.
     *
     * **IPU cost:** 0 (§9.1).
     *
     * @param options - Pagination options. All optional.
     * @returns Paginated ledger entries.
     *
     * @throws {CloudError} `ENS-5002` if disposed. `ENS-5004` if anonymous.
     *
     * @see Design Choice AM13 — IPU ledger exposure to customers.
     */
    getLedger(
        options?: LedgerListOptions,
    ): Promise<CloudResult<LedgerPage>>;

    // -------------------------------------------------------------------
    // Operations
    // -------------------------------------------------------------------

    /**
     * Initiate "Enterstellar Certified" audit for a published contract.
     *
     * Proxies to `POST /v1/contracts/:id/certify`. Deducts 20 IPU,
     * enqueues the certification job, and returns a `pending` status
     * with a polling URL (GI5). The Certification Runner executes
     * tests on a Fly.io microVM (CR5, max 60s).
     *
     * Poll `GET /v1/contracts/:id` (via `@enterstellar-ai/global-index`) to check
     * `certification_status` for completion (CR10).
     *
     * **IPU cost:** 20 per invocation (§9.1).
     * **Timeout:** 90s default (CR5: max 60s + overhead).
     * **Idempotency:** `X-Idempotency-Key` sent (AM10).
     *
     * @param contractId - The contract ID to certify (e.g., `'comp_01HYX...'`).
     * @returns Pending status with polling URL.
     *
     * @throws {CloudError} On quota, retry exhaustion, disposal, or anonymous mode.
     *
     * @see Design Choice GI5 — certification lifecycle.
     * @see Design Choice CR10 — polling-based notification.
     */
    certify(
        contractId: string,
    ): Promise<CloudResult<CertifyResult>>;

    /**
     * Initiate GDPR right-to-delete for a project's data.
     *
     * Proxies to `DELETE /v1/project/:id/data`. Immediate soft-delete
     * in D1 (`deleted_at = NOW()`), background Worker hard-purges within
     * 72h across D1, R2, Vectorize, and ClickHouse (AG9).
     *
     * Returns `202 Accepted` — fire-and-forget from the SDK's perspective.
     *
     * **IPU cost:** 0 (§9.1).
     *
     * @param projectId - The project ID to delete data for.
     * @returns Acceptance confirmation (`{ accepted: true }`).
     *
     * @throws {CloudError} `ENS-5002` if disposed. `ENS-5004` if anonymous.
     *
     * @see Design Choice AG9 — two-phase delete: soft-delete + background purge.
     * @see Audit Finding F16 — fire-and-forget, no `jobId` (endpoint not in §9.1).
     */
    deleteProjectData(
        projectId: string,
    ): Promise<CloudResult<{ readonly accepted: boolean }>>;

    // -------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------

    /**
     * Release all resources held by this client.
     *
     * After calling `dispose()`, all subsequent method calls throw
     * `CloudError` (`ENS-5002`). Safe to call multiple times (idempotent).
     *
     * Does NOT throw in anonymous mode — always allowed.
     */
    dispose(): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES — Not re-exported from barrel
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// CloudRequestConfig (internal)
// ---------------------------------------------------------------------------

/**
 * Configuration for a single HTTP request to the Cloud API.
 *
 * Used by {@link CloudHttpTransport} and proxy modules to construct
 * outgoing requests. The `ipuCost` field determines whether an
 * `X-Idempotency-Key` header is sent (AM10: only when IPU > 0).
 *
 * @internal — not part of the public API.
 */
export type CloudRequestConfig = {
    /** HTTP method. `DELETE` added for `deleteProjectData()` (AG9). */
    readonly method: 'GET' | 'POST' | 'DELETE';

    /**
     * URL path segment appended to the base URL.
     * Must start with `/`. Example: `'/v1/forge'`.
     */
    readonly path: string;

    /** JSON body to send. Omitted for GET/DELETE requests. */
    readonly body?: unknown;

    /**
     * The IPU cost for this operation (from `IPU_COSTS`).
     *
     * Used by the transport to decide whether to send `X-Idempotency-Key`:
     * - `ipuCost > 0` → send key (AM10).
     * - `ipuCost === 0` → do not send key (F8).
     */
    readonly ipuCost: number;

    /**
     * Per-operation timeout in milliseconds.
     *
     * Overridden by `CloudConfig.timeoutMs` if set globally.
     * Defaults from `OPERATION_TIMEOUTS` map:
     * - `forge`: 30,000ms
     * - `certify`: 90,000ms
     * - `analytics` / `businessAnalytics`: 30,000ms
     * - Others: 10,000ms
     *
     * @see Audit Finding F21 — per-operation timeout defaults.
     */
    readonly operationTimeout?: number | undefined;
};

// ---------------------------------------------------------------------------
// CloudResponse<T> (internal)
// ---------------------------------------------------------------------------

/**
 * Parsed response from the Cloud API transport layer.
 *
 * Encapsulates the HTTP response status, parsed JSON body, IPU headers
 * (§9.3), and any error body (§9.4). Proxy modules use this to construct
 * the public {@link CloudResult} wrapper.
 *
 * **Changes from v0.0.x:**
 * - `degraded` field removed — errors now throw (SD3).
 * - `ipuCost` field added — from `X-IPU-Cost` header (§9.3).
 * - `requestId` field added — from `X-Request-Id` header (AG16).
 * - `error` field added — parsed server error body (§9.4).
 *
 * @typeParam T - The expected JSON body type for successful responses.
 *
 * @internal — not part of the public API.
 */
export type CloudResponse<T> = {
    /** Whether the HTTP response was successful (2xx). */
    readonly ok: boolean;

    /** HTTP status code. `undefined` on network error before response. */
    readonly statusCode: number | undefined;

    /** Parsed JSON body. `null` when `ok` is `false` or body is empty. */
    readonly data: T | null;

    /**
     * Total IPUs consumed this billing period.
     * From `X-IPU-Used` header. `undefined` on 0-IPU or `pk_anon` requests (AG8).
     */
    readonly ipuUsed: number | undefined;

    /**
     * IPUs remaining this billing period.
     * From `X-IPU-Remaining` header. `undefined` on 0-IPU or `pk_anon` requests (AG8).
     */
    readonly ipuRemaining: number | undefined;

    /**
     * IPUs charged for this specific request.
     * From `X-IPU-Cost` header. `undefined` on `pk_anon` requests (AG8).
     * `0` on 0-IPU endpoints.
     */
    readonly ipuCost: number | undefined;

    /**
     * Server request ID for correlation and support tickets.
     * From `X-Request-Id` header. Bare ULID (AG16).
     * `undefined` on network error before response.
     */
    readonly requestId: string | undefined;

    /**
     * Parsed error body from non-2xx responses (§9.4).
     * `null` on successful responses or when the error body cannot be parsed.
     */
    readonly error: CloudErrorBody | null;
};
