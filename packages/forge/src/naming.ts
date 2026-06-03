/**
 * @module @enterstellar-ai/forge/naming
 * @description Deterministic naming for forged ComponentContracts.
 *
 * Forged contracts follow the naming convention:
 * ```
 * __forged_{slug}_{8-char-xxHash}
 * ```
 *
 * - `slug` — the intent string, slugified and truncated to 30 characters.
 * - `hash` — 8 hex characters from a pure-TypeScript xxHash32 implementation.
 *
 * xxHash was chosen over SHA-256 because it is ~10x faster for short strings
 * and cryptographic security is not required for fingerprinting (F13).
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript — no native deps.
 *
 * @see Design Choice F13 — xxHash, 8 hex chars, slug from intent.
 * @see Design Choice F14 — promoted contracts drop the `__forged_` prefix.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for the slugified intent portion of a forged name. */
const MAX_SLUG_LENGTH = 30;

/** Prefix for all forged component names. */
const FORGED_PREFIX = '__forged_';

// ---------------------------------------------------------------------------
// xxHash32 (pure TypeScript implementation)
// ---------------------------------------------------------------------------

/**
 * xxHash32 constants.
 * @see https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md
 */
const XXHASH_PRIME1 = 0x9e3779b1;
const XXHASH_PRIME2 = 0x85ebca77;
const XXHASH_PRIME3 = 0xc2b2ae3d;
const XXHASH_PRIME4 = 0x27d4eb2f;
const XXHASH_PRIME5 = 0x165667b1;

/**
 * 32-bit left rotate.
 *
 * @param value - The 32-bit integer to rotate.
 * @param bits - Number of bits to rotate left.
 * @returns The rotated value as a 32-bit integer.
 */
