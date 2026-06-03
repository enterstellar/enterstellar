/**
 * @module @enterstellar-ai/cloud/__tests__/transport/idempotency.test
 * @description Tests for the ULID-based idempotency key generator.
 *
 * Validates:
 * - Output is exactly 26 characters (10 timestamp + 16 randomness).
 * - Characters are Crockford Base32 only.
 * - 1000 sequential keys are all unique.
 * - Keys are lexicographically sortable (timestamp prefix).
 *
 * @see Design Choice AM10 — `X-Idempotency-Key` on IPU-consuming requests.
 * @see Design Choice SD9 — zero external deps (hand-rolled ULID).
 */

import { describe, expect, it } from 'vitest';

import { generateIdempotencyKey } from '../../src/transport/idempotency.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Crockford Base32 character set (excludes I, L, O, U). */
const CROCKFORD_BASE32_REGEX = /^[0-9A-HJKMNP-TV-Z]+$/;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateIdempotencyKey', () => {
    it('generates a 26-character string', () => {
        const key = generateIdempotencyKey();
        expect(key).toHaveLength(26);
    });

    it('uses only Crockford Base32 characters', () => {
        const key = generateIdempotencyKey();
        expect(key).toMatch(CROCKFORD_BASE32_REGEX);
    });

    it('excludes ambiguous characters (I, L, O, U)', () => {
        // Generate many keys and verify none contain excluded chars.
        for (let i = 0; i < 100; i++) {
            const key = generateIdempotencyKey();
            expect(key).not.toMatch(/[ILOU]/);
        }
    });

    it('generates 1000 unique keys', () => {
        const keys = new Set<string>();

        for (let i = 0; i < 1000; i++) {
            keys.add(generateIdempotencyKey());
        }

        expect(keys.size).toBe(1000);
    });

    it('produces lexicographically sortable keys (timestamp prefix)', () => {
        // Keys generated at the same millisecond share a timestamp prefix.
        // Keys generated at different millisecond boundaries should sort correctly.
        const key1 = generateIdempotencyKey();

        // Wait briefly to ensure different timestamp.
        const start = Date.now();
        while (Date.now() === start) {
            // Busy-wait for millisecond boundary.
        }

        const key2 = generateIdempotencyKey();

        // The timestamp prefix (first 10 chars) of key2 should be >= key1.
        const ts1 = key1.substring(0, 10);
        const ts2 = key2.substring(0, 10);
        expect(ts2 >= ts1).toBe(true);
    });

    it('generates keys with consistent format across multiple calls', () => {
        for (let i = 0; i < 50; i++) {
            const key = generateIdempotencyKey();
            expect(key).toHaveLength(26);
            expect(key).toMatch(CROCKFORD_BASE32_REGEX);
        }
    });

    it('timestamp portion changes over time', () => {
        const key1 = generateIdempotencyKey();

        // Wait for at least 1ms.
        const start = Date.now();
        while (Date.now() === start) {
            // Busy-wait.
        }

        const key2 = generateIdempotencyKey();

        // Timestamp prefix (first 10 chars) should differ.
        const ts1 = key1.substring(0, 10);
        const ts2 = key2.substring(0, 10);
        expect(ts1).not.toBe(ts2);
    });
});
