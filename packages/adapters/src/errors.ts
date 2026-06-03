/**
 * @module @enterstellar-ai/adapters/errors
 * @description Error factory functions for the adapters module.
 *
 * Every error is an `EnterstellarError` with:
 * - Machine-readable `code` (`ENS-7xxx`)
 * - Module identifier `'adapters'`
 * - `recoverable` flag per Enterstellar error taxonomy
 *
 * Error taxonomy:
 * - `ENS-7001` — ADAPTER_VALIDATION_FAILED: config missing required methods or invalid name
 *   (non-recoverable, developer misconfiguration)
 * - `ENS-7002` — ADAPTER_METHOD_ERROR: adapter method threw during execution (recoverable)
 * - `ENS-7003` — ADAPTER_QUERY_ERROR: DataAdapter query() failed (recoverable)
 * - `ENS-7004` — ADAPTER_MUTATION_ERROR: DataAdapter mutate() failed (recoverable)
 * - `ENS-7005` — ADAPTER_AUTH_ERROR: AuthAdapter session/role check failed (recoverable)
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice AD5 — wrap into EnterstellarError
 * @see Design Choice C14 — error code ranges
 */

import { EnterstellarError } from '@enterstellar-ai/types';

import type { AdapterType } from './types.js';

// ---------------------------------------------------------------------------
// ENS-7001: Adapter Validation Failed
// ---------------------------------------------------------------------------

/**
 * Creates an error for when an adapter config fails validation.
 *
 * This is a **non-recoverable** error — it indicates developer misconfiguration
 * (missing required methods, empty name, non-function fields). The consumer
 * must fix their adapter config before proceeding.
 *
 * @param adapterType - The adapter category that failed validation (e.g., `'auth'`, `'data'`).
 * @param reason - Human-readable explanation of what is invalid.
 * @returns An `EnterstellarError` with code `ENS-7001`.
 *
 * @example
 * ```ts
 * throw adapterValidationError('auth', 'Missing required method: getSession');
 * // EnterstellarError: Adapter validation failed for "auth": Missing required method: getSession
 * //   code: 'ENS-7001', module: 'adapters', recoverable: false
 * ```
 */
export function adapterValidationError(
    adapterType: AdapterType,
    reason: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-7001',
        'adapters',
        `Adapter validation failed for "${adapterType}": ${reason}`,
        false, // non-recoverable — developer misconfiguration
    );
}

// ---------------------------------------------------------------------------
// ENS-7002: Adapter Method Error
// ---------------------------------------------------------------------------

/**
 * Creates an error for when an adapter method throws during execution.
 *
 * This is a **recoverable** error — the underlying infrastructure may have
 * experienced a transient failure. The operation can be retried. The original
 * error is preserved in `cause` for debugging (AD5).
 *
 * @param adapterName - The adapter instance name (e.g., `'supabase-auth'`).
 * @param methodName - The method that threw (e.g., `'getSession'`, `'track'`).
 * @param cause - The original error thrown by the adapter implementation.
 * @returns An `EnterstellarError` with code `ENS-7002`.
 *
 * @example
 * ```ts
 * throw adapterMethodError('supabase-auth', 'getSession', originalError);
 * // EnterstellarError: Adapter "supabase-auth" method "getSession" threw.
 * //   code: 'ENS-7002', module: 'adapters', recoverable: true, cause: originalError
 * ```
 */
export function adapterMethodError(
    adapterName: string,
    methodName: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-7002',
        'adapters',
        `Adapter "${adapterName}" method "${methodName}" threw.`,
        true, // recoverable — transient infrastructure failure
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-7003: Adapter Query Error
// ---------------------------------------------------------------------------

/**
 * Creates an error for when a {@link DataAdapter}'s `query()` method fails.
 *
 * This is a **recoverable** error — the data source may be temporarily
 * unavailable. Specialized variant of `ENS-7002` that includes the
 * queried resource name for debugging.
 *
 * @param adapterName - The adapter instance name (e.g., `'supabase-data'`).
 * @param resource - The resource that was being queried (e.g., `'patients.vitals'`).
 * @param cause - The original error thrown by the query implementation.
 * @returns An `EnterstellarError` with code `ENS-7003`.
 *
 * @example
 * ```ts
 * throw adapterQueryError('supabase-data', 'patients.vitals', pgError);
 * // EnterstellarError: Adapter "supabase-data" query failed for resource "patients.vitals".
 * //   code: 'ENS-7003', module: 'adapters', recoverable: true, cause: pgError
 * ```
 */
export function adapterQueryError(
    adapterName: string,
    resource: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-7003',
        'adapters',
        `Adapter "${adapterName}" query failed for resource "${resource}".`,
        true, // recoverable — transient data source failure
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-7004: Adapter Mutation Error
// ---------------------------------------------------------------------------

/**
 * Creates an error for when a {@link DataAdapter}'s `mutate()` method fails.
 *
 * This is a **recoverable** error — the data source may be temporarily
 * unavailable. Specialized variant of `ENS-7002` that includes the
 * resource name and mutation action for debugging.
 *
 * @param adapterName - The adapter instance name (e.g., `'supabase-data'`).
 * @param resource - The resource being mutated (e.g., `'patients'`).
 * @param action - The mutation action that failed (`'create'`, `'update'`, or `'delete'`).
 * @param cause - The original error thrown by the mutation implementation.
 * @returns An `EnterstellarError` with code `ENS-7004`.
 *
 * @example
 * ```ts
 * throw adapterMutationError('supabase-data', 'patients', 'update', pgError);
 * // EnterstellarError: Adapter "supabase-data" mutation "update" failed for resource "patients".
 * //   code: 'ENS-7004', module: 'adapters', recoverable: true, cause: pgError
 * ```
 */
export function adapterMutationError(
    adapterName: string,
    resource: string,
    action: 'create' | 'update' | 'delete',
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-7004',
        'adapters',
        `Adapter "${adapterName}" mutation "${action}" failed for resource "${resource}".`,
        true, // recoverable — transient data source failure
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-7005: Adapter Auth Error
// ---------------------------------------------------------------------------

/**
 * Creates an error for when an {@link AuthAdapter}'s session or role check fails.
 *
 * This is a **recoverable** error — the auth provider may be temporarily
 * unavailable, or the session may have expired. Specialized variant of
 * `ENS-7002` for authentication operations.
 *
 * @param adapterName - The adapter instance name (e.g., `'clerk-auth'`).
 * @param operation - The auth operation that failed (e.g., `'getSession'`, `'hasRole'`).
 * @param cause - The original error thrown by the auth implementation.
 * @returns An `EnterstellarError` with code `ENS-7005`.
 *
 * @example
 * ```ts
 * throw adapterAuthError('clerk-auth', 'getSession', sessionExpiredError);
 * // EnterstellarError: Adapter "clerk-auth" auth operation "getSession" failed.
 * //   code: 'ENS-7005', module: 'adapters', recoverable: true, cause: sessionExpiredError
 * ```
 */
export function adapterAuthError(
    adapterName: string,
    operation: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-7005',
        'adapters',
        `Adapter "${adapterName}" auth operation "${operation}" failed.`,
        true, // recoverable — auth provider may be temporarily unavailable
        cause,
    );
}
