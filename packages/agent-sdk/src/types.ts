/**
 * @module @enterstellar-ai/agent-sdk/types
 * @description SDK-local type definitions for the Agent SDK.
 *
 * Types defined here are internal to `@enterstellar-ai/agent-sdk`. They define the
 * configuration, MCP tool interfaces, data shapes for tool I/O, and the
 * public `EnterstellarAgentSDK` interface returned by `createAgentSDK()`.
 *
 * **Naming convention (T1):** Interfaces for objects with methods
 * (`EnterstellarAgentSDK`), types for data shapes (`UISpec`, `ZoneSpec`).
 *
 * **Prefix convention (T2):** Public API types prefixed with `Enterstellar`.
 * Internal data shapes have no prefix.
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript types only.
 *
 * @see Bible §4.16 — `@enterstellar-ai/agent-sdk` MCP tools specification.
 * @see Design Choices AS1–AS6.
 */

import type { CompilationResult, SemanticSearchResult, ForgeResult } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// MCP Tool I/O — Zone Specification (AS3)
// ---------------------------------------------------------------------------

/**
 * A single zone assignment in a `UISpec`.
 *
 * Represents an agent's instruction to render a specific component in a
 * named zone with given props and determinism level. Referenced by name,
 * not by index — per Design Choice AS3.
 *
 * @see Design Choice AS3 — flat list of zone assignments with `determinism` per zone.
 * @see Bible §4.16 — `enterstellar_compose_ui` input format.
 */
export type ZoneSpec = {
    /** Zone name (kebab-case, e.g., `'main-dashboard'`, `'sidebar'`). */
    readonly name: string;

    /** PascalCase component name from the registry (e.g., `'PatientVitals'`). */
    readonly component: string;

    /**
     * Props to pass to the component.
     * Validated against the component's Zod schema during compilation.
     */
    readonly props: Readonly<Record<string, unknown>>;

    /**
     * Determinism level for this zone (0.0–1.0).
     *
     * - `0.0` = fully locked (compliance mode, cached output only).
     * - `1.0` = fully generative (creative, LLM-driven).
     *
     * Allows the agent to signal "this zone is strictly controlled" vs
     * "this zone is creative." Critical for blending clinical UI with
     * generative chat in the same layout.
     *
     * @see Bible §4.16 — determinism per zone in `UISpec`.
     */
    readonly determinism: number;
};

// ---------------------------------------------------------------------------
// MCP Tool I/O — UI Specification (AS3)
// ---------------------------------------------------------------------------

/**
 * Complete UI specification output by `enterstellar_compose_ui`.
 *
 * A flat list of zone assignments — NOT a tree. Each zone is independently
 * assigned a component, props, and determinism level.
 *
 * @see Design Choice AS3 — flat list, reference by name, not index.
 * @see Bible §4.16 — output of `enterstellar_compose_ui`.
 */
export type UISpec = {
    /** Ordered list of zone assignments. */
    readonly zones: readonly ZoneSpec[];
};

// ---------------------------------------------------------------------------
// MCP Tool I/O — Trace Analysis (AS5)
// ---------------------------------------------------------------------------

/**
 * A single group entry in a `TraceAnalysis` result.
 *
 * Represents aggregated metrics for a group of traces sharing a common
 * characteristic (e.g., same component, same zone, same resolution strategy).
 */
export type TraceAnalysisGroup = {
    /** The grouping key value (e.g., `'PatientVitals'`, `'main-dashboard'`). */
    readonly key: string;

    /** Number of traces in this group. */
    readonly count: number;

    /** Average total pipeline latency in milliseconds. */
    readonly avgLatencyMs: number;

    /**
     * Success rate as a fraction (0.0–1.0).
     * Computed as `passCount / totalCount`.
     */
    readonly successRate: number;
};

/**
 * Output of the `enterstellar_analyze_traces` MCP tool.
 *
 * Provides aggregated trace analytics grouped by a specified dimension.
 * Queries `EnterstellarStore.traces` for local session data (AS5).
 *
 * @see Design Choice AS5 — local traces from `EnterstellarStore`.
 * @see Bible §4.16 — `enterstellar_analyze_traces` output.
 */
