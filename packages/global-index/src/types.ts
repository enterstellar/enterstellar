/**
 * @module @enterstellar-ai/global-index/types
 * @description Type definitions for the Enterstellar Global Index — federated registry
 * discovery, search, publish-to-earn, and certification.
 *
 * Types follow Enterstellar naming conventions:
 * - Interfaces for objects with methods (`GlobalIndex`)
 * - Types for data shapes (`GlobalSearchResult`, `FederatedRegistry`)
 * - Every field has a doc comment (T5)
 * - All fields `readonly` (defensive immutability)
 *
 * @see Bible §4.14
 * @see Design Choices GI1–GI5
 */

import { z } from 'zod';

import type { ComponentContract } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Certification Tier (GI3)
// ---------------------------------------------------------------------------

/**
 * Verification tier for a contract in the Global Index.
 *
 * - `'indexed'` — Passed schema + tokens + a11y verification via the compiler.
 * - `'certified'` — Additionally passed headless Playwright + axe-core
 *   + design token visual regression tests.
 *
 * @see Design Choice GI3 — two-tier verification.
 */
export type CertificationTier = 'indexed' | 'certified';

// ---------------------------------------------------------------------------
// GlobalIndexConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createGlobalIndex}.
 *
 * @example
 * ```ts
 * import { createGlobalIndex } from '@enterstellar-ai/global-index';
 * import { createEnterstellarCloudClient } from '@enterstellar-ai/cloud';
 *
 * const cloud = createEnterstellarCloudClient({ apiKey: '...', tier: 'pro' });
 * const index = createGlobalIndex({ cloudClient: cloud });
 * ```
 */
export type GlobalIndexConfig = {
    /**
     * API key for authenticating with the Global Index service.
     *
     * Sent as `Authorization: Bearer {apiKey}` header on every request.
     * Obtain from the Enterstellar Cloud dashboard under the Global Index section.
     *
     * @see Design Choice CL4 — bearer token auth.
     */
    readonly apiKey: string;

    /**
     * Base URL of the Global Index service.
     * Defaults to `'https://index.enterstellar.dev'`.
     */
    readonly endpoint?: string | undefined;

    /**
     * Enterstellar Cloud client instance. Used as a structural dependency
     * to verify the caller has an active cloud subscription.
     *
     * @see Bible §4.14 — `cloudClient` is required.
     */
    readonly cloudClient: CloudClientLike;

    /**
     * Request timeout in milliseconds.
     * Defaults to `10_000` (10 seconds).
     */
    readonly timeoutMs?: number | undefined;
};

/**
 * Minimal interface extracted from `EnterstellarCloudClient` to avoid importing
 * the full cloud module at the type level. The factory validates that
 * the provided object satisfies this shape.
 *
 * This enables `@enterstellar-ai/global-index` to accept any object that exposes
 * the cloud client's HTTP transport, without tightly coupling to the
 * `@enterstellar-ai/cloud` implementation.
 */
export type CloudClientLike = {
    /** Retrieves current IPU usage — used to verify the client is functional. */
    readonly getUsage: () => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// FederatedRegistry (GI1)
// ---------------------------------------------------------------------------

/**
 * A federated registry registered with the Global Index.
 *
 * Created via {@link GlobalIndex.registerRegistry} and returned by
 * {@link GlobalIndex.listRegistries}.
 *
 * @see Design Choice GI1 — self-registration via `POST /v1/registries`.
 */
export type FederatedRegistry = {
    /** Unique identifier assigned by the Global Index on registration. */
    readonly id: string;

    /** Display name of the registry (e.g., `'ACME Clinical'`). */
    readonly name: string;

    /** URL of the remote registry API (e.g., `'https://registry.acme.health'`). */
    readonly url: string;

    /** Publisher or organization that owns this registry. */
    readonly publisher: string;

    /** Number of contracts currently indexed from this registry. */
    readonly contractCount: number;

    /** ISO 8601 timestamp of the last successful index refresh. */
    readonly lastRefreshedAt: string;

    /** Whether the registry is currently reachable and actively indexed. */
    readonly active: boolean;
};

/**
 * Zod schema for validating `FederatedRegistry` API responses.
 *
 * @see Design Choice T7 — export Zod schemas alongside TS types.
 */
export const FederatedRegistrySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    url: z.url(),
    publisher: z.string().min(1),
    contractCount: z.number().int().min(0),
    lastRefreshedAt: z.string().min(1),
    active: z.boolean(),
});

// ---------------------------------------------------------------------------
// RegistryRegistration (GI1 — input type)
// ---------------------------------------------------------------------------

/**
 * Input payload for registering a new federated registry with the Global Index.
 *
 * @see Design Choice GI1 — self-registration via `POST /v1/registries`.
 */
export type RegistryRegistration = {
    /** Display name for the registry. */
    readonly name: string;

    /** URL of the remote registry API. Must be HTTPS. */
    readonly url: string;

    /** Publisher or organization name (for attribution and earnings). */
    readonly publisher: string;
};

