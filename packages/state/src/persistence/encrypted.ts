/**
 * @module @enterstellar-ai/state/persistence/encrypted
 * @description AES-GCM encryption wrapper for persistence adapters.
 *
 * This is a **decorator** that wraps any `PersistenceAdapter` with transparent
 * AES-GCM encryption at rest. The consumer provides a `CryptoKey` via the
 * `EncryptionConfig.keySource` callback.
 *
 * Implementation details:
 * - Algorithm: AES-GCM (authenticated encryption with associated data).
 * - IV: 12 bytes (96 bits), randomly generated per write (NIST SP 800-38D).
 * - Storage format: `{ iv: string (base64), data: string (base64) }` — JSON object
 *   stored via the inner adapter.
 * - Decryption failure: returns `undefined` (treated as no persisted state).
 *
 * @see Design Choice S7 — optional AES-GCM encryption via Web Crypto API.
 */

import type { SerializedState } from '@enterstellar-ai/types';
import { SerializedStateSchema } from '@enterstellar-ai/types';
import type { PersistenceAdapter } from '../types.js';
import { persistenceError } from '../errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AES-GCM IV length in bytes (96 bits per NIST recommendation). */
const IV_LENGTH = 12;

/** Algorithm identifier for Web Crypto API. */
const ALGORITHM = 'AES-GCM';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a `Uint8Array` to a base64 string.
 * Uses the built-in `btoa()` available in all Enterstellar target environments.
 *
 * @param bytes - The byte array to encode.
 * @returns A base64-encoded string.
 */
function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
}

/**
 * Decodes a base64 string to a `Uint8Array`.
 *
 * @param base64 - The base64-encoded string.
 * @returns The decoded byte array.
 */
function fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// ---------------------------------------------------------------------------
// Encrypted Payload Shape
// ---------------------------------------------------------------------------

/**
 * The shape of data stored by the encrypted adapter.
 * The inner adapter stores this object instead of raw `SerializedState`.
 */
type EncryptedPayload = {
    /** Base64-encoded initialization vector (12 bytes). */
    readonly iv: string;
    /** Base64-encoded AES-GCM ciphertext. */
    readonly data: string;
};

/**
 * Type guard for `EncryptedPayload`.
 *
 * @param value - The value to check.
 * @returns `true` if the value is an `EncryptedPayload`.
 */
function isEncryptedPayload(value: unknown): value is EncryptedPayload {
    return (
        typeof value === 'object' &&
        value !== null &&
        'iv' in value &&
        'data' in value &&
        typeof (value as EncryptedPayload).iv === 'string' &&
        typeof (value as EncryptedPayload).data === 'string'
    );
}

// ---------------------------------------------------------------------------
// Encrypted Adapter
// ---------------------------------------------------------------------------

/**
 * Wraps a `PersistenceAdapter` with AES-GCM encryption.
 *
 * Every `save()` encrypts the state with a fresh random IV.
 * Every `load()` decrypts the stored ciphertext.
 * `clear()` delegates directly to the inner adapter.
 *
 * @param inner - The underlying adapter to wrap.
 * @param key - The AES-GCM `CryptoKey` for encryption/decryption.
 * @returns A `PersistenceAdapter` that transparently encrypts/decrypts.
 *
 * @example
 * ```ts
 * const inner = createLocalStorageAdapter();
 * const key = await deriveKey(password); // Consumer's key management
 * const adapter = createEncryptedAdapter(inner, key);
 * await adapter.save(state); // Encrypts, then saves to localStorage
 * ```
 */
export function createEncryptedAdapter(
    inner: PersistenceAdapter,
    key: CryptoKey,
): PersistenceAdapter {
    return {
        async load(): Promise<SerializedState | undefined> {
            try {
                const raw = await inner.load();
                if (raw === undefined) {
                    return undefined;
                }

                // The inner adapter stores the encrypted payload as SerializedState.
                // We need to check if it's actually an encrypted payload.
                if (!isEncryptedPayload(raw)) {
                    // Data is not encrypted — could be a migration from unencrypted.
                    // Validate as plain SerializedState and return.
                    const result = SerializedStateSchema.safeParse(raw);
                    if (result.success) {
                        return result.data as SerializedState;
                    }
                    return undefined;
                }

                // Decrypt the AES-GCM ciphertext
                const iv = fromBase64(raw.iv);
                const ciphertext = fromBase64(raw.data);

                const decryptedBuffer = await crypto.subtle.decrypt(
                    { name: ALGORITHM, iv: iv as BufferSource },
                    key,
                    ciphertext as BufferSource,
                );

                const decoder = new TextDecoder();
                const json = decoder.decode(decryptedBuffer);
                const parsed: unknown = JSON.parse(json);

                const result = SerializedStateSchema.safeParse(parsed);
                if (result.success) {
                    return result.data as SerializedState;
                }

                // Decrypted but invalid schema — treat as no state.
                return undefined;
            } catch {
                // Decryption failure, wrong key, corrupted data — no state.
                return undefined;
            }
        },

        async save(state: SerializedState): Promise<void> {
            try {
                // Serialize to JSON
                const encoder = new TextEncoder();
                const plaintext = encoder.encode(JSON.stringify(state));

                // Generate random IV (fresh per write)
                const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

                // Encrypt with AES-GCM
                const ciphertext = await crypto.subtle.encrypt(
                    { name: ALGORITHM, iv: iv as BufferSource },
                    key,
                    plaintext,
                );

                // Store as encrypted payload via inner adapter.
                const payload: EncryptedPayload = {
                    iv: toBase64(iv),
                    data: toBase64(new Uint8Array(ciphertext)),
                };

                // SAFETY: Double cast `as unknown as SerializedState` is intentional.
                // The `PersistenceAdapter` interface is typed to `SerializedState`, but
                // the encrypted adapter stores an opaque `EncryptedPayload` instead.
                // Introducing generics (`PersistenceAdapter<T>`) would break the shared
                // interface across all adapters. This is sound because:
                // 1. The encrypted adapter is the SOLE writer of this data.
                // 2. The encrypted adapter is the SOLE reader (via `load()` above).
                // 3. `load()` checks `isEncryptedPayload()` before decrypting.
                // 4. The inner adapter stores the payload opaquely — it never inspects it.
                await inner.save(payload as unknown as SerializedState);
            } catch (error: unknown) {
                throw persistenceError('encrypted', error);
            }
        },

        async clear(): Promise<void> {
            await inner.clear();
        },
    };
}
