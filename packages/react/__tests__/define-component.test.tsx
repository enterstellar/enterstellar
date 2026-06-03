/**
 * @module @enterstellar-ai/react/__tests__/define-enterstellar-component.test
 * @description Unit tests for `defineComponent()`.
 *
 * Covers:
 * - Creates a frozen `ComponentContract` via `defineComponent()`.
 * - Registers the renderer in the module-level `rendererRegistry`.
 * - Returns `{ contract, render }` — contract is frozen, render is same ref.
 * - Propagates validation errors from `defineComponent()`.
 *
 * @see Design Choice R4, R5, R6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

import { defineComponent } from '../src/define-component.js';
import { rendererRegistry } from '../src/renderer-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock React component. */
const MockRenderer = (_props: Record<string, unknown>) => null;

/** Valid contract input for testing. */
function validContractInput() {
    return {
        name: 'TestComponent',
        description: 'A test component for unit testing.',
        category: 'data-display' as const,
        tags: ['test', 'unit'],
        props: z.object({
            title: z.string(),
            count: z.number(),
        }),
        tokens: {},
        accessibility: {
            role: 'region' as const,
            ariaLabel: 'Test component',
            announceOnUpdate: false,
        },
        states: {
            loading: 'skeleton',
            ready: 'TestComponent',
            error: 'error-message',
            empty: 'empty-state',
        },
        examples: [],
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('defineComponent()', () => {
    beforeEach(() => {
        rendererRegistry.clear();
    });

    it('returns a frozen ComponentContract and the render function', () => {
        const result = defineComponent({
            contract: validContractInput(),
            render: MockRenderer,
        });

        // Contract is returned and frozen (R4)
        expect(result.contract).toBeDefined();
        expect(result.contract.name).toBe('TestComponent');
        expect(Object.isFrozen(result.contract)).toBe(true);

        // Render is the same reference
        expect(result.render).toBe(MockRenderer);
    });

    it('registers the renderer in the module-level rendererRegistry', () => {
        defineComponent({
            contract: validContractInput(),
            render: MockRenderer,
        });

        expect(rendererRegistry.has('TestComponent')).toBe(true);
        expect(rendererRegistry.get('TestComponent')).toBe(MockRenderer);
    });

    it('contract has all required fields from defineComponent()', () => {
        const { contract } = defineComponent({
            contract: validContractInput(),
            render: MockRenderer,
        });

        expect(contract.name).toBe('TestComponent');
        expect(contract.description).toBe('A test component for unit testing.');
        expect(contract.category).toBe('data-display');
        expect(contract.tags).toEqual(['test', 'unit']);
        expect(contract.props).toBeDefined();
        expect(contract.accessibility).toBeDefined();
        expect(contract.accessibility.role).toBe('region');
    });

    it('propagates EnterstellarError from defineComponent() on invalid contract', () => {
        expect(() =>
            defineComponent({
                contract: {
                    name: '', // Invalid: empty name (rule R1)
                    description: 'Bad component',
                    category: 'data-display' as const,
                    tags: [],
                    props: z.object({}),
                    tokens: {},
                    accessibility: { role: 'region' as const, ariaLabel: 'test', announceOnUpdate: false },
                    states: { loading: 'skeleton', ready: 'TestComponent', error: 'error', empty: 'empty' },
                    examples: [],
                } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- intentionally incomplete for error testing
                render: MockRenderer,
            }),
        ).toThrow(); // R5: fail-fast validation
    });

    it('overwrites renderer if calling twice with same name', () => {
        const Renderer1 = (_props: Record<string, unknown>) => null;
        const Renderer2 = (_props: Record<string, unknown>) => null;

        defineComponent({
            contract: validContractInput(),
            render: Renderer1,
        });

        defineComponent({
            contract: validContractInput(),
            render: Renderer2,
        });

        // Second registration wins (last-write-wins)
        expect(rendererRegistry.get('TestComponent')).toBe(Renderer2);
    });

    it('does not register renderer if contract validation fails', () => {
        try {
            defineComponent({
                contract: {
                    name: '', // Invalid
                    description: 'Bad',
                    category: 'data-display' as const,
                    tags: [],
                    props: z.object({}),
                    tokens: {},
                    accessibility: { role: 'region' as const, ariaLabel: 'test', announceOnUpdate: false },
                    states: { loading: 'skeleton', ready: 'TestComponent', error: 'error', empty: 'empty' },
                    examples: [],
                } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- intentionally incomplete for error testing
                render: MockRenderer,
            });
        } catch {
            // Expected to throw
        }

        // Renderer should NOT be registered (contract validation happens first)
        expect(rendererRegistry.has('')).toBe(false);
        expect(rendererRegistry.size).toBe(0);
    });
});
