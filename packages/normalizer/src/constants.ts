/**
 * @module @enterstellar-ai/normalizer/constants
 * @description Normalizer constants — AG-UI event types, default configuration values.
 *
 * These constants are the single source of truth for protocol-specific
 * event identifiers and default configuration. Prevents magic strings
 * from scattering across adapter implementations.
 *
 * @see Design Choice N4 — AG-UI event mapping
 * @see Design Choice N5 — Buffer-and-assemble streaming
 */

// ---------------------------------------------------------------------------
// AG-UI Event Types (N4)
// ---------------------------------------------------------------------------

/**
 * AG-UI event types that produce a `ComponentIntent`.
 *
 * - `tool_call_start` — Tool invocation with component name + props.
 * - `text_message_start` — Text message start (may contain structured UI hints).
 *
 * All other AG-UI events are ignored by the normalizer.
 *
 * @see Design Choice N4
 */
export const AGUI_UI_EVENT_TYPES = [
    'tool_call_start',
    'text_message_start',
] as const;

/**
 * AG-UI event types that map to lifecycle signals (loading, ready, error).
 *
 * These events do NOT produce a `ComponentIntent` — they inform the
 * lifecycle manager about agent run state transitions.
 *
 * - `run_started` → lifecycle `loading`
 * - `run_finished` → lifecycle `ready`
 * - `run_error` → lifecycle `error`
 *
 * @see Design Choice N4
 */
export const AGUI_LIFECYCLE_EVENT_TYPES = [
    'run_started',
    'run_finished',
    'run_error',
] as const;

/**
 * Union type of all known AG-UI event types handled by the normalizer.
 * Used for structural detection in `canHandle()`.
 */
export type AGUIEventType =
    | (typeof AGUI_UI_EVENT_TYPES)[number]
    | (typeof AGUI_LIFECYCLE_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// AG-UI Streaming Event Types (N5)
// ---------------------------------------------------------------------------

/**
 * AG-UI event types that signal completion of a streaming sequence.
 *
 * When one of these events is received, the streaming buffer finalizes
 * the accumulated partial intent into a complete `ComponentIntent`.
 *
 * @see Design Choice N5
 */
export const AGUI_COMPLETION_EVENT_TYPES = [
    'tool_call_end',
    'text_message_end',
] as const;

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

/**
 * Default confidence score assigned to AG-UI tool call intents when the
 * agent does not provide an explicit confidence value.
 *
 * 0.8 is conservative — high enough to avoid unnecessary fallback,
 * low enough to signal that confidence was not explicitly provided.
 */
export const DEFAULT_AGUI_CONFIDENCE = 0.8 as const;

/**
 * Default protocol identifier for the AG-UI adapter.
 * Used in `IntentSource.protocol`.
 */
export const AGUI_PROTOCOL = 'ag-ui' as const;

/**
 * Default protocol identifier for custom adapters.
 * Used in `IntentSource.protocol`.
 */
export const CUSTOM_PROTOCOL = 'custom' as const;
