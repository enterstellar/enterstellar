/**
 * @module @enterstellar-ai/lifecycle/state-machine
 * @description Core finite state machine for zone lifecycle management.
 *
 * Implements the exhaustive transition map from LC2 as a deterministic,
 * framework-agnostic FSM. Every valid transition emits a `LifecycleEvent`
 * to registered listeners (L4). Invalid transitions throw `ENS-3003`.
 *
 * The FSM manages:
 * - State transitions with exhaustive validation.
 * - Loading-state timeout timer (LC3, default 30s).
 * - Retry count tracking with configurable limit (RE17).
 * - Clean disposal for zone unmount.
 *
 * @see Bible §4.8
 * @see Design Choices LC1 (custom FSM), LC2 (transition map), LC3 (timeout)
 */

import type {
    LifecycleState,
    LifecycleEvent,
    LifecycleTransitionContext,
    LifecycleListener,
    LifecycleManagerConfig,
    LifecycleManager,
} from './types.js';
import { VALID_TRANSITIONS } from './constants.js';
import {
    createInvalidTransitionError,
    createAgentTimeoutError,
    createDisposedError,
    createMaxRetriesExceededError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new lifecycle state machine.
 *
 * Returns a `LifecycleManager` plain object (not a class — R1 pattern).
 * The FSM starts in `idle` state and awaits an explicit `transition('loading')`
 * call to begin the lifecycle.
 *
 * @param config - Lifecycle timeout and retry configuration.
 * @returns A `LifecycleManager` instance.
 *
 * @example
 * ```ts
 * const fsm = createStateMachine({ timeoutMs: 30_000, maxRetries: 3 });
 * fsm.on((event) => console.log(`${event.from} → ${event.to}`));
 * fsm.transition('loading');
 * fsm.transition('streaming');
 * fsm.transition('ready');
 * ```
 *
 * @see Design Choice LC1 — custom FSM, ~100 lines, not xstate or React reducer.
 */
export function createStateMachine(config: LifecycleManagerConfig): LifecycleManager {
    // -----------------------------------------------------------------------
    // Internal State (closures — no `this` binding issues per R1)
    // -----------------------------------------------------------------------

    let currentState: LifecycleState = 'idle';
    let retryCount = 0;
    let isDisposed = false;
    let timeoutTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const listeners: Set<LifecycleListener> = new Set();

    // -----------------------------------------------------------------------
    // Internal Helpers
    // -----------------------------------------------------------------------

    /**
     * Validates that a transition from `currentState` to `to` is permitted.
     * Throws `ENS-3003` on invalid transition.
     */
    function validateTransition(to: LifecycleState): void {
        const allowed = VALID_TRANSITIONS[currentState];
        if (!allowed.includes(to)) {
            throw createInvalidTransitionError(currentState, to);
        }
    }

    /**
     * Emits a `LifecycleEvent` to all registered listeners.
     */
    function emit(from: LifecycleState, to: LifecycleState, context?: LifecycleTransitionContext): void {
        // Build event conditionally: exactOptionalPropertyTypes forbids assigning
        // `undefined` to the optional `context` field — we must omit it entirely.
        const base = { from, to, timestamp: Date.now() } as const;
        const event: LifecycleEvent = context !== undefined
            ? { ...base, context }
            : base;

        for (const listener of listeners) {
            listener(event);
        }
    }

    /**
     * Starts the loading timeout timer.
     * Transitions to `error` with `ENS-3002` if the timer fires.
     */
    function startTimeout(): void {
        clearTimeoutTimer();
        timeoutTimerId = globalThis.setTimeout(() => {
            // Guard: manager may have been disposed or transitioned while timer was pending
            if (isDisposed || currentState !== 'loading') {
                return;
            }
            const error = createAgentTimeoutError(config.timeoutMs);
            // Perform the timeout transition internally (bypass validateTransition — we know loading → error is valid)
            const from = currentState;
            currentState = 'error';
            emit(from, 'error', { error });
        }, config.timeoutMs);
    }

    /**
     * Clears the loading timeout timer if active.
     */
    function clearTimeoutTimer(): void {
        if (timeoutTimerId !== null) {
            globalThis.clearTimeout(timeoutTimerId);
            timeoutTimerId = null;
        }
    }

    /**
     * Asserts the manager has not been disposed.
     * Throws `ENS-3005` if disposed.
     */
    function assertNotDisposed(): void {
        if (isDisposed) {
            throw createDisposedError();
        }
    }

    // -----------------------------------------------------------------------
    // Public Interface
    // -----------------------------------------------------------------------

    const manager: LifecycleManager = {
        get state(): LifecycleState {
            return currentState;
        },

        get retryCount(): number {
            return retryCount;
        },

        get disposed(): boolean {
            return isDisposed;
        },

        transition(to: LifecycleState, context?: LifecycleTransitionContext): void {
            assertNotDisposed();

            // Special case: error → loading requires retry count check
            if (currentState === 'error' && to === 'loading') {
                if (retryCount >= config.maxRetries) {
                    throw createMaxRetriesExceededError(config.maxRetries);
                }
            }

            validateTransition(to);

            const from = currentState;
            currentState = to;

            // -------------------------------------------------------------------
            // Post-transition side effects
            // -------------------------------------------------------------------

            // Track retry count
            if (from === 'error' && to === 'loading') {
                retryCount += 1;
            }

            // Reset retry count on success
            if (to === 'ready') {
                retryCount = 0;
            }

            // Start timeout timer when entering loading
            if (to === 'loading') {
                startTimeout();
            }

            // Clear timeout timer when leaving loading
            if (from === 'loading') {
                clearTimeoutTimer();
            }

            // Enrich context with retry info for error → loading
            let enrichedContext = context;
            if (from === 'error' && to === 'loading') {
                enrichedContext = {
                    ...context,
                    retryAttempt: retryCount,
                };
            }

            emit(from, to, enrichedContext);
        },

        on(listener: LifecycleListener): () => void {
            assertNotDisposed();
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },

        reset(): void {
            assertNotDisposed();

            const from = currentState;
            clearTimeoutTimer();
            retryCount = 0;
            currentState = 'idle';

            // Only emit if we actually changed state
            if (from !== 'idle') {
                emit(from, 'idle');
            }
        },

        dispose(): void {
            if (isDisposed) {
                return; // Idempotent — dispose is safe to call multiple times
            }
            clearTimeoutTimer();
            listeners.clear();
            isDisposed = true;
        },
    };

    return manager;
}
