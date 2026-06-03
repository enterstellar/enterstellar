/**
 * @module @enterstellar-ai/connection/errors
 * @description Connection-specific error helper factories.
 *
 * All errors in `@enterstellar-ai/connection` are instances of `EnterstellarError` from
 * `@enterstellar-ai/types`, with `module: 'connection'` pre-filled. These helpers
 * eliminate boilerplate and enforce consistent error shape across the module.
 *
 * Error code range for connection: `ENS-3xxx` (lifecycle / zone / connection).
 *
 * | Code       | Scenario                                    | Recoverable |
 * | :--------- | :------------------------------------------ | :---------- |
 * | `ENS-3003` | Connection failed (timeout, create error)   | Yes         |
 * | `ENS-3004` | Send on disconnected transport              | No          |
 * | `ENS-3005` | Inbound message parse failure (bad JSON)    | Yes         |
 * | `ENS-3010` | Intent dropped due to backpressure          | Yes         |
 *
 * @internal Not exported from the public API surface.
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14 — Error codes with documentation URLs
 * @see Design Choice P5 — ENS-3010 backpressure warning
 */

import { EnterstellarError } from '@enterstellar-ai/types';
import type { EnterstellarErrorCode } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helper Factories
// ---------------------------------------------------------------------------

/**
 * Creates a connection-failed error (`ENS-3003`).
 *
 * Used when WebSocket or SSE transport fails to connect, either due to
 * a creation error or a connection timeout.
 *
 * @param message - Human-readable description of the failure.
 * @param cause - Optional underlying error that caused the failure.
 * @returns An `EnterstellarError` with code `ENS-3003`, recoverable.
 */
export function connectionFailedError(
    message: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError('ENS-3003', 'connection', message, true, cause);
}

/**
 * Creates a send-on-disconnected error (`ENS-3004`).
 *
 * Thrown when `send()` is called on a transport that is not connected.
 * This is a non-recoverable error — the caller must reconnect first.
 *
 * @param transport - The transport type that was disconnected (for diagnostics).
 * @returns An `EnterstellarError` with code `ENS-3004`, non-recoverable.
 */
export function sendDisconnectedError(transport: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-3004',
        'connection',
        `Cannot send: ${transport} transport is not connected.`,
        false,
    );
}

/**
 * Creates a message parse error (`ENS-3005`).
 *
 * Used when an inbound message from the agent cannot be parsed as JSON.
 * Recoverable — the connection stays alive, just this one message is dropped.
 *
 * @param transport - The transport type that received the bad message.
 * @param cause - The underlying JSON parse error.
 * @returns An `EnterstellarError` with code `ENS-3005`, recoverable.
 */
export function messageParseError(
    transport: string,
    cause: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-3005',
        'connection',
        `Failed to parse inbound ${transport} message as JSON.`,
        true,
        cause,
    );
}

/**
 * Creates a backpressure drop warning (`ENS-3010`).
 *
 * Emitted when an intent is dropped from the buffer because the buffer
 * is at capacity. The dropped intent's component name is included for
 * diagnostic visibility in DevTools and traces.
 *
 * @param componentName - The `component` field of the dropped `ComponentIntent`.
 * @returns An `EnterstellarError` with code `ENS-3010`, recoverable.
 *
 * @see Design Choice P5
 */
export function backpressureDropWarning(componentName: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-3010',
        'connection',
        `Intent for component "${componentName}" was dropped due to backpressure. ` +
        'Consider increasing backpressure.maxBuffer or processing intents faster.',
        true,
    );
}

/**
 * Creates a configuration validation error (`ENS-3001`).
 *
 * Thrown when `createAgentConnection()` receives invalid configuration.
 * This is a developer error — fatal, non-recoverable.
 *
 * @param message - Human-readable description of the invalid config.
 * @param cause - Optional Zod parse error for detailed field-level info.
 * @returns An `EnterstellarError` with code `ENS-3001`, non-recoverable.
 *
 * @see Coding Rules — Developer errors → fatal throw
 */
export function configValidationError(
    message: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError('ENS-3001', 'connection', message, false, cause);
}

// ---------------------------------------------------------------------------
// Error Code Constants
// ---------------------------------------------------------------------------

/**
 * All error codes used by the `@enterstellar-ai/connection` module.
 * Useful for programmatic error handling and filtering.
 */
export const CONNECTION_ERROR_CODES: readonly EnterstellarErrorCode[] = [
    'ENS-3001', // Invalid zone/connection config (developer error)
    'ENS-3003', // Connection failed (timeout, create error)
    'ENS-3004', // Send on disconnected transport
    'ENS-3005', // Inbound message parse failure
    'ENS-3010', // Intent dropped due to backpressure
] as const;
