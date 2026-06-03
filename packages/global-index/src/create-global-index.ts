/**
 * @module @enterstellar-ai/global-index/create-global-index
 * @description Factory function for creating a `GlobalIndex` client instance.
 *
 * `createGlobalIndex(config)` is the sole public entry point for this package.
 * It validates configuration, creates an internal HTTP transport, wires all
 * internal modules (discovery, publishing, badge service), and returns a
 * frozen `GlobalIndex` object.
 *
 * **Lifecycle:**
 * 1. Call `createGlobalIndex(config)` at startup.
 * 2. Use the returned `GlobalIndex` for search, discovery, and publishing.
 * 3. Call `dispose()` on shutdown to release resources.
 *
 * **Error Policy:**
 * - Configuration errors (missing `apiKey`, missing `cloudClient`) → `ENS-5030` thrown at creation.
 * - Post-dispose calls → `ENS-5031` thrown immediately.
 * - Operational errors (network, server, validation) → recoverable `EnterstellarError`, never hard-stop.
 *
 * @see Bible §4.14
 * @see Design Choices GI1–GI5
 */

import type { ComponentContract } from '@enterstellar-ai/types';

import { createConfigError, createDisposedError } from './errors.js';
import {
    listRegistries,
    refreshRegistry,
    registerRegistry,
} from './discovery/registry-crawler.js';
import {
    getContract,
    getFeatured,
    searchContracts,
} from './discovery/search-index.js';
import {
    getPublisherStats,
    publishContract,
} from './publishing/publish-handler.js';
import type { TransportConfig } from './transport.js';
import type {
    FederatedRegistry,
    GlobalIndex,
    GlobalIndexConfig,
    GlobalSearchOptions,
    GlobalSearchResult,
    PublishEarnings,
    RegistryRegistration,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default base URL for the Global Index service. */
const DEFAULT_ENDPOINT = 'https://index.enterstellar.dev';

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------

/**
 * Validates the `GlobalIndexConfig` and extracts resolved values with defaults.
 *
 * @param config - The raw config from the consumer.
 * @returns Resolved transport config with all defaults applied.
 * @throws {EnterstellarError} `ENS-5030` if required fields are missing or invalid.
 *
 * @internal
 */
function resolveConfig(config: GlobalIndexConfig): TransportConfig {
    // -----------------------------------------------------------------------
    // apiKey — required, non-empty
    // -----------------------------------------------------------------------
    if (typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
        throw createConfigError(
            'apiKey is required and must be a non-empty string.',
        );
    }

    // -----------------------------------------------------------------------
    // cloudClient — required, must have getUsage method
    // Runtime guard: TypeScript types guarantee this at compile time, but
    // consumers may bypass types via `as unknown as`, so we validate.
    // -----------------------------------------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!config.cloudClient) {
        throw createConfigError(
            'cloudClient is required. Pass an EnterstellarCloudClient instance.',
        );
    }

    if (typeof config.cloudClient.getUsage !== 'function') {
        throw createConfigError(
            'cloudClient must have a getUsage() method. Pass a valid EnterstellarCloudClient instance.',
        );
    }

    // -----------------------------------------------------------------------
    // endpoint — optional, default to https://index.enterstellar.dev
    // -----------------------------------------------------------------------
    const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;

    // -----------------------------------------------------------------------
    // timeoutMs — optional, must be positive if provided
    // -----------------------------------------------------------------------
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (timeoutMs <= 0) {
        throw createConfigError(
            `timeoutMs must be a positive number. Received: ${String(timeoutMs)}.`,
        );
    }

    return Object.freeze({
        endpoint,
        apiKey: config.apiKey,
        timeoutMs,
    });
}

// ---------------------------------------------------------------------------
// createGlobalIndex()
// ---------------------------------------------------------------------------

