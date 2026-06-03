/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/build-ui
 * @description Unit tests for `executeBuildUI()`.
 *
 * Verifies the composite `enterstellar_build_ui` MCP tool (AS2):
 * - Full chain: search → compose → validate.
 * - Auto-fill logic for empty component fields.
 * - Explicit component preservation.
 * - Error propagation from inner tools.
 *
 * Uses mocks for `AgentSDKSemanticIndex`, `AgentSDKRegistry`, and
 * `AgentSDKCompiler`, all injected as parameters.
 *
 * @see Design Choice AS2 — composite convenience tool.
 */

import { describe, it, expect, vi } from 'vitest';

import type { SemanticSearchResult, CompilationResult, ComponentContract } from '@enterstellar-ai/types';

import type {
    AgentSDKSemanticIndex,
    AgentSDKRegistry,
    AgentSDKCompiler,
    AgentSDKComponentContract,
    ZoneSpec,
} from '../../src/types.js';
import { executeBuildUI } from '../../src/tools/build-ui.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `SemanticSearchResult`.
 */
function createSearchResult(name: string, similarity: number): SemanticSearchResult {
    return {
        componentName: name,
        similarity,
        contract: {
            name,
            category: 'data-display',
            description: `Test component ${name}`,
            tags: ['test'],
            props: {},
            examples: [],
            tokens: {},
            states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'Ready' },
            accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
            id: name,
            _meta: { forged: false, version: '0.0.0', createdAt: new Date().toISOString() },
        } as unknown as ComponentContract,
    };
}

/**
 * Creates a mock `CompilationResult` with a pass status.
 */
function createPassResult(): CompilationResult {
    return {
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
    };
}

/**
 * Creates a mock contract for registry lookup.
 */
function createContract(name: string): AgentSDKComponentContract {
    return {
        name,
        category: 'data-display',
        description: `Test ${name}`,
        tags: [],
        props: {},
    };
}

/**
 * Creates a default set of mocks for the build-ui test suite.
 */
function createMocks(overrides: {
    searchResults?: SemanticSearchResult[];
    knownComponents?: string[];
} = {}): {
    semanticIndex: AgentSDKSemanticIndex;
    registry: AgentSDKRegistry;
    compiler: AgentSDKCompiler;
} {
    const results = overrides.searchResults ?? [
        createSearchResult('PatientVitals', 0.92),
        createSearchResult('MedicationList', 0.78),
    ];

    const knownNames = overrides.knownComponents ?? results.map((r) => r.componentName);
    const componentMap = new Map<string, AgentSDKComponentContract>(
        knownNames.map((name) => [name, createContract(name)]),
    );

    return {
        semanticIndex: {
            search: vi.fn().mockResolvedValue(results),
        },
        registry: {
            get: vi.fn((name: string) => componentMap.get(name)),
            list: vi.fn(() => Array.from(componentMap.values())),
        },
        compiler: {
            compile: vi.fn().mockResolvedValue(createPassResult()),
            lint: vi.fn().mockResolvedValue([]),
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeBuildUI', () => {
    // -----------------------------------------------------------------------
    // Full chain
    // -----------------------------------------------------------------------

    describe('full chain', () => {
        it('returns BuildUIResult with searchResults, spec, and validation', async () => {
            const { semanticIndex, registry, compiler } = createMocks();
            const zones: readonly ZoneSpec[] = [
                { name: 'main', component: '', props: {}, determinism: 0.5 },
            ];

            const result = await executeBuildUI(
                semanticIndex, registry, compiler, 'patient vitals', zones,
            );

            expect(result.searchResults).toBeDefined();
            expect(result.searchResults.length).toBeGreaterThan(0);
            expect(result.spec).toBeDefined();
            expect(result.spec.zones).toHaveLength(1);
            expect(result.validation).toBeDefined();
            expect(result.validation.status).toBe('pass');
        });

        it('calls search with topK matching zone count', async () => {
            const { semanticIndex, registry, compiler } = createMocks();
            const zones: readonly ZoneSpec[] = [
                { name: 'main', component: '', props: {}, determinism: 0.5 },
                { name: 'sidebar', component: '', props: {}, determinism: 0.0 },
            ];

            await executeBuildUI(
                semanticIndex, registry, compiler, 'patient data', zones,
            );

            expect(semanticIndex.search).toHaveBeenCalledWith('patient data', { topK: 2 });
        });
    });

    // -----------------------------------------------------------------------
    // Auto-fill logic
    // -----------------------------------------------------------------------

    describe('auto-fill', () => {
        it('fills empty component fields from search results by position', async () => {
            const { semanticIndex, registry, compiler } = createMocks({
                searchResults: [
                    createSearchResult('PatientVitals', 0.92),
                    createSearchResult('MedicationList', 0.78),
                ],
            });
            const zones: readonly ZoneSpec[] = [
                { name: 'main', component: '', props: {}, determinism: 0.5 },
                { name: 'sidebar', component: '', props: {}, determinism: 0.0 },
            ];

            const result = await executeBuildUI(
                semanticIndex, registry, compiler, 'patient data', zones,
            );

            expect(result.spec.zones[0]?.component).toBe('PatientVitals');
            expect(result.spec.zones[1]?.component).toBe('MedicationList');
        });

        it('preserves explicit component names', async () => {
            const { semanticIndex, registry, compiler } = createMocks({
                knownComponents: ['PatientVitals', 'MedicationList', 'ExplicitComponent'],
            });
            const zones: readonly ZoneSpec[] = [
                { name: 'main', component: 'ExplicitComponent', props: {}, determinism: 0.5 },
            ];

            const result = await executeBuildUI(
                semanticIndex, registry, compiler, 'patient data', zones,
            );

            expect(result.spec.zones[0]?.component).toBe('ExplicitComponent');
        });

        it('handles mix of auto-fill and explicit components', async () => {
            const { semanticIndex, registry, compiler } = createMocks({
                searchResults: [createSearchResult('PatientVitals', 0.92)],
                knownComponents: ['PatientVitals', 'ExplicitComponent'],
            });
            const zones: readonly ZoneSpec[] = [
                { name: 'main', component: 'ExplicitComponent', props: {}, determinism: 0.5 },
                { name: 'sidebar', component: '', props: {}, determinism: 0.0 },
            ];

            const result = await executeBuildUI(
                semanticIndex, registry, compiler, 'patient data', zones,
            );

            expect(result.spec.zones[0]?.component).toBe('ExplicitComponent');
            expect(result.spec.zones[1]?.component).toBe('PatientVitals');
        });
    });

    // -----------------------------------------------------------------------
    // Validation pass-through
    // -----------------------------------------------------------------------

    describe('validation', () => {
        it('returns validation result from compiler without throwing on fail', async () => {
            const { semanticIndex, registry } = createMocks();
            const failResult = createPassResult();
            const compiler: AgentSDKCompiler = {
                compile: vi.fn().mockResolvedValue({
                    ...failResult,
                    status: 'fail',
                    errors: [{ code: 'ENS-2001', path: 'props', message: 'Invalid' }],
                }),
                lint: vi.fn().mockResolvedValue([]),
            };
            const zones: readonly ZoneSpec[] = [
                { name: 'main', component: '', props: {}, determinism: 0.5 },
            ];

            const result = await executeBuildUI(
                semanticIndex, registry, compiler, 'patient data', zones,
            );

            // Does NOT throw — returns the fail result for agent to inspect
            expect(result.validation.status).toBe('fail');
            expect(result.validation.errors.length).toBeGreaterThan(0);
        });
    });
});
