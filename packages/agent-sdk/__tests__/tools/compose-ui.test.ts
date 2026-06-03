/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/compose-ui
 * @description Unit tests for `executeComposeUI()`.
 *
 * Verifies the `enterstellar_compose_ui` MCP tool:
 * - Valid zone assembly into a `UISpec`.
 * - Edge cases: empty zones, boundary determinism values.
 * - Validation errors: unknown component, invalid determinism, duplicate names.
 *
 * Uses a mock `AgentSDKRegistry` injected as a parameter.
 *
 * @see Design Choice AS3 — flat list, reference by name, determinism per zone.
 * @see Error ENS-8003 — compose failures.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { AgentSDKRegistry, AgentSDKComponentContract, ZoneSpec } from '../../src/types.js';
import { executeComposeUI } from '../../src/tools/compose-ui.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `AgentSDKRegistry` with configurable component lookup.
 *
 * @param knownComponents - Map of component name → contract. Names not in
 *    this map will return `undefined` from `get()`.
 */
function createMockRegistry(
    knownComponents: ReadonlyMap<string, AgentSDKComponentContract> = new Map(),
): AgentSDKRegistry {
    return {
        get: vi.fn((name: string) => knownComponents.get(name)),
        list: vi.fn(() => Array.from(knownComponents.values())),
    };
}

/**
 * Creates a mock `AgentSDKComponentContract` for testing.
 */
function createMockContract(name: string): AgentSDKComponentContract {
    return {
        name,
        category: 'data-display',
        description: `Test component ${name}`,
        tags: ['test'],
        props: { id: { type: 'string' } },
    };
}

/**
 * Creates a valid `ZoneSpec` for testing.
 */
function createZone(overrides: Partial<ZoneSpec> = {}): ZoneSpec {
    return {
        name: 'main',
        component: 'PatientVitals',
        props: {},
        determinism: 0.5,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeComposeUI', () => {
    const knownComponents = new Map<string, AgentSDKComponentContract>([
        ['PatientVitals', createMockContract('PatientVitals')],
        ['MedicationList', createMockContract('MedicationList')],
    ]);

    // -----------------------------------------------------------------------
    // Valid composition
    // -----------------------------------------------------------------------

    describe('valid composition', () => {
        it('returns a UISpec with the correct zone structure', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones: readonly ZoneSpec[] = [
                createZone({ name: 'main', component: 'PatientVitals', determinism: 0.5 }),
                createZone({ name: 'sidebar', component: 'MedicationList', determinism: 0.0 }),
            ];

            const spec = await executeComposeUI(registry, zones);

            expect(spec.zones).toHaveLength(2);
            expect(spec.zones[0]?.name).toBe('main');
            expect(spec.zones[0]?.component).toBe('PatientVitals');
            expect(spec.zones[1]?.name).toBe('sidebar');
            expect(spec.zones[1]?.component).toBe('MedicationList');
        });

        it('preserves props in zone assignments', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ props: { patientId: '123' } })];

            const spec = await executeComposeUI(registry, zones);

            expect(spec.zones[0]?.props).toEqual({ patientId: '123' });
        });

        it('preserves determinism values in zone assignments', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ determinism: 0.75 })];

            const spec = await executeComposeUI(registry, zones);

            expect(spec.zones[0]?.determinism).toBe(0.75);
        });
    });

    // -----------------------------------------------------------------------
    // Empty zones edge case
    // -----------------------------------------------------------------------

    describe('empty zones', () => {
        it('returns empty spec for empty zones array', async () => {
            const registry = createMockRegistry(knownComponents);

            const spec = await executeComposeUI(registry, []);

            expect(spec.zones).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // Determinism boundary values (T13)
    // -----------------------------------------------------------------------

    describe('determinism boundaries', () => {
        it('accepts determinism exactly 0.0 (fully locked)', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ determinism: 0.0 })];

            const spec = await executeComposeUI(registry, zones);

            expect(spec.zones[0]?.determinism).toBe(0.0);
        });

        it('accepts determinism exactly 1.0 (fully generative)', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ determinism: 1.0 })];

            const spec = await executeComposeUI(registry, zones);

            expect(spec.zones[0]?.determinism).toBe(1.0);
        });
    });

    // -----------------------------------------------------------------------
    // Validation errors (ENS-8003)
    // -----------------------------------------------------------------------

    describe('validation errors', () => {
        it('throws ENS-8003 for unknown component', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ component: 'NonExistent' })];

            try {
                await executeComposeUI(registry, zones);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8003');
                expect(enterstellarError.module).toBe('agent-sdk');
                expect(enterstellarError.recoverable).toBe(true);
                expect(enterstellarError.message).toContain('NonExistent');
            }
        });

        it('throws ENS-8003 for determinism below 0', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ determinism: -0.1 })];

            try {
                await executeComposeUI(registry, zones);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8003');
                expect(enterstellarError.message).toContain('-0.1');
            }
        });

        it('throws ENS-8003 for determinism above 1', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [createZone({ determinism: 1.5 })];

            try {
                await executeComposeUI(registry, zones);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8003');
                expect(enterstellarError.message).toContain('1.5');
            }
        });

        it('throws ENS-8003 for duplicate zone names', async () => {
            const registry = createMockRegistry(knownComponents);
            const zones = [
                createZone({ name: 'main', component: 'PatientVitals' }),
                createZone({ name: 'main', component: 'MedicationList' }),
            ];

            try {
                await executeComposeUI(registry, zones);
                expect.fail('Should have thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8003');
                expect(enterstellarError.message).toContain('Duplicate zone name');
                expect(enterstellarError.message).toContain('main');
            }
        });
    });
});
