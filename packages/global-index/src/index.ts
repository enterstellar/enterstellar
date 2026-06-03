/**
 * @module @enterstellar-ai/global-index
 * @description Federated registry discovery and search — the npm for ComponentContracts.
 *
 * This is the public API surface of `@enterstellar-ai/global-index`.
 * Internal modules (transport, errors, crawlers, search-index, publish-handler)
 * are NOT exported — they are implementation details.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createGlobalIndex } from '@enterstellar-ai/global-index';
 * import { createEnterstellarCloudClient } from '@enterstellar-ai/cloud';
 *
 * const cloud = createEnterstellarCloudClient({ apiKey: 'cloud-key', tier: 'pro' });
 * const index = createGlobalIndex({ apiKey: 'index-key', cloudClient: cloud });
 *
 * const results = await index.search('patient vitals');
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export { createGlobalIndex } from './create-global-index.js';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type {
    CertificationTier,
    CloudClientLike,
    ContractVerification,
    ContractVerificationIssue,
    FederatedRegistry,
    GlobalIndex,
    GlobalIndexConfig,
    GlobalSearchFilters,
    GlobalSearchOptions,
    GlobalSearchResult,
    PublishEarnings,
    RegistryRegistration,
} from './types.js';

// ---------------------------------------------------------------------------
// Contract Verification Utilities
// ---------------------------------------------------------------------------

export {
    isValidContract,
    verifyContract,
} from './discovery/contract-verifier.js';

// ---------------------------------------------------------------------------
// Badge / Certification Utilities
// ---------------------------------------------------------------------------

export {
    getCertificationTier,
    getRelevanceScore,
    getScreenshotUrl,
    hasScreenshot,
    isCertified,
    isIndexed,
} from './publishing/badge-service.js';
