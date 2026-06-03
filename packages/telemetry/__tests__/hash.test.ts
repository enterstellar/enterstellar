/**
 * @module @enterstellar-ai/telemetry/__tests__/hash
 * @description Tests for SHA-256 intent hashing.
 *
 * Verifies determinism, uniqueness, edge cases (empty, unicode, long strings),
 * and correct hex output format per TL3.
 */

import { describe, expect, it } from 'vitest';

import { hashIntent } from '../src/hash.js';

describe('hashIntent', () => {
    it('produces a 64-character lowercase hex string', async () => {
        const result = await hashIntent('show patient vitals');

        expect(result).toHaveLength(64);
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same input always yields same hash', async () => {
        const input = 'book a flight to Berlin';
        const hash1 = await hashIntent(input);
        const hash2 = await hashIntent(input);

        expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', async () => {
        const hash1 = await hashIntent('show patient vitals');
        const hash2 = await hashIntent('show medication list');

        expect(hash1).not.toBe(hash2);
    });

    it('handles empty string input', async () => {
        // SHA-256 of empty string is a well-known constant:
        // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        const result = await hashIntent('');

        expect(result).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
    });

    it('handles unicode input', async () => {
        const result = await hashIntent('患者のバイタルを表示');

        expect(result).toHaveLength(64);
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('handles very long input strings', async () => {
        const longIntent = 'a'.repeat(10_000);
        const result = await hashIntent(longIntent);

        expect(result).toHaveLength(64);
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces the correct SHA-256 digest for a known non-empty input', async () => {
        // Pre-computed: echo -n "show patient vitals" | shasum -a 256
        const result = await hashIntent('show patient vitals');

        expect(result).toBe(
            '7c33bef98b6a42d06c7f6eee05140d3b7e6d7b0e4fa10a1cfa916bad5db79e0e',
        );
    });
});