export type TraceAnalysis = {
    /** The time range filter that was applied (ISO 8601 range or keyword). */
    readonly timeRange: string;

    /** The dimension used for grouping (`'component'`, `'zone'`, `'status'`, `'strategy'`). */
    readonly groupBy: string;

    /** Total number of traces matched by the time range filter. */
    readonly totalTraces: number;

    /** Aggregated groups sorted by `count` descending. */
    readonly groups: readonly TraceAnalysisGroup[];
};

// ---------------------------------------------------------------------------
// MCP Tool I/O — Composite Build UI (AS2)
// ---------------------------------------------------------------------------

/**
 * Output of the composite `enterstellar_build_ui` tool.
 *
 * Combines the outputs of search → compose → validate into a single
 * response, saving 2 round-trips for the 90% use case.
 *
 * @see Design Choice AS2 — composite convenience tool.
 * @see Bible §4.16.
 */
export type BuildUIResult = {
    /** Semantic search results for the query. */
    readonly searchResults: readonly SemanticSearchResult[];

    /** Composed UI specification from the matched components. */
    readonly spec: UISpec;

    /** Compiler validation result for the composed spec. */
    readonly validation: CompilationResult;
};

// ---------------------------------------------------------------------------
// Component Schema Output
// ---------------------------------------------------------------------------

/**
 * Output of the `enterstellar_get_component_schema` tool.
 *
 * Contains the JSON Schema representation of a component's props,
 * extracted from its Zod schema via Zod v4's native `.json()` method.
 *
 * @see Design Choice R8 — Zod v4 `.json()` for JSON Schema generation.
 * @see Bible §4.16 — `enterstellar_get_component_schema` output.
 */
