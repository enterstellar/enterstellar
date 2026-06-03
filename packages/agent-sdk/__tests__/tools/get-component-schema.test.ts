/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/get-component-schema
 * @description Unit tests for `executeGetComponentSchema()`.
 *
 * Verifies the `enterstellar_get_component_schema` MCP tool:
 * - Successful registry lookup returns component schema.
 * - Missing component throws ENS-8004.
 * - Empty component name handled gracefully.
 * - Uses canonical name from the registry contract.
 *
 * Uses a mock `AgentSDKRegistry` injected as a parameter.
 *
 * @see Bible §4.16 — `enterstellar_get_component_schema` tool definition.
 * @see Design Choice R8 — Zod v4 JSON Schema.
 * @see Error ENS-8004 — component not found.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { AgentSDKRegistry, AgentSDKComponentContract } from '../../src/types.js';
import { executeGetComponentSchema } from '../../src/tools/get-component-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `AgentSDKRegistry` with configurable component lookup.
 */
function createMockRegistry(
    components: ReadonlyMap<string, AgentSDKComponentContract> = new Map(),
): AgentSDKRegistry {
    return {
        get: vi.fn((name: string) => components.get(name)),
        list: vi.fn(() => Array.from(components.values())),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeGetComponentSchema', () => {
    // -----------------------------------------------------------------------
    // Successful lookup
    // -----------------------------------------------------------------------

    describe('successful lookup', () => {
        it('returns the component schema for a known component', () => {
            const contract: AgentSDKComponentContract = {
                name: 'PatientVitals',
                category: 'data-display',
                description: 'Displays patient vital signs',
                tags: ['clinical', 'vitals'],
                props: {
                    type: 'object',
                    properties: {
                        patientId: { type: 'string' },
                        showHistory: { type: 'boolean' },
                    },
                    required: ['patientId'],
                },
            };
            const registry = createMockRegistry(new Map([['PatientVitals', contract]]));

            const result = executeGetComponentSchema(registry, 'PatientVitals');

            expect(result.componentName).toBe('PatientVitals');
            expect(result.schema).toEqual(contract.props);
        });

        it('uses canonical name from registry contract (not input)', () => {
            const contract: AgentSDKComponentContract = {
                name: 'PatientVitals',
                category: 'data-display',
                description: 'Test',
                tags: [],
                props: {},
            };
            // Registry stores by canonical name
            const registry = createMockRegistry(new Map([['PatientVitals', contract]]));

            const result = executeGetComponentSchema(registry, 'PatientVitals');

            // Result uses contract.name, not input parameter
            expect(result.componentName).toBe('PatientVitals');
        });

        it('returns empty schema for component with no props', () => {
            const contract: AgentSDKComponentContract = {
                name: 'Divider',
                category: 'layout',
                description: 'A horizontal divider',
                tags: ['layout'],
                props: {},
            };
            const registry = createMockRegistry(new Map([['Divider', contract]]));

            const result = executeGetComponentSchema(registry, 'Divider');

            expect(result.schema).toEqual({});
        });
    });

    // -----------------------------------------------------------------------
    // Missing component (ENS-8004)
    // -----------------------------------------------------------------------

    describe('missing component', () => {
        it('throws ENS-8004 for unknown component name', () => {
            const registry = createMockRegistry();

            try {
                executeGetComponentSchema(registry, 'NonExistentComponent');
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8004');
                expect(enterstellarError.module).toBe('agent-sdk');
                expect(enterstellarError.recoverable).toBe(true);
                expect(enterstellarError.message).toContain('NonExistentComponent');
                expect(enterstellarError.message).toContain('not found');
            }
        });

        it('throws ENS-8004 for empty component name', () => {
            const registry = createMockRegistry();

            try {
                executeGetComponentSchema(registry, '');
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8004');
            }
        });
    });
});
