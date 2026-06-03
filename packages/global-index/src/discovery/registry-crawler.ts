/**
 * @module @enterstellar-ai/global-index/discovery/registry-crawler
 * @description Internal HTTP methods for federated registry discovery.
 *
 * Provides three operations against the Global Index service:
 * 1. **Register** — `POST /v1/registries` (GI1)
 * 2. **List** — `GET /v1/registries` (GI1)
 * 3. **Refresh** — `POST /v1/registries/{id}/refresh` (GI2)
 *
 * All HTTP calls delegate to the shared transport layer for consistent
 * auth, timeout, error wrapping, and Zod validation.
 *
 * Input validation (Zod `safeParse`) is performed locally before any
 * network call to fail fast on obviously malformed requests.
 *
 * @see Design Choice GI1 — self-registration.
 * @see Design Choice GI2 — on-demand refresh, no scheduled crawler.
 * @internal
 */

import { z } from 'zod';

import { createRegistrationError } from '../errors.js';
import { execute } from '../transport.js';
import type { TransportConfig } from '../transport.js';
import {
    FederatedRegistrySchema,
    RegistryRegistrationSchema,
} from '../types.js';
import type {
    FederatedRegistry,
    RegistryRegistration,
} from '../types.js';

// ---------------------------------------------------------------------------
// Response Schemas (arrays)
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating the `GET /v1/registries` response.
 * The server returns an object with a `registries` array field.
 *
 * @internal
 */
const ListRegistriesResponseSchema = z.object({
    registries: z.array(FederatedRegistrySchema),
});

/**
 * Zod schema for validating single-registry responses
 * (register + refresh). The server wraps the result in a `registry` field.
 *
 * @internal
 */
const SingleRegistryResponseSchema = z.object({
    registry: FederatedRegistrySchema,
});

// ---------------------------------------------------------------------------
// registerRegistry()
// ---------------------------------------------------------------------------

/**
 * Registers a new federated registry with the Global Index service.
 *
 * Validates the input locally against `RegistryRegistrationSchema` before
 * sending the request. If the input is malformed, throws `ENS-5034`
 * immediately without a network call (fail-fast).
 *
 * @param config - Transport configuration (endpoint, apiKey, timeoutMs).
 * @param registration - Registry metadata (name, URL, publisher).
 * @returns The registered `FederatedRegistry` with server-assigned ID.
 * @throws {EnterstellarError} `ENS-5034` if input validation fails.
 * @throws {EnterstellarError} `ENS-5034` if the server rejects the registration.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @see Design Choice GI1 — `POST /v1/registries`.
 * @internal
 */
export async function registerRegistry(
    config: TransportConfig,
    registration: RegistryRegistration,
): Promise<FederatedRegistry> {
    // -----------------------------------------------------------------------
    // Local input validation (fail-fast)
    // -----------------------------------------------------------------------
    const inputResult = RegistryRegistrationSchema.safeParse(registration);

    if (!inputResult.success) {
        throw createRegistrationError(
            `Invalid registration input: ${inputResult.error.message}`,
            inputResult.error,
        );
    }

    // -----------------------------------------------------------------------
    // HTTP request
    // -----------------------------------------------------------------------
    const response = await execute(config, {
        method: 'POST',
        path: '/v1/registries',
        body: inputResult.data,
    }, SingleRegistryResponseSchema);

    return response.data.registry;
}

// ---------------------------------------------------------------------------
// listRegistries()
// ---------------------------------------------------------------------------

/**
 * Lists all federated registries known to the Global Index service.
 *
 * Returns every registered registry with its current status, contract
 * count, and last refresh timestamp.
 *
 * @param config - Transport configuration.
 * @returns All known federated registries. Empty array if none registered.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @see Design Choice GI1 — `GET /v1/registries`.
 * @internal
 */
export async function listRegistries(
    config: TransportConfig,
): Promise<readonly FederatedRegistry[]> {
    const response = await execute(config, {
        method: 'GET',
        path: '/v1/registries',
    }, ListRegistriesResponseSchema);

    return response.data.registries;
}

// ---------------------------------------------------------------------------
// refreshRegistry()
// ---------------------------------------------------------------------------

/**
 * Triggers a re-index of a specific federated registry.
 *
 * The registry owner calls this endpoint when contracts are published
 * or updated. The Global Index service will crawl the registry and
 * update the centralized search index.
 *
 * **Per GI2, there is no scheduled crawler.** Refresh is strictly
 * on-demand — the registry owner triggers re-indexing when needed.
 *
 * @param config - Transport configuration.
 * @param registryId - The unique ID of the registry to refresh.
 * @returns The updated `FederatedRegistry` with new contract count.
 * @throws {EnterstellarError} `ENS-5034` if `registryId` is empty.
 * @throws {EnterstellarError} `ENS-5032` on network/HTTP errors.
 * @throws {EnterstellarError} `ENS-5035` if the response fails Zod validation.
 *
 * @see Design Choice GI2 — on-demand refresh, no scheduled crawler.
 * @internal
 */
export async function refreshRegistry(
    config: TransportConfig,
    registryId: string,
): Promise<FederatedRegistry> {
    // -----------------------------------------------------------------------
    // Guard: empty registry ID
    // -----------------------------------------------------------------------
    if (registryId.trim() === '') {
        throw createRegistrationError(
            'Registry ID must not be empty.',
        );
    }

    // -----------------------------------------------------------------------
    // HTTP request
    // -----------------------------------------------------------------------
    const response = await execute(config, {
        method: 'POST',
        path: `/v1/registries/${encodeURIComponent(registryId)}/refresh`,
    }, SingleRegistryResponseSchema);

    return response.data.registry;
}
