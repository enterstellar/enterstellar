/**
 * @module @enterstellar-ai/agent-sdk/create-agent-sdk
 * @description Factory function for the Enterstellar Agent SDK.
 *
 * `createAgentSDK(config)` is the primary public API entry point.
 * It validates the provided configuration, wires tool implementations
 * to actual module instances, and returns a frozen `EnterstellarAgentSDK` object.
 *
 * **Factory pattern (R1, R4, AS4):**
 * - Plain object with closures, not a class instance.
 * - `Object.freeze()` on the returned object — immutable surface.
 * - Required deps validated eagerly (fail-fast with `ENS-8001`).
 * - Optional deps validated lazily at tool invocation time.
 *
 * **MCP tool definitions:**
 * The `tools` property exposes all 7 MCP tool definitions with input
 * schemas and handler functions. These are consumed by `createMCPServer()`
 * to register the SDK as an MCP server.
 *
 * @see Design Choice AS4 — factory pattern.
 * @see Design Choice R1 — plain object with closures.
 * @see Design Choice R4 — `Object.freeze()`.
 * @see Bible §4.16 — `@enterstellar-ai/agent-sdk` module specification.
 */

import type { CompilationResult, SemanticSearchResult, ForgeResult } from '@enterstellar-ai/types';

import type {
    AgentSDKConfig,
    EnterstellarAgentSDK,
    ZoneSpec,
    UISpec,
    TraceAnalysis,
    BuildUIResult,
    ComponentSchemaResult,
    MCPToolDefinition,
} from './types.js';
import { sdkNotInitializedError } from './errors.js';
import {
    executeSearchComponents,
    executeComposeUI,
    executeValidateSpec,
    executeAnalyzeTraces,
    executeForgeComponent,
    executeGetComponentSchema,
    executeBuildUI,
} from './tools/index.js';

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Creates a new `EnterstellarAgentSDK` instance.
 *
 * Validates the provided configuration, wires tool implementations to
 * the actual module instances, and returns a frozen SDK object.
 *
 * **Required dependencies:** `registry`, `compiler`, `semanticIndex`.
 * **Optional dependencies:** `forge` (for `forgeComponent`), `store` (for `analyzeTraces`).
 *
 * @param config - SDK configuration with module dependencies.
 * @returns A frozen `EnterstellarAgentSDK` object with all tools wired.
 *
 * @throws {EnterstellarError} Code `ENS-8001` if any required dependency is missing.
 *
 * @example
 * ```ts
 * import { createAgentSDK } from '@enterstellar-ai/agent-sdk';
 *
 * const sdk = createAgentSDK({
 *   registry,
 *   compiler,
 *   semanticIndex,
 *   forge,     // optional
 *   store,     // optional
 * });
 *
 * // Use atomic tools
 * const results = await sdk.search('show patient vitals');
 *
 * // Use composite tool
 * const build = await sdk.buildUI('patient vitals', [
 *   { name: 'main', component: '', props: {}, determinism: 0.5 },
 * ]);
 *
 * // Access MCP tool definitions
 * const mcpTools = sdk.tools;
 * ```
 */
