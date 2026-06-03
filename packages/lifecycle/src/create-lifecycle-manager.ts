/**
 * @module @enterstellar-ai/lifecycle/create-lifecycle-manager
 * @description Factory function for creating a `LifecycleManager` instance.
 *
 * Composes the core state machine with configuration defaults.
 * This is the primary public entry point for `@enterstellar-ai/lifecycle`.
 *
 * Follows the Enterstellar factory pattern (R1): returns a plain object with
 * closures, not a class instance. Consistent with `createCompiler()`,
 * `createRegistry()`, and all other Enterstellar module factories.
 *
 * @see Bible §4.8
 * @see Design Choices LC1–LC3, R1
 */

import type { LifecycleManagerConfig, LifecycleManager } from './types.js';
import { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from './constants.js';
import { createStateMachine } from './state-machine.js';

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------

/**
 * Merges a partial user config with defaults and validates the result.
 *
 * @param partial - Optional partial configuration from the consumer.
 * @returns A fully resolved `LifecycleManagerConfig`.
 *
 * @internal
 */
function resolveConfig(partial?: Partial<LifecycleManagerConfig>): LifecycleManagerConfig {
    const config: LifecycleManagerConfig = {
        timeoutMs: partial?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxRetries: partial?.maxRetries ?? DEFAULT_MAX_RETRIES,
    };

    return config;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new `LifecycleManager` instance.
 *
 * The lifecycle manager is a framework-agnostic finite state machine (L15)
 * that tracks zone lifecycle transitions with exhaustive validation (LC2),
 * configurable timeout (LC3), and retry limits (RE17).
 *
 * @param config - Optional partial configuration. Unspecified fields
 *   receive sensible defaults:
 *   - `timeoutMs`: 30000 (30 seconds, per LC3)
 *   - `maxRetries`: 3 (per RE17)
 *
 * @returns A `LifecycleManager` instance starting in `idle` state.
 *
 * @example
 * ```ts
 * import { createLifecycleManager } from '@enterstellar-ai/lifecycle';
 *
 * // With defaults (30s timeout, 3 retries)
 * const manager = createLifecycleManager();
 *
 * // With custom config
 * const customManager = createLifecycleManager({
 *   timeoutMs: 15_000,
 *   maxRetries: 5,
 * });
 *
 * // Subscribe to state changes (L4: Observable by Default)
 * const unsubscribe = manager.on((event) => {
 *   console.log(`Lifecycle: ${event.from} → ${event.to}`);
 * });
 *
 * // Drive the lifecycle
 * manager.transition('loading');   // idle → loading (starts timeout timer)
 * manager.transition('streaming'); // loading → streaming (clears timeout)
 * manager.transition('ready');     // streaming → ready (resets retry count)
 *
 * // Cleanup on zone unmount
 * unsubscribe();
 * manager.dispose();
 * ```
 *
 * @see Bible §4.8
 * @see Design Choice LC1 — custom FSM over xstate.
 * @see Design Choice LC3 — 30s default timeout.
 * @see Design Choice RE17 — 3 retries with exponential backoff.
 */
export function createLifecycleManager(config?: Partial<LifecycleManagerConfig>): LifecycleManager {
    const resolvedConfig = resolveConfig(config);
    return createStateMachine(resolvedConfig);
}
