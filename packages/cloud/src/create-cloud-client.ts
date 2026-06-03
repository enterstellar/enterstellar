/**
 * @module @enterstellar-ai/cloud/create-cloud-client
 * @description Factory function for creating the Enterstellar Cloud SDK client.
 *
 * This is the top-level entry point of `@enterstellar-ai/cloud`. It validates the
 * configuration, initializes all internal modules — HTTP transport, SSE
 * transport, IPU tracker, and 8 proxy modules — and returns a fully
 * wired {@link EnterstellarCloudClient} instance.
 *
 * **13 methods + `forge.stream()` + `dispose()`** wired from:
 *
 * | Method                | Proxy Module                   |
 * |:----------------------|:-------------------------------|
 * | `forge` / `.stream()` | `CloudForgeProxy`              |
 * | `search`              | `CloudIndexProxy`              |
 * | `route`               | `CloudRouterProxy`             |
 * | `routeBatch`          | `CloudRouterProxy`             |
 * | `submitSignal`        | `SignalSubmitter`              |
 * | `submitTrace`         | `TraceSubmitter`               |
 * | `getTraces`           | `TracesQueryProxy`             |
 * | `analytics`           | `CloudAnalyticsProxy`          |
 * | `businessAnalytics`   | `CloudAnalyticsProxy`          |
 * | `getUsage`            | (inline — direct transport)    |
 * | `getLedger`           | `LedgerQueryProxy`             |
 * | `certify`             | `CertifyProxy`                 |
 * | `deleteProjectData`   | `DataDeletionProxy`            |
 *
 * **Anonymous mode (SD1):**
 * When the API key starts with `pk_anon_`, only `submitSignal()` and
 * `dispose()` are available. All other methods throw `ENS-5004`.
 *
 * **Error policy:**
 * - Config validation errors → throw `CloudError` (`ENS-5001`) at creation.
 * - Post-dispose calls → throw `CloudError` (`ENS-5002`).
 * - Anonymous mode violations → throw `CloudError` (`ENS-5004`).
 * - Operational errors → delegated to proxy modules / transport (SD3, SD5).
 *
 * @see Bible §9.2 — SDK ↔ Cloud endpoint mapping.
 * @see Design Choice SD1 — auto-detect `pk_anon_` → anonymous mode.
 * @see Design Choice SD6 — dual forge API: `forge()` + `forge.stream()`.
 * @see Design Choice SD7 — every method returns `CloudResult<T>`.
 * @see Design Choice SD8 — default `baseUrl` = `https://api.enterstellar.dev`.
 * @see Design Choice TA2 — `traceConsent` defaults to `false`.
 * @see Design Choice D111 — `sessionType` defaults to `'app'`.
 * @see Design Choices CL1–CL5 — metering, billing, degradation.
 * @see Principle L15 — zero framework imports.
 */

import type {
    EnterstellarCloudClient,
    CloudConfig,
    CloudIPU,
    CloudResult,
    CloudUsage,
    ForgeFragment,
    ForgeOptions,
    SessionType,
} from './types.js';

import { createCloudHttpTransport } from './transport/cloud-http.js';
import { createCloudSSETransport } from './transport/cloud-sse.js';
import { createIPUTracker } from './metering/ipu-tracker.js';
import { IPU_COSTS } from './metering/ipu-costs.js';
import { createCloudForgeProxy } from './inference/cloud-forge-proxy.js';
import { createCloudIndexProxy } from './inference/cloud-index-proxy.js';
import { createCloudRouterProxy } from './routing/cloud-router-proxy.js';
import { createCloudAnalyticsProxy } from './analytics/cloud-analytics-proxy.js';
import { createTraceSubmitter } from './traces/trace-submitter.js';
import { createSignalSubmitter } from './signals/signal-submitter.js';
import { createTracesQueryProxy } from './operations/traces-query-proxy.js';
import { createCertifyProxy } from './operations/certify-proxy.js';
import { createLedgerQueryProxy } from './operations/ledger-query-proxy.js';
import { createDataDeletionProxy } from './operations/data-deletion-proxy.js';
import {
    createAnonymousModeError,
    createConfigError,
    createDisposedError,
} from './errors.js';

