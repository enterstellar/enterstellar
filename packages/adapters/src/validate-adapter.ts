/**
 * @module @enterstellar-ai/adapters/validate-adapter
 * @description Shared runtime validation for adapter configuration objects.
 *
 * Called by each `createXxxAdapter()` factory before wrapping the consumer's
 * implementation. Validates that:
 * - The config has a non-empty `name` string
 * - All required methods for the adapter type are present and are functions
 *
 * Throws `ENS-7001` (`adapterValidationError`) on any violation — this is a
 * non-recoverable developer error per Enterstellar error taxonomy.
 *
 * @see Coding Rules — Error Taxonomy (developer errors → fatal throw)
 * @see Design Choice AD1 — minimal but complete interfaces
 */

import { adapterValidationError } from './errors.js';
import type { AdapterType } from './types.js';

// ---------------------------------------------------------------------------
// Required Method Maps
// ---------------------------------------------------------------------------

/**
 * Maps each adapter type to the set of method names that the config
 * object MUST provide as function values.
 *
 * @remarks
 * These lists must stay in sync with the corresponding config types
 * in `types.ts` and the adapter interfaces in `@enterstellar-ai/types/adapters`.
 */
const REQUIRED_METHODS: Readonly<Record<AdapterType, readonly string[]>> = {
    auth: ['getSession', 'hasRole', 'onAuthChange'],
    data: ['query', 'mutate', 'subscribe'],
    error: ['report', 'shouldRetry', 'sanitize'],
    analytics: ['track', 'identify'],
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that an adapter config object has a valid name and all required methods.
 *
 * This function performs two checks:
 * 1. **Name check:** `config.name` must be a non-empty string.
 * 2. **Method check:** Every method listed in {@link REQUIRED_METHODS} for the
 *    given `adapterType` must be present on the config and be `typeof === 'function'`.
 *
 * Throws `ENS-7001` on the first validation failure encountered.
 *
 * @param adapterType - The adapter category being validated (e.g., `'auth'`, `'data'`).
 * @param config - The raw config object to validate.
 * @throws `EnterstellarError` with code `ENS-7001` if validation fails.
 *
 * @example
 * ```ts
 * // Valid — passes silently
 * validateAdapterConfig('auth', {
 *   name: 'supabase-auth',
 *   getSession: async () => null,
 *   hasRole: async () => false,
 *   onAuthChange: (cb) => () => {},
 * });
 *
 * // Invalid — throws ENS-7001
 * validateAdapterConfig('auth', { name: '', getSession: null });
 * // EnterstellarError: Adapter validation failed for "auth": "name" must be a non-empty string.
 * ```
 */
export function validateAdapterConfig(
    adapterType: AdapterType,
    config: Readonly<Record<string, unknown>>,
): void {
    // -----------------------------------------------------------------------
    // 1. Name validation
    // -----------------------------------------------------------------------
    const name = config['name'];

    if (typeof name !== 'string' || name.length === 0) {
        throw adapterValidationError(
            adapterType,
            '"name" must be a non-empty string.',
        );
    }

    // -----------------------------------------------------------------------
    // 2. Required method validation
    // -----------------------------------------------------------------------
    const requiredMethods = REQUIRED_METHODS[adapterType];

    for (const methodName of requiredMethods) {
        const method = config[methodName];

        if (typeof method !== 'function') {
            const receivedType = method === null ? 'null' : typeof method;
            throw adapterValidationError(
                adapterType,
                `Missing or invalid method "${methodName}". Expected function, received ${receivedType}.`,
            );
        }
    }
}
