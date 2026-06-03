/**
 * @module @enterstellar-ai/contracts-shadcn/__tests__/smoke
 * @description Smoke tests for the `@enterstellar-ai/contracts-shadcn` package.
 *
 * Validates:
 * 1. `registerShadcnContracts` is exported and callable from the barrel.
 * 2. Calling with an empty component map `{}` returns `[]` (v0 scaffold).
 * 3. Return type is `readonly ComponentContract[]` (compile-time check).
 * 4. `ShadcnComponentMap` type is exported (compile-time check).
 *
 * @see Correction 7 Decision 2 — Code-Copy Libraries
 */

import { describe, it, expect } from 'vitest';

import type { ComponentContract } from '@enterstellar-ai/types';

import { registerShadcnContracts } from '../src/index.js';
import type { ShadcnComponentMap } from '../src/index.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/contracts-shadcn', () => {
    it('exports registerShadcnContracts as a function', () => {
        expect(typeof registerShadcnContracts).toBe('function');
    });

    it('returns an empty array when called with an empty component map (v0 scaffold)', () => {
        const result = registerShadcnContracts({});

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
    });

    it('return type is readonly ComponentContract[] (compile-time verification)', () => {
        // This test verifies at compile time that the return type of
        // registerShadcnContracts is assignable to readonly ComponentContract[].
        // If the types diverge, TypeScript will produce a compilation error.
        const contracts: readonly ComponentContract[] = registerShadcnContracts({});

        expect(Array.isArray(contracts)).toBe(true);
    });

    it('ShadcnComponentMap type is exported and usable', () => {
        // Compile-time verification: ShadcnComponentMap can be used to
        // type a variable. If the type export is missing, this file
        // will not compile.
        const map: ShadcnComponentMap = {};

        // The map is Partial — empty is valid.
        expect(Object.keys(map)).toHaveLength(0);
    });

    it('throws for unknown keys when SHADCN_CONTRACTS is empty', () => {
        // With production registration logic and empty SHADCN_CONTRACTS,
        // any key in the component map is "unknown" and triggers the
        // fuzzy-validated throw path.
        expect(() => registerShadcnContracts({
            Button: () => null,
        })).toThrow("'Button' is not a known shadcn contract.");
    });
});