/**
 * Creates a new `GlobalIndex` client instance.
 *
 * This is the **sole public entry point** for the `@enterstellar-ai/global-index` package.
 * It validates configuration, creates the internal HTTP transport, and wires
 * all internal modules into the `GlobalIndex` interface.
 *
 * @param config - Client configuration with API key, cloud client, and options.
 * @returns A frozen `GlobalIndex` instance.
 * @throws {EnterstellarError} `ENS-5030` if config is invalid (missing apiKey, cloudClient, etc.).
 *
 * @example
 * ```ts
 * import { createGlobalIndex } from '@enterstellar-ai/global-index';
 * import { createEnterstellarCloudClient } from '@enterstellar-ai/cloud';
 *
 * const cloud = createEnterstellarCloudClient({ apiKey: 'cloud-key', tier: 'pro' });
 * const index = createGlobalIndex({
 *     apiKey: 'index-key',
 *     cloudClient: cloud,
 * });
 *
 * // Search across all federated registries
 * const results = await index.search('patient vitals');
 *
 * // Publish a contract
 * const published = await index.publishContract(myContract);
 *
 * // Cleanup on shutdown
 * index.dispose();
 * ```
 *
 * @see Bible §4.14
 * @see Design Choices GI1–GI5
 */
export function createGlobalIndex(config: GlobalIndexConfig): GlobalIndex {
    // -----------------------------------------------------------------------
    // Validate config and resolve defaults
    // -----------------------------------------------------------------------
    const transportConfig = resolveConfig(config);

    // -----------------------------------------------------------------------
    // Dispose state
    // -----------------------------------------------------------------------
    let disposed = false;

    /**
     * Guard function that throws `ENS-5031` if the client has been disposed.
     * Called at the top of every public method.
     *
     * @throws {EnterstellarError} `ENS-5031` if disposed.
     */
    function ensureNotDisposed(): void {
        if (disposed) {
            throw createDisposedError();
        }
    }

    // -----------------------------------------------------------------------
    // Build the GlobalIndex interface
    // -----------------------------------------------------------------------
    const globalIndex: GlobalIndex = {
        // -------------------------------------------------------------------
        // Search (GI5)
        // -------------------------------------------------------------------

        async search(
            query: string,
            options?: GlobalSearchOptions,
        ): Promise<readonly GlobalSearchResult[]> {
            ensureNotDisposed();
            return searchContracts(transportConfig, query, options);
        },

        // -------------------------------------------------------------------
        // Get Contract
        // -------------------------------------------------------------------

        async getContract(
            name: string,
            registryUrl: string,
        ): Promise<GlobalSearchResult | null> {
            ensureNotDisposed();
            return getContract(transportConfig, name, registryUrl);
        },

        // -------------------------------------------------------------------
        // Featured
        // -------------------------------------------------------------------

        async featured(): Promise<readonly GlobalSearchResult[]> {
            ensureNotDisposed();
            return getFeatured(transportConfig);
        },

        // -------------------------------------------------------------------
        // Register Registry (GI1)
        // -------------------------------------------------------------------

        async registerRegistry(
            registration: RegistryRegistration,
        ): Promise<FederatedRegistry> {
            ensureNotDisposed();
            return registerRegistry(transportConfig, registration);
        },

        // -------------------------------------------------------------------
        // List Registries (GI1)
        // -------------------------------------------------------------------

        async listRegistries(): Promise<readonly FederatedRegistry[]> {
            ensureNotDisposed();
            return listRegistries(transportConfig);
        },

        // -------------------------------------------------------------------
        // Refresh Registry (GI2)
        // -------------------------------------------------------------------

        async refreshRegistry(registryId: string): Promise<FederatedRegistry> {
            ensureNotDisposed();
            return refreshRegistry(transportConfig, registryId);
        },

        // -------------------------------------------------------------------
        // Publish Contract
        // -------------------------------------------------------------------

        async publishContract(
            contract: ComponentContract,
        ): Promise<GlobalSearchResult> {
            ensureNotDisposed();
            return publishContract(transportConfig, contract);
        },

        // -------------------------------------------------------------------
        // Publisher Stats (publish-to-earn)
        // -------------------------------------------------------------------

        async getPublisherStats(publisher: string): Promise<PublishEarnings> {
            ensureNotDisposed();
            return getPublisherStats(transportConfig, publisher);
        },

        // -------------------------------------------------------------------
        // Dispose
        // -------------------------------------------------------------------

        dispose(): void {
            // Idempotent — safe to call multiple times
            disposed = true;
        },
    };

    // Freeze the returned object for defensive immutability
    return Object.freeze(globalIndex);
}
