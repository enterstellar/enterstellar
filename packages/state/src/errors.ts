/**
 * @module @enterstellar-ai/state/errors
 * @description Error factories for `@enterstellar-ai/state`.
 *
 * All errors are `EnterstellarError` instances with codes in the `ENS-4xxx` range.
 * Error messages are prefixed with the code for grep-ability.
 *
 * | Code       | Scenario                                    | Recoverable |
 * | :--------- | :------------------------------------------ | :---------- |
 * | `ENS-4002` | Extension already registered                | No          |
 * | `ENS-4003` | Extension value fails Zod validation        | No          |
 * | `ENS-4004` | Unknown store key                           | No          |
 * | `ENS-4005` | Persistence adapter failure                 | Yes         |
 * | `ENS-4006` | Snapshot exceeds 1MB size limit             | No          |
 * | `ENS-4007` | Major version mismatch on restore           | No          |
 *
 * Note: `ENS-4001` is reserved for Forge generation errors.
 *
 * @see Coding Rules — Error Handling
 * @see Design Choices S5, S7, S9
 */

import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// ENS-4002 — Extension Already Registered
// ---------------------------------------------------------------------------

/**
 * Creates an error for attempting to register a duplicate store extension.
 *
 * @param name - The extension name that was already registered.
 * @returns An `EnterstellarError` with code `ENS-4002`.
 */
export function extensionAlreadyRegisteredError(name: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-4002',
        'state',
        `[ENS-4002] Extension "${name}" is already registered. Each extension name must be unique.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-4003 — Extension Validation Error
// ---------------------------------------------------------------------------

/**
 * Creates an error for a store extension value that fails Zod validation.
 *
 * @param name - The extension name whose value failed validation.
 * @param errors - The Zod validation error messages.
 * @returns An `EnterstellarError` with code `ENS-4003`.
 */
export function extensionValidationError(name: string, errors: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-4003',
        'state',
        `[ENS-4003] Value for extension "${name}" failed schema validation: ${errors}`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-4004 — Invalid Store Key
// ---------------------------------------------------------------------------

/**
 * Creates an error for accessing an unknown store key.
 *
 * The store has a fixed schema (`zones`, `traces`, `session`) plus
 * registered extensions. Accessing any other key is an error.
 *
 * @param key - The unknown key that was accessed.
 * @returns An `EnterstellarError` with code `ENS-4004`.
 */
export function invalidKeyError(key: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-4004',
        'state',
        `[ENS-4004] Unknown store key "${key}". Valid keys: "zones", "traceIds", "session", or a registered extension name.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-4005 — Persistence Error
// ---------------------------------------------------------------------------

/**
 * Creates an error for persistence adapter failures (load/save/clear).
 *
 * Persistence errors are recoverable — the store continues operating
 * from memory even when persistence fails.
 *
 * @param strategy - The persistence strategy that failed.
 * @param cause - The underlying error.
 * @returns An `EnterstellarError` with code `ENS-4005`.
 */
export function persistenceError(strategy: string, cause: unknown): EnterstellarError {
    return new EnterstellarError(
        'ENS-4005',
        'state',
        `[ENS-4005] Persistence adapter "${strategy}" failed. The store continues in memory. See cause for details.`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-4006 — Snapshot Size Limit Exceeded
// ---------------------------------------------------------------------------

/**
 * Creates an error when a snapshot exceeds the 1MB hard limit.
 *
 * @param sizeBytes - The actual snapshot size in bytes.
 * @returns An `EnterstellarError` with code `ENS-4006`.
 *
 * @see Design Choice S9 — 1MB hard limit.
 */
export function snapshotSizeLimitError(sizeBytes: number): EnterstellarError {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    return new EnterstellarError(
        'ENS-4006',
        'state',
        `[ENS-4006] Snapshot size (${sizeMB} MB) exceeds the 1 MB limit. Move large data to IndexedDB directly.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-4007 — Major Version Mismatch
// ---------------------------------------------------------------------------

/**
 * Creates an error when `restore()` receives a snapshot with a future
 * major version. Forward-compatible for minor versions (via `.passthrough()`),
 * but major version jumps are hard-rejected to prevent data loss.
 *
 * @param snapshotVersion - The version string from the snapshot.
 * @param currentVersion - The current `STATE_SCHEMA_VERSION`.
 * @returns An `EnterstellarError` with code `ENS-4007`.
 *
 * @see Design Choice S5 (amended v2).
 */
export function majorVersionMismatchError(
    snapshotVersion: string,
    currentVersion: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-4007',
        'state',
        `[ENS-4007] Cannot restore state from future version ${snapshotVersion}. Current schema version is ${currentVersion}. Please update Enterstellar.`,
        false,
    );
}
