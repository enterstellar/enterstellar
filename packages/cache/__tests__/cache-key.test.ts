/**
 * @module @enterstellar-ai/cache/__tests__/cache-key
 * @description Tests for `buildCacheKey()` and `extractComponentName()` —
 * deterministic key construction per Design Choice CA1.
 */

import { describe, it, expect } from 'vitest';

import { buildCacheKey, extractComponentName } from '../src/cache-key.js';

// ---------------------------------------------------------------------------
// buildCacheKey()
// ---------------------------------------------------------------------------

describe('buildCacheKey()', () => {
    it('produces a deterministic key from intentHash and componentName', () => {
        const key = buildCacheKey('abc123', 'PatientVitals');
        expect(key).toBe('abc123::PatientVitals');
    });

    it('produces different keys for different intents', () => {
        const key1 = buildCacheKey('hash-a', 'PatientVitals');
        const key2 = buildCacheKey('hash-b', 'PatientVitals');
        expect(key1).not.toBe(key2);
    });

    it('produces different keys for different components', () => {
        const key1 = buildCacheKey('same-hash', 'PatientVitals');
        const key2 = buildCacheKey('same-hash', 'MedicationList');
        expect(key1).not.toBe(key2);
    });

    it('is deterministic — same inputs always produce the same key', () => {
        const key1 = buildCacheKey('hash-x', 'ComponentA');
        const key2 = buildCacheKey('hash-x', 'ComponentA');
        expect(key1).toBe(key2);
    });

    it('handles empty intentHash', () => {
        const key = buildCacheKey('', 'Component');
        expect(key).toBe('::Component');
    });

    it('handles empty componentName', () => {
        const key = buildCacheKey('hash', '');
        expect(key).toBe('hash::');
    });

    it('handles both empty strings', () => {
        const key = buildCacheKey('', '');
        expect(key).toBe('::');
    });

    it('handles long SHA-256 hashes', () => {
        const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const key = buildCacheKey(sha256, 'PatientVitals');
        expect(key).toBe(`${sha256}::PatientVitals`);
    });

    it('handles special characters in hash', () => {
        const key = buildCacheKey('hash/with+special=chars', 'Component');
        expect(key).toBe('hash/with+special=chars::Component');
    });
});

// ---------------------------------------------------------------------------
// extractComponentName()
// ---------------------------------------------------------------------------

describe('extractComponentName()', () => {
    it('extracts the component name from a valid cache key', () => {
        const name = extractComponentName('abc123::PatientVitals');
        expect(name).toBe('PatientVitals');
    });

    it('returns undefined for a key without separator', () => {
        const name = extractComponentName('no-separator-here');
        expect(name).toBeUndefined();
    });

    it('handles empty component name portion', () => {
        const name = extractComponentName('hash::');
        expect(name).toBe('');
    });

    it('handles empty hash portion', () => {
        const name = extractComponentName('::Component');
        expect(name).toBe('Component');
    });

    it('handles multiple separators — uses first occurrence', () => {
        const name = extractComponentName('hash::Component::Extra');
        expect(name).toBe('Component::Extra');
    });

    it('roundtrips with buildCacheKey()', () => {
        const original = 'MyComponent';
        const key = buildCacheKey('some-hash', original);
        const extracted = extractComponentName(key);
        expect(extracted).toBe(original);
    });
});
