/**
 * @module @enterstellar-ai/agent-sdk/errors
 * @description Agent SDK error factory functions for `ENS-8xxx` codes.
 *
 * Each factory creates a well-typed `EnterstellarError` with:
 * - Machine-readable `code` (e.g., `'ENS-8001'`)
 * - Module identifier `'agent-sdk'`
 * - `recoverable` flag indicating whether the agent can retry
 *
 * Agent SDK errors follow a clear split:
 * - **Developer errors** (`ENS-8001`: missing config) → non-recoverable, fatal.
 * - **Agent errors** (`ENS-8002`–`ENS-8005`: bad query, missing component) → recoverable.
 *
 * Error messages are intentionally verbose — AI agents read them to self-correct.
 *
 * @see Coding Rules — Error Taxonomy (ENS-8xxx range)
 * @see Design Choice AS4 — factory validates config on creation.
 */

import { EnterstellarError } from '@enterstellar-ai/types';


// ---------------------------------------------------------------------------
// ENS-8001: SDK Not Initialized
// ---------------------------------------------------------------------------

/**
 * Creates an error when the SDK factory receives invalid configuration (`ENS-8001`).
 *
 * This is a **developer error** — thrown during `createAgentSDK()` when
 * required dependencies (registry, compiler, semanticIndex) are missing.
 * Non-recoverable at runtime.
 *
 * @param missingDep - The name of the missing required dependency.
 * @returns An `EnterstellarError` with code `'ENS-8001'`, module `'agent-sdk'`, recoverable `false`.
 *
 * @see Design Choice AS4 — factory validates config before returning SDK.
 */
export function sdkNotInitializedError(
    missingDep: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-8001',
        'agent-sdk',
        `Agent SDK initialization failed: required dependency '${missingDep}' is missing. ` +
        `Provide it via createAgentSDK({ ${missingDep}: ... }).`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-8002: Search Failed
// ---------------------------------------------------------------------------

/**
 * Creates an error when `enterstellar_search_components` fails (`ENS-8002`).
 *
 * Wraps underlying semantic index errors (embedding failures, vector store
 * errors) into a consistent SDK error. Recoverable — the agent can retry
 * with a different query or reduced `topK`.
 *
 * @param query - The search query that failed.
 * @param cause - The underlying error from the semantic index.
 * @returns An `EnterstellarError` with code `'ENS-8002'`, module `'agent-sdk'`, recoverable `true`.
 *
 * @see Bible §4.16 — `enterstellar_search_components` tool.
 */
export function searchFailedError(
    query: string,
    cause: unknown,
): EnterstellarError {
    const reason = cause instanceof Error
        ? cause.message
        : String(cause);

    return new EnterstellarError(
        'ENS-8002',
        'agent-sdk',
        `Component search failed for query '${query}': ${reason}. ` +
        `Try a simpler query or reduce topK.`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-8003: Compose Failed
// ---------------------------------------------------------------------------

/**
 * Creates an error when `enterstellar_compose_ui` fails validation (`ENS-8003`).
 *
 * Emitted when a zone spec references an unknown component or has an
 * invalid determinism value. Recoverable — the agent can fix the zone
 * specification and retry.
 *
 * @param reason - Human-readable reason for the compose failure.
 * @returns An `EnterstellarError` with code `'ENS-8003'`, module `'agent-sdk'`, recoverable `true`.
 *
 * @see Design Choice AS3 — UISpec validation rules.
 * @see Bible §4.16 — `enterstellar_compose_ui` tool.
 */
export function composeFailedError(
    reason: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-8003',
        'agent-sdk',
        `UI composition failed: ${reason}. ` +
        `Verify that all component names exist in the registry and determinism is 0.0–1.0.`,
        true,
    );
}

// ---------------------------------------------------------------------------
// ENS-8004: Component Schema Not Found
// ---------------------------------------------------------------------------

/**
 * Creates an error when `enterstellar_get_component_schema` cannot find the component (`ENS-8004`).
 *
 * Emitted when the requested component name does not exist in the registry.
 * Recoverable — the agent can use `enterstellar_search_components` to discover
 * valid component names.
 *
 * @param componentName - The PascalCase component name that was not found.
 * @returns An `EnterstellarError` with code `'ENS-8004'`, module `'agent-sdk'`, recoverable `true`.
 *
 * @see Bible §4.16 — `enterstellar_get_component_schema` tool.
 */
export function componentSchemaNotFoundError(
    componentName: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-8004',
        'agent-sdk',
        `Component '${componentName}' not found in registry. ` +
        `Use enterstellar_search_components to discover available components.`,
        true,
    );
}

// ---------------------------------------------------------------------------
// ENS-8005: Trace Analysis Invalid
// ---------------------------------------------------------------------------

/**
 * Creates an error when `enterstellar_analyze_traces` receives invalid parameters (`ENS-8005`).
 *
 * Emitted when the `groupBy` value is not a valid dimension or when the
 * store dependency is not configured. Recoverable — the agent can fix
 * the query parameters.
 *
 * @param reason - Human-readable reason for the analysis failure.
 * @returns An `EnterstellarError` with code `'ENS-8005'`, module `'agent-sdk'`, recoverable `true`.
 *
 * @see Design Choice AS5 — queries `EnterstellarStore` for local traces.
 * @see Bible §4.16 — `enterstellar_analyze_traces` tool.
 */
export function traceAnalysisInvalidError(
    reason: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-8005',
        'agent-sdk',
        `Trace analysis failed: ${reason}. ` +
        `Valid groupBy values: 'component', 'zone', 'status', 'strategy'.`,
        true,
    );
}