export function createAgentSDK(config: AgentSDKConfig): EnterstellarAgentSDK {
    // -----------------------------------------------------------------------
    // Validate required dependencies (fail-fast — ENS-8001)
    // -----------------------------------------------------------------------

    validateRequiredDeps(config);

    // -----------------------------------------------------------------------
    // Destructure for closure capture
    // -----------------------------------------------------------------------

    const { registry, compiler, semanticIndex, forge, store } = config;

    // -----------------------------------------------------------------------
    // Build tool method closures
    // -----------------------------------------------------------------------

    const search = async (
        query: string,
        topK?: number,
    ): Promise<readonly SemanticSearchResult[]> => {
        return executeSearchComponents(semanticIndex, query, topK);
    };

    const compose = (
        zones: readonly ZoneSpec[],
        _layout?: string,
    ): Promise<UISpec> => {
        return Promise.resolve(executeComposeUI(registry, zones, _layout));
    };

    const validate = async (spec: UISpec): Promise<CompilationResult> => {
        return executeValidateSpec(compiler, spec);
    };

    const analyzeTraces = (
        timeRange: string,
        groupBy: string,
    ): Promise<TraceAnalysis> => {
        return Promise.resolve(executeAnalyzeTraces(store, timeRange, groupBy));
    };

    const forgeComponent = async (
        intent: string,
        constraints?: Readonly<Record<string, unknown>>,
    ): Promise<ForgeResult> => {
        return executeForgeComponent(forge, intent, constraints);
    };

    const getComponentSchema = (componentName: string): ComponentSchemaResult => {
        return executeGetComponentSchema(registry, componentName);
    };

    const buildUI = async (
        query: string,
        zones: readonly ZoneSpec[],
    ): Promise<BuildUIResult> => {
        return executeBuildUI(semanticIndex, registry, compiler, query, zones);
    };

    // -----------------------------------------------------------------------
    // Build MCP tool definitions
    // -----------------------------------------------------------------------

    const tools: readonly MCPToolDefinition[] = buildToolDefinitions(
        search,
        compose,
        validate,
        analyzeTraces,
        forgeComponent,
        getComponentSchema,
        buildUI,
    );

    // -----------------------------------------------------------------------
    // Assemble and freeze SDK (R4)
    // -----------------------------------------------------------------------

    const sdk: EnterstellarAgentSDK = {
        search,
        compose,
        validate,
        analyzeTraces,
        forgeComponent,
        getComponentSchema,
        buildUI,
        tools,
    };

    return Object.freeze(sdk);
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Validates that all required dependencies are provided in the config.
 *
 * The config is cast to a partial record so ESLint does not flag the
 * existence checks as unnecessary (they ARE necessary at runtime
 * because JS consumers can pass incomplete objects).
 *
 * @param config - SDK configuration to validate.
 * @throws {EnterstellarError} Code `ENS-8001` for each missing required dependency.
 */
function validateRequiredDeps(config: AgentSDKConfig): void {
    // Cast to partial record for defensive runtime checks (JS consumers).
    const raw = config as Partial<Record<string, unknown>>;

    if (!raw['registry']) {
        throw sdkNotInitializedError('registry');
    }
    if (!raw['compiler']) {
        throw sdkNotInitializedError('compiler');
    }
    if (!raw['semanticIndex']) {
        throw sdkNotInitializedError('semanticIndex');
    }
}

/**
 * Builds the MCP tool definitions array for server registration.
 *
 * Each tool definition includes:
 * - `name` — MCP tool name (e.g., `'enterstellar_search_components'`).
 * - `description` — human-readable description for agent introspection.
 * - `inputSchema` — JSON Schema for the tool's input parameters.
 * - `handler` — async function that executes the tool.
 *
 * @returns Array of 7 MCP tool definitions (6 atomic + 1 composite).
 */
function buildToolDefinitions(
    search: EnterstellarAgentSDK['search'],
    compose: EnterstellarAgentSDK['compose'],
    validate: EnterstellarAgentSDK['validate'],
    analyzeTraces: EnterstellarAgentSDK['analyzeTraces'],
    forgeComponent: EnterstellarAgentSDK['forgeComponent'],
    getComponentSchema: EnterstellarAgentSDK['getComponentSchema'],
    buildUI: EnterstellarAgentSDK['buildUI'],
): readonly MCPToolDefinition[] {
    return Object.freeze([
        // -----------------------------------------------------------------
        // enterstellar_search_components
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_search_components',
            description: 'Search the component registry using natural language. Returns the top-K most similar components with similarity scores.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Natural-language intent string.' },
                    topK: { type: 'number', description: 'Max results (1–20, default 5).', minimum: 1, maximum: 20 },
                },
                required: ['query'],
            },
            handler: async (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const rawQuery = input['query'];
                const query = typeof rawQuery === 'string' ? rawQuery : '';
                const topK = typeof input['topK'] === 'number' ? input['topK'] : undefined;
                return search(query, topK);
            },
        },

        // -----------------------------------------------------------------
        // enterstellar_compose_ui
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_compose_ui',
            description: 'Compose a UI specification from zone assignments. Each zone maps a component to a named region with props and determinism level.',
            inputSchema: {
                type: 'object',
                properties: {
                    zones: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                component: { type: 'string' },
                                props: { type: 'object' },
                                determinism: { type: 'number', minimum: 0, maximum: 1 },
                            },
                            required: ['name', 'component', 'props', 'determinism'],
                        },
                    },
                    layout: { type: 'string', description: 'Layout hint (e.g., grid, stack). Reserved for future use.' },
                },
                required: ['zones'],
            },
            handler: async (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const zones = (Array.isArray(input['zones']) ? input['zones'] : []) as readonly ZoneSpec[];
                const layout = typeof input['layout'] === 'string' ? input['layout'] : undefined;
                return compose(zones, layout);
            },
        },

        // -----------------------------------------------------------------
        // enterstellar_validate_spec
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_validate_spec',
            description: 'Validate a UI specification through the Enterstellar compiler. Enforces schema validation, design token compliance, and accessibility requirements.',
            inputSchema: {
                type: 'object',
                properties: {
                    spec: {
                        type: 'object',
                        properties: {
                            zones: { type: 'array' },
                        },
                        required: ['zones'],
                    },
                },
                required: ['spec'],
            },
            handler: async (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const spec = (input['spec'] ?? { zones: [] }) as UISpec;
                return validate(spec);
            },
        },

        // -----------------------------------------------------------------
        // enterstellar_analyze_traces
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_analyze_traces',
            description: 'Analyze agent traces from the current session. Groups traces by a specified dimension and returns aggregated metrics.',
            inputSchema: {
                type: 'object',
                properties: {
                    timeRange: { type: 'string', description: "Time filter: 'last-hour', 'last-day', 'all', or ISO 8601 timestamp." },
                    groupBy: { type: 'string', description: "Grouping dimension: 'component', 'zone', 'status', or 'strategy'.", enum: ['component', 'zone', 'status', 'strategy'] },
                },
                required: ['timeRange', 'groupBy'],
            },
            handler: async (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const rawTimeRange = input['timeRange'];
                const timeRange = typeof rawTimeRange === 'string' ? rawTimeRange : 'all';
                const rawGroupBy = input['groupBy'];
                const groupBy = typeof rawGroupBy === 'string' ? rawGroupBy : 'component';
                return analyzeTraces(timeRange, groupBy);
            },
        },

        // -----------------------------------------------------------------
        // enterstellar_forge_component
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_forge_component',
            description: 'Generate a runtime component when no registry match exists. Uses LocalForge (templates) or CloudForge (LLM) with compiler validation.',
            inputSchema: {
                type: 'object',
                properties: {
                    intent: { type: 'string', description: 'Natural-language intent for the component to generate.' },
                    constraints: { type: 'object', description: 'Optional constraints for generation.' },
                },
                required: ['intent'],
            },
            handler: async (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const rawIntent = input['intent'];
                const intent = typeof rawIntent === 'string' ? rawIntent : '';
                const constraints = typeof input['constraints'] === 'object' && input['constraints'] !== null
                    ? input['constraints'] as Readonly<Record<string, unknown>>
                    : undefined;
                return forgeComponent(intent, constraints);
            },
        },

        // -----------------------------------------------------------------
        // enterstellar_get_component_schema
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_get_component_schema',
            description: 'Retrieve the JSON Schema for a registered component\'s props. Use to understand expected props before composing UI.',
            inputSchema: {
                type: 'object',
                properties: {
                    componentName: { type: 'string', description: 'PascalCase component name.' },
                },
                required: ['componentName'],
            },
            handler: (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const rawName = input['componentName'];
                const componentName = typeof rawName === 'string' ? rawName : '';
                return Promise.resolve(getComponentSchema(componentName));
            },
        },

        // -----------------------------------------------------------------
        // enterstellar_build_ui (composite — AS2)
        // -----------------------------------------------------------------
        {
            name: 'enterstellar_build_ui',
            description: 'Composite tool: search → compose → validate in one call. Empty component fields in zones are auto-filled from search results.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Natural-language search query.' },
                    zones: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                component: { type: 'string', description: "Leave empty ('') to auto-fill from search results." },
                                props: { type: 'object' },
                                determinism: { type: 'number', minimum: 0, maximum: 1 },
                            },
                            required: ['name', 'component', 'props', 'determinism'],
                        },
                    },
                },
                required: ['query', 'zones'],
            },
            handler: async (input: Readonly<Record<string, unknown>>): Promise<unknown> => {
                const rawQuery = input['query'];
                const query = typeof rawQuery === 'string' ? rawQuery : '';
                const zones = (Array.isArray(input['zones']) ? input['zones'] : []) as readonly ZoneSpec[];
                return buildUI(query, zones);
            },
        },
    ]);
}