import type { ComponentContract } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default Enterstellar Cloud API base URL.
 *
 * @see Design Choice SD8 — default with override via `CloudConfig.baseUrl`.
 */
const DEFAULT_BASE_URL = 'https://api.enterstellar.dev';

/**
 * API key prefix for anonymous mode detection.
 *
 * @see Design Choice SD1 — auto-detect `pk_anon_` prefix.
 */
const ANONYMOUS_KEY_PREFIX = 'pk_anon_';

/**
 * Default session type when not specified in config.
 *
 * @see Design Choice D111 — `session_type TEXT DEFAULT 'app'`.
 */
const DEFAULT_SESSION_TYPE: SessionType = 'app';

// ---------------------------------------------------------------------------
// Server Response Shape for GET /v1/usage
// ---------------------------------------------------------------------------

/**
 * Expected JSON response shape from `GET /v1/usage`.
 *
 * @internal — used only for typing the transport response.
 */
type UsageResponse = {
    readonly used: number;
    readonly limit: number;
    readonly tier: string;
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a `CloudIPU` object from transport response headers.
 *
 * For 0-IPU endpoints (like usage query), the server may still
 * include `X-IPU-*` headers. Returns `null` in anonymous mode (AG8).
 *
 * @param ipuUsed - `X-IPU-Used` header value.
 * @param ipuRemaining - `X-IPU-Remaining` header value.
 * @param ipuCost - `X-IPU-Cost` header value.
 * @param isAnonymous - Whether the client is in anonymous mode.
 * @returns A `CloudIPU` object, or `null`.
 */
function buildIPU(
    ipuUsed: number | undefined,
    ipuRemaining: number | undefined,
    ipuCost: number | undefined,
    isAnonymous: boolean,
): CloudIPU | null {
    if (isAnonymous) {
        return null;
    }

    if (ipuUsed !== undefined && ipuRemaining !== undefined && ipuCost !== undefined) {
        return { used: ipuUsed, remaining: ipuRemaining, cost: ipuCost };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an {@link EnterstellarCloudClient} — the primary public API of `@enterstellar-ai/cloud`.
 *
 * Validates the configuration, initializes the HTTP and SSE transports
 * with bearer token auth (CL4), creates an IPU tracker for hybrid metering
 * (CL1), wires all 8 proxy modules, and returns the client interface.
 *
 * **Anonymous mode (SD1):** If `config.apiKey` starts with `pk_anon_`,
 * only `submitSignal()` and `dispose()` are available. All other method
 * calls throw `CloudError` (`ENS-5004`).
 *
 * @param config - Client configuration. See {@link CloudConfig} for details.
 * @returns A fully wired `EnterstellarCloudClient` instance.
 *
 * @throws {CloudError} `ENS-5001` if `apiKey` is empty or missing.
 *
 * @example
 * ```ts
 * import { createEnterstellarCloudClient, CloudError } from '@enterstellar-ai/cloud';
 *
 * // Full mode:
 * const client = createEnterstellarCloudClient({
 *     apiKey: process.env['ENTERSTELLAR_API_KEY']!,
 *     traceConsent: true,
 *     sessionType: 'app',
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
 *
 * // Anonymous mode:
 * const anonClient = createEnterstellarCloudClient({ apiKey: 'pk_anon_abc123' });
 * await anonClient.submitSignal(signal); // ✓ Works
 * await anonClient.forge({ intent: 'x' }); // ✗ Throws ENS-5004
 * ```
 *
 * @see Bible §9.2 — SDK ↔ Cloud endpoint mapping.
 * @see Design Choice SD1 — anonymous mode auto-detection.
 * @see Design Choice SD6 — dual forge API.
 * @see Design Choice SD7 — universal `CloudResult<T>` return wrapper.
 * @see Design Choices CL1–CL5 — metering and billing.
 */
export function createEnterstellarCloudClient(config: CloudConfig): EnterstellarCloudClient {
    // -----------------------------------------------------------------------
    // Configuration Validation
    // -----------------------------------------------------------------------

    if (!config.apiKey || config.apiKey.trim().length === 0) {
        throw createConfigError('apiKey');
    }

    // -----------------------------------------------------------------------
    // Resolve Defaults
    // -----------------------------------------------------------------------

    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const sessionType = config.sessionType ?? DEFAULT_SESSION_TYPE;
    const traceConsent = config.traceConsent ?? false;
    const isAnonymous = config.apiKey.startsWith(ANONYMOUS_KEY_PREFIX);

    // -----------------------------------------------------------------------
    // Wire Transport Layer
    // -----------------------------------------------------------------------

    const transport = createCloudHttpTransport({
        endpoint: baseUrl,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
    });

    const sseTransport = createCloudSSETransport({
        endpoint: baseUrl,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
    });

    // -----------------------------------------------------------------------
    // Wire IPU Tracker (CL1)
    // -----------------------------------------------------------------------

    const tracker = createIPUTracker();

    // -----------------------------------------------------------------------
    // Wire Proxy Modules (one per domain)
    // -----------------------------------------------------------------------

    const forgeProxy = createCloudForgeProxy(
        transport, sseTransport, tracker, isAnonymous, sessionType,
    );

    const indexProxy = createCloudIndexProxy(transport, tracker, isAnonymous);
    const routerProxy = createCloudRouterProxy(transport, tracker, isAnonymous);
    const analyticsProxy = createCloudAnalyticsProxy(transport, tracker, isAnonymous);

    const traceSubmitter = createTraceSubmitter(
        transport, tracker, isAnonymous, traceConsent, sessionType,
    );

    const signalSubmitter = createSignalSubmitter(
        transport, tracker, isAnonymous, sessionType,
    );

    const tracesQueryProxy = createTracesQueryProxy(transport, tracker, isAnonymous);
    const certifyProxy = createCertifyProxy(transport, tracker, isAnonymous);
    const ledgerQueryProxy = createLedgerQueryProxy(transport, tracker, isAnonymous);
    const dataDeletionProxy = createDataDeletionProxy(transport, tracker, isAnonymous);

    // -----------------------------------------------------------------------
    // Disposal State
    // -----------------------------------------------------------------------

    /** Whether `dispose()` has been called. */
    let disposed = false;

    /**
     * Guards against method calls after `dispose()`.
     *
     * @throws {CloudError} `ENS-5002` if the client has been disposed.
     */
    function assertNotDisposed(): void {
        if (disposed) {
            throw createDisposedError();
        }
    }

    /**
     * Guards against non-signal method calls in anonymous mode (SD1).
     *
     * @param method - The method name that was called (for error message).
     * @throws {CloudError} `ENS-5004` if in anonymous mode.
     */
    function assertNotAnonymous(method: string): void {
        if (isAnonymous) {
            throw createAnonymousModeError(method);
        }
    }

    // -----------------------------------------------------------------------
    // EnterstellarCloudClient Implementation
    // -----------------------------------------------------------------------

    // --- forge: callable + .stream() (SD6) ---
    // `Object.assign` creates a function that is also an object with a
    // `.stream` property. TypeScript sees this as `ForgeFunction & { stream }`.
    const forge = Object.assign(
        async (options: ForgeOptions): Promise<CloudResult<ComponentContract>> => {
            assertNotDisposed();
            assertNotAnonymous('forge');
            return forgeProxy.forge(options);
        },
        {
            stream(options: ForgeOptions): AsyncGenerator<ForgeFragment, void, undefined> {
                assertNotDisposed();
                assertNotAnonymous('forge.stream');
                return forgeProxy.stream(options);
            },
        },
    );

    return {
        // -------------------------------------------------------------------
        // Generation (SD6)
        // -------------------------------------------------------------------
        forge,

        // -------------------------------------------------------------------
        // Search
        // -------------------------------------------------------------------
        async search(query, topK) {
            assertNotDisposed();
            assertNotAnonymous('search');
            return indexProxy.search(query, topK);
        },

        // -------------------------------------------------------------------
        // Routing (IR2, IR5)
        // -------------------------------------------------------------------
        async route(intentHash) {
            assertNotDisposed();
            assertNotAnonymous('route');
            return routerProxy.route(intentHash);
        },

        async routeBatch(intentHashes) {
            assertNotDisposed();
            assertNotAnonymous('routeBatch');
            return routerProxy.routeBatch(intentHashes);
        },

        // -------------------------------------------------------------------
        // Signals (SD1, SD4) — works in anonymous mode
        // -------------------------------------------------------------------
        async submitSignal(signal) {
            assertNotDisposed();
            // No assertNotAnonymous — signals work in anonymous mode.
            return signalSubmitter.submitSignal(signal);
        },

        // -------------------------------------------------------------------
        // Traces (TA2)
        // -------------------------------------------------------------------
        async submitTrace(trace) {
            assertNotDisposed();
            assertNotAnonymous('submitTrace');
            return traceSubmitter.submitTrace(trace);
        },

        async getTraces(options) {
            assertNotDisposed();
            assertNotAnonymous('getTraces');
            return tracesQueryProxy.getTraces(options);
        },

        // -------------------------------------------------------------------
        // Analytics (TA3, TA5, TA10)
        // -------------------------------------------------------------------
        async analytics(query) {
            assertNotDisposed();
            assertNotAnonymous('analytics');
            return analyticsProxy.analytics(query);
        },

        async businessAnalytics(query) {
            assertNotDisposed();
            assertNotAnonymous('businessAnalytics');
            return analyticsProxy.businessAnalytics(query);
        },

        // -------------------------------------------------------------------
        // Billing (CL1) — inline, no separate proxy
        // -------------------------------------------------------------------
        async getUsage() {
            assertNotDisposed();
            assertNotAnonymous('getUsage');

            // ---------------------------------------------------------------
            // Execute GET /v1/usage.
            // ipuCost: 0 → no X-Idempotency-Key (F8).
            // Transport handles retry (SD5), throws on failure (SD3).
            // ---------------------------------------------------------------
            const response = await transport.request<UsageResponse>({
                method: 'GET',
                path: '/v1/usage',
                ipuCost: IPU_COSTS.USAGE_QUERY,
            });

            // ---------------------------------------------------------------
            // Reconcile IPU tracker from response headers (CL1).
            // ---------------------------------------------------------------
            if (response.ipuUsed !== undefined && response.ipuRemaining !== undefined) {
                tracker.reconcile(response.ipuUsed, response.ipuRemaining, response.ipuCost);
            }

            // ---------------------------------------------------------------
            // Build CloudResult<CloudUsage> (SD7).
            // ---------------------------------------------------------------
            const ipu = buildIPU(
                response.ipuUsed,
                response.ipuRemaining,
                response.ipuCost,
                isAnonymous,
            );

            // Defensive fallback — transport guarantees 2xx at this point,
            // but guard against null data for safety.
            const data: CloudUsage = response.data !== null
                ? {
                    used: response.data.used,
                    limit: response.data.limit,
                    tier: response.data.tier,
                }
                : { used: 0, limit: 0, tier: 'unknown' };

            return { data, ipu };
        },

        async getLedger(options) {
            assertNotDisposed();
            assertNotAnonymous('getLedger');
            return ledgerQueryProxy.getLedger(options);
        },

        // -------------------------------------------------------------------
        // Operations
        // -------------------------------------------------------------------
        async certify(contractId) {
            assertNotDisposed();
            assertNotAnonymous('certify');
            return certifyProxy.certify(contractId);
        },

        async deleteProjectData(projectId) {
            assertNotDisposed();
            assertNotAnonymous('deleteProjectData');
            return dataDeletionProxy.deleteProjectData(projectId);
        },

        // -------------------------------------------------------------------
        // Lifecycle
        // -------------------------------------------------------------------
        dispose(): void {
            // Idempotent — safe to call multiple times.
            // Never throws — always allowed, even in anonymous mode.
            disposed = true;
        },
    };
}
