/**
 * @module @enterstellar-ai/normalizer/adapters/ag-ui-adapter
 * @description AG-UI protocol adapter for the Enterstellar normalizer.
 *
 * Converts AG-UI Server-Sent Events into `ComponentIntent` objects.
 *
 * ## Event Mapping (N4)
 *
 * | AG-UI Event            | Enterstellar Output              |
 * | :--------------------- | :----------------------- |
 * | `tool_call_start`      | `ComponentIntent`        |
 * | `text_message_start`   | `null` (chat layer)      |
 * | `run_started`          | `null` (lifecycle signal) |
 * | `run_finished`         | `null` (lifecycle signal) |
 * | `run_error`            | `null` (lifecycle signal) |
 * | All other events       | `null` (ignored)         |
 *
 * ## Correlation ID (P2)
 *
 * The AG-UI `runId` is extracted and passed as `_source.correlationId`.
 * If absent, the field is omitted (the consumer or downstream normalizer
 * may generate a UUIDv4 fallback).
 *
 * @example
 * ```ts
 * import { createAGUIAdapter } from '@enterstellar-ai/normalizer';
 *
 * const adapter = createAGUIAdapter();
 *
 * const intent = adapter.normalize({
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
 * @see Bible §4.9
 * @see Design Choice N4 — AG-UI event mapping
 * @see Design Choice N5 — buffer-and-assemble streaming
 * @see Appendix E P2 — correlationId
 */

import type { ComponentIntent } from '@enterstellar-ai/types';
import type { ProtocolNormalizer, AGUIAdapterConfig } from '../types.js';
import {
    AGUI_PROTOCOL,
    AGUI_UI_EVENT_TYPES,
    AGUI_LIFECYCLE_EVENT_TYPES,
    DEFAULT_AGUI_CONFIDENCE,
} from '../constants.js';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a value is a non-null object with a string `type` field.
 * Used as the first structural gate before inspecting AG-UI-specific fields.
 *
 * @param event - The raw event to check.
 * @returns `true` if the event is a typed object.
 */
function isTypedObject(event: unknown): event is Record<string, unknown> & { type: string } {
    return (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        typeof (event as Record<string, unknown>)['type'] === 'string'
    );
}

/**
 * Checks whether the event type is a known AG-UI event type.
 *
 * @param type - The event type string.
 * @returns `true` if the type is a recognized AG-UI event.
 */
function isKnownAGUIEventType(type: string): boolean {
    return (
        (AGUI_UI_EVENT_TYPES as readonly string[]).includes(type) ||
        (AGUI_LIFECYCLE_EVENT_TYPES as readonly string[]).includes(type)
    );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an AG-UI protocol adapter.
 *
 * The adapter recognizes AG-UI events by their `type` field and converts
 * `tool_call_start` events into `ComponentIntent` objects. All other
 * events return `null`.
 *
 * @param config - Optional configuration. Defaults to `{ defaultConfidence: 0.8 }`.
 * @returns A `ProtocolNormalizer` with `protocol: 'ag-ui'`.
 *
 * @example
 * ```ts
 * // Default confidence (0.8)
 * const adapter = createAGUIAdapter();
 *
 * // Custom confidence
 * const adapter = createAGUIAdapter({ defaultConfidence: 0.9 });
 * ```
 *
 * @see Design Choice N3 — explicit factory
 * @see Design Choice N4 — AG-UI event mapping
 */
export function createAGUIAdapter(config?: AGUIAdapterConfig): ProtocolNormalizer {
    const confidence = config?.defaultConfidence ?? DEFAULT_AGUI_CONFIDENCE;

    return {
        protocol: AGUI_PROTOCOL,

        /**
         * Structural check: is this an AG-UI event?
         *
         * Checks for a typed object with a `type` field matching a known
         * AG-UI event type. Lightweight — no parsing, no async.
         */
        canHandle(event: unknown): boolean {
            if (!isTypedObject(event)) {
                return false;
            }
            return isKnownAGUIEventType(event['type']);
        },

        /**
         * Normalizes an AG-UI event into a `ComponentIntent`.
         *
         * - `tool_call_start` → `ComponentIntent` with component = `toolName`, props = `args`.
         * - `text_message_start` → `null` (text messages handled by chat layer).
         * - Lifecycle events (`run_started`, `run_finished`, `run_error`) → `null`.
         * - Unknown events → `null`.
         */
        normalize(event: unknown): ComponentIntent | null {
            if (!isTypedObject(event)) {
                return null;
            }

            const eventType = event['type'];

            // -----------------------------------------------------------------
            // tool_call_start → ComponentIntent (N4)
            // -----------------------------------------------------------------
            if (eventType === 'tool_call_start') {
                const toolName = typeof event['toolName'] === 'string'
                    ? event['toolName']
                    : '';

                const toolCallId = typeof event['toolCallId'] === 'string'
                    ? event['toolCallId']
                    : undefined;

                const runId = typeof event['runId'] === 'string'
                    ? event['runId']
                    : undefined;

                // Args default to empty object if missing or non-object
                const rawArgs = typeof event['args'] === 'object' && event['args'] !== null
                    ? event['args'] as Record<string, unknown>
                    : {};

                return {
                    component: toolName,
                    props: rawArgs,
                    confidence,
                    _source: {
                        protocol: AGUI_PROTOCOL,
                        ...(toolCallId !== undefined ? { rawEventId: toolCallId } : {}),
                        ...(runId !== undefined ? { correlationId: runId } : {}),
                    },
                };
            }

            // -----------------------------------------------------------------
            // text_message_start → null (N4: handled by chat layer, not GenUI)
            // -----------------------------------------------------------------
            // Lifecycle events (run_started, run_finished, run_error) → null
            // Unknown events → null
            // -----------------------------------------------------------------
            return null;
        },
    };
}
