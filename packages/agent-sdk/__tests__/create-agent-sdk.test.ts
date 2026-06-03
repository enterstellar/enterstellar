/**
 * @module @enterstellar-ai/agent-sdk/__tests__/create-agent-sdk
 * @description Unit tests for `createAgentSDK()` factory function.
 *
 * Verifies the main factory function:
 * - Config validation (missing required deps → ENS-8001).
 * - Returned interface shape (all 7 methods + tools array).
 * - `Object.freeze()` on returned SDK (R4).
 * - Optional deps accepted without error.
 * - SDK methods are callable (shallow integration).
 *
 * @see Design Choice AS4 — factory pattern, plain object.
 * @see Design Choice R4 — `Object.freeze()`.
 * @see Error ENS-8001 — SDK not initialized.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type {
    AgentSDKConfig,
    AgentSDKRegistry,
    AgentSDKCompiler,
    AgentSDKSemanticIndex,
    AgentSDKForge,
    AgentSDKStore,
    AgentSDKComponentContract,
} from '../src/types.js';
import { createAgentSDK } from '../src/create-agent-sdk.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid `AgentSDKConfig` with all required deps mocked.
 */
function createValidConfig(overrides: Partial<AgentSDKConfig> = {}): AgentSDKConfig {
    return {
        registry: createMockRegistry(),
        compiler: createMockCompiler(),
        semanticIndex: createMockSemanticIndex(),
        ...overrides,
    };
}

function createMockRegistry(): AgentSDKRegistry {
    const contract: AgentSDKComponentContract = {
        name: 'TestComponent',
        category: 'data-display',
        description: 'Test',
        tags: [],
        props: { type: 'object', properties: {} },
    };
    return {
        get: vi.fn((_name: string) => contract),
        list: vi.fn(() => [contract]),
    };
}

function createMockCompiler(): AgentSDKCompiler {
    return {
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
    };
}

function createMockSemanticIndex(): AgentSDKSemanticIndex {
    return {
        search: vi.fn().mockResolvedValue([]),
    };
}

function createMockForge(): AgentSDKForge {
    return {
        forge: vi.fn().mockResolvedValue({
            success: true,
            contract: { name: '__forged_test', props: {} },
            compilationResult: { status: 'pass' },
            fallbackUsed: false,
            forgeMode: 'local',
        }),
    };
}

function createMockStore(): AgentSDKStore {
    return {
        get: vi.fn().mockReturnValue([]) as AgentSDKStore['get'],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAgentSDK', () => {
    // -----------------------------------------------------------------------
    // Config validation (ENS-8001)
    // -----------------------------------------------------------------------

    describe('config validation', () => {
        it('throws ENS-8001 when registry is missing', () => {
            try {
                createAgentSDK({
                    compiler: createMockCompiler(),
                    semanticIndex: createMockSemanticIndex(),
                } as AgentSDKConfig);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8001');
                expect(enterstellarError.module).toBe('agent-sdk');
                expect(enterstellarError.recoverable).toBe(false);
                expect(enterstellarError.message).toContain('registry');
            }
        });

        it('throws ENS-8001 when compiler is missing', () => {
            try {
                createAgentSDK({
                    registry: createMockRegistry(),
                    semanticIndex: createMockSemanticIndex(),
                } as AgentSDKConfig);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8001');
                expect(enterstellarError.message).toContain('compiler');
            }
        });

        it('throws ENS-8001 when semanticIndex is missing', () => {
            try {
                createAgentSDK({
                    registry: createMockRegistry(),
                    compiler: createMockCompiler(),
                } as AgentSDKConfig);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8001');
                expect(enterstellarError.message).toContain('semanticIndex');
            }
        });

        it('ENS-8001 is non-recoverable (developer error)', () => {
            try {
                createAgentSDK({} as AgentSDKConfig);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.recoverable).toBe(false);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Interface shape (AS4)
    // -----------------------------------------------------------------------

    describe('interface shape', () => {
        it('returns an object with all 7 tool methods', () => {
            const sdk = createAgentSDK(createValidConfig());

            expect(typeof sdk.search).toBe('function');
            expect(typeof sdk.compose).toBe('function');
            expect(typeof sdk.validate).toBe('function');
            expect(typeof sdk.analyzeTraces).toBe('function');
            expect(typeof sdk.forgeComponent).toBe('function');
            expect(typeof sdk.getComponentSchema).toBe('function');
            expect(typeof sdk.buildUI).toBe('function');
        });

        it('exposes tools array with 7 MCP tool definitions', () => {
            const sdk = createAgentSDK(createValidConfig());

            expect(sdk.tools).toHaveLength(7);

            const toolNames = sdk.tools.map((t) => t.name);
            expect(toolNames).toContain('enterstellar_search_components');
            expect(toolNames).toContain('enterstellar_compose_ui');
            expect(toolNames).toContain('enterstellar_validate_spec');
            expect(toolNames).toContain('enterstellar_analyze_traces');
            expect(toolNames).toContain('enterstellar_forge_component');
            expect(toolNames).toContain('enterstellar_get_component_schema');
            expect(toolNames).toContain('enterstellar_build_ui');
        });

        it('each tool definition has name, description, inputSchema, and handler', () => {
            const sdk = createAgentSDK(createValidConfig());

            for (const tool of sdk.tools) {
                expect(typeof tool.name).toBe('string');
                expect(tool.name.length).toBeGreaterThan(0);
                expect(typeof tool.description).toBe('string');
                expect(tool.description.length).toBeGreaterThan(0);
                expect(typeof tool.inputSchema).toBe('object');
                expect(typeof tool.handler).toBe('function');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Frozen object (R4)
    // -----------------------------------------------------------------------

    describe('frozen object', () => {
        it('returns a frozen SDK object', () => {
            const sdk = createAgentSDK(createValidConfig());

            expect(Object.isFrozen(sdk)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Optional deps
    // -----------------------------------------------------------------------

    describe('optional dependencies', () => {
        it('accepts forge without error', () => {
            const sdk = createAgentSDK(createValidConfig({
                forge: createMockForge(),
            }));

            expect(typeof sdk.forgeComponent).toBe('function');
        });

        it('accepts store without error', () => {
            const sdk = createAgentSDK(createValidConfig({
                store: createMockStore(),
            }));

            expect(typeof sdk.analyzeTraces).toBe('function');
        });

        it('accepts both forge and store', () => {
            const sdk = createAgentSDK(createValidConfig({
                forge: createMockForge(),
                store: createMockStore(),
            }));

            expect(sdk.tools).toHaveLength(7);
        });
    });

    // -----------------------------------------------------------------------
    // Shallow integration (methods callable)
    // -----------------------------------------------------------------------

    describe('shallow integration', () => {
        it('search() delegates to semantic index', async () => {
            const semanticIndex = createMockSemanticIndex();
            const sdk = createAgentSDK(createValidConfig({ semanticIndex }));

            await sdk.search('test query', 5);

            expect(semanticIndex.search).toHaveBeenCalledOnce();
        });

        it('getComponentSchema() delegates to registry', () => {
            const registry = createMockRegistry();
            const sdk = createAgentSDK(createValidConfig({ registry }));

            const result = sdk.getComponentSchema('TestComponent');

            expect(result.componentName).toBe('TestComponent');
            expect(registry.get).toHaveBeenCalledWith('TestComponent');
        });
    });
});
