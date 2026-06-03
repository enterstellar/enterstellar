/**
 * @module @enterstellar-ai/contracts-shadcn/__tests__/levenshtein
 * @description Tests for the Levenshtein distance and closest-match
 * utility functions used by fuzzy contract name validation.
 *
 * @see levenshteinDistance — core edit distance algorithm
 * @see findClosestMatch — threshold-based candidate matching
 */

import { describe, it, expect } from 'vitest';

import {
    levenshteinDistance,
    findClosestMatch,
} from '../src/utils/levenshtein.js';

// ---------------------------------------------------------------------------
// levenshteinDistance
// ---------------------------------------------------------------------------

describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
        expect(levenshteinDistance('Button', 'Button')).toBe(0);
    });

    it('returns 0 for two empty strings', () => {
        expect(levenshteinDistance('', '')).toBe(0);
    });

    it('returns the length of the other string when one is empty', () => {
        expect(levenshteinDistance('', 'Hello')).toBe(5);
        expect(levenshteinDistance('World', '')).toBe(5);
    });

    it('returns 1 for a single character substitution', () => {
        expect(levenshteinDistance('Button', 'Buttan')).toBe(1);
    });

    it('returns 1 for a single character deletion', () => {
        expect(levenshteinDistance('Button', 'Buttn')).toBe(1);
    });

    it('returns 1 for a single character insertion', () => {
        expect(levenshteinDistance('Card', 'Carrd')).toBe(1);
    });

    it('returns 2 for a transposition (swap)', () => {
        // 'Cadr' → 'Card' requires 2 operations (not just a swap)
        // in classic Levenshtein (Damerau-Levenshtein would be 1).
        expect(levenshteinDistance('Cadr', 'Card')).toBe(2);
    });

    it('returns correct distance for completely different strings', () => {
        expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    });

    it('returns correct distance for case-sensitive comparison', () => {
        // 'button' vs 'Button' differs in first character.
        expect(levenshteinDistance('button', 'Button')).toBe(1);
    });

    it('handles single-character strings', () => {
        expect(levenshteinDistance('a', 'b')).toBe(1);
        expect(levenshteinDistance('a', 'a')).toBe(0);
    });

    it('handles long strings correctly', () => {
        const a = 'AccordionTrigger';
        const b = 'AccordionContent';
        // These are quite different — should have a high distance.
        const dist = levenshteinDistance(a, b);
        expect(dist).toBeGreaterThan(3);
    });
});

// ---------------------------------------------------------------------------
// findClosestMatch
// ---------------------------------------------------------------------------

describe('findClosestMatch', () => {
    const candidates = ['Button', 'Card', 'Dialog', 'Input', 'Accordion'];

    it('returns exact match (distance 0)', () => {
        expect(findClosestMatch('Button', candidates)).toBe('Button');
    });

    it('returns closest match for 1-char typo', () => {
        expect(findClosestMatch('Buttn', candidates)).toBe('Button');
    });

    it('returns closest match for 2-char difference', () => {
        expect(findClosestMatch('Cadr', candidates)).toBe('Card');
    });

    it('returns closest match for prefix error', () => {
        expect(findClosestMatch('Inpt', candidates)).toBe('Input');
    });

    it('returns undefined when no candidate is within threshold', () => {
        expect(findClosestMatch('XyzAbcDef', candidates)).toBeUndefined();
    });

    it('returns undefined for an empty candidates array', () => {
        expect(findClosestMatch('Button', [])).toBeUndefined();
    });

    it('returns the first match when multiple candidates tie', () => {
        // Both 'ab' and 'ac' are distance 1 from 'aa'.
        const result = findClosestMatch('aa', ['ab', 'ac']);
        expect(result).toBe('ab'); // First encountered.
    });

    it('handles empty input string', () => {
        // Distance from '' to 'Card' is 4 (> threshold 3).
        expect(findClosestMatch('', candidates)).toBeUndefined();
    });

    it('handles single-character candidates', () => {
        const result = findClosestMatch('A', ['B', 'C', 'A']);
        expect(result).toBe('A'); // Exact match.
    });

    it('respects the threshold of 3', () => {
        // Distance from 'Dial' to 'Dialog' is 2 (within threshold).
        expect(findClosestMatch('Dial', candidates)).toBe('Dialog');

        // Distance from 'D' to 'Dialog' is 5 (exceeds threshold).
        expect(findClosestMatch('D', candidates)).toBeUndefined();
    });
});
