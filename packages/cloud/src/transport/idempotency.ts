/**
 * @module @enterstellar-ai/cloud/transport/idempotency
 * @description Hand-rolled ULID generator for `X-Idempotency-Key` headers.
 *
 * Enterstellar Cloud requires an `X-Idempotency-Key` header on all IPU-consuming
 * requests (AM10). The server uses this key with `INSERT OR IGNORE` on
 * `(idempotency_key, project_id)` to prevent double-deduction when the
 * SDK retries failed requests (SD5).
 *
 * The key format is a standard ULID: 10 chars (48-bit ms timestamp) +
 * 16 chars (80-bit randomness) = 26 chars, Crockford Base32 encoded.
 *
 * **Why hand-rolled:** SD9 mandates zero external dependencies beyond
 * `eventsource-parser`. A ULID generator is < 30 LOC with the Web Crypto
 * API, which is available in all target runtimes (Node 19+, browsers,
 * Cloudflare Workers, Deno).
 *
 * **Monotonicity note:** Unlike a full ULID library, this implementation
 * does NOT guarantee monotonic ordering within the same millisecond.
 * Idempotency keys only need uniqueness, not strict ordering — the
 * timestamp prefix provides sufficient sortability for server-side
 * debugging and ledger queries.
 *
 * @see Design Choice AM10 — `X-Idempotency-Key` on all IPU-consuming requests.
 * @see Design Choice SD5 — blanket retry makes idempotency mandatory.
 * @see Design Choice AG16 — bare ULIDs for request IDs (same format).
 * @see Design Choice SD9 — zero external deps beyond `eventsource-parser`.
 */

// ---------------------------------------------------------------------------
// Crockford Base32 Encoding Table
// ---------------------------------------------------------------------------

/**
 * Crockford's Base32 alphabet (excludes I, L, O, U to avoid ambiguity).
 * Used by the ULID specification for human-friendly, case-insensitive encoding.
 *
 * @see https://www.crockford.com/base32.html
 */
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const;

// ---------------------------------------------------------------------------
// Timestamp Encoding
// ---------------------------------------------------------------------------

/**
 * Encodes a millisecond Unix timestamp into a 10-character Crockford Base32
 * string (ULID timestamp component).
 *
 * The ULID spec allocates 48 bits for the timestamp, which supports dates
 * up to the year 10889. The encoding produces exactly 10 characters by
 * extracting 5-bit chunks from the 48-bit value (most-significant first).
 *
 * @param timeMs - Unix timestamp in milliseconds (e.g., `Date.now()`).
 * @returns A 10-character Crockford Base32 string.
 *
 * @internal
 */
function encodeTimestamp(timeMs: number): string {
    let remaining = timeMs;
    const chars: string[] = new Array<string>(10);

    // Extract 10 characters (5 bits each = 50 bits, but only 48 are used).
    // Work from the least significant end to preserve leading zeros.
    for (let i = 9; i >= 0; i--) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- CROCKFORD_BASE32 has 32 entries, index is always 0-31
        chars[i] = CROCKFORD_BASE32[remaining & 0x1f]!;
        remaining = Math.floor(remaining / 32);
    }

    return chars.join('');
}

// ---------------------------------------------------------------------------
// Randomness Encoding
// ---------------------------------------------------------------------------

/**
 * Generates a 16-character Crockford Base32 string from 80 bits of
 * cryptographic randomness (ULID randomness component).
 *
 * Uses `crypto.getRandomValues()` for cryptographically secure random
 * bytes. 10 bytes = 80 bits → 16 Base32 characters (5 bits per char).
 *
 * @returns A 16-character Crockford Base32 string.
 *
 * @internal
 */
function encodeRandomness(): string {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);

    const chars: string[] = new Array<string>(16);

    // Convert 10 bytes (80 bits) into 16 Base32 characters (5 bits each).
    // Process bytes as a big-endian bitstream, extracting 5-bit chunks.
    // We use a sliding window approach over the byte array.
    let bitBuffer = 0;
    let bitsInBuffer = 0;
    let charIndex = 0;

    for (let byteIndex = 0; byteIndex < 10; byteIndex++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- byteIndex is bounded by loop
        bitBuffer = (bitBuffer << 8) | bytes[byteIndex]!;
        bitsInBuffer += 8;

        while (bitsInBuffer >= 5) {
            bitsInBuffer -= 5;
            const fiveBitValue = (bitBuffer >>> bitsInBuffer) & 0x1f;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fiveBitValue is always 0-31
            chars[charIndex] = CROCKFORD_BASE32[fiveBitValue]!;
            charIndex++;
        }
    }

    return chars.join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a ULID-format string for use as an `X-Idempotency-Key` header value.
 *
 * Produces a 26-character string: 10 chars (timestamp) + 16 chars (randomness),
 * encoded in Crockford Base32. The timestamp prefix enables chronological
 * sorting for server-side debugging. The randomness suffix guarantees
 * uniqueness across concurrent requests.
 *
 * **Collision probability:** With 80 bits of randomness per key, the
 * probability of collision is ~1 in 2^80 (effectively zero for any
 * practical request volume).
 *
 * @returns A 26-character Crockford Base32 ULID string.
 *
 * @example
 * ```ts
 * import { generateIdempotencyKey } from './transport/idempotency.js';
 *
 * const key = generateIdempotencyKey();
 * // → '01HYX4K8R3ABCDEFGHJKMNPQRS' (26 chars)
 *
 * headers['X-Idempotency-Key'] = key;
 * ```
 *
 * @see Design Choice AM10 — universal idempotency on IPU-consuming requests.
 */
export function generateIdempotencyKey(): string {
    return encodeTimestamp(Date.now()) + encodeRandomness();
}
