/**
 * @module @enterstellar-ai/telemetry/hash
 * @description SHA-256 hashing for intent strings.
 *
 * Converts a raw intent string into a hex-encoded SHA-256 digest.
 * This ensures PII never leaves the device — only the hash is
 * included in the `ForgeSignal.intentHash` field.
 *
 * **Runtime compatibility:**
 * - Browser: Web Crypto API (`crypto.subtle.digest`)
 * - Cloudflare Workers: Web Crypto API (natively available)
 * - Node 18+: `globalThis.crypto.subtle` (available since Node 18)
 *
 * @see Design Choice TL3 — hashing happens in `record()`, caller passes raw intent.
 * @see Principle L15 — zero framework imports.
 */

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Converts an `ArrayBuffer` to a lowercase hex-encoded string.
 *
 * @param buffer - The raw hash digest bytes.
 * @returns Hex-encoded string (64 chars for SHA-256).
 */
function bufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const hexParts: string[] = [];

    for (let i = 0; i < bytes.length; i++) {
        // biome-ignore lint: Uint8Array index access is safe within bounds
        hexParts.push((bytes[i] as number).toString(16).padStart(2, '0'));
    }

    return hexParts.join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hash of a raw intent string.
 *
 * Returns a lowercase hex-encoded digest (64 characters).
 * The raw intent is **never** stored or transmitted — only the hash.
 *
 * @param rawIntent - The user's raw intent string to hash.
 * @returns A promise resolving to the hex-encoded SHA-256 digest.
 *
 * @example
 * ```ts
 * const hash = await hashIntent('show patient vitals');
 * // → 'a3f2b8c1d4e5f6...' (64 hex chars)
 * ```
 *
 * @throws {Error} If the Web Crypto API is unavailable in the runtime.
 * @see Design Choice TL3
 */
export async function hashIntent(rawIntent: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawIntent);

    // Web Crypto API is available in browsers, Cloudflare Workers, and Node 18+.
    // TypeScript types assume crypto always exists, but SSR / legacy Node may not have it.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (globalThis.crypto?.subtle !== undefined) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
        return bufferToHex(digest);
    }

    // This branch should never be reached in supported environments.
    // All target runtimes (browser, Workers, Node 18+) provide crypto.subtle.
    throw new Error(
        '@enterstellar-ai/telemetry: Web Crypto API (crypto.subtle) is unavailable. ' +
        'Enterstellar requires a runtime with Web Crypto support (browser, Node 18+, Cloudflare Workers).',
    );
}
