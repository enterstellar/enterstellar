/**
 * @module @enterstellar-ai/compiler/__tests__/diff
 * @description Unit tests for the diff generator (snapshotProps, generateDiff).
 */

import { describe, it, expect } from 'vitest';

import { snapshotProps, generateDiff } from '../src/diff.js';

describe('snapshotProps', () => {
    it('creates a deep copy of props', () => {
        const original = { a: 1, nested: { b: 2 } };
        const snapshot = snapshotProps(original);

        expect(snapshot).toEqual(original);
        expect(snapshot).not.toBe(original);
        expect(snapshot['nested']).not.toBe(original.nested);
    });

    it('handles empty objects', () => {
        expect(snapshotProps({})).toEqual({});
    });
});

describe('generateDiff', () => {
    it('returns diff when includeDiff is true', () => {
        const raw = { riskLevel: 'high', unknown: true };
        const compiled = { riskLevel: 3 };
        const diff = generateDiff(raw, compiled, true);

        expect(diff).toBeDefined();
        expect(diff?.raw).toEqual(raw);
        expect(diff?.compiled).toEqual(compiled);
    });

    it('returns undefined when includeDiff is false', () => {
        const diff = generateDiff({ a: 1 }, { a: 1 }, false);
        expect(diff).toBeUndefined();
    });

    it('compiled is a deep copy (not a reference)', () => {
        const compiled = { a: { b: 1 } };
        const diff = generateDiff({}, compiled, true);

        expect(diff?.compiled).toEqual(compiled);
        expect(diff?.compiled).not.toBe(compiled);
    });
});