/**
 * Zod schema for validating `RegistryRegistration` input.
 */
export const RegistryRegistrationSchema = z.object({
    name: z.string().min(1, 'Registry name is required.'),
    url: z.url('Registry URL must be a valid URL.'),
    publisher: z.string().min(1, 'Publisher name is required.'),
});

// ---------------------------------------------------------------------------
// GlobalSearchOptions
// ---------------------------------------------------------------------------

/**
 * Options for {@link GlobalIndex.search}.
 *
 * All fields are optional — sensible defaults are applied server-side.
 */
export type GlobalSearchOptions = {
    /**
     * Maximum number of results to return.
     * Clamped to `[1, 50]` server-side. Defaults to `10`.
     */
    readonly topK?: number | undefined;

    /** Filters to narrow search results. */
    readonly filters?: GlobalSearchFilters | undefined;
};

/**
 * Filter criteria for narrowing Global Index search results.
 *
 * Multiple filters are combined with AND semantics.
 */
export type GlobalSearchFilters = {
    /** Filter by component category (e.g., `'clinical'`, `'admin'`). */
    readonly category?: string | undefined;

    /** Filter by publisher name or organization. */
    readonly publisher?: string | undefined;

    /** Filter by certification status. `true` = Enterstellar Certified only. */
    readonly certified?: boolean | undefined;
};

// ---------------------------------------------------------------------------
// GlobalSearchResult (Bible §4.14)
// ---------------------------------------------------------------------------

/**
 * A single search result from the Global Index.
 *
 * Contains the full `ComponentContract` plus federation metadata
 * (origin registry, publisher, usage stats, certification status).
 *
 * @see Bible §4.14 — `GlobalSearchResult` type.
 */
export type GlobalSearchResult = {
    /** The full `ComponentContract` data (headless — no render function per R16). */
    readonly contract: ComponentContract;

    /** URL of the registry that published this contract. */
    readonly registryUrl: string;

    /** Publisher or organization that owns this contract. */
    readonly publisher: string;

    /** Community star count (social proof metric). */
    readonly stars: number;

    /** Total number of times this contract has been rendered via Enterstellar Cloud. */
    readonly usageCount: number;

    /** Whether this contract has passed all verification gates (GI3). */
    readonly certified: boolean;

    /**
     * Certification tier — `'indexed'` or `'certified'`.
     * Only meaningful when `certified` is `true`.
     *
     * @see Design Choice GI3 — two-tier verification.
     */
    readonly certificationTier: CertificationTier;

    /** Semantic similarity score (0.0–1.0). Only present for search results. */
    readonly score?: number | undefined;

    /**
     * URL to a PNG screenshot of the rendered component.
     * Only available for `'certified'` contracts (GI4).
     *
     * @see Design Choice GI4 — PNG screenshots for Enterstellar Certified components.
     */
    readonly screenshotUrl?: string | undefined;
};

/**
 * Zod schema for validating `GlobalSearchResult` API responses.
 * Uses `.passthrough()` on the contract field to preserve unknown props
 * from future API versions without validation failure.
 */
export const GlobalSearchResultSchema = z.object({
    contract: z.record(z.string(), z.unknown()),
    registryUrl: z.string().min(1),
    publisher: z.string().min(1),
    stars: z.number().int().min(0),
    usageCount: z.number().int().min(0),
    certified: z.boolean(),
    certificationTier: z.enum(['indexed', 'certified']),
    score: z.number().min(0).max(1).optional(),
    screenshotUrl: z.url().optional(),
});

// ---------------------------------------------------------------------------
// ContractVerification
// ---------------------------------------------------------------------------

/**
 * Result of a local contract verification check.
 *
 * Returned by the internal `verifyContract()` utility, which validates
 * a `ComponentContract` against the Zod schema before publishing.
 */
export type ContractVerification = {
    /** Whether the contract passed all checks. */
    readonly valid: boolean;

    /** Verification issues, if any. Empty when `valid` is `true`. */
    readonly issues: readonly ContractVerificationIssue[];
};

/**
 * A single verification issue found during contract validation.
 */
export type ContractVerificationIssue = {
    /** Dot-path to the problematic field (e.g., `'accessibility.role'`). */
    readonly path: string;

    /** Human-readable description of the issue. */
    readonly message: string;
};

// ---------------------------------------------------------------------------
// PublishEarnings (publish-to-earn)
// ---------------------------------------------------------------------------

/**
 * Publisher earnings and usage statistics from the Global Index.
 *
 * Tracks render counts, revenue share, and certification status
 * for the publish-to-earn incentive program.
 */
export type PublishEarnings = {
    /** Publisher or organization identifier. */
    readonly publisher: string;

    /** Total number of contracts published by this publisher. */
    readonly totalContracts: number;

    /** Total render count across all published contracts. */
    readonly totalRenders: number;

    /** Estimated revenue share earned (in USD cents). */
    readonly revenueShareCents: number;

    /** Number of free IPU credits earned through publishing. */
    readonly freeCreditsEarned: number;

    /** Number of contracts that achieved Enterstellar Certified status. */
    readonly certifiedCount: number;
};

