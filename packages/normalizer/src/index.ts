/**
 * @module @enterstellar-ai/normalizer
 * @description Protocol-agnostic intake — normalizes AG-UI, custom, and
 * future protocols into unified `ComponentIntent` objects.
 *
 * The normalizer is an **engine package** (L15) — zero framework dependencies.
 * It sits at the entry point of the Enterstellar rendering pipeline, converting
 * raw protocol events from any agent transport into the canonical
 * `ComponentIntent` format consumed by the compiler.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createNormalizer, createAGUIAdapter, createCustomAdapter } from '@enterstellar-ai/normalizer';
 *
 * // Compose adapters — first match wins
 * const normalize = createNormalizer({
 *   adapters: [
 *     createAGUIAdapter(),
 *     createCustomAdapter({
 *       normalize: (msg) => ({ component: 'Fallback', props: {}, confidence: 0.5 }),
 *     }),
 *   ],
 * });
 *
 * // Dispatch a raw AG-UI event
 * const intent = normalize({
 *   type: 'tool_call_start',
 *   toolCallId: 'tc-001',
 *   toolName: 'PatientVitals',
 *   args: { patientId: 'P-123' },
 *   runId: 'run-abc',
 * });
 * // → { component: 'PatientVitals', props: { patientId: 'P-123' }, confidence: 0.8,
 * //     _source: { protocol: 'ag-ui', rawEventId: 'tc-001', correlationId: 'run-abc' } }
 * ```
 *
 * @see Implementation Bible §4.9
 * @see Design Choices N1–N6
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export { createNormalizer } from './create-normalizer.js';

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------
export { createAGUIAdapter } from './adapters/ag-ui-adapter.js';
export { createCustomAdapter } from './adapters/custom-adapter.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    ProtocolNormalizer,
    NormalizerConfig,
    NormalizerDispatch,
    AGUIAdapterConfig,
    CustomAdapterConfig,
    AGUIToolCallEvent,
    AGUITextMessageEvent,
    AGUILifecycleEvent,
    AGUIEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Error Factories
// ---------------------------------------------------------------------------
export {
    createUnknownProtocolError,
    createNormalizationFailedError,
    createInvalidIntentError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Constants (for advanced usage and testing)
// ---------------------------------------------------------------------------
export {
    DEFAULT_AGUI_CONFIDENCE,
    AGUI_UI_EVENT_TYPES,
    AGUI_LIFECYCLE_EVENT_TYPES,
    AGUI_COMPLETION_EVENT_TYPES,
    AGUI_PROTOCOL,
    CUSTOM_PROTOCOL,
} from './constants.js';

export type { AGUIEventType } from './constants.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { NORMALIZER_VERSION } from './version.js';
