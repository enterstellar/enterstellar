/**
 * @module @enterstellar-ai/agent-sdk/__tests__/integration/agent-simulation
 * @description 360 Agent Simulation — full-pipeline MCP dispatch integration test.
 *
 * Validates the complete path an AI agent takes when interacting with Enterstellar:
 *
 * ```
 * Agent → handleToolCall(name, args) → Map dispatch → handler → input parsing
 *       → SDK method → tool function → dependency → MCPCallResult
 * ```
 *
 * **Why this test exists:**
 * Individual tool functions are unit-tested in `__tests__/tools/`. The MCP
 * server wrapper is tested in `__tests__/mcp-server.test.ts`. But neither
 * verifies the **full wiring** from raw `Record<string, unknown>` input
 * through the embedded MCP dispatch to a successful `{ success: true, data }`
 * response for ALL 7 tools.
 *
 * This test closes the P3 Gate item:
 * > "AI agent successfully calls all 6 MCP tools."
 * (6 atomic + 1 composite = 7 total per AS2.)
 *
 * **Design:**
 * - Single `createFullyWiredServer()` helper builds `createAgentSDK()` →
 *   `createMCPServer()` with all 5 structural mock dependencies.
 * - Each tool has a `describe` block with at least one successful dispatch.
 * - Final completeness assertion ensures no tool is left untested.
 *
 * @see Design Choice AS1 — embedded MCP server (same-process dispatch).
 * @see Design Choice AS2 — 6 atomic + 1 composite tool.
 * @see Principle L3 — compiler never bypassed (validated via mock spy).
 */

import { describe, it, expect, vi } from 'vitest';

import type {
    AgentSDKConfig,
    AgentSDKRegistry,
    AgentSDKCompiler,
    AgentSDKSemanticIndex,
    AgentSDKForge,
    AgentSDKStore,
    AgentSDKComponentContract,
} from '../../src/types.js';
import { createAgentSDK } from '../../src/create-agent-sdk.js';
import { createMCPServer } from '../../src/mcp-server.js';

import type { EnterstellarMCPServer } from '../../src/mcp-server.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

/**
 * Creates a mock `AgentSDKComponentContract`.
 *
 * Returns a minimal contract with the given name, matching the structural
 * interface. Used by registry and compose/validate tool tests.
 *
 * @param name - PascalCase component name.
 * @returns A contract object satisfying `AgentSDKComponentContract`.
 */
function createMockContract(name: string): AgentSDKComponentContract {
    return {
        name,
        category: 'data-display',
        description: `Mock ${name} component for integration testing.`,
        tags: ['test', 'integration'],
        props: {
            type: 'object',
            properties: {
                patientId: { type: 'string' },
            },
        },
    };
}

/**
 * Creates a mock `AgentSDKRegistry` with two known components.
 *
 * `PatientVitals` and `MedicationList` are registered. Any other name
 * returns `undefined` from `get()`.
 *
 * @returns A mock registry with `get` and `list` methods.
 */
function createMockRegistry(): AgentSDKRegistry {
    const contracts = new Map<string, AgentSDKComponentContract>([
        ['PatientVitals', createMockContract('PatientVitals')],
        ['MedicationList', createMockContract('MedicationList')],
    ]);

    return {
        get: vi.fn((name: string) => contracts.get(name)),
        list: vi.fn(() => Array.from(contracts.values())),
    };
}

/**
 * Creates a mock `AgentSDKCompiler` that always returns `status: 'pass'`.
 *
 * The `compile` function is a Vitest spy so tests can verify it was called
 * (L3 enforcement check).
 *
 * @returns A mock compiler with `compile` and `lint` spies.
 */
