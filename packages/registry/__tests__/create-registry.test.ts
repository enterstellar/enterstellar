/**
 * @module @enterstellar-ai/registry/__tests__/create-registry
 * @description Tests for `createRegistry()` — all EnterstellarRegistry methods,
 * events, duplicate detection, design token merging, and validation.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createRegistry } from '../src/create-registry.js';
import { defineComponent } from '../src/define-component.js';
import type { ComponentContractInput } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeContract(name: string, overrides: Partial<ComponentContractInput> = {}) {
    return defineComponent({
        name,
        description: `Test component ${name}`,
        category: 'data-display',
        tags: ['test'],
        props: z.object({ value: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [],
        ...overrides,
    });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('createRegistry()', () => {
    it('creates a registry with initial components', () => {
        const registry = createRegistry({
            components: [makeContract('ComponentA'), makeContract('ComponentB')],
        });

        expect(registry.size).toBe(2);
    });

    it('creates an empty registry when no components provided', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.size).toBe(0);
    });

    it('throws on duplicate names in initial components', () => {
        const contract = makeContract('DuplicateTest');
        expect(() =>
            createRegistry({ components: [contract, contract] }),
        ).toThrow(EnterstellarError);
        expect(() =>
            createRegistry({ components: [contract, contract] }),
        ).toThrow(/ENS-1001/);
    });
});

// ---------------------------------------------------------------------------
// get()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.get()', () => {
    it('returns the contract for a registered component', () => {
        const contract = makeContract('TestComponent');
        const registry = createRegistry({ components: [contract] });

        const result = registry.get('TestComponent');
        expect(result).toBeDefined();
        expect(result?.name).toBe('TestComponent');
    });

    it('returns undefined for an unregistered name', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.get('NonExistent')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.list()', () => {
    it('returns sorted names of all registered components', () => {
        const registry = createRegistry({
            components: [
                makeContract('Zebra'),
                makeContract('Alpha'),
                makeContract('Mango'),
            ],
        });

        expect(registry.list()).toEqual(['Alpha', 'Mango', 'Zebra']);
    });

    it('returns an empty array when no components registered', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.list()).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// register()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.register()', () => {
    it('registers a new component at runtime', () => {
        const registry = createRegistry({ components: [] });
        const contract = makeContract('RuntimeComp');

        registry.register(contract);

        expect(registry.size).toBe(1);
        expect(registry.get('RuntimeComp')).toBeDefined();
    });

    it('throws on duplicate name (R10)', () => {
        const contract = makeContract('UniqueComp');
        const registry = createRegistry({ components: [contract] });

        expect(() => registry.register(contract)).toThrow(EnterstellarError);
        expect(() => registry.register(contract)).toThrow(/ENS-1001/);
    });

    it('emits register event (R18)', () => {
        const registry = createRegistry({ components: [] });
        const handler = vi.fn();
        registry.on('register', handler);

        const contract = makeContract('EventComp');
        registry.register(contract);

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(contract);
    });
});

// ---------------------------------------------------------------------------
// unregister()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.unregister()', () => {
    it('removes a registered component and returns true', () => {
        const contract = makeContract('ToRemove');
        const registry = createRegistry({ components: [contract] });

        expect(registry.unregister('ToRemove')).toBe(true);
        expect(registry.size).toBe(0);
        expect(registry.get('ToRemove')).toBeUndefined();
    });

    it('returns false for an unregistered name', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.unregister('NonExistent')).toBe(false);
    });

    it('emits unregister event (R18)', () => {
        const contract = makeContract('EventRemove');
        const registry = createRegistry({ components: [contract] });
        const handler = vi.fn();
        registry.on('unregister', handler);

        registry.unregister('EventRemove');

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(contract);
    });
});

// ---------------------------------------------------------------------------
// getManifest()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.getManifest()', () => {
    it('returns CompactManifestEntry[] for all registered components', () => {
        const registry = createRegistry({
            components: [
                makeContract('Alpha'),
                makeContract('Beta'),
            ],
        });

        const manifest = registry.getManifest();

        expect(manifest).toHaveLength(2);
        expect(manifest[0]?.name).toBe('Alpha');
        expect(manifest[1]?.name).toBe('Beta');
    });

    it('returns empty array for empty registry', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.getManifest()).toEqual([]);
    });

    it('includes prop summaries in manifest entries', () => {
        const registry = createRegistry({
            components: [
                makeContract('WithProps', {
                    props: z.object({
                        patientId: z.string(),
                        count: z.number(),
                    }),
                }),
            ],
        });

        const manifest = registry.getManifest();
        expect(manifest[0]?.props).toHaveProperty('patientId');
        expect(manifest[0]?.props).toHaveProperty('count');
    });
});

// ---------------------------------------------------------------------------
// getSchema()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.getSchema()', () => {
    it('returns the Zod schema for a registered component', () => {
        const propsSchema = z.object({ value: z.string() });
        const contract = makeContract('SchemaTest', { props: propsSchema });
        const registry = createRegistry({ components: [contract] });

        const schema = registry.getSchema('SchemaTest');
        expect(schema).toBeDefined();
        expect(schema?.safeParse({ value: 'test' }).success).toBe(true);
    });

    it('returns undefined for an unregistered name', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.getSchema('Missing')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getDesignTokens() (R19)
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.getDesignTokens()', () => {
    it('returns config-level design tokens', () => {
        const registry = createRegistry({
            components: [],
            designTokens: { danger: 'token:danger', cardBg: 'token:card-bg' },
        });

        const tokens = registry.getDesignTokens();
        expect(tokens['danger']).toBe('token:danger');
        expect(tokens['cardBg']).toBe('token:card-bg');
    });

    it('merges component-level tokens with config-level tokens', () => {
        const registry = createRegistry({
            components: [
                makeContract('WithTokens', { tokens: { compToken: 'token:comp-value' } }),
            ],
            designTokens: { configToken: 'token:config-value' },
        });

        const tokens = registry.getDesignTokens();
        expect(tokens['configToken']).toBe('token:config-value');
        expect(tokens['compToken']).toBe('token:comp-value');
    });

    it('applies first-wins on conflict and warns (R19)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const registry = createRegistry({
            components: [
                makeContract('CompA', { tokens: { shared: 'token:comp-a-value' } }),
                makeContract('CompB', { tokens: { shared: 'token:comp-b-value' } }),
            ],
        });

        const tokens = registry.getDesignTokens();
        expect(tokens['shared']).toBe('token:comp-a-value'); // First-wins
        expect(warnSpy).toHaveBeenCalledOnce();

        warnSpy.mockRestore();
    });

    it('returns empty object when no tokens defined', () => {
        const registry = createRegistry({ components: [] });
        expect(registry.getDesignTokens()).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.validate()', () => {
    it('returns valid result for a valid contract', () => {
        const contract = makeContract('ValidContract');
        const registry = createRegistry({ components: [] });

        const result = registry.validate(contract);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it('returns violations without throwing', () => {
        const contract = makeContract('InvalidContract');
        // Manually create a contract with bad data that bypasses defineComponent
        const badContract = {
            ...contract,
            name: 'lower_case',
            states: { loading: 'L', error: 'E', empty: 'Em', ready: 'WrongReady' },
        };

        const registry = createRegistry({ components: [] });
        const result = registry.validate(badContract);

        expect(result.valid).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// on() — Event System (R18)
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.on()', () => {
    it('returns an unsubscribe function', () => {
        const registry = createRegistry({ components: [] });
        const handler = vi.fn();

        const unsubscribe = registry.on('register', handler);
        expect(typeof unsubscribe).toBe('function');

        // Register triggers handler
        const contract = makeContract('EventTest1');
        registry.register(contract);
        expect(handler).toHaveBeenCalledOnce();

        // Unsubscribe
        unsubscribe();

        // Register again — handler should NOT be called
        const contract2 = makeContract('EventTest2');
        registry.register(contract2);
        expect(handler).toHaveBeenCalledOnce(); // Still 1, not 2
    });

    it('supports multiple listeners on the same event', () => {
        const registry = createRegistry({ components: [] });
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        registry.on('register', handler1);
        registry.on('register', handler2);

        registry.register(makeContract('MultiListener'));

        expect(handler1).toHaveBeenCalledOnce();
        expect(handler2).toHaveBeenCalledOnce();
    });
});

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe('EnterstellarRegistry.size', () => {
    it('reflects the current count of registered components', () => {
        const registry = createRegistry({
            components: [makeContract('SizeA'), makeContract('SizeB')],
        });

        expect(registry.size).toBe(2);

        registry.register(makeContract('SizeC'));
        expect(registry.size).toBe(3);

        registry.unregister('SizeA');
        expect(registry.size).toBe(2);
    });
});