/**
 * Zod schema for validating `PublishEarnings` API responses.
 */
export const PublishEarningsSchema = z.object({
    publisher: z.string().min(1),
    totalContracts: z.number().int().min(0),
    totalRenders: z.number().int().min(0),
    revenueShareCents: z.number().int().min(0),
    freeCreditsEarned: z.number().int().min(0),
    certifiedCount: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// GlobalIndex Interface (Bible §4.14 + GI1/GI2 extensions)
// ---------------------------------------------------------------------------

/**
 * The Global Index client — federated registry discovery, search, and
 * publish-to-earn tracking.
 *
 * Created via {@link createGlobalIndex}. Communicates with the Global Index
 * service at `index.enterstellar.dev` (or a custom endpoint) for centralized search
 * across all federated registries.
 *
 * Core operations:
 * - **Search** — full-text + semantic search across all indexed contracts (GI5).
 * - **Discover** — browse, register, and refresh federated registries (GI1, GI2).
 * - **Publish** — publish contracts and track publish-to-earn metrics.
 *
 * All methods are async and return graceful errors (never hard-fail).
 *
 * @see Bible §4.14
 * @see Design Choices GI1–GI5
 */
export interface GlobalIndex {
    /**
     * Search for contracts across all federated registries.
     *
     * Uses the centralized search index (GI5) for consistent ranking
     * and sub-100ms latency. Results include full `ComponentContract`
     * data plus federation metadata (origin, publisher, usage, certification).
     *
     * @param query - Natural language search query (intent string).
     * @param options - Optional search configuration (topK, filters).
     * @returns Matching contracts sorted by relevance. Empty array if no matches.
     *
     * @see Design Choice GI5 — centralized search index.
     */
    search(
        query: string,
        options?: GlobalSearchOptions,
    ): Promise<readonly GlobalSearchResult[]>;

    /**
     * Get a specific contract by name and originating registry URL.
     *
     * @param name - PascalCase component name (e.g., `'PatientVitals'`).
     * @param registryUrl - URL of the registry that published the contract.
     * @returns The contract with federation metadata, or `null` if not found.
     */
    getContract(
        name: string,
        registryUrl: string,
    ): Promise<GlobalSearchResult | null>;

    /**
     * Get trending and featured contracts from the Global Index.
     *
     * Featured contracts are curated based on usage count, star count,
     * and certification status. Useful for discovery and marketplace browsing.
     *
     * @returns Top featured contracts sorted by relevance.
     */
    featured(): Promise<readonly GlobalSearchResult[]>;

    /**
     * Register a new federated registry for indexing.
     *
     * The Global Index will crawl the registry at the provided URL,
     * index all published contracts, and make them searchable.
     *
     * @param registration - Registry metadata (name, URL, publisher).
     * @returns The registered `FederatedRegistry` with assigned ID.
     *
     * @see Design Choice GI1 — self-registration via `POST /v1/registries`.
     */
    registerRegistry(
        registration: RegistryRegistration,
    ): Promise<FederatedRegistry>;

    /**
     * List all federated registries known to the Global Index.
     *
     * @returns All registered registries with status and contract counts.
     *
     * @see Design Choice GI1 — `GET /v1/registries`.
     */
    listRegistries(): Promise<readonly FederatedRegistry[]>;

    /**
     * Trigger re-indexing of a specific federated registry.
     *
     * The registry owner calls this endpoint when contracts are published
     * or updated. No scheduled crawler — refresh is on-demand only.
     *
     * @param registryId - The unique ID of the registry to refresh.
     * @returns The updated `FederatedRegistry` with new contract count.
     *
     * @see Design Choice GI2 — on-demand refresh, no scheduled crawler.
     */
    refreshRegistry(registryId: string): Promise<FederatedRegistry>;

    /**
     * Publish a contract to the Global Index for federation and discovery.
     *
     * The contract is validated locally (Zod schema) before submission.
     * Server-side, it enters the verification pipeline:
     * - **Indexed:** schema + tokens + a11y verification.
     * - **Certified:** additionally headless render + axe-core (async, GI3).
     *
     * @param contract - The `ComponentContract` to publish.
     * @returns The published result with initial certification status.
     */
    publishContract(
        contract: ComponentContract,
    ): Promise<GlobalSearchResult>;

    /**
     * Get publisher earnings and usage statistics.
     *
     * Tracks render counts, revenue share, free credits, and certification
     * stats for the publish-to-earn incentive program.
     *
     * @param publisher - Publisher identifier (e.g., org name or handle).
     * @returns Earnings and usage breakdown for the publisher.
     */
    getPublisherStats(publisher: string): Promise<PublishEarnings>;

    /**
     * Release all resources held by this client.
     *
     * After calling `dispose()`, all subsequent method calls will throw
     * `EnterstellarError` with code `ENS-5031`. Safe to call multiple times
     * (idempotent).
     */
    dispose(): void;
}
