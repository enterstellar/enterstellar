/**
 * @module @enterstellar-ai/lifecycle/constants
 * @description Default configuration values and the exhaustive state transition map.
 *
 * The transition map is the single source of truth for valid lifecycle
 * state transitions. It is consumed by `state-machine.ts` for validation.
 *
 * @see Design Choice LC2 — valid transition map.
 * @see Design Choice LC3 — default timeout 30s.
 * @see Design Choice RE17 — default 3 retries.
 */

import type { LifecycleState } from './types.js';

// ---------------------------------------------------------------------------
// Transition Map
// ---------------------------------------------------------------------------

/**
 * Exhaustive map of valid lifecycle state transitions.
 *
 * Each key is a source state, and the corresponding value is a readonly
 * tuple of permitted target states. Any transition not listed here is
 * invalid and will cause `ENS-3003` to be thrown.
 *
 * Transition rules (LC2):
 * - `idle → loading` — Zone activated (mount, visible, or manual).
 * - `loading → streaming` — First prop fragment received from agent.
 * - `loading → ready` — Agent returned complete props instantly (no streaming).
 * - `loading → error` — Agent timeout, compilation failure, or network error.
 * - `loading → empty` — Agent responded with no data.
 * - `streaming → ready` — All required props present and Zod-validated (LC5).
 * - `streaming → error` — Streaming interrupted by error.
 * - `ready → streaming` — Live data update from agent (re-streaming).
 * - `ready → empty` — Agent signals content removal.
 * - `error → loading` — Retry (manual or automatic).
 * - `empty → (none)` — Terminal state. Only `reset()` can exit.
 *
 * @see Design Choice LC2
 */
export const VALID_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
    idle: ['loading'],
    loading: ['streaming', 'ready', 'error', 'empty'],
    streaming: ['ready', 'error'],
    ready: ['streaming', 'empty'],
    error: ['loading'],
    empty: [],
} as const;

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

/**
 * Default timeout in milliseconds for the `loading` state.
 *
 * After this duration, the lifecycle manager transitions from
 * `loading` to `error` with `ENS-3002` (agent timeout).
 *
 * @see Design Choice LC3 — 30 seconds.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Default maximum number of retry attempts (error → loading).
 *
 * @see Design Choice RE17 — 3 retries with exponential backoff.
 */
export const DEFAULT_MAX_RETRIES = 3;
