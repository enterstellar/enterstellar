/**
 * @module @enterstellar-ai/normalizer/adapters/custom-adapter
 * @description Factory for custom protocol adapters.
 *
 * Wraps a user-provided normalization function into a `ProtocolNormalizer`.
 * The custom adapter is the escape hatch for proprietary agent protocols
 * that don't conform to AG-UI, A2UI, or MCP.
 *
 * Per N2: the consumer provides a simple function signature
 * `(message: unknown) => ComponentIntent | null`. This factory wraps it
 * with `canHandle()`, protocol metadata injection, and `ProtocolNormalizer`
 * interface compliance.
 *
 * @example
 * ```ts
 * import { createCustomAdapter } from '@enterstellar-ai/normalizer';
 *
 * const myAdapter = createCustomAdapter({
 *   normalize: (msg) => {
 *     const typed = msg as { action: string; data: Record<string, unknown> };
 *     return {
 *       component: typed.action,
 *       props: typed.data,
 *       confidence: 0.9,
 *     };
 *   },
 *   canHandle: (msg) => typeof msg === 'object' && msg !== null && 'action' in msg,
 * });
 * ```
 *
 * @see Bible §4.9
 * @see Design Choice N2 — custom normalizer function signature
 * @see Design Choice N3 — explicit factory, no auto-detection
 */

import type { ComponentIntent } from '@enterstellar-ai/types';
import type { ProtocolNormalizer, CustomAdapterConfig } from '../types.js';
import { CUSTOM_PROTOCOL } from '../constants.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `ProtocolNormalizer` from a user-provided normalization function.
 *
 * The returned adapter:
 * - Uses the consumer's `canHandle()` if provided, otherwise returns `true`
 *   for all events (catch-all — place last in adapter list).
 * - Calls the consumer's `normalize()` function and injects `_source`
 *   metadata with `protocol: 'custom'`.
 * - Returns `null` propagation: if the consumer's function returns `null`,
 *   the adapter returns `null` (event has no UI implication).
 *
 * @param config - Custom adapter configuration with normalize function.
 * @returns A `ProtocolNormalizer` with `protocol: 'custom'`.
 *
 * @example
 * ```ts
 * const adapter = createCustomAdapter({
 *   normalize: (msg) => ({
 *     component: 'Dashboard',
 *     props: { userId: '123' },
 *     confidence: 0.95,
 *   }),
 * });
 *
 * adapter.canHandle({ anything: true }); // true (catch-all)
 * adapter.normalize({ anything: true }); // ComponentIntent
 * ```
 *
 * @see Design Choice N2
 */
export function createCustomAdapter(config: CustomAdapterConfig): ProtocolNormalizer {
    const { normalize, canHandle } = config;

    return {
        protocol: CUSTOM_PROTOCOL,

        canHandle: canHandle ?? ((_event: unknown): boolean => true),

        normalize(event: unknown): ComponentIntent | null {
            const result = normalize(event);

            // Null propagation — event has no UI implication
            if (result === null) {
                return null;
            }

            // Inject _source metadata without mutating the consumer's object.
            // If the consumer already provided _source, preserve their fields
            // but ensure protocol is always 'custom'.
            return {
                ...result,
                _source: {
                    ...result._source,
                    protocol: CUSTOM_PROTOCOL,
                },
            };
        },
    };
}
