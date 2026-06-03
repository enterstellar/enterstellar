/**
 * @module @enterstellar-ai/lifecycle
 * @description Framework-agnostic lifecycle state machine for Enterstellar zones.
 *
 * Manages the lifecycle of zone content: `idle → loading → streaming → ready`,
 * with error and empty terminal states. Every state transition emits a
 * structured event for observability (L4).
 *
 * This is an **engine package** (L15) — zero framework dependencies.
 * `@enterstellar-ai/react` wraps the lifecycle manager in React hooks.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createLifecycleManager, createStreamingAssembler } from '@enterstellar-ai/lifecycle';
 * import { z } from 'zod';
 *
 * // Create a lifecycle manager with default config (30s timeout, 3 retries)
 * const manager = createLifecycleManager();
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
 * // Streaming assembly (LC4)
 * const assembler = createStreamingAssembler();
 * assembler.apply({ path: 'patientId', value: 'P-123' });
 * assembler.apply({ path: 'metrics[0].value', value: 92 });
 *
 * const schema = z.object({
 *   patientId: z.string(),
 *   metrics: z.array(z.object({ value: z.number() })),
 * });
 * assembler.isComplete(schema); // true
 *
 * // Cleanup
 * unsubscribe();
 * manager.dispose();
 * ```
 *
 * @see Implementation Bible §4.8
 * @see Design Choices LC1–LC9
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export { createLifecycleManager } from './create-lifecycle-manager.js';

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------
export { createStreamingAssembler } from './streaming-assembler.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    LifecycleState,
    LifecycleEvent,
    LifecycleTransitionContext,
    LifecycleListener,
    LifecycleManagerConfig,
    PropFragment,
    LifecycleManager,
    StreamingAssembler,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants (for advanced usage and testing)
// ---------------------------------------------------------------------------
export { VALID_TRANSITIONS, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from './constants.js';

// ---------------------------------------------------------------------------
// Error Factories (for custom integrations and testing)
// ---------------------------------------------------------------------------
export {
    createAgentTimeoutError,
    createInvalidTransitionError,
    createStreamingAssemblyError,
    createDisposedError,
    createMaxRetriesExceededError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Utilities (internal, exported for testing)
// ---------------------------------------------------------------------------
export { parsePath, deepSet } from './streaming-assembler.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { LIFECYCLE_VERSION } from './version.js';
