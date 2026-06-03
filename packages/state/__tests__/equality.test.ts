/**
 * @module @enterstellar-ai/state/__tests__/equality
 * @description Tests for `shallowEqual()` utility.
 *
 * Covers: primitives, NaN, +0/-0, null, undefined, arrays,
 * plain objects, nested references, and type mismatches.
 *
 * @see Design Choice S4 — shallow equality for subscriptions.
 */

import { describe, it, expect } from 'vitest';
import { shallowEqual } from '../src/equality.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('shallowEqual — primitives', () => {
    it('returns true for identical numbers', () => {
        expect(shallowEqual(42, 42)).toBe(true);
    });

    it('returns true for identical strings', () => {
        expect(shallowEqual('hello', 'hello')).toBe(true);
    });

    it('returns true for identical booleans', () => {
        expect(shallowEqual(true, true)).toBe(true);
    });

    it('returns false for different numbers', () => {
        expect(shallowEqual(1, 2)).toBe(false);
    });

    it('returns true for NaN === NaN (Object.is semantics)', () => {
        expect(shallowEqual(NaN, NaN)).toBe(true);
    });

    it('returns false for +0 vs -0 (Object.is semantics)', () => {
        expect(shallowEqual(+0, -0)).toBe(false);
    });

    it('returns true for null === null', () => {
        expect(shallowEqual(null, null)).toBe(true);
    });

    it('returns true for undefined === undefined', () => {
        expect(shallowEqual(undefined, undefined)).toBe(true);
    });

    it('returns false for null vs undefined', () => {
        expect(shallowEqual(null, undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

describe('shallowEqual — arrays', () => {
    it('returns true for identical empty arrays (by reference)', () => {
        const arr: unknown[] = [];
        expect(shallowEqual(arr, arr)).toBe(true);
    });

    it('returns true for structurally equal arrays', () => {
        expect(shallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it('returns false for arrays with different lengths', () => {
        expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('returns false for arrays with different elements', () => {
        expect(shallowEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    });

    it('compares nested objects by reference, not structure', () => {
        const inner = { a: 1 };
        expect(shallowEqual([inner], [inner])).toBe(true);
        expect(shallowEqual([{ a: 1 }], [{ a: 1 }])).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Plain Objects
// ---------------------------------------------------------------------------

describe('shallowEqual — plain objects', () => {
    it('returns true for identical empty objects (by reference)', () => {
        const obj = {};
        expect(shallowEqual(obj, obj)).toBe(true);
    });

    it('returns true for structurally equal objects', () => {
        expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    });

    it('returns false for objects with different key counts', () => {
        expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    it('returns false for objects with different values', () => {
        expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('returns false for objects with different keys', () => {
        expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('compares nested objects by reference, not structure', () => {
        const inner = { x: 1 };
        expect(shallowEqual({ a: inner }, { a: inner })).toBe(true);
        expect(shallowEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Type Mismatches
// ---------------------------------------------------------------------------

describe('shallowEqual — type mismatches', () => {
    it('returns false for array vs object', () => {
        expect(shallowEqual([1], { 0: 1 })).toBe(false);
    });

    it('returns false for string vs number', () => {
        expect(shallowEqual('1', 1)).toBe(false);
    });

    it('returns false for object vs null', () => {
        expect(shallowEqual({}, null)).toBe(false);
    });

    it('returns false for number vs null', () => {
        expect(shallowEqual(0, null)).toBe(false);
    });
});
