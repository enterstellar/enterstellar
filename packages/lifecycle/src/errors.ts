/**
 * @module @enterstellar-ai/lifecycle/errors
 * @description Factory functions for lifecycle-specific Enterstellar errors.
 *
 * Each factory returns an `EnterstellarError` with the correct error code,
 * module attribution, recoverability flag, and descriptive message.
 *
 * Error codes used:
 * - `ENS-3002` — Agent timeout (recoverable via retry).
 * - `ENS-3003` — Invalid state transition (fatal — developer error).
 * - `ENS-3004` — Streaming fragment assembly failure (recoverable).
 * - `ENS-3005` — Lifecycle manager disposed while active (fatal).
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14 — error code ranges.
 */

import { EnterstellarError } from '@enterstellar-ai/types';

import type { LifecycleState } from './types.js';

// ---------------------------------------------------------------------------
// ENS-3002: Agent Timeout
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for agent timeout.
 *
 * Thrown when the lifecycle manager's loading timer expires before
 * the agent responds. Recoverable — the consumer can retry.
 *
 * @param timeoutMs - The timeout duration that was exceeded.
 * @returns An `EnterstellarError` with code `ENS-3002`.
 *
 * @example
 * ```ts
 * throw createAgentTimeoutError(30_000);
 * // EnterstellarError: ENS-3002 — Agent timeout after 30000ms.
 * ```
 */
export function createAgentTimeoutError(timeoutMs: number): EnterstellarError {
    return new EnterstellarError(
        'ENS-3002',
        'lifecycle',
        `Agent did not respond within ${String(timeoutMs)}ms. ` +
        'The zone will render its fallback component. ' +
        'Increase the timeout via the `timeoutMs` configuration option if this is expected.',
        true, // recoverable — retry is possible
    );
}

// ---------------------------------------------------------------------------
// ENS-3003: Invalid State Transition
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for an invalid lifecycle state transition.
 *
 * Thrown when `transition()` is called with a target state that is not
 * permitted from the current state. NOT recoverable — this is a
 * developer error indicating misuse of the lifecycle API.
 *
 * @param from - The current lifecycle state.
 * @param to - The attempted (invalid) target state.
 * @returns An `EnterstellarError` with code `ENS-3003`.
 *
 * @example
 * ```ts
 * throw createInvalidTransitionError('empty', 'streaming');
 * // EnterstellarError: ENS-3003 — Invalid lifecycle transition: "empty" → "streaming".
 * ```
 */
export function createInvalidTransitionError(
    from: LifecycleState,
    to: LifecycleState,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-3003',
        'lifecycle',
        `Invalid lifecycle transition: "${from}" → "${to}". ` +
        'Check the VALID_TRANSITIONS map in @enterstellar-ai/lifecycle/constants for permitted transitions. ' +
        'If the zone is in "empty" state, call reset() before transitioning.',
        false, // not recoverable — developer error
    );
}

// ---------------------------------------------------------------------------
// ENS-3004: Streaming Assembly Error
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for a streaming fragment assembly failure.
 *
 * Thrown when a `PropFragment` has a malformed path or the deep-set
 * operation fails. Recoverable — the streaming session can continue
 * with subsequent valid fragments.
 *
 * @param path - The malformed prop path that caused the error.
 * @param reason - A human-readable explanation of why the path is invalid.
 * @returns An `EnterstellarError` with code `ENS-3004`.
 *
 * @example
 * ```ts
 * throw createStreamingAssemblyError('[invalid', 'Unclosed bracket in path segment.');
 * // EnterstellarError: ENS-3004 — Failed to apply streaming fragment at path "[invalid".
 * ```
 */
export function createStreamingAssemblyError(path: string, reason: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-3004',
        'lifecycle',
        `Failed to apply streaming fragment at path "${path}". Reason: ${reason}`,
        true, // recoverable — subsequent fragments may succeed
    );
}

// ---------------------------------------------------------------------------
// ENS-3005: Lifecycle Manager Disposed
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for operations on a disposed lifecycle manager.
 *
 * Thrown when `transition()`, `on()`, or `reset()` is called after
 * `dispose()`. NOT recoverable — the manager must be re-created.
 *
 * @returns An `EnterstellarError` with code `ENS-3005`.
 *
 * @example
 * ```ts
 * throw createDisposedError();
 * // EnterstellarError: ENS-3005 — Cannot operate on a disposed LifecycleManager.
 * ```
 */
export function createDisposedError(): EnterstellarError {
    return new EnterstellarError(
        'ENS-3005',
        'lifecycle',
        'Cannot operate on a disposed LifecycleManager. ' +
        'Create a new instance via createLifecycleManager() after disposal.',
        false, // not recoverable — must re-create
    );
}

// ---------------------------------------------------------------------------
// ENS-3003: Max Retries Exceeded (variant)
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when the maximum retry count has been exceeded.
 *
 * Thrown when `transition('loading')` is called from `error` state
 * but the retry count has already reached `maxRetries`. NOT recoverable
 * via this manager instance — the zone should render its permanent fallback.
 *
 * @param maxRetries - The configured maximum retry count.
 * @returns An `EnterstellarError` with code `ENS-3003`.
 *
 * @example
 * ```ts
 * throw createMaxRetriesExceededError(3);
 * // EnterstellarError: ENS-3003 — Maximum retry attempts (3) exceeded.
 * ```
 */
export function createMaxRetriesExceededError(maxRetries: number): EnterstellarError {
    return new EnterstellarError(
        'ENS-3003',
        'lifecycle',
        `Maximum retry attempts (${String(maxRetries)}) exceeded. ` +
        'The zone will remain in error state. Call reset() to start a fresh lifecycle.',
        false, // not recoverable via retry
    );
}