function createMockCompiler(): AgentSDKCompiler {
    return {
        compile: vi.fn().mockResolvedValue({
            componentName: 'PatientVitals',
            props: { patientId: '123' },
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

/**
 * Creates a mock `AgentSDKSemanticIndex` that returns a single search result.
 *
 * The result's `componentName` is `'PatientVitals'` with similarity `0.92`.
 * This is critical for `enterstellar_build_ui` auto-fill: when a zone has
 * `component: ''`, it is auto-filled from this search result.
 *
 * @returns A mock semantic index with a `search` spy.
 */
function createMockSemanticIndex(): AgentSDKSemanticIndex {
    return {
        search: vi.fn().mockResolvedValue([
            {
                componentName: 'PatientVitals',
                similarity: 0.92,
                category: 'data-display',
                description: 'Displays patient vital signs.',
            },
        ]),
    };
}

/**
 * Creates a mock `AgentSDKForge` that returns a successful forge result.
 *
 * Simulates a local forge hit (F9 — never hard-fails).
 *
 * @returns A mock forge with a `forge` spy.
 */
function createMockForge(): AgentSDKForge {
    return {
        forge: vi.fn().mockResolvedValue({
            success: true,
            contract: {
                name: '__forged_patient_medication_timeline_a1b2c3d4',
                category: 'data-display',
                description: 'Forged component for patient medication timeline.',
                tags: ['forged'],
                props: {},
            },
            compilationResult: {
                componentName: '__forged_patient_medication_timeline_a1b2c3d4',
                props: {},
                status: 'pass',
                provenance: {
                    agent: 'forge',
                    registry: 'default',
                    compiledAt: new Date().toISOString(),
                    compilerVersion: '0.0.0',
                },
                errors: [],
                selfCorrectionAttempts: 0,
            },
            fallbackUsed: false,
            forgeMode: 'local',
        }),
    };
}

/**
 * Creates a mock `AgentSDKStore` with 3 trace records.
 *
 * Traces cover 2 components (`PatientVitals`, `MedicationList`) with
 * varying statuses, enabling meaningful `enterstellar_analyze_traces` grouping.
 * Each trace matches the `AnalyzableTrace` shape expected by the tool.
 *
 * @returns A mock store with a `get` spy returning trace data.
 */
function createMockStore(): AgentSDKStore {
    const now = new Date().toISOString();

    const traces = [
        {
            timestamp: now,
            resolution: { strategy: 'exact', resolvedComponent: 'PatientVitals' },
            compilation: { status: 'pass' },
            determinism: { zone: 'main' },
            metrics: { totalMs: 42 },
        },
        {
            timestamp: now,
            resolution: { strategy: 'semantic', resolvedComponent: 'PatientVitals' },
            compilation: { status: 'corrected' },
            determinism: { zone: 'main' },
            metrics: { totalMs: 78 },
        },
        {
            timestamp: now,
            resolution: { strategy: 'exact', resolvedComponent: 'MedicationList' },
            compilation: { status: 'pass' },
            determinism: { zone: 'sidebar' },
            metrics: { totalMs: 35 },
        },
    ];

    return {
        get: vi.fn().mockReturnValue(traces) as AgentSDKStore['get'],
    };
}

// ---------------------------------------------------------------------------
// Server Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fully-wired `EnterstellarMCPServer` with all 5 structural mock deps.
 *
 * This is the entry point for all integration tests. It builds the real
 * `createAgentSDK()` → `createMCPServer()` pipeline with mocked deps,
 * exercising the full dispatch path.
 *
 * @returns An object containing the frozen MCP server and all mock spies
 *          for assertion access.
 */
function createFullyWiredServer(): {
    readonly server: EnterstellarMCPServer;
    readonly mocks: {
        readonly registry: AgentSDKRegistry;
        readonly compiler: AgentSDKCompiler;
        readonly semanticIndex: AgentSDKSemanticIndex;
        readonly forge: AgentSDKForge;
        readonly store: AgentSDKStore;
    };
} {
    const registry = createMockRegistry();
    const compiler = createMockCompiler();
    const semanticIndex = createMockSemanticIndex();
    const forge = createMockForge();
    const store = createMockStore();

    const config: AgentSDKConfig = {
        registry,
        compiler,
        semanticIndex,
        forge,
        store,
    };

    const sdk = createAgentSDK(config);
    const server = createMCPServer(sdk);

    return {
        server,
        mocks: { registry, compiler, semanticIndex, forge, store },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('360 Agent Simulation — MCP dispatch integration', () => {
    // -----------------------------------------------------------------------
    // enterstellar_search_components
    // -----------------------------------------------------------------------

    describe('enterstellar_search_components', () => {
        it('dispatches successfully and returns search results', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_search_components', {
                query: 'patient vitals',
                topK: 5,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(Array.isArray(result.data)).toBe(true);
                const data = result.data as readonly Record<string, unknown>[];
                expect(data.length).toBeGreaterThan(0);
                expect(data[0]).toHaveProperty('componentName', 'PatientVitals');
                expect(data[0]).toHaveProperty('similarity', 0.92);
            }
            expect(mocks.semanticIndex.search).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // enterstellar_compose_ui
    // -----------------------------------------------------------------------

    describe('enterstellar_compose_ui', () => {
        it('dispatches successfully and returns a valid UISpec', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_compose_ui', {
                zones: [
                    {
                        name: 'main',
                        component: 'PatientVitals',
                        props: { patientId: '123' },
                        determinism: 0.5,
                    },
                ],
            });

            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data as Record<string, unknown>;
                expect(data).toHaveProperty('zones');
                const zones = data['zones'] as readonly Record<string, unknown>[];
                expect(zones).toHaveLength(1);
                expect(zones[0]).toHaveProperty('name', 'main');
                expect(zones[0]).toHaveProperty('component', 'PatientVitals');
                expect(zones[0]).toHaveProperty('determinism', 0.5);
            }
            expect(mocks.registry.get).toHaveBeenCalledWith('PatientVitals');
        });
    });

    // -----------------------------------------------------------------------
    // enterstellar_validate_spec (L3 enforcement)
    // -----------------------------------------------------------------------

    describe('enterstellar_validate_spec', () => {
        it('dispatches successfully and enforces L3 (compiler called)', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_validate_spec', {
                spec: {
                    zones: [
                        {
                            name: 'main',
                            component: 'PatientVitals',
                            props: { patientId: '123' },
                            determinism: 0.5,
                        },
                    ],
                },
            });

            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data as Record<string, unknown>;
                expect(data).toHaveProperty('status', 'pass');
                expect(data).toHaveProperty('errors');
                expect(data).toHaveProperty('selfCorrectionAttempts', 0);
            }

            // L3: compiler.compile() MUST have been called — this is the critical assertion
            expect(mocks.compiler.compile).toHaveBeenCalledOnce();
            expect(mocks.compiler.compile).toHaveBeenCalledWith(
                expect.objectContaining({ component: 'PatientVitals' }),
                expect.objectContaining({ agent: 'agent-sdk' }),
            );
        });
    });

    // -----------------------------------------------------------------------
    // enterstellar_analyze_traces (AS5 — local traces from EnterstellarStore)
    // -----------------------------------------------------------------------

    describe('enterstellar_analyze_traces', () => {
        it('dispatches successfully and returns grouped trace analysis', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_analyze_traces', {
                timeRange: 'all',
                groupBy: 'component',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data as Record<string, unknown>;
                expect(data).toHaveProperty('timeRange', 'all');
                expect(data).toHaveProperty('groupBy', 'component');
                expect(data).toHaveProperty('totalTraces', 3);

                const groups = data['groups'] as readonly Record<string, unknown>[];
                expect(groups.length).toBeGreaterThan(0);

                // PatientVitals has 2 traces, MedicationList has 1 → PV sorted first
                expect(groups[0]).toHaveProperty('key', 'PatientVitals');
                expect(groups[0]).toHaveProperty('count', 2);
            }
            expect(mocks.store.get).toHaveBeenCalledWith('traces');
        });
    });

    // -----------------------------------------------------------------------
    // enterstellar_forge_component (F9 — never hard-fails)
    // -----------------------------------------------------------------------

    describe('enterstellar_forge_component', () => {
        it('dispatches successfully and returns a forge result', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_forge_component', {
                intent: 'patient medication timeline',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data as Record<string, unknown>;
                expect(data).toHaveProperty('success', true);
                expect(data).toHaveProperty('forgeMode', 'local');

                const contract = data['contract'] as Record<string, unknown>;
                expect(contract).toHaveProperty('name');
                expect(typeof contract['name']).toBe('string');
                expect((contract['name'] as string).startsWith('__forged_')).toBe(true);
            }
            expect(mocks.forge.forge).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // enterstellar_get_component_schema
    // -----------------------------------------------------------------------

    describe('enterstellar_get_component_schema', () => {
        it('dispatches successfully and returns the component schema', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_get_component_schema', {
                componentName: 'PatientVitals',
            });

            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data as Record<string, unknown>;
                expect(data).toHaveProperty('componentName', 'PatientVitals');
                expect(data).toHaveProperty('schema');
                expect(typeof data['schema']).toBe('object');
            }
            expect(mocks.registry.get).toHaveBeenCalledWith('PatientVitals');
        });
    });

    // -----------------------------------------------------------------------
    // enterstellar_build_ui (composite — AS2: search → compose → validate)
    // -----------------------------------------------------------------------

    describe('enterstellar_build_ui', () => {
        it('dispatches successfully with auto-fill and validates through compiler', async () => {
            const { server, mocks } = createFullyWiredServer();

            const result = await server.handleToolCall('enterstellar_build_ui', {
                query: 'show patient vitals',
                zones: [
                    {
                        name: 'main',
                        component: '',       // Empty — should be auto-filled from search
                        props: {},
                        determinism: 0.5,
                    },
                ],
            });

            expect(result.success).toBe(true);
            if (result.success) {
                const data = result.data as Record<string, unknown>;

                // Search results present
                expect(data).toHaveProperty('searchResults');
                const searchResults = data['searchResults'] as readonly Record<string, unknown>[];
                expect(searchResults.length).toBeGreaterThan(0);

                // Spec assembled with auto-filled component
                expect(data).toHaveProperty('spec');
                const spec = data['spec'] as Record<string, unknown>;
                const zones = spec['zones'] as readonly Record<string, unknown>[];
                expect(zones).toHaveLength(1);
                expect(zones[0]).toHaveProperty('component', 'PatientVitals'); // Auto-filled!

                // Validation result present
                expect(data).toHaveProperty('validation');
                const validation = data['validation'] as Record<string, unknown>;
                expect(validation).toHaveProperty('status', 'pass');
            }

            // Verify the full chain executed:
            // 1. Search was called
            expect(mocks.semanticIndex.search).toHaveBeenCalledOnce();
            // 2. Registry was consulted (compose validates component existence)
            expect(mocks.registry.get).toHaveBeenCalledWith('PatientVitals');
            // 3. L3: Compiler was called (validate step)
            expect(mocks.compiler.compile).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // Completeness Assertion
    // -----------------------------------------------------------------------

    describe('completeness', () => {
        /**
         * All 7 tool names that MUST have a successful dispatch test above.
         *
         * If a new tool is added to the SDK but not tested here, this
         * assertion will fail — forcing the developer to add a test.
         */
        const TESTED_TOOLS = new Set<string>([
            'enterstellar_search_components',
            'enterstellar_compose_ui',
            'enterstellar_validate_spec',
            'enterstellar_analyze_traces',
            'enterstellar_forge_component',
            'enterstellar_get_component_schema',
            'enterstellar_build_ui',
        ]);

        it('every tool in listTools() has a successful dispatch test', () => {
            const { server } = createFullyWiredServer();
            const tools = server.listTools();

            // Verify count matches
            expect(tools).toHaveLength(TESTED_TOOLS.size);

            // Verify every registered tool is in our test set
            for (const tool of tools) {
                expect(TESTED_TOOLS.has(tool.name)).toBe(true);
            }
        });

        it('TESTED_TOOLS count matches listTools() count (no stale entries)', () => {
            const { server } = createFullyWiredServer();
            const tools = server.listTools();

            // If TESTED_TOOLS has entries not in listTools(), this catches it
            const registeredNames = new Set(tools.map((t) => t.name));
            for (const testedName of TESTED_TOOLS) {
                expect(registeredNames.has(testedName)).toBe(true);
            }
        });
    });
});
