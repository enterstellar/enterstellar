/**
 * @module @enterstellar-ai/agent-sdk/mcp-server
 * @description Embedded MCP server wrapper for the Enterstellar Agent SDK.
 *
 * Exposes the `EnterstellarAgentSDK` as an MCP-compatible server that can be
 * consumed by any MCP-aware AI agent (Claude, GPT, Gemini, custom).
 *
 * **Design Choice AS1:** Embedded (same process). The server runs
 * in-process alongside the application — no IPC, no HTTP. Direct
 * access to registry, compiler, and store via the SDK instance.
 *
 * **Protocol:** The MCP server implements a lightweight tool-call
 * dispatch protocol:
 * - `listTools()` — returns available tool definitions.
 * - `handleToolCall(name, args)` — dispatches to the correct handler.
 *
 * No external MCP SDK dependency is required. The protocol surface is
 * minimal — tool name + JSON arguments → JSON result.
 *
 * **Error handling:** Handler errors are caught and returned as error
 * content objects — the server never crashes on a tool call failure.
 *
 * @see Design Choice AS1 — embedded MCP server.
 * @see Bible §4.16 — MCP tool definitions.
 */

import { EnterstellarError } from '@enterstellar-ai/types';

import type { EnterstellarAgentSDK, MCPToolDefinition } from './types.js';

// ---------------------------------------------------------------------------
// MCP Response Types
// ---------------------------------------------------------------------------

/**
 * Successful MCP tool call response.
 */
export type MCPToolResponse = {
    /** Whether the tool call succeeded. */
    readonly success: true;
    /** The tool's output data. */
    readonly data: unknown;
};

/**
 * Failed MCP tool call response.
 */
export type MCPToolErrorResponse = {
    /** Whether the tool call succeeded. */
    readonly success: false;
    /** Machine-readable error code (if available). */
    readonly code: string;
    /** Human-readable error message. */
    readonly message: string;
};

/**
 * Union of all possible MCP tool call responses.
 */
export type MCPCallResult = MCPToolResponse | MCPToolErrorResponse;

// ---------------------------------------------------------------------------
// MCP Server Interface
// ---------------------------------------------------------------------------

/**
 * The embedded MCP server interface.
 *
 * Provides `listTools()` for introspection and `handleToolCall()` for
 * tool execution. Consumed by MCP-aware agents to discover and invoke
 * Enterstellar capabilities.
 */
export interface EnterstellarMCPServer {
    /**
     * Returns the list of available MCP tool definitions.
     *
     * Each definition includes the tool's name, description, and input
     * schema in JSON Schema format. Agents use this for introspection —
     * discovering what tools are available and how to call them.
     *
     * @returns Array of MCP tool definitions.
     */
    listTools(): readonly MCPToolDefinition[];

    /**
     * Dispatches a tool call to the correct handler.
     *
     * Looks up the tool by name, validates that it exists, and invokes
     * its handler with the provided arguments. Returns a result object
     * indicating success or failure.
     *
     * @param name - MCP tool name (e.g., `'enterstellar_search_components'`).
     * @param args - Tool input arguments as a JSON-compatible record.
     * @returns A `MCPCallResult` — either `{ success: true, data }` or `{ success: false, code, message }`.
     */
    handleToolCall(
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<MCPCallResult>;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Creates an embedded MCP server from an `EnterstellarAgentSDK` instance.
 *
 * The server is a thin dispatch layer — it maps tool names to handlers
 * from the SDK's `tools` array and wraps results/errors in MCP-compatible
 * response objects.
 *
 * @param sdk - A fully configured `EnterstellarAgentSDK` instance.
 * @returns A frozen `EnterstellarMCPServer` object.
 *
 * @example
 * ```ts
 * import { createAgentSDK } from '@enterstellar-ai/agent-sdk';
 * import { createMCPServer } from '@enterstellar-ai/agent-sdk';
 *
 * const sdk = createAgentSDK({ registry, compiler, semanticIndex });
 * const server = createMCPServer(sdk);
 *
 * // Agent introspection
 * const tools = server.listTools();
 *
 * // Agent tool call
 * const result = await server.handleToolCall('enterstellar_search_components', {
 *   query: 'show patient vitals',
 *   topK: 5,
 * });
 * ```
 */
export function createMCPServer(sdk: EnterstellarAgentSDK): EnterstellarMCPServer {
    // Build a lookup map from tool name → handler for O(1) dispatch
    const toolMap = new Map<string, MCPToolDefinition>();

    for (const tool of sdk.tools) {
        toolMap.set(tool.name, tool);
    }

    // Freeze the tools array reference for listTools()
    const frozenTools = sdk.tools;

    const server: EnterstellarMCPServer = {
        listTools(): readonly MCPToolDefinition[] {
            return frozenTools;
        },

        async handleToolCall(
            name: string,
            args: Readonly<Record<string, unknown>>,
        ): Promise<MCPCallResult> {
            // ---------------------------------------------------------------
            // Look up tool by name
            // ---------------------------------------------------------------

            const tool = toolMap.get(name);

            if (tool === undefined) {
                const availableTools = Array.from(toolMap.keys()).join(', ');
                return {
                    success: false,
                    code: 'UNKNOWN_TOOL',
                    message: `Unknown tool '${name}'. Available tools: ${availableTools}.`,
                };
            }

            // ---------------------------------------------------------------
            // Execute handler with error wrapping
            // ---------------------------------------------------------------

            try {
                const data = await tool.handler(args);
                return { success: true, data };
            } catch (error: unknown) {
                return formatError(error);
            }
        },
    };

    return Object.freeze(server);
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Formats a caught error into an `MCPToolErrorResponse`.
 *
 * Extracts structured error information from `EnterstellarError` instances.
 * Falls back to generic error formatting for non-Enterstellar errors.
 *
 * @param error - The caught error (typed as `unknown` per strict TS).
 * @returns An `MCPToolErrorResponse` with code and message.
 */
function formatError(error: unknown): MCPToolErrorResponse {
    if (error instanceof EnterstellarError) {
        return {
            success: false,
            code: error.code,
            message: error.message,
        };
    }

    if (error instanceof Error) {
        return {
            success: false,
            code: 'INTERNAL_ERROR',
            message: error.message,
        };
    }

    return {
        success: false,
        code: 'INTERNAL_ERROR',
        message: String(error),
    };
}