function rotl32(value: number, bits: number): number {
    return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * 32-bit multiply (JavaScript safe — avoids IEEE 754 precision loss).
 *
 * @param a - First 32-bit operand.
 * @param b - Second 32-bit operand.
 * @returns The lower 32 bits of `a * b`.
 */
function mul32(a: number, b: number): number {
    const al = a & 0xffff;
    const ah = (a >>> 16) & 0xffff;
    return (((ah * b + al * ((b >>> 16) & 0xffff)) << 16) + (al * (b & 0xffff))) >>> 0;
}

/**
 * Computes an xxHash32 digest of the input string and returns the lower
 * 8 hexadecimal characters.
 *
 * This is a pure TypeScript implementation — no native modules, no WebAssembly,
 * no external dependencies. Suitable for all platforms (L15).
 *
 * @param input - The string to hash.
 * @param seed - Optional seed value. Default: `0`.
 * @returns An 8-character lowercase hexadecimal string.
 *
 * @example
 * ```ts
 * xxHash8('show patient vitals'); // e.g., '7f3a90bc'
 * ```
 *
 * @see Design Choice F13 — xxHash, 8 hex chars.
 */
export function xxHash8(input: string, seed: number = 0): string {
    // Convert string to UTF-8 byte array
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const len = data.length;

    let h32: number;

    if (len >= 16) {
        let v1 = (seed + XXHASH_PRIME1 + XXHASH_PRIME2) >>> 0;
        let v2 = (seed + XXHASH_PRIME2) >>> 0;
        let v3 = seed >>> 0;
        let v4 = (seed - XXHASH_PRIME1) >>> 0;

        let offset = 0;
        const limit = len - 16;

        // Process 16-byte blocks
        while (offset <= limit) {
            v1 = mul32(rotl32((v1 + mul32(readU32(data, offset), XXHASH_PRIME2)) >>> 0, 13), XXHASH_PRIME1);
            offset += 4;
            v2 = mul32(rotl32((v2 + mul32(readU32(data, offset), XXHASH_PRIME2)) >>> 0, 13), XXHASH_PRIME1);
            offset += 4;
            v3 = mul32(rotl32((v3 + mul32(readU32(data, offset), XXHASH_PRIME2)) >>> 0, 13), XXHASH_PRIME1);
            offset += 4;
            v4 = mul32(rotl32((v4 + mul32(readU32(data, offset), XXHASH_PRIME2)) >>> 0, 13), XXHASH_PRIME1);
            offset += 4;
        }

        h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
    } else {
        h32 = (seed + XXHASH_PRIME5) >>> 0;
    }

    h32 = (h32 + len) >>> 0;

    // Process remaining 4-byte blocks
    let offset = len >= 16 ? len - (len % 16) : 0;
    while (offset + 4 <= len) {
        h32 = mul32(rotl32((h32 + mul32(readU32(data, offset), XXHASH_PRIME3)) >>> 0, 17), XXHASH_PRIME4);
        offset += 4;
    }

    // Process remaining bytes
    while (offset < len) {
        const byte = data[offset];
        if (byte !== undefined) {
            h32 = mul32(rotl32((h32 + mul32(byte, XXHASH_PRIME5)) >>> 0, 11), XXHASH_PRIME1);
        }
        offset += 1;
    }

    // Final avalanche
    h32 = mul32((h32 ^ (h32 >>> 15)), XXHASH_PRIME2);
    h32 = mul32((h32 ^ (h32 >>> 13)), XXHASH_PRIME3);
    h32 = (h32 ^ (h32 >>> 16)) >>> 0;

    return h32.toString(16).padStart(8, '0');
}

/**
 * Reads a little-endian 32-bit unsigned integer from a byte array.
 *
 * @param data - The byte array.
 * @param offset - The byte offset to start reading from.
 * @returns The 32-bit unsigned integer.
 */
function readU32(data: Uint8Array, offset: number): number {
    const b0 = data[offset] ?? 0;
    const b1 = data[offset + 1] ?? 0;
    const b2 = data[offset + 2] ?? 0;
    const b3 = data[offset + 3] ?? 0;
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

// ---------------------------------------------------------------------------
// Slug Generation
// ---------------------------------------------------------------------------

/**
 * Converts an intent string to a URL-safe, kebab-case slug.
 *
 * Processing steps:
 * 1. Convert to lowercase.
 * 2. Replace non-alphanumeric characters with hyphens.
 * 3. Collapse consecutive hyphens to a single hyphen.
 * 4. Trim leading/trailing hyphens.
 * 5. Truncate to {@link MAX_SLUG_LENGTH} characters.
 * 6. Remove any trailing hyphen from truncation.
 * 7. Fall back to `'unknown'` if the result is empty.
 *
 * @param intent - The raw intent string to slugify.
 * @returns A kebab-case slug, max 30 characters.
 *
 * @example
 * ```ts
 * slugifyIntent('Show Patient Treatment Comparison');
 * // → 'show-patient-treatment-comparis'
 *
 * slugifyIntent('');
 * // → 'unknown'
 * ```
 *
 * @see Design Choice F13 — slug from intent, truncated to 30 chars.
 */
export function slugifyIntent(intent: string): string {
    const slug = intent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/-$/g, '');

    return slug.length > 0 ? slug : 'unknown';
}

// ---------------------------------------------------------------------------
// Forged Name Generation
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic forged component name from an intent string.
 *
 * Format: `__forged_{slug}_{8-char-xxHash}`
 *
 * The slug is derived from the intent (slugified + truncated to 30 chars).
 * The hash is an 8-character xxHash32 hex digest of the raw intent.
 *
 * @param intent - The raw intent string.
 * @returns A deterministic forged name (e.g., `'__forged_treatment_comparison_7f3a90bc'`).
 *
 * @example
 * ```ts
 * generateForgedName('show treatment comparison');
 * // → '__forged_show-treatment-comparison_a1b2c3d4'
 * ```
 *
 * @see Design Choice F13 — `__forged_{name}_{8-char-hash}` convention.
 * @see Design Choice F14 — prefix dropped on promotion to registry.
 */
export function generateForgedName(intent: string): string {
    const slug = slugifyIntent(intent);
    const hash = xxHash8(intent);
    return `${FORGED_PREFIX}${slug}_${hash}`;
}
