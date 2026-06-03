/**
 * @module @enterstellar-ai/cloud/metering/ipu-costs
 * @description Weighted IPU (Intent Processing Unit) cost constants.
 *
 * Each Enterstellar Cloud API operation has a fixed IPU cost. These constants
 * are the single source of truth for cost calculations across all
 * proxy modules. They are also exported from the barrel for consumer
 * use (e.g., pre-flight cost estimation in application code).
 *
 * **13 operations** defined per Bible §9.1 (corrected):
 *
 * | Operation            | Constant                  | IPU |
 * |:---------------------|:--------------------------|:---:|
 * | Cloud Forge          | `FORGE`                   | 10  |
 * | Semantic Search      | `SEMANTIC_SEARCH`         |  1  |
 * | Intent Route         | `ROUTE`                   |  1  |
 * | Batch Route (per)    | `ROUTE_BATCH_PER_INTENT`  |  1  |
 * | Submit Signal        | `SIGNAL_SUBMIT`           |  0  |
 * | Submit Trace         | `TRACE_SUBMIT`            |  0  |
 * | Trace Analytics      | `TRACE_ANALYTICS`         |  5  |
 * | Business Analytics   | `BUSINESS_ANALYTICS`      |  5  |
 * | Certify              | `CERTIFY`                 | 20  |
 * | Usage Query          | `USAGE_QUERY`             |  0  |
 * | Ledger Query         | `LEDGER_QUERY`            |  0  |
 * | Get Traces           | `GET_TRACES`              |  0  |
 * | Delete Project Data  | `DELETE_PROJECT_DATA`     |  0  |
 *
 * **Scope (F9):** This table covers SDK-triggered operations only.
 * Server-internal operations (`cold_path`, `hitl_review`, `global_index_publish`,
 * etc.) are defined in the Cloud monorepo's `shared/ipu.ts`.
 *
 * @see Design Choice CL2 — weighted IPU costs.
 * @see Bible §9.1 — API endpoint table with IPU costs.
 * @see Audit Finding F9 — SDK-triggered operations only.
 */

// ---------------------------------------------------------------------------
// IPU Cost Constants
// ---------------------------------------------------------------------------

/**
 * Weighted IPU costs per cloud API operation.
 *
 * These values are locked per Design Choice CL2 and Bible §9.1.
 * Do not modify without an explicit amendment to the design choices
 * document and the Implementation Bible.
 *
 * @example
 * ```ts
 * import { IPU_COSTS } from '@enterstellar-ai/cloud';
 *
 * // Pre-flight cost estimation:
 * const batchCost = intentHashes.length * IPU_COSTS.ROUTE_BATCH_PER_INTENT;
 * console.log(`Batch route will cost ${batchCost} IPU`);
 * ```
 */
export const IPU_COSTS = Object.freeze({
    /**
     * CloudForge generation — LLM-based component contract generation.
     * Premium feature, highest per-operation cost.
     *
     * @see Design Choice CL2 — "CloudForge generation = 10 IPU"
     * @see Bible §9.1 — `POST /v1/forge`
     */
    FORGE: 10,

    /**
     * Cloud semantic search — vector similarity lookup via Vectorize.
     * Lightweight operation, lowest per-operation cost.
     *
     * @see Design Choice CL2 — "cloud semantic search = 1 IPU"
     * @see Bible §9.1 — `POST /v1/semantic-search`
     */
    SEMANTIC_SEARCH: 1,

    /**
     * Intent routing — frequency-based (Phase 2) or ML-based (Phase 3)
     * component prediction for a single intent hash.
     *
     * @see Design Choice IR2 — router prediction response shape.
     * @see Bible §9.1 — `POST /v1/route`
     */
    ROUTE: 1,

    /**
     * Batch intent routing — per-intent cost within a batch request.
     * A batch of N intents costs `N × 1 IPU`.
     *
     * @see Design Choice IR5 — batch routing for pre-rendering.
     * @see Bible §9.1 — `POST /v1/route/batch`
     */
    ROUTE_BATCH_PER_INTENT: 1,

    /**
     * ForgeSignal submission — telemetry data ingestion.
     * Free — signal data is Enterstellar's #1 strategic asset (§9.1:
     * "never charge for data collection").
     *
     * @see Design Choice SD4 — transparent `pk_anon` auth for signals.
     * @see Bible §9.1 — `POST /v1/signals`
     */
    SIGNAL_SUBMIT: 0,

    /**
     * AgentTrace submission — trace data ingestion for aggregation.
     * Free — trace data is the feedstock for analytics features.
     *
     * **CORRECTED:** Was 5 IPU in the OSS Bible (§4.13). Changed to 0
     * in the Cloud Bible §9.1: "never charge for data collection."
     *
     * @see Bible §9.1 — `POST /v1/traces` (0 IPU)
     */
    TRACE_SUBMIT: 0,

    /**
     * Trace analytics query — server-side OLAP aggregation via ClickHouse.
     * Moderate cost reflecting the compute intensity.
     *
     * @see Design Choice TA5 — fixed analytics query types.
     * @see Bible §9.1 — `POST /v1/traces/analytics`
     */
    TRACE_ANALYTICS: 5,

    /**
     * Business analytics query — product intelligence via ClickHouse.
     * Same cost profile as trace analytics.
     *
     * @see Design Choice TA10 — Enterstellar Analytics (business intelligence).
     * @see Bible §9.1 — `POST /v1/analytics/*`
     */
    BUSINESS_ANALYTICS: 5,

    /**
     * Contract certification — "Enterstellar Certified" audit initiation.
     * Highest cost — involves Fly.io microVM test execution (CR5).
     *
     * @see Design Choice GI5 — certification lifecycle.
     * @see Design Choice CR6 — certification costs 20 IPU.
     * @see Bible §9.1 — `POST /v1/contracts/:id/certify`
     */
    CERTIFY: 20,

    /**
     * Usage query — returns current IPU consumption and tier.
     * Free — necessary for clients to monitor their own usage.
     *
     * @see Bible §9.1 — `GET /v1/usage`
     */
    USAGE_QUERY: 0,

    /**
     * IPU ledger query — per-operation charge audit trail.
     * Free — billing transparency.
     *
     * @see Design Choice AM13 — IPU ledger exposure.
     * @see Bible §9.1 — `GET /v1/usage/ledger`
     */
    LEDGER_QUERY: 0,

    /**
     * Trace listing query — paginated trace retrieval.
     * Free — reading your own data is never charged.
     *
     * @see Bible §9.1 — `GET /v1/traces`
     */
    GET_TRACES: 0,

    /**
     * GDPR data deletion — initiate project data purge.
     * Free — compliance operations are never charged.
     *
     * @see Design Choice AG9 — two-phase delete.
     * @see Design Choice D110 — GDPR soft-delete.
     * @see Bible §9.1 — `DELETE /v1/project/:id/data`
     */
    DELETE_PROJECT_DATA: 0,
} as const);

// ---------------------------------------------------------------------------
// IPU Cost Type
// ---------------------------------------------------------------------------

/**
 * Union type of all valid IPU cost values.
 *
 * Derived from the `IPU_COSTS` constant object. Useful for
 * type-constraining function parameters that accept IPU costs.
 *
 * Currently: `0 | 1 | 5 | 10 | 20`.
 */
export type IPUCostValue = (typeof IPU_COSTS)[keyof typeof IPU_COSTS];
