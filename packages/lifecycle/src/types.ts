/**
 * @module @enterstellar-ai/lifecycle/types
 * @description Module-local types for the lifecycle state machine.
 *
 * Defines the vocabulary for lifecycle management: states, transitions,
 * events, configuration, and the public `LifecycleManager` interface.
 *
 * These types are re-exported from `@enterstellar-ai/lifecycle`'s barrel but are
 * NOT re-exported from `@enterstellar-ai/types` — they are internal to this module.
 *
 * @see Bible §4.8
 * @see Design Choices LC1–LC9
 */

import type { z } from 'zod';

import type { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// State Definitions
// ---------------------------------------------------------------------------

/**
 * The 6 lifecycle states of an Enterstellar zone.
 *
 * - `idle` — Initial state before activation.
 * - `loading` — Agent has been called, awaiting response.
 * - `streaming` — Receiving incremental prop fragments from the agent.
 * - `ready` — All required props are present and validated. Component is rendered.
 * - `error` — An error occurred (timeout, compilation failure, network).
 * - `empty` — Agent responded with no data. Terminal until zone re-mount.
 *
 * @see Design Choice LC2 — valid transition map.
 */
export type LifecycleState =
    | 'idle'
    | 'loading'
    | 'streaming'
    | 'ready'
    | 'error'
    | 'empty';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/**
 * Optional context carried with a lifecycle state transition.
 *
 * Only relevant fields are populated:
 * - `error` is present when transitioning to `'error'` state.
 * - `retryAttempt` is present when transitioning from `'error'` to `'loading'`.
 */
export type LifecycleTransitionContext = {
    /**
     * The error that caused the transition to `'error'` state.
     * Undefined for all other transitions.
     */
    readonly error?: EnterstellarError;

    /**
     * The current retry attempt number (1-indexed).
     * Present when transitioning `error → loading`.
     */
    readonly retryAttempt?: number;
};

/**
 * A structured event emitted on every lifecycle state transition.
 *
 * Every valid transition emits exactly one `LifecycleEvent` to all
 * registered listeners. This satisfies L4 (Observable by Default).
 *
 * @see Principle L4
 */
export type LifecycleEvent = {
    /** The state before the transition. */
    readonly from: LifecycleState;
    /** The state after the transition. */
    readonly to: LifecycleState;
    /** Unix timestamp (ms) when the transition occurred. */
    readonly timestamp: number;
    /** Optional context for the transition. */
    readonly context?: LifecycleTransitionContext;
};

/**
 * Callback function for lifecycle event subscriptions.
 *
 * @param event - The lifecycle event emitted on state transition.
 */
export type LifecycleListener = (event: LifecycleEvent) => void;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration options for the lifecycle manager.
 *
 * @see Design Choice LC3 — default timeout 30s.
 * @see Design Choice RE17 — default 3 retries with exponential backoff.
 */
export type LifecycleManagerConfig = {
    /**
     * Maximum time in milliseconds to wait in `loading` state before
     * transitioning to `error` with `ENS-3002`.
     *
     * Default: 30000 (30 seconds).
     *
     * @see Design Choice LC3
     */
    readonly timeoutMs: number;

    /**
     * Maximum number of retry attempts allowed (error → loading).
     * After this limit, `transition('loading')` from `error` throws.
     *
     * Default: 3.
     *
     * @see Design Choice RE17
     */
    readonly maxRetries: number;
};

// ---------------------------------------------------------------------------
// Streaming Types
// ---------------------------------------------------------------------------

/**
 * A path-based prop fragment received during streaming.
 *
 * The `path` uses dot-notation with bracket syntax for arrays:
 * - `'title'` → sets `{ title: value }`
 * - `'metrics[0].value'` → sets `{ metrics: [{ value: ... }] }`
 *
 * @see Design Choice LC4 — raw prop fragments with path-based updates.
 */
export type PropFragment = {
    /** Dot-notation path to the prop field being set. */
    readonly path: string;
    /** The value to assign at the given path. */
    readonly value: unknown;
};

// ---------------------------------------------------------------------------
// StreamingAssembler Interface
// ---------------------------------------------------------------------------

/**
 * Accumulates streaming prop fragments into a complete props object.
 *
 * The assembler is responsible for:
 * 1. Applying path-based prop fragments (LC4).
 * 2. Checking structural completeness via Zod schema validation (LC5).
 * 3. Providing no optimistic defaults — missing fields stay missing (LC6).
 *
 * @see Design Choices LC4, LC5, LC6
 */
export interface StreamingAssembler {
    /**
     * Apply a single prop fragment to the accumulated state.
     *
     * @param fragment - The path-based prop fragment to apply.
     * @throws `EnterstellarError` with code `ENS-3004` if the path is malformed.
     */
    apply(fragment: PropFragment): void;

    /**
     * Apply multiple prop fragments at once.
     *
     * @param fragments - Readonly array of fragments to apply in order.
     * @throws `EnterstellarError` with code `ENS-3004` if any path is malformed.
     */
    applyBatch(fragments: readonly PropFragment[]): void;

    /**
     * Returns a deep copy of the currently accumulated props.
     *
     * @returns The accumulated props object.
     */
    getAccumulated(): Record<string, unknown>;

    /**
     * Check whether the accumulated props satisfy the given Zod schema.
     *
     * Uses `schema.safeParse()` — returns `true` only when ALL required
     * fields are present and valid. No optimistic defaults (LC6).
     *
     * @param schema - The Zod schema to validate against.
     * @returns `true` if the accumulated props pass validation.
     *
     * @see Design Choice LC5 — structural completeness via Zod.
     * @see Design Choice LC6 — no optimistic defaults.
     */
    isComplete(schema: z.ZodType): boolean;

    /**
     * Reset the accumulated state to an empty object.
     * Called when the lifecycle resets or a new streaming session starts.
     */
    reset(): void;
}

// ---------------------------------------------------------------------------
// LifecycleManager Interface
// ---------------------------------------------------------------------------

/**
 * The public interface for managing zone lifecycle state.
 *
 * Created via `createLifecycleManager()`. Provides:
 * - Deterministic state transitions with exhaustive validation (LC1, LC2).
 * - Event emission on every transition (L4).
 * - Configurable timeout and retry limits (LC3, RE17).
 * - Clean disposal for zone unmount.
 *
 * This is a framework-agnostic engine component (L15). It has NO React,
 * Vue, or DOM dependencies. `@enterstellar-ai/react` wraps it in hooks.
 *
 * @see Bible §4.8
 * @see Design Choices LC1–LC9
 */
export interface LifecycleManager {
    /**
     * The current lifecycle state.
     * Read-only — state changes only via `transition()`.
     */
    readonly state: LifecycleState;

    /**
     * The number of retry attempts that have occurred.
     * Increments on each `error → loading` transition.
     * Resets to 0 when reaching `ready` state.
     */
    readonly retryCount: number;

    /**
     * Whether this manager has been disposed.
     * Once `true`, all method calls except reading `state` and
     * `disposed` will throw `ENS-3005`.
     */
    readonly disposed: boolean;

    /**
     * Transition to a new lifecycle state.
     *
     * Validates the transition against the exhaustive transition map (LC2).
     * Emits a `LifecycleEvent` to all registered listeners on success.
     *
     * @param to - The target lifecycle state.
     * @param context - Optional context for the transition (error details, retry info).
     * @throws `EnterstellarError` with code `ENS-3003` if the transition is invalid.
     * @throws `EnterstellarError` with code `ENS-3005` if the manager is disposed.
     */
    transition(to: LifecycleState, context?: LifecycleTransitionContext): void;

    /**
     * Subscribe to lifecycle state transition events.
     *
     * @param listener - Callback invoked on every valid state transition.
     * @returns An unsubscribe function. Call it to remove the listener.
     */
    on(listener: LifecycleListener): () => void;

    /**
     * Reset the lifecycle manager to `idle` state.
     *
     * Clears the timeout timer, resets retry count to 0, and emits
     * a transition event from the current state to `idle`.
     * Used when a zone unmounts and remounts.
     */
    reset(): void;

    /**
     * Dispose the lifecycle manager.
     *
     * Clears all timers, removes all listeners, and marks the manager
     * as disposed. Subsequent calls to `transition()`, `on()`, or
     * `reset()` will throw `ENS-3005`.
     */
    dispose(): void;
}
