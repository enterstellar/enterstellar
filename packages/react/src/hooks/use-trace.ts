'use client';

/**
 * @module @enterstellar-ai/react/hooks/use-enterstellar-trace
 * @description Hook to access the latest `ZoneTrace` for a given zone.
 *
 * Returns the most recent trace only — for full trace history, use
 * `useEnterstellarStore(state => state.traces)` (RE10).
 *
 * The trace contains the full compilation pipeline record:
 * - Intent received
 * - Resolution result (matched / not-found / forged)
 * - Compilation result (pass / corrected / fail)
 * - Determinism level
 * - Performance metrics (latency, token count)
 *
 * Uses `useSyncExternalStore` for tear-free reads (RE11), matching
 * the subscription pattern in `useEnterstellarStore`. Previous implementation
 * read `store.get('traces')` directly on each render, which produced
 * stale data because it didn't subscribe to store changes.
 *
 * @see Design Choice RE10 — latest trace only; history via store
 * @see Design Choice RE11 — `useSyncExternalStore` for reactive reads
 * @see Principle L4 — every render is traceable
 *
 * @example
 * ```tsx
 * import { useEnterstellarTrace } from '@enterstellar-ai/react';
 *
 * function ZoneDebug({ zoneName }: { zoneName: string }) {
 *   const trace = useEnterstellarTrace(zoneName);
 *
 *   if (trace === null) {
 *     return <span>No trace yet</span>;
 *   }
 *
 *   return (
 *     <div>
 *       <span>Status: {trace.compilation.status}</span>
 *       <span>Latency: {trace.metrics.totalMs}ms</span>
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useContext, useRef, useSyncExternalStore } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

import { EnterstellarContext, Enterstellar_CONTEXT_NONE } from '../provider.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Module-level constant for an empty traces array.
 * Avoids creating a new `[]` on every `getSnapshot` call, which would
 * break `useSyncExternalStore`'s referential equality contract.
 *
 * @internal
 */
const EMPTY_TRACES: readonly ZoneTrace[] = [];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the latest `ZoneTrace` for the given zone name.
 *
 * Subscribes to the `EnterstellarStore` via `useSyncExternalStore` (RE11) so that
 * the component re-renders whenever the store's trace data changes. The
 * hook reads traces from the store via `store.get<ZoneTrace[]>('traces')`
 * (traces are stored as a top-level store key by `Zone`), then selects
 * the most recent trace matching the zone name.
 *
 * A stable reference is maintained via trace ID comparison — the component
 * only re-renders when the actual latest trace for this zone changes.
 *
 * Returns `null` if no trace exists yet for the specified zone.
 * This is expected on first render before any intent has been processed.
 *
 * **Init-phase behavior:** This hook throws `ENS-3001` during async
 * provider initialization (when store/telemetry are still being created).
 * Components that need to handle the init phase gracefully should use
 * `useContext(EnterstellarContext)` directly and check for `null`.
 *
 * @param zoneName - The zone name to retrieve the latest trace for.
 * @returns The latest `ZoneTrace`, or `null` if none exists.
 * @throws {EnterstellarError} `ENS-3001` if called outside an `<Provider>`,
 *   or during async provider initialization when context is `null`.
 *
 * @see Design Choice RE10 — returns latest only
 * @see Design Choice RE11 — `useSyncExternalStore`
 * @see Principle L4 — every render is traceable
 */
export function useEnterstellarTrace(zoneName: string): ZoneTrace | null {
    const context = useContext(EnterstellarContext);

    if (context === null || context === Enterstellar_CONTEXT_NONE) {
        throw new EnterstellarError(
            'ENS-3001',
            'react',
            'useEnterstellarTrace() must be used within an <Provider>. No EnterstellarContext found.',
            false,
        );
    }

    const { store } = context;

    /**
     * `subscribe` for `useSyncExternalStore`.
     * Wraps `store.subscribe()` which fires on actual value changes (S4).
     *
     * @see Design Choice RE11 — `useSyncExternalStore` subscription
     */
    const subscribe = useCallback(
        (onStoreChange: () => void): (() => void) => {
            return store.subscribe(onStoreChange);
        },
        [store],
    );

    /**
     * `getSnapshot` for `useSyncExternalStore`.
     *
     * Reads traces via `store.get<ZoneTrace[]>('traces')` rather than
     * `store.getSnapshot().traces` because `SerializedState` stores only
     * trace IDs (`traceIds: string[]`), not full `ZoneTrace` objects.
     * The full trace objects are stored under the `'traces'` key by
     * `Zone` as store extension data.
     *
     * Returns `EMPTY_TRACES` (module-level constant) when no traces exist
     * to maintain referential stability for `useSyncExternalStore`.
     *
     * @see Design Choice RE11
     */
    const getSnapshot = useCallback(
        (): readonly ZoneTrace[] => {
            return store.get<readonly ZoneTrace[]>('traces') ?? EMPTY_TRACES;
        },
        [store],
    );

    // Subscribe to store changes via useSyncExternalStore (RE11).
    // The snapshot is the full traces array — zone filtering is applied after.
    const traces = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    /**
     * Previous trace reference for referential stability.
     * Prevents unnecessary re-renders when the latest trace for this
     * zone hasn't actually changed (same trace ID).
     */
    const prevTraceRef = useRef<ZoneTrace | null>(null);

    /**
     * Select the latest trace for this zone from the traces array.
     *
     * Zone association is determined by trace ID prefix convention:
     * `"zoneName-..."` — set by `Zone` when storing the trace.
     *
     * Iterates in reverse to find the most recent match (RE10).
     */
    let latestTrace: ZoneTrace | null = null;
    for (let i = traces.length - 1; i >= 0; i--) {
        const trace = traces[i];
        if (trace?.id.startsWith(`${zoneName}-`) === true) {
            latestTrace = trace;
            break;
        }
    }

    // Referential stability: return the same reference if the trace ID
    // hasn't changed, preventing unnecessary consumer re-renders.
    if (
        prevTraceRef.current !== null &&
        latestTrace !== null &&
        prevTraceRef.current.id === latestTrace.id
    ) {
        return prevTraceRef.current;
    }

    prevTraceRef.current = latestTrace;
    return latestTrace;
}
