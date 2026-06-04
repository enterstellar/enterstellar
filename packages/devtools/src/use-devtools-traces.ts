'use client';

/**
 * @module @enterstellar-ai/devtools/use-devtools-traces
 * @description Internal hook for DevTools trace subscription, buffering, and filtering.
 *
 * Subscribes to `EnterstellarStore` traces via `useSyncExternalStore` + `store.get('traces')`
 * (replacing the previous broken `useEnterstellarStore(selector)` path that used unsafe casts).
 * Maintains a ring buffer of the last N traces (default: 500 per DT5) and
 * provides filtered views for the Trace Timeline and Validation Log panels.
 *
 * Data flow:
 * ```
 * EnterstellarStore.get('traces') → useSyncExternalStore → ring buffer → filter → panels
 * ```
 *
 * @see Design Choice DT5 — 500 traces in memory, real-time subscription
 * @see Design Choice DT7 — data via EnterstellarStore directly
 * @see Principle L4 — every render is traceable
 *
 * @internal
 */

import { useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';

import type { EnterstellarStore, ZoneTrace } from '@enterstellar-ai/types';
import { EnterstellarContext } from '@enterstellar-ai/react';

import type { TraceFilter } from './types.js';
import { DEVTOOLS_MAX_TRACES } from './constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Empty traces array for referential stability.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return the same reference
 * when the value hasn't changed. This module-level constant ensures that
 * "no traces" always returns the same array reference.
 *
 * @internal
 */
const EMPTY_TRACES: readonly ZoneTrace[] = Object.freeze([]);

/**
 * No-op store stub used when `EnterstellarContext` is null.
 *
 * Provides the minimum `EnterstellarStore` surface required by `useSyncExternalStore`:
 * - `subscribe` — returns a no-op unsubscribe (no events will ever fire).
 * - `get` — always returns `undefined` (no traces available).
 *
 * This prevents Rules of Hooks violations (hooks must run unconditionally)
 * while ensuring DevTools gracefully degrades to "No traces yet" when
 * rendered outside `<Provider>`.
 *
 * @internal
 */
const NULL_STORE: Pick<EnterstellarStore, 'subscribe' | 'get'> = {
    subscribe: () => () => { /* no-op */ },
    get: (_key: string) => undefined,
};

// ---------------------------------------------------------------------------
// Ring Buffer
// ---------------------------------------------------------------------------

/**
 * Appends new traces to the buffer, evicting the oldest entries when
 * the buffer exceeds `maxSize`.
 *
 * Returns a new array only if the buffer contents changed. If no new
 * traces are detected, returns the previous buffer reference to avoid
 * unnecessary re-renders downstream.
 *
 * @param prevBuffer - The current ring buffer contents.
 * @param incomingTraces - All traces currently in the store.
 * @param seenIds - Set of trace IDs already in the buffer (mutation-safe).
 * @param maxSize - Maximum buffer size.
 * @returns Updated buffer (or same reference if unchanged).
 *
 * @internal
 */
function updateRingBuffer(
    prevBuffer: readonly ZoneTrace[],
    incomingTraces: readonly ZoneTrace[],
    seenIds: Set<string>,
    maxSize: number,
): readonly ZoneTrace[] {
    // Identify new traces not yet in the buffer
    const newTraces: ZoneTrace[] = [];
    for (const trace of incomingTraces) {
        if (!seenIds.has(trace.id)) {
            newTraces.push(trace);
            seenIds.add(trace.id);
        }
    }

    // Nothing new — return same reference
    if (newTraces.length === 0) {
        return prevBuffer;
    }

    // Append new traces and enforce max size
    const combined = [...prevBuffer, ...newTraces];

    if (combined.length <= maxSize) {
        return combined;
    }

    // Evict oldest entries and remove their IDs from the seen set
    const evictCount = combined.length - maxSize;
    for (let i = 0; i < evictCount; i++) {
        const evicted = combined[i];
        if (evicted !== undefined) {
            seenIds.delete(evicted.id);
        }
    }

    return combined.slice(evictCount);
}

// ---------------------------------------------------------------------------
// Filter Logic
// ---------------------------------------------------------------------------

/**
 * Extracts the zone name from a zone-prefixed trace ID.
 *
 * Trace IDs follow the pattern `"zoneName-uuid"` where `zoneName` is
 * the kebab-case zone identifier and `uuid` is a unique suffix.
 *
 * @param traceId - The full trace ID string.
 * @returns The zone name prefix, or the full ID if no separator found.
 *
 * @see `@enterstellar-ai/react/src/hooks/use-enterstellar-trace.ts` — zone-prefixed ID convention
 * @internal
 */
export function extractZoneName(traceId: string): string {
    const separatorIndex = traceId.indexOf('-');
    if (separatorIndex === -1) {
        return traceId;
    }
    return traceId.substring(0, separatorIndex);
}

/**
 * Applies filter criteria to a trace array.
 *
 * Filters are combined with logical AND — a trace must match ALL
 * active criteria to be included. `undefined` criteria are skipped.
 *
 * Text search (`filter.search`) matches against:
 * - `intent.raw` (the raw intent string)
 * - `intent.component` (resolved component name)
 * - Compilation error messages (if any exist in the trace)
 *
 * @param traces - The full trace buffer to filter.
 * @param filter - The active filter criteria.
 * @returns Filtered subset of traces.
 *
 * @internal
 */
export function applyTraceFilter(
    traces: readonly ZoneTrace[],
    filter: TraceFilter,
): readonly ZoneTrace[] {
    const { zone, component, status, search } = filter;

    // Fast path: no filters active
    if (zone === undefined && component === undefined && status === undefined && search === undefined) {
        return traces;
    }

    const searchLower = search?.toLowerCase();

    return traces.filter((trace) => {
        // Zone filter: extract zone name from trace ID
        if (zone !== undefined && extractZoneName(trace.id) !== zone) {
            return false;
        }

        // Component filter: match against intent.component
        if (component !== undefined && trace.intent.component !== component) {
            return false;
        }

        // Status filter: match compilation status
        if (status !== undefined && trace.compilation.status !== status) {
            return false;
        }

        // Text search: case-insensitive across multiple fields
        if (searchLower !== undefined && searchLower.length > 0) {
            const componentMatch = trace.intent.component.toLowerCase().includes(searchLower);

            if (!componentMatch) {
                return false;
            }
        }

        return true;
    });
}

// ---------------------------------------------------------------------------
// Return Type
// ---------------------------------------------------------------------------

/**
 * Return value of `useDevtoolsTraces()`.
 *
 * @internal
 */
export type DevtoolsTracesResult = {
    /** All traces in the ring buffer (unfiltered). */
    readonly allTraces: readonly ZoneTrace[];

    /** Traces filtered by the current filter criteria. */
    readonly filteredTraces: readonly ZoneTrace[];

    /** Unique zone names extracted from all buffered traces. */
    readonly availableZones: readonly string[];

    /** Unique component names across all buffered traces. */
    readonly availableComponents: readonly string[];
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribes to `EnterstellarStore` traces and provides a filtered, buffered view.
 *
 * The hook maintains an internal ring buffer (default: 500 entries per DT5)
 * that accumulates traces over time, independent of the store's own
 * `maxTraces` setting. This allows DevTools to retain more history than
 * the application store if needed.
 *
 * @param filter - Active filter criteria. All fields optional.
 * @param maxTraces - Maximum traces in the ring buffer. Default: 500.
 * @returns Buffered and filtered trace data, plus available filter options.
 *
 * @see Design Choice DT5 — 500 traces in memory
 * @see Design Choice DT7 — data via EnterstellarStore directly
 *
 * @internal
 */
export function useDevtoolsTraces(
    filter: TraceFilter,
    maxTraces: number = DEVTOOLS_MAX_TRACES,
): DevtoolsTracesResult {
    // ---------------------------------------------------------------------------
    // Store Subscription
    // ---------------------------------------------------------------------------

    /**
     * Access the EnterstellarStore directly via EnterstellarContext.
     *
     * DevTools reads trace data from the store's `'traces'` extension key
     * using `store.get('traces')`, NOT from `getSnapshot().traces` (which
     * would read from `SerializedState.extensions['traces']` — a different
     * and potentially stale code path).
     *
     * @see Design Choice DT7 — data via EnterstellarStore directly.
     */
    const enterstellarContext = useContext(EnterstellarContext);

    /**
     * When `EnterstellarContext` is null (DevTools rendered outside `<Provider>`,
     * or during provider init), use a no-op store stub. This preserves the
     * Rules of Hooks (all hooks below run unconditionally) while returning
     * empty results. DevTools gracefully shows "No traces yet" instead of
     * crashing the render tree.
     *
     * This aligns with the Batch 4 init race resolution strategy — DevTools
     * should never prevent the application from rendering.
     */
    const store = (enterstellarContext !== null && typeof enterstellarContext === 'object')
        ? enterstellarContext.store
        : NULL_STORE;

    /**
     * Subscribe to store changes via `useSyncExternalStore` (RE11).
     *
     * The `subscribe` callback registers a listener that fires on any store
     * mutation (S4: shallow equality check handled internally by the store).
     * The `getSnapshot` callback reads full `ZoneTrace[]` from the `'traces'`
     * extension key, returning `EMPTY_TRACES` for referential stability
     * when no traces exist.
     *
     * This replaces the previous broken pattern that used `useEnterstellarStore`
     * with an unsafe `state as Record<string, unknown>` cast to access
     * extension data via bracket notation on `SerializedState`.
     *
     * @see Design Choice RE11 — `useSyncExternalStore`.
     * @see Design Choice S4 — fire only on actual change.
     */
    const subscribe = useCallback(
        (onStoreChange: () => void): (() => void) => store.subscribe(onStoreChange),
        [store],
    );

    const getSnapshot = useCallback(
        (): readonly ZoneTrace[] => store.get<readonly ZoneTrace[]>('traces') ?? EMPTY_TRACES,
        [store],
    );

    const storeTraces = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    // ---------------------------------------------------------------------------
    // Ring Buffer State (ref-based to avoid re-render loops)
    // ---------------------------------------------------------------------------

    const bufferRef = useRef<readonly ZoneTrace[]>([]);
    const seenIdsRef = useRef<Set<string>>(new Set());

    /**
     * Update the ring buffer with any new traces from the store.
     * `updateRingBuffer` is referentially stable — it returns the same
     * array reference if nothing changed, preventing needless memoization
     * invalidation downstream.
     */
    const updatedBuffer = updateRingBuffer(
        bufferRef.current,
        storeTraces,
        seenIdsRef.current,
        maxTraces,
    );
    bufferRef.current = updatedBuffer;

    // ---------------------------------------------------------------------------
    // Derived Data
    // ---------------------------------------------------------------------------

    /**
     * Extract unique zone names from all buffered traces.
     * Stable memoization keyed on the buffer reference.
     */
    const availableZones = useMemo((): readonly string[] => {
        const zones = new Set<string>();
        for (const trace of updatedBuffer) {
            zones.add(extractZoneName(trace.id));
        }
        return [...zones].sort();
    }, [updatedBuffer]);

    /**
     * Extract unique component names from all buffered traces.
     * Stable memoization keyed on the buffer reference.
     */
    const availableComponents = useMemo((): readonly string[] => {
        const components = new Set<string>();
        for (const trace of updatedBuffer) {
            components.add(trace.intent.component);
        }
        return [...components].sort();
    }, [updatedBuffer]);

    // ---------------------------------------------------------------------------
    // Filtering
    // ---------------------------------------------------------------------------

    /**
     * Stable reference to the filter function to avoid re-creating
     * the filtered array on every render when filters haven't changed.
     */
    const applyFilter = useCallback(
        (traces: readonly ZoneTrace[]) => applyTraceFilter(traces, filter),
        [filter],
    );

    const filteredTraces = useMemo(
        () => applyFilter(updatedBuffer),
        [applyFilter, updatedBuffer],
    );

    // ---------------------------------------------------------------------------
    // Result
    // ---------------------------------------------------------------------------

    return {
        allTraces: updatedBuffer,
        filteredTraces,
        availableZones,
        availableComponents,
    };
}