export type ComponentSchemaResult = {
    /** PascalCase component name. */
    readonly componentName: string;

    /** JSON Schema representation of the component's props schema. */
    readonly schema: Readonly<Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// MCP Tool Definition
// ---------------------------------------------------------------------------

/**
 * Describes a single MCP tool exposed by the Agent SDK.
 *
 * Used by `createMCPServer()` to register tools with precise input/output
 * schemas. Each tool definition is self-documenting — agents can introspect
 * the available tools and their expected I/O formats.
 *
 * @see Design Choice AS1 — embedded MCP server.
 * @see Design Choice AS2 — 6 atomic + 1 composite tool.
 */
export type MCPToolDefinition = {
    /** Tool name (e.g., `'enterstellar_search_components'`). */
    readonly name: string;

    /** Human-readable description of what the tool does. */
    readonly description: string;

    /** JSON Schema for the tool's input parameters. */
    readonly inputSchema: Readonly<Record<string, unknown>>;

    /**
     * The tool's handler function.
     * Accepts a validated input object and returns the tool's output.
     *
     * @param input - Validated input matching `inputSchema`.
     * @returns The tool's output (shape varies per tool).
     */
    readonly handler: (input: Readonly<Record<string, unknown>>) => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// SDK Configuration (AS4)
// ---------------------------------------------------------------------------

/**
 * Configuration for `createAgentSDK()`.
 *
 * Requires the core Enterstellar modules (registry, compiler, semantic index).
 * Forge and store are optional — tools that depend on them degrade
 * gracefully with descriptive errors.
 *
 * @see Design Choice AS4 — factory function, plain object with closures.
 * @see Bible §4.16 — internal dependencies.
 */
export type AgentSDKConfig = {
    /**
     * The component registry to search and validate against.
     * Required — all tools depend on registry for component lookup.
     */
    readonly registry: AgentSDKRegistry;

    /**
     * The Enterstellar compiler for spec validation.
     * Required — L3 mandates compiler validation for all UI output.
     */
    readonly compiler: AgentSDKCompiler;

    /**
     * The semantic index for intent-based component search.
     * Required — powers `enterstellar_search_components` and `enterstellar_build_ui`.
     */
    readonly semanticIndex: AgentSDKSemanticIndex;

    /**
     * The component forge for runtime component generation.
     * Optional — `enterstellar_forge_component` returns an error if not provided.
     */
    readonly forge?: AgentSDKForge;

    /**
     * The Enterstellar store for trace analysis.
     * Optional — `enterstellar_analyze_traces` returns an error if not provided.
     */
    readonly store?: AgentSDKStore;
};

// ---------------------------------------------------------------------------
// Structural Dependency Interfaces (L15)
// ---------------------------------------------------------------------------
// The SDK uses structural typing (duck typing) to avoid importing
// framework-specific module interfaces directly. This keeps the
// dependency graph clean and allows testing with lightweight mocks.
// ---------------------------------------------------------------------------

/**
 * Structural interface for registry operations needed by the SDK.
 *
 * Matches the subset of `EnterstellarRegistry` from `@enterstellar-ai/registry` that the
 * SDK actually uses. Uses structural typing for testability.
 */
export interface AgentSDKRegistry {
    /** Retrieves a component contract by name. Returns `undefined` if not found. */
    get(name: string): AgentSDKComponentContract | undefined;

    /** Lists all registered component names. */
    list(): readonly AgentSDKComponentContract[];
}

/**
 * Minimal component contract shape needed by the SDK.
 *
 * Matches the subset of `ComponentContract` from `@enterstellar-ai/types` that
 * SDK tools actually inspect. Avoids coupling to the full contract type.
 */
export type AgentSDKComponentContract = {
    /** PascalCase component name. */
    readonly name: string;

    /** Zod schema for the component's props. */
    readonly props: Readonly<Record<string, unknown>>;

    /** Component category. */
    readonly category: string;

    /** Semantic tags for search. */
    readonly tags: readonly string[];

    /** Component description. */
    readonly description: string;
};

/**
 * Structural interface for compiler operations needed by the SDK.
 *
 * Matches the subset of `EnterstellarCompiler` from `@enterstellar-ai/compiler`.
 */
export interface AgentSDKCompiler {
    /** Compiles a component intent through the validation pipeline. */
    compile(
        intent: Readonly<Record<string, unknown>>,
        options?: Readonly<Record<string, unknown>>,
    ): Promise<CompilationResult>;

    /** Validates without producing a full result. */
    lint(intent: Readonly<Record<string, unknown>>): Promise<readonly unknown[]>;
}

/**
 * Structural interface for semantic index operations needed by the SDK.
 *
 * Matches the subset of `SemanticIndex` from `@enterstellar-ai/semantic-index`.
 */
export interface AgentSDKSemanticIndex {
    /** Searches for components matching a natural-language intent. */
    search(
        intent: string,
        options?: { readonly topK?: number },
    ): Promise<readonly SemanticSearchResult[]>;
}

/**
 * Structural interface for forge operations needed by the SDK.
 *
 * Matches the subset of `ComponentForge` from `@enterstellar-ai/forge`.
 */
export interface AgentSDKForge {
    /** Generates a runtime component contract for an unmatched intent. */
    forge(intent: Readonly<Record<string, unknown>>): Promise<ForgeResult>;
}

/**
 * Structural interface for store operations needed by the SDK.
 *
 * Matches the subset of `EnterstellarStore` from `@enterstellar-ai/state` used by
 * `enterstellar_analyze_traces` (AS5).
 */
export interface AgentSDKStore {
    /** Retrieves a value from the store by key path. */
    get(key: string): unknown;
}

// ---------------------------------------------------------------------------
// Public SDK Interface (AS4)
// ---------------------------------------------------------------------------

/**
 * The public interface returned by `createAgentSDK()`.
 *
 * Provides typed methods for all 6 atomic MCP tools plus the composite
 * `buildUI` convenience method. Also exposes `tools` — the MCP tool
 * definitions array for server registration.
 *
 * @example
 * ```ts
 * import { createAgentSDK } from '@enterstellar-ai/agent-sdk';
 *
 * const sdk = createAgentSDK({ registry, compiler, semanticIndex });
 *
 * // Atomic tool usage
 * const results = await sdk.search('show patient vitals');
 * const spec = await sdk.compose([{ name: 'main', component: 'PatientVitals', props: {}, determinism: 0.5 }]);
 * const validation = await sdk.validate(spec);
 *
 * // Composite tool — search → compose → validate in one call
 * const build = await sdk.buildUI('show patient vitals', [{ name: 'main', component: '', props: {}, determinism: 0.5 }]);
 * ```
 *
 * @see Design Choice AS4 — factory pattern, plain object.
 * @see Design Choice AS2 — 6 atomic + 1 composite tool.
 * @see Bible §4.16 — canonical tool definitions.
 */
export interface EnterstellarAgentSDK {
    /**
     * Searches for components matching a natural-language query.
     *
     * Delegates to `SemanticIndex.search()`. Returns top-K results
     * sorted by descending similarity score.
     *
     * @param query - Natural-language intent string.
     * @param topK - Maximum results (1–20, default 5). See SI5.
     * @returns Matching components with similarity scores.
     *
     * @throws {EnterstellarError} `ENS-8002` if the search fails.
     */
    search(query: string, topK?: number): Promise<readonly SemanticSearchResult[]>;

    /**
     * Composes a UI specification from zone assignments.
     *
     * Validates that each zone's component exists in the registry and
     * that determinism values are within the valid 0.0–1.0 range.
     *
     * @param zones - Array of zone specifications.
     * @param layout - Optional layout hint (e.g., `'grid'`, `'stack'`).
     * @returns A validated `UISpec`.
     *
     * @throws {EnterstellarError} `ENS-8003` if any zone references an unknown component.
     */
    compose(zones: readonly ZoneSpec[], layout?: string): Promise<UISpec>;

    /**
     * Validates a UI specification through the Enterstellar compiler.
     *
     * Runs each zone in the spec through the compiler pipeline (L3).
     * Returns the compilation result for the first zone (v1 — single
     * component compilation per C20).
     *
     * @param spec - The UI specification to validate.
     * @returns Compiler validation result.
     */
    validate(spec: UISpec): Promise<CompilationResult>;

    /**
     * Analyzes agent traces from the local session.
     *
     * Queries `EnterstellarStore.traces` (AS5) and groups by the specified
     * dimension. Returns aggregated metrics per group.
     *
     * @param timeRange - Time range filter (ISO 8601 range or keyword like `'last-hour'`).
     * @param groupBy - Grouping dimension: `'component'`, `'zone'`, `'status'`, or `'strategy'`.
     * @returns Aggregated trace analysis.
     *
     * @throws {EnterstellarError} `ENS-8005` if store is not configured or groupBy is invalid.
     */
    analyzeTraces(timeRange: string, groupBy: string): Promise<TraceAnalysis>;

    /**
     * Forges a runtime component for an unmatched intent.
     *
     * Delegates to `ComponentForge.forge()`. The forged contract passes
     * through the compiler (L3, L13) before being returned.
     *
     * @param intent - Natural-language intent string.
     * @param constraints - Optional constraints for the forge.
     * @returns Forge result with generated contract (if successful).
     *
     * @throws {EnterstellarError} `ENS-8002` if forge is not configured.
     */
    forgeComponent(
        intent: string,
        constraints?: Readonly<Record<string, unknown>>,
    ): Promise<ForgeResult>;

    /**
     * Retrieves the JSON Schema for a registered component's props.
     *
     * Uses Zod v4's native `.json()` method to convert the component's
     * props schema to JSON Schema format (R8).
     *
     * @param componentName - PascalCase component name.
     * @returns Component schema result with JSON Schema.
     *
     * @throws {EnterstellarError} `ENS-8004` if the component is not found.
     */
    getComponentSchema(componentName: string): ComponentSchemaResult;

    /**
     * Composite tool: search → compose → validate in one call.
     *
     * Saves 2 round-trips for the 90% use case (AS2). Searches for
     * components matching the query, slots results into the provided
     * zone specs, then validates the composed spec through the compiler.
     *
     * @param query - Natural-language intent string for search.
     * @param zones - Zone specifications (component names are auto-filled from search results).
     * @returns Combined result with search results, spec, and validation.
     */
    buildUI(
        query: string,
        zones: readonly ZoneSpec[],
    ): Promise<BuildUIResult>;

    /**
     * MCP tool definitions for server registration.
     *
     * Contains all 7 tools (6 atomic + 1 composite) with their JSON
     * Schema input definitions and handler functions. Used by
     * `createMCPServer()` to expose the SDK as an MCP server.
     *
     * @see Design Choice AS1 — embedded MCP server.
     */
    readonly tools: readonly MCPToolDefinition[];
}
