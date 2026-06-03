/**
 * @module @enterstellar-ai/adapters/create-error-adapter
 * @description Factory functions for creating validated `ErrorAdapter` instances.
 *
 * - `createErrorAdapter(config)` — wraps a consumer-provided implementation,
 *   validates config via {@link validateAdapterConfig}, and wraps every method
 *   in error handling per Design Choice AD5 (raw vendor errors never leak).
 *
 * - `createNoopErrorAdapter()` — returns a no-op adapter for testing and
 *   development when no real error tracking service is connected.
 *
 * Both factories return a plain object with closures (R1 pattern — no classes).
 *
 * @see Bible §4.15
 * @see Design Choice AD2 — all methods async (I/O + future-proofing)
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import type { ErrorAdapter } from '@enterstellar-ai/types';

import { adapterMethodError } from './errors.js';
import type { ErrorAdapterConfig } from './types.js';
import { validateAdapterConfig } from './validate-adapter.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a validated `ErrorAdapter` from consumer-provided config.
 *
 * The factory:
 * 1. Validates the config (name + required methods) — throws `ENS-7001` on failure.
 * 2. Wraps `report()` in async error handling → `ENS-7002` on throw.
 * 3. Wraps `shouldRetry()` in async error handling → `ENS-7002` on throw.
 * 4. Wraps `sanitize()` in async error handling → `ENS-7002` on throw.
 *
 * All three methods are async per AD2 — even `shouldRetry` and `sanitize`
 * which may seem synchronous in simple implementations, but production
 * adapters may require remote circuit breaker checks or external PII
 * detection services.
 *
 * Consumers never see raw vendor errors — all failures are `EnterstellarError` (AD5).
 *
 * @param config - The adapter implementation with a `name` and all required methods.
 * @returns A frozen `ErrorAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { createErrorAdapter } from '@enterstellar-ai/adapters';
 *
 * const errors = createErrorAdapter({
 *   name: 'sentry-error',
 *   report: async (error, context) => {
 *     Sentry.captureException(error, { extra: context });
 *   },
 *   shouldRetry: async (error, attempt) => attempt < 3 && isTransient(error),
 *   sanitize: async (error) => {
 *     const sanitized = new Error(error.message.replace(/SSN-\d+/g, '[REDACTED]'));
 *     sanitized.stack = error.stack;
 *     return sanitized;
 *   },
 * });
 * ```
 */
export function createErrorAdapter(config: ErrorAdapterConfig): ErrorAdapter {
    // -----------------------------------------------------------------------
    // Step 1: Validate config — throws ENS-7001 on failure
    // -----------------------------------------------------------------------
    validateAdapterConfig('error', config);

    const adapterName = config.name;

    // -----------------------------------------------------------------------
    // Step 2: Build wrapped adapter (plain object with closures — R1 pattern)
    // -----------------------------------------------------------------------
    const adapter: ErrorAdapter = {
        /**
         * Wrapped `report()` — catches vendor errors → `ENS-7002`.
         * If the error reporting service itself fails, the caller must know.
         */
        async report(
            error: Error,
            context?: Readonly<Record<string, unknown>>,
        ): Promise<void> {
            try {
                await config.report(error, context);
            } catch (reportError: unknown) {
                throw adapterMethodError(adapterName, 'report', reportError);
            }
        },

        /**
         * Wrapped `shouldRetry()` — catches vendor errors → `ENS-7002`.
         * Async per AD2: production implementations may consult remote
         * circuit breakers (LaunchDarkly, Unleash) before deciding.
         */
        async shouldRetry(error: Error, attemptNumber: number): Promise<boolean> {
            try {
                return await config.shouldRetry(error, attemptNumber);
            } catch (retryError: unknown) {
                throw adapterMethodError(adapterName, 'shouldRetry', retryError);
            }
        },

        /**
         * Wrapped `sanitize()` — catches vendor errors → `ENS-7002`.
         * Async per AD2: production implementations may call external
         * PII detection services (Google DLP, AWS Comprehend Medical).
         */
        async sanitize(error: Error): Promise<Error> {
            try {
                return await config.sanitize(error);
            } catch (sanitizeError: unknown) {
                throw adapterMethodError(adapterName, 'sanitize', sanitizeError);
            }
        },
    };

    // -----------------------------------------------------------------------
    // Step 3: Freeze and return — prevents accidental mutation (R4 pattern)
    // -----------------------------------------------------------------------
    return Object.freeze(adapter);
}

// ---------------------------------------------------------------------------
// No-Op Factory
// ---------------------------------------------------------------------------

/**
 * Creates a no-op `ErrorAdapter` for testing and development.
 *
 * All methods resolve to safe defaults:
 * - `report()` → void (errors silently consumed)
 * - `shouldRetry()` → `false` (never retry)
 * - `sanitize()` → returns error as-is (no transformation)
 *
 * @returns A frozen, no-op `ErrorAdapter` instance.
 *
 * @example
 * ```ts
 * import { createNoopErrorAdapter } from '@enterstellar-ai/adapters';
 *
 * const errors = createNoopErrorAdapter();
 * await errors.report(new Error('test')); // no-op
 * await errors.shouldRetry(new Error('test'), 1); // false
 * await errors.sanitize(new Error('test')); // returns same error
 * ```
 */
export function createNoopErrorAdapter(): ErrorAdapter {
    const adapter: ErrorAdapter = {
        /** No-op — errors silently consumed in noop mode. */
        async report(
            _error: Error,
            _context?: Readonly<Record<string, unknown>>,
        ): Promise<void> {
            // No-op — errors silently consumed in noop mode.
        },

        /** Returns `false` — never retry in noop mode. */
        shouldRetry(_error: Error, _attemptNumber: number): Promise<boolean> {
            return Promise.resolve(false);
        },

        /** Returns the original error unchanged — identity pass-through. */
        sanitize(error: Error): Promise<Error> {
            return Promise.resolve(error);
        },
    };

    return Object.freeze(adapter);
}
