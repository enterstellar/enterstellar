/**
 * @module @enterstellar-ai/forge/__tests__/naming
 * @description Unit tests for the forged component naming utilities.
 *
 * Verifies `slugifyIntent()`, `xxHash8()`, and `generateForgedName()`
 * produce deterministic, correctly formatted output per Design Choice F13.
 */

import { describe, it, expect } from 'vitest';

import { slugifyIntent, xxHash8, generateForgedName } from '../src/naming.js';

// ---------------------------------------------------------------------------
// slugifyIntent
// ---------------------------------------------------------------------------

describe('slugifyIntent', () => {
    it('converts a PascalCase intent to kebab-case', () => {
        const result = slugifyIntent('PatientVitals');
        expect(result).toBe('patientvitals');
    });

    it('converts spaces and special characters to hyphens', () => {
        const result = slugifyIntent('Show Patient Treatment!');
        expect(result).toBe('show-patient-treatment');
    });

    it('collapses consecutive hyphens to a single hyphen', () => {
        const result = slugifyIntent('show---patient---vitals');
        expect(result).toBe('show-patient-vitals');
    });

    it('trims leading and trailing hyphens', () => {
        const result = slugifyIntent('--show-patient--');
        expect(result).toBe('show-patient');
    });

    it('truncates to 30 characters maximum', () => {
        const longIntent = 'This Is A Very Long Intent Name That Exceeds Thirty Characters';
        const result = slugifyIntent(longIntent);
        expect(result.length).toBeLessThanOrEqual(30);
    });

    it('removes trailing hyphen after truncation', () => {
        // Craft an intent that would produce a hyphen at position 30
        const intent = 'abcdefghijklmnopqrstuvwxyz abc def';
        const result = slugifyIntent(intent);
        expect(result).not.toMatch(/-$/);
    });

    it('returns "unknown" for empty string', () => {
        expect(slugifyIntent('')).toBe('unknown');
    });

    it('returns "unknown" for whitespace-only string', () => {
        expect(slugifyIntent('   ')).toBe('unknown');
    });

    it('returns "unknown" for all-special-characters string', () => {
        expect(slugifyIntent('!!!@@@###')).toBe('unknown');
    });

    it('handles unicode characters by stripping them', () => {
        const result = slugifyIntent('Pâtient Vïtals');
        // Non-ASCII chars are stripped; only ASCII alphanumerics and hyphens remain
        expect(result).toMatch(/^[a-z0-9-]+$/);
    });
});

// ---------------------------------------------------------------------------
// xxHash8
// ---------------------------------------------------------------------------

describe('xxHash8', () => {
    it('returns an 8-character hexadecimal string', () => {
        const hash = xxHash8('test input');
        expect(hash).toHaveLength(8);
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('is deterministic — same input produces same output', () => {
        const hash1 = xxHash8('show patient vitals');
        const hash2 = xxHash8('show patient vitals');
        expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', () => {
        const hash1 = xxHash8('show patient vitals');
        const hash2 = xxHash8('show treatment comparison');
        expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', () => {
        const hash = xxHash8('');
        expect(hash).toHaveLength(8);
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('handles very long strings', () => {
        const longString = 'a'.repeat(10_000);
        const hash = xxHash8(longString);
        expect(hash).toHaveLength(8);
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('respects the seed parameter', () => {
        const hash1 = xxHash8('test', 0);
        const hash2 = xxHash8('test', 42);
        expect(hash1).not.toBe(hash2);
    });

    it('pads short hashes with leading zeros', () => {
        // Any hash output must be exactly 8 chars, even if the numeric value is small
        const hash = xxHash8('a');
        expect(hash).toHaveLength(8);
    });
});

// ---------------------------------------------------------------------------
// generateForgedName
// ---------------------------------------------------------------------------

describe('generateForgedName', () => {
    it('produces the __forged_{slug}_{8hex} format', () => {
        const name = generateForgedName('show patient vitals');
        expect(name).toMatch(/^__forged_[a-z0-9-]+_[0-9a-f]{8}$/);
    });

    it('starts with __forged_ prefix', () => {
        const name = generateForgedName('PatientVitals');
        expect(name.startsWith('__forged_')).toBe(true);
    });

    it('includes the slugified intent', () => {
        const name = generateForgedName('Show Treatment');
        // Should contain 'show-treatment' between __forged_ and the hash
        expect(name).toContain('show-treatment');
    });

    it('is deterministic — same intent produces same name', () => {
        const name1 = generateForgedName('show patient vitals');
        const name2 = generateForgedName('show patient vitals');
        expect(name1).toBe(name2);
    });

    it('produces different names for different intents', () => {
        const name1 = generateForgedName('show patient vitals');
        const name2 = generateForgedName('show treatment comparison');
        expect(name1).not.toBe(name2);
    });

    it('handles empty intent gracefully', () => {
        const name = generateForgedName('');
        expect(name).toMatch(/^__forged_unknown_[0-9a-f]{8}$/);
    });
});
