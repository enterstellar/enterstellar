/**
 * @module @enterstellar-ai/agent-sdk/__tests__/mcp-server
 * @description Unit tests for `createMCPServer()`.
 *
 * Verifies the embedded MCP server wrapper:
 * - `listTools()` returns all 7 tool definitions.
 * - `handleToolCall()` dispatches to correct handler.
 * - Unknown tool name → structured error response.
 * - `EnterstellarError` → preserved code in error response.
 * - Generic `Error` → `INTERNAL_ERROR` code.
 * - Server is frozen (R4).
 *
 * @see Design Choice AS1 — embedded MCP server.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type {
    AgentSDKConfig,
    AgentSDKRegistry,
    AgentSDKCompiler,
    AgentSDKSemanticIndex,
    AgentSDKComponentContract,
    EnterstellarAgentSDK,
    MCPToolDefinition,
} from '../src/types.js';
import { createAgentSDK } from '../src/create-agent-sdk.js';
import { createMCPServer } from '../src/mcp-server.js';

import type { EnterstellarMCPServer } from '../src/mcp-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a valid SDK instance for MCP server tests.
 */
function createTestSDK(): EnterstellarAgentSDK {
    const contract: AgentSDKComponentContract = {
        name: 'TestComponent',
        category: 'data-display',
        description: 'Test',
        tags: [],
        props: {},
    };

    const config: AgentSDKConfig = {
        registry: {
            get: vi.fn((_name: string) => contract),
            list: vi.fn(() => [contract]),
        },
        compiler: {
            compile: vi.fn().mockResolvedValue({
                componentName: 'TestComponent',
                props: {},
                status: 'pass',
                provenance: {
                    agent: 'agent-sdk',
                    registry: 'default',
                    compiledAt: new Date().toISOString(),
                    compilerVersion: '0.0.0',
                },
                errors: [],
                selfCorrectionAttempts: 0,
            }),
            lint: vi.fn().mockResolvedValue([]),
        },
        semanticIndex: {
            search: vi.fn().mockResolvedValue([]),
        },
    };

    return createAgentSDK(config);
}

/**
 * Creates a test MCP server from a valid SDK.
 */
function createTestServer(): EnterstellarMCPServer {
    return createMCPServer(createTestSDK());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMCPServer', () => {
    // -----------------------------------------------------------------------
    // listTools()
    // -----------------------------------------------------------------------

    describe('listTools', () => {
        it('returns all 7 MCP tool definitions', () => {
            const server = createTestServer();

            const tools = server.listTools();

            expect(tools).toHaveLength(7);
        });

        it('each tool has name, description, inputSchema, and handler', () => {
            const server = createTestServer();

            for (const tool of server.listTools()) {
                expect(typeof tool.name).toBe('string');
                expect(typeof tool.description).toBe('string');
                expect(typeof tool.inputSchema).toBe('object');
                expect(typeof tool.handler).toBe('function');
            }
        });
    });

    // -----------------------------------------------------------------------
    // handleToolCall() — successful dispatch
    // -----------------------------------------------------------------------

    describe('successful dispatch', () => {
        it('dispatches enterstellar_search_components and returns success', async () => {
            const server = createTestServer();

            const result = await server.handleToolCall('enterstellar_search_components', {
                query: 'test query',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBeDefined();
            }
        });

        it('dispatches enterstellar_get_component_schema and returns success', async () => {
            const server = createTestServer();

            const result = await server.handleToolCall('enterstellar_get_component_schema', {
                componentName: 'TestComponent',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBeDefined();
            }
        });
    });

    // -----------------------------------------------------------------------
    // handleToolCall() — unknown tool
    // -----------------------------------------------------------------------

    describe('unknown tool', () => {
        it('returns error for unknown tool name', async () => {
            const server = createTestServer();

            const result = await server.handleToolCall('nonexistent_tool', {});

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.code).toBe('UNKNOWN_TOOL');
                expect(result.message).toContain('nonexistent_tool');
                expect(result.message).toContain('Available tools');
            }
        });

        it('lists available tool names in error message', async () => {
            const server = createTestServer();

            const result = await server.handleToolCall('bad_tool', {});

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.message).toContain('enterstellar_search_components');
                expect(result.message).toContain('enterstellar_compose_ui');
            }
        });
    });

    // -----------------------------------------------------------------------
    // handleToolCall() — error handling
    // -----------------------------------------------------------------------

    describe('error handling', () => {
        it('preserves EnterstellarError code in error response', async () => {
            // Create SDK with a forge-less config, then call forge tool
            const server = createTestServer();

            const result = await server.handleToolCall('enterstellar_forge_component', {
                intent: 'test intent',
            });

            // Should fail because forge is not configured
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.code).toBe('ENS-8002');
            }
        });

        it('returns INTERNAL_ERROR for non-EnterstellarError exceptions', async () => {
            // Create a custom SDK with a tool that throws a generic error
            const sdk = createTestSDK();
            const tools: MCPToolDefinition[] = [{
                name: 'test_throw',
                description: 'Test tool that throws',
                inputSchema: { type: 'object' },
                handler: vi.fn().mockRejectedValue(new Error('Generic crash')),
            }];

            // Replace the tools on the sdk (we need to work around freeze)
            const customSDK: EnterstellarAgentSDK = {
                ...sdk,
                tools,
            };
            const server = createMCPServer(customSDK);

            const result = await server.handleToolCall('test_throw', {});

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.code).toBe('INTERNAL_ERROR');
                expect(result.message).toContain('Generic crash');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Frozen server (R4)
    // -----------------------------------------------------------------------

    describe('frozen server', () => {
        it('returns a frozen MCP server object', () => {
            const server = createTestServer();

            expect(Object.isFrozen(server)).toBe(true);
        });
    });
});
