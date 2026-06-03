/**
 * @module @enterstellar-ai/registry/errors
 * @description Registry-specific error factories.
 *
 * Every error uses `EnterstellarError` from `@enterstellar-ai/types` with the `ENS-1xxx` code range.
 * Each code maps to one of the 10 registration-time validation rules.
 *
 * **Error philosophy:** Registration rule violations are developer errors —
 * they indicate a badly-configured contract. These are non-recoverable
 * (`recoverable: false`) and throw immediately at the call site per R5.
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14 — ~15 error codes across 5 ranges
 */

import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Error Code Constants
// ---------------------------------------------------------------------------

/**
 * Registry error code registry.
 *
 * Each constant maps to an `EnterstellarErrorCode` in the `ENS-1xxx` range.
 * The table below documents the exact message template and corresponding rule.
 *
 * | Code       | Rule | Scenario                                |
 * | :--------- | :--- | :-------------------------------------- |
 * | `ENS-1001` | R10  | Duplicate component name                |
 * | `ENS-1002` | R1   | Name not PascalCase                     |
 * | `ENS-1003` | R2   | Description exceeds 120 characters      |
 * | `ENS-1004` | R3   | Tags count outside 1–10 range           |
 * | `ENS-1005` | R4   | Missing required lifecycle state        |
 * | `ENS-1006` | R5   | `states.ready` not matching own name    |
 * | `ENS-1007` | R6   | Token value missing `token:` prefix     |
 * | `ENS-1008` | R7   | Props not a valid Zod schema            |
 * | `ENS-1009` | R8   | Invalid WAI-ARIA role                   |
 * | `ENS-1010` | R9   | Description is empty/missing            |
 */

// ---------------------------------------------------------------------------
// Error Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for a duplicate component name (R10).
 *
 * @param name - The component name that was already registered.
 * @returns An `EnterstellarError` with code `ENS-1001`.
 */
export function duplicateNameError(name: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-1001',
        'registry',
        `[ENS-1001] Duplicate component name: '${name}'. Each component name must be unique within the registry.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for a non-PascalCase component name (R1).
 *
 * @param name - The invalid component name.
 * @returns An `EnterstellarError` with code `ENS-1002`.
 */
export function invalidNameError(name: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-1002',
        'registry',
        `[ENS-1002] Component name must be PascalCase: got '${name}'. Names must start with an uppercase letter and contain only alphanumeric characters.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for a description exceeding 120 characters (R2).
 *
 * @param length - The actual length of the description.
 * @returns An `EnterstellarError` with code `ENS-1003`.
 */
export function descriptionTooLongError(length: number): EnterstellarError {
    return new EnterstellarError(
        'ENS-1003',
        'registry',
        `[ENS-1003] Description exceeds 120 characters (${String(length)}). Write a concise description — no auto-truncation.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for an invalid tag count (R3).
 * Tags must have between 1 and 10 entries.
 *
 * @param count - The actual number of tags provided.
 * @returns An `EnterstellarError` with code `ENS-1004`.
 */
export function invalidTagCountError(count: number): EnterstellarError {
    return new EnterstellarError(
        'ENS-1004',
        'registry',
        `[ENS-1004] Tags must have 1–10 entries, got ${String(count)}. Provide at least one semantic tag for matching.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for a missing required lifecycle state (R4).
 *
 * @param state - The name of the missing state (e.g., `'loading'`, `'error'`).
 * @returns An `EnterstellarError` with code `ENS-1005`.
 */
export function missingStateError(state: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-1005',
        'registry',
        `[ENS-1005] Missing required lifecycle state: '${state}'. All four states (loading, error, empty, ready) are required (L9).`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` when `states.ready` does not reference the
 * component's own name (R5).
 *
 * @param expected - The expected value (the component name).
 * @param received - The actual value found in `states.ready`.
 * @returns An `EnterstellarError` with code `ENS-1006`.
 */
export function invalidReadyStateError(expected: string, received: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-1006',
        'registry',
        `[ENS-1006] states.ready must reference the component's own name: expected '${expected}', got '${received}'.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for a token value missing the `token:` prefix (R6).
 *
 * @param key - The token key.
 * @param value - The invalid token value.
 * @returns An `EnterstellarError` with code `ENS-1007`.
 */
export function invalidTokenValueError(key: string, value: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-1007',
        'registry',
        `[ENS-1007] Token value must start with 'token:': key '${key}' has value '${value}'.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for props that are not a valid Zod schema (R7).
 *
 * @returns An `EnterstellarError` with code `ENS-1008`.
 */
export function invalidPropsSchemaError(): EnterstellarError {
    return new EnterstellarError(
        'ENS-1008',
        'registry',
        '[ENS-1008] Props must be a Zod schema with a safeParse method. Received a non-schema value.',
        false,
    );
}

/**
 * Creates an `EnterstellarError` for an invalid WAI-ARIA role (R8).
 *
 * @param role - The invalid ARIA role provided.
 * @returns An `EnterstellarError` with code `ENS-1009`.
 */
export function invalidAriaRoleError(role: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-1009',
        'registry',
        `[ENS-1009] Invalid WAI-ARIA role: '${role}'. Use a valid role from the WAI-ARIA specification.`,
        false,
    );
}

/**
 * Creates an `EnterstellarError` for a missing or empty description (R9).
 *
 * @returns An `EnterstellarError` with code `ENS-1010`.
 */
export function missingDescriptionError(): EnterstellarError {
    return new EnterstellarError(
        'ENS-1010',
        'registry',
        '[ENS-1010] Description is required. Provide a concise, human-readable description (max 120 characters).',
        false,
    );
}
