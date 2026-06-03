/**
 * @module @enterstellar-ai/registry/__tests__/merge-registries
 * @description Tests for `mergeRegistries()` — merging multiple registries,
 * cross-registry duplicate detection, and token conflict handling.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createRegistry, mergeRegistries } from '../src/index.js';
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
// Tests
// ---------------------------------------------------------------------------

describe('mergeRegistries()', () => {
    it('merges two registries into one', () => {
        const regA = createRegistry({ components: [makeContract('CompAlpha')] });
        const regB = createRegistry({ components: [makeContract('CompBeta')] });

        const merged = mergeRegistries(regA, regB);

        expect(merged.size).toBe(2);
        expect(merged.get('CompAlpha')).toBeDefined();
        expect(merged.get('CompBeta')).toBeDefined();
    });

    it('merges three or more registries', () => {
        const regA = createRegistry({ components: [makeContract('RegAComp')] });
        const regB = createRegistry({ components: [makeContract('RegBComp')] });
        const regC = createRegistry({ components: [makeContract('RegCComp')] });

        const merged = mergeRegistries(regA, regB, regC);

        expect(merged.size).toBe(3);
        expect(merged.list()).toEqual(['RegAComp', 'RegBComp', 'RegCComp']);
    });

    it('throws on cross-registry duplicate names (R10)', () => {
        const contract = makeContract('DuplicateName');
        const regA = createRegistry({ components: [contract] });
        const regB = createRegistry({ components: [contract] });

        expect(() => mergeRegistries(regA, regB)).toThrow(EnterstellarError);
        expect(() => mergeRegistries(regA, regB)).toThrow(/ENS-1001/);
    });

    it('merges design tokens with first-wins policy (R19)', () => {
        const regA = createRegistry({
            components: [],
            designTokens: { shared: 'token:from-a', onlyA: 'token:a-only' },
        });
        const regB = createRegistry({
            components: [],
            designTokens: { shared: 'token:from-b', onlyB: 'token:b-only' },
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const merged = mergeRegistries(regA, regB);
        const tokens = merged.getDesignTokens();

        // First-wins
        expect(tokens['shared']).toBe('token:from-a');
        // Both unique tokens present
        expect(tokens['onlyA']).toBe('token:a-only');
        expect(tokens['onlyB']).toBe('token:b-only');
        // Warning emitted for conflict
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('produces a functional registry (get, list, getManifest work)', () => {
        const regA = createRegistry({ components: [makeContract('FuncTestA')] });
        const regB = createRegistry({ components: [makeContract('FuncTestB')] });

        const merged = mergeRegistries(regA, regB);

        expect(merged.get('FuncTestA')?.name).toBe('FuncTestA');
        expect(merged.list()).toEqual(['FuncTestA', 'FuncTestB']);
        expect(merged.getManifest()).toHaveLength(2);
    });

    it('allows runtime register on merged registry', () => {
        const regA = createRegistry({ components: [makeContract('ExistingComp')] });
        const merged = mergeRegistries(regA);

        const newContract = makeContract('RuntimeMerge');
        merged.register(newContract);

        expect(merged.size).toBe(2);
        expect(merged.get('RuntimeMerge')).toBeDefined();
    });
});
