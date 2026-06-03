/**
 * @module @enterstellar-ai/agent-sdk
 * @description AI agent SDK with MCP server — 7 tools for component search,
 * compose, validate, analyze, forge, schema, and composite build.
 *
 * The Agent SDK exposes Enterstellar as an **MCP server** so any AI agent (Claude,
 * GPT, Gemini, custom) can interact with the component registry, compiler,
 * semantic index, and forge as composable tools.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createAgentSDK, createMCPServer } from '@enterstellar-ai/agent-sdk';
 *
 * const sdk = createAgentSDK({ registry, compiler, semanticIndex, forge });
 *
 * // Direct usage
 * const results = await sdk.search('show patient vitals');
 * const spec = await sdk.compose([...zones]);
 * const validation = await sdk.validate(spec);
 *
 * // MCP server for agent integration
 * const server = createMCPServer(sdk);
 * const tools = server.listTools();
 * const result = await server.handleToolCall('enterstellar_search_components', { query: '...' });
 * ```
 *
 * @see Bible §4.16 — module specification.
 * @see Design Choices AS1–AS6.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------
export { createAgentSDK } from './create-agent-sdk.js';
export { createMCPServer } from './mcp-server.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    EnterstellarAgentSDK,
    AgentSDKConfig,
    ZoneSpec,
    UISpec,
    TraceAnalysis,
    TraceAnalysisGroup,
    BuildUIResult,
    ComponentSchemaResult,
    MCPToolDefinition,
    AgentSDKRegistry,
    AgentSDKCompiler,
    AgentSDKSemanticIndex,
    AgentSDKForge,
    AgentSDKStore,
} from './types.js';

// ---------------------------------------------------------------------------
// MCP Server Types
// ---------------------------------------------------------------------------
export type {
    EnterstellarMCPServer,
    MCPToolResponse,
    MCPToolErrorResponse,
    MCPCallResult,
} from './mcp-server.js';

// ---------------------------------------------------------------------------
// Error Factories (for testing and consumer error handling)
// ---------------------------------------------------------------------------
export {
    sdkNotInitializedError,
    searchFailedError,
    composeFailedError,
    componentSchemaNotFoundError,
    traceAnalysisInvalidError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { AGENT_SDK_VERSION } from './version.js';
