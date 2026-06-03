/**
 * @module @enterstellar-ai/cloud
 * @description Enterstellar Cloud SDK client — forge generation, semantic search,
 * intent routing, trace analytics, IPU metering, and contract certification.
 *
 * **Quick Start:**
 * ```ts
 * import { createEnterstellarCloudClient, CloudError } from '@enterstellar-ai/cloud';
 *
 * const client = createEnterstellarCloudClient({
 *     apiKey: process.env['ENTERSTELLAR_API_KEY']!,
 * });
 *
 * try {
 *     const { data: contract, ipu } = await client.forge({ intent: 'patient vitals' });
 *     console.log(`Generated: ${contract.name}, IPU remaining: ${ipu?.remaining}`);
 * } catch (error) {
 *     if (error instanceof CloudError && error.upgradeUrl) {
 *         showUpgradePrompt(error.upgradeUrl);
 *     }
 * } finally {
 *     client.dispose();
 * }
 * ```
 *
 * **Anonymous mode (SD1):**
 * ```ts
 * const anonClient = createEnterstellarCloudClient({ apiKey: 'pk_anon_abc123' });
 * await anonClient.submitSignal(signal); // ✓ Only method available
 * ```
 *
 * @see Bible §9.1–§9.4 — API surface, response headers, error format.
 * @see Design Choices SD1–SD10 — SDK locked decisions.
 * @see Design Choices CL1–CL5 — metering and billing.
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Public API — Factory
// ---------------------------------------------------------------------------

export { createEnterstellarCloudClient } from './create-cloud-client.js';

// ---------------------------------------------------------------------------
// Public API — Error Class & Types
// ---------------------------------------------------------------------------

export { CloudError } from './errors.js';
export type { CloudErrorBody } from './errors.js';

// ---------------------------------------------------------------------------
// Public API — Version
// ---------------------------------------------------------------------------

export { CLOUD_SDK_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Public API — IPU Cost Constants
// ---------------------------------------------------------------------------

export { IPU_COSTS } from './metering/ipu-costs.js';
export type { IPUCostValue } from './metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// Public API — Types
// ---------------------------------------------------------------------------

export type {
    // Client interface
    EnterstellarCloudClient,

    // Configuration
    CloudConfig,
    SessionType,

    // Universal return wrapper (SD7)
    CloudResult,
    CloudIPU,

    // Usage / billing
    CloudUsage,

    // Forge (SD6)
    ForgeOptions,
    ForgeFunction,
    ForgeFragment,
    ForgeMetaFragment,
    ForgeNodeFragment,
    ForgePropertyFragment,
    ForgeCompleteFragment,
    ForgeErrorFragment,

    // Routing (IR2)
    RouterPrediction,

    // Analytics (TA5)
    AnalyticsQuery,
    AnalyticsResult,

    // Traces
    TraceListOptions,
    TracePage,

    // Ledger
    LedgerListOptions,
    LedgerPage,

    // Certification (GI5)
    CertifyResult,
} from './types.js';
