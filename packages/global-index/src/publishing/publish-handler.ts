/**
 * @module @enterstellar-ai/global-index/publishing/publish-handler
 * @description Internal HTTP methods for contract publishing and earnings.
 *
 * Provides two operations against the Global Index service:
 * 1. **Publish** — `POST /v1/contracts` (publish a contract for federation)
 * 2. **Publisher Stats** — `GET /v1/publishers/{id}/stats` (publish-to-earn)
 *
 * The publish operation performs local pre-validation via `verifyContract()`
 * before sending the request. This catches obvious schema violations
 * without a network round-trip (fail-fast).
 *
 * Server-side, published contracts enter the verification pipeline:
 * - **Indexed:** schema + tokens + a11y verification via compiler.
 * - **Certified:** additionally headless Playwright + axe-core (async, GI3).
 *
 * @see Bible §4.14 — `publishContract()`, `getPublisherStats()`.
 * @see Design Choice GI3 — two-tier verification (server-side).
 * @internal
 */

import { z } from 'zod';

import type { ComponentContract } from '@enterstellar-ai/types';

import { createRegistrationError, createValidationError } from '../errors.js';
import { execute } from '../transport.js';
import type { TransportConfig } from '../transport.js';
import {
    GlobalSearchResultSchema,
    PublishEarningsSchema,
} from '../types.js';
import type {
    GlobalSearchResult,
    PublishEarnings,
} from '../types.js';
import { verifyContract } from '../discovery/contract-verifier.js';

// ---------------------------------------------------------------------------
// Response Schemas
// ---------------------------------------------------------------------------

/**
 * Zod schema for the `POST /v1/contracts` response.
 * The server wraps the published result in a `result` field.
 *
 * @internal
 */
const PublishResponseSchema = z.object({
    result: GlobalSearchResultSchema,
});

/**
 * Zod schema for the `GET /v1/publishers/{id}/stats` response.
 * The server wraps the earnings in a `stats` field.
 *
 * @internal
 */
const PublisherStatsResponseSchema = z.object({
    stats: PublishEarningsSchema,
});

// ---------------------------------------------------------------------------
// publishContract()
// ---------------------------------------------------------------------------

/**
 * Publishes a `ComponentContract` to the Global Index for federation.
 *
 * Before sending the network request, the contract is validated locally
 * against `ComponentContractSchema` via `verifyContract()`. If the
 * contract is malformed, throws `ENS-5035` immediately without a
 * network call (fail-fast).
 *
 * Server-side, the contract enters the GI3 verification pipeline:
 * - **Indexed tier:** schema + design token + accessibility verification.
 * - **Certified tier:** additionally headless render + axe-core (async).
 *
 * The initial response will typically have `certificationTier: 'indexed'`.
 * Certified status is assigned asynchronously after the full pipeline runs.
 *
 * @param config - Transport configuration (endpoint, apiKey, timeoutMs).
 * @param contract - The `ComponentContract` to publish.
 * @returns The published result with initial certification status.
 * @throws {EnterstellarError} `ENS-5035` if the contract fails local Zod validation.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the server response fails Zod validation.
 *
 * @see Design Choice GI3 — two-tier verification.
 * @internal
 */
export async function publishContract(
    config: TransportConfig,
    contract: ComponentContract,
): Promise<GlobalSearchResult> {
    // -----------------------------------------------------------------------
    // Local pre-validation (fail-fast)
    // -----------------------------------------------------------------------
    const verification = verifyContract(contract);

    if (!verification.valid) {
        const issuesSummary = verification.issues
            .map(i => `  - ${i.path}: ${i.message}`)
            .join('\n');

        throw createValidationError(
            `Contract failed local validation before publish:\n${issuesSummary}`,
        );
    }

    // -----------------------------------------------------------------------
    // HTTP request
    // -----------------------------------------------------------------------
    const response = await execute(config, {
        method: 'POST',
        path: '/v1/contracts',
        body: contract,
    }, PublishResponseSchema);

    // Cast: Zod validates the envelope; contract field is a full ComponentContract at runtime.
    return response.data.result as unknown as GlobalSearchResult;
}

// ---------------------------------------------------------------------------
// getPublisherStats()
// ---------------------------------------------------------------------------

/**
 * Retrieves publisher earnings and usage statistics.
 *
 * Sends a `GET /v1/publishers/{id}/stats` request. Returns render counts,
 * revenue share, free credits, and certification stats for the
 * publish-to-earn incentive program.
 *
 * @param config - Transport configuration.
 * @param publisher - Publisher identifier (e.g., org name or handle).
 * @returns Earnings and usage breakdown for the publisher.
 * @throws {EnterstellarError} `ENS-5034` if `publisher` is empty.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @internal
 */
export async function getPublisherStats(
    config: TransportConfig,
    publisher: string,
): Promise<PublishEarnings> {
    // -----------------------------------------------------------------------
    // Guard: empty publisher ID
    // -----------------------------------------------------------------------
    if (publisher.trim() === '') {
        throw createRegistrationError(
            'Publisher identifier must not be empty.',
        );
    }

    // -----------------------------------------------------------------------
    // HTTP request
    // -----------------------------------------------------------------------
    const response = await execute(config, {
        method: 'GET',
        path: `/v1/publishers/${encodeURIComponent(publisher)}/stats`,
    }, PublisherStatsResponseSchema);

    return response.data.stats;
}
