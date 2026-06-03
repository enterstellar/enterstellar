/**
 * @module @enterstellar-ai/normalizer/create-normalizer
 * @description Factory function that composes protocol adapters into a single dispatch.
 *
 * `createNormalizer()` is the primary entry point for the normalizer module.
 * It accepts an ordered list of `ProtocolNormalizer` adapters and returns
 * a dispatch function that routes raw protocol events to the correct adapter.
 *
 * ## Dispatch Logic
 *
 * 1. Iterate adapters in order.
 * 2. First adapter whose `canHandle(event)` returns `true` processes the event.
 * 3. If `normalize()` returns `null` → return `null` (no UI intent).
 * 4. If `normalize()` returns a `ComponentIntent` → validate via `ComponentIntentSchema`.
 * 5. If no adapter matches → throw `ENS-6001`.
 * 6. If adapter throws → wrap in `ENS-6002`.
 * 7. If Zod validation fails → throw `ENS-6003`.
 *
 * @example
 * ```ts
 * import { createNormalizer, createAGUIAdapter, createCustomAdapter } from '@enterstellar-ai/normalizer';
 *
 * const normalize = createNormalizer({
 *   adapters: [
 *     createAGUIAdapter(),
 *     createCustomAdapter({ normalize: myCustomFn }),
 *   ],
 * });
 *
 * const intent = normalize(agUIEvent);
 * // → ComponentIntent | null
 * ```
 *
 * @see Bible §4.9
 * @see Design Choice N3 — explicit factory, no auto-detection
 */

import { ComponentIntentSchema } from '@enterstellar-ai/types';
import type { NormalizerConfig, NormalizerDispatch } from './types.js';
import {
    createUnknownProtocolError,
    createNormalizationFailedError,
    createInvalidIntentError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a normalizer dispatch function from an ordered array of protocol adapters.
 *
 * The dispatch function routes each raw event to the first adapter whose
 * `canHandle()` returns `true`, validates the output against
 * `ComponentIntentSchema`, and returns the validated `ComponentIntent`.
 *
 * @param config - Configuration containing an ordered list of adapters.
 * @returns A dispatch function: `(event: unknown) => ComponentIntent | null`.
 *
 * @throws EnterstellarError `ENS-6001` — No adapter can handle the event.
 * @throws EnterstellarError `ENS-6002` — An adapter's `normalize()` threw.
 * @throws EnterstellarError `ENS-6003` — The assembled intent failed Zod validation.
 *
 * @example
 * ```ts
 * const normalize = createNormalizer({
 *   adapters: [createAGUIAdapter()],
 * });
 *
 * // Successful normalization
 * const intent = normalize({
 *   type: 'tool_call_start',
 *   toolCallId: 'tc-001',
 *   toolName: 'PatientVitals',
 *   args: { patientId: 'P-123' },
 * });
 *
 * // Event with no UI implication (lifecycle event)
 * const noop = normalize({ type: 'run_started', runId: 'r-1' });
 * // → null
 * ```
 *
 * @see Bible §4.9
 * @see Design Choice N3
 */
export function createNormalizer(config: NormalizerConfig): NormalizerDispatch {
    const { adapters } = config;

    return (event: unknown) => {
        // -----------------------------------------------------------------
        // Step 1: Find the first adapter that can handle this event.
        // Adapters are checked in declaration order — first match wins.
        // -----------------------------------------------------------------
        for (const adapter of adapters) {
            if (!adapter.canHandle(event)) {
                continue;
            }

            // ---------------------------------------------------------------
            // Step 2: Normalize the event via the matched adapter.
            // Wrap in try/catch to produce ENS-6002 on adapter failures.
            // catch(e) types e as `unknown` per useUnknownInCatchVariables.
            // ---------------------------------------------------------------
            let result;
            try {
                result = adapter.normalize(event);
            } catch (cause: unknown) {
                throw createNormalizationFailedError(adapter.protocol, cause);
            }

            // ---------------------------------------------------------------
            // Step 3: Null propagation — event has no UI implication.
            // This is a valid outcome (e.g., AG-UI lifecycle events).
            // ---------------------------------------------------------------
            if (result === null) {
                return null;
            }

            // ---------------------------------------------------------------
            // Step 4: Validate the assembled intent against ComponentIntentSchema.
            // Uses safeParse() for controlled error formatting (not parse()).
            // ---------------------------------------------------------------
            const parseResult = ComponentIntentSchema.safeParse(result);

            if (!parseResult.success) {
                // Format Zod errors into a human-readable string for the error message.
                const formattedErrors = parseResult.error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('; ');
                throw createInvalidIntentError(formattedErrors);
            }

            // ---------------------------------------------------------------
            // Step 5: Return the validated, typed ComponentIntent.
            // We return the original result (not parseResult.data) to preserve
            // readonly types and avoid Zod's potential type widening.
            // The safeParse above guarantees structural correctness.
            // ---------------------------------------------------------------
            return result;
        }

        // -----------------------------------------------------------------
        // No adapter matched — developer misconfiguration.
        // -----------------------------------------------------------------
        throw createUnknownProtocolError(event);
    };
}
