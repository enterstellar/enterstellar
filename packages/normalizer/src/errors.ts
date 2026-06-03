/**
 * @module @enterstellar-ai/normalizer/errors
 * @description Error factory functions for the normalizer module.
 *
 * Every error is an `EnterstellarError` with:
 * - Machine-readable `code` (`ENS-6xxx`)
 * - Module identifier `'normalizer'`
 * - `recoverable` flag per Enterstellar error taxonomy
 *
 * Error taxonomy:
 * - `ENS-6001` — UNKNOWN_PROTOCOL: no adapter can handle the event (non-recoverable, developer misconfiguration)
 * - `ENS-6002` — NORMALIZATION_FAILED: adapter threw during normalize() (recoverable)
 * - `ENS-6003` — INVALID_INTENT: assembled intent failed Zod validation (recoverable)
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14 — error code ranges
 */

import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Error Factories
// ---------------------------------------------------------------------------

/**
 * Creates an error for when no protocol adapter can handle the incoming event.
 *
 * This is a **non-recoverable** error — it indicates developer misconfiguration
 * (wrong adapters registered, unexpected event shape). The consumer must fix
 * their adapter configuration.
 *
 * @param event - The raw event that no adapter could handle.
 * @returns An `EnterstellarError` with code `ENS-6001`.
 *
 * @example
 * ```ts
 * throw createUnknownProtocolError({ type: 'unknown_event' });
 * // EnterstellarError: No protocol adapter can handle this event (object).
 * //   code: 'ENS-6001', module: 'normalizer', recoverable: false
 * ```
 */
export function createUnknownProtocolError(event: unknown): EnterstellarError {
    const eventType = typeof event === 'object' && event !== null && 'type' in event
        ? String((event as Record<string, unknown>)['type'])
        : typeof event;

    return new EnterstellarError(
        'ENS-6001',
        'normalizer',
        `No protocol adapter can handle this event. Event type: "${eventType}".`,
        false, // non-recoverable — developer misconfiguration
    );
}

/**
 * Creates an error for when an adapter's `normalize()` method throws.
 *
 * This is a **recoverable** error — the next event from the agent may
 * succeed. The original error is preserved in `cause` for debugging.
 *
 * @param protocol - The protocol identifier of the adapter that failed.
 * @param cause - The original error thrown by the adapter.
 * @returns An `EnterstellarError` with code `ENS-6002`.
 *
 * @example
 * ```ts
 * throw createNormalizationFailedError('ag-ui', new TypeError('missing field'));
 * // EnterstellarError: Normalization failed for protocol "ag-ui".
 * //   code: 'ENS-6002', module: 'normalizer', recoverable: true
 * ```
 */
export function createNormalizationFailedError(
    protocol: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-6002',
        'normalizer',
        `Normalization failed for protocol "${protocol}".`,
        true, // recoverable — next event may succeed
        cause,
    );
}

/**
 * Creates an error for when an assembled `ComponentIntent` fails
 * `ComponentIntentSchema` Zod validation.
 *
 * This is a **recoverable** error — the LLM produced a malformed output
 * that the adapter mapped to an invalid intent. The self-correction loop
 * at the compiler level may fix the next attempt.
 *
 * @param zodErrors - Formatted Zod error string describing validation failures.
 * @returns An `EnterstellarError` with code `ENS-6003`.
 *
 * @example
 * ```ts
 * throw createInvalidIntentError('Required at "component"; Expected number, received string at "confidence"');
 * // EnterstellarError: Assembled intent failed validation: Required at "component"...
 * //   code: 'ENS-6003', module: 'normalizer', recoverable: true
 * ```
 */
export function createInvalidIntentError(zodErrors: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-6003',
        'normalizer',
        `Assembled intent failed ComponentIntentSchema validation: ${zodErrors}`,
        true, // recoverable — malformed agent output
    );
}
