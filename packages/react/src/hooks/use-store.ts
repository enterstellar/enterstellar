'use client';

/**
 * @module @enterstellar-ai/react/hooks/use-enterstellar-store
 * @description Hook to subscribe to `EnterstellarStore` state with optional selector.
 *
 * Uses React 18+ `useSyncExternalStore` for tear-free reads (RE11).
 * Supports two call signatures:
 *
 * 1. **No selector** — returns the full serialized state snapshot.
 * 2. **With selector** — returns a derived slice. Uses shallow equality
 *    comparison to prevent unnecessary re-renders when the selected
 *    value hasn't changed (S4).
 *
 * @see Design Choice RE11 — `useSyncExternalStore` with shallow equality
 * @see Design Choice S4 — shallow equality change detection
 * @see Design Choice S13 — React integration via `useSyncExternalStore`
 *
 * @example
 * ```tsx
 * import { useEnterstellarStore } from '@enterstellar-ai/react';
 *
 * // Full state
 * function DebugPanel() {
 *   const state = useEnterstellarStore();
 *   return <pre>{JSON.stringify(state, null, 2)}</pre>;
 * }
 *
 * // With selector (granular subscription)
 * function TraceCount() {
 *   const traceCount = useEnterstellarStore((state) => {
 *     const traces = state.traces as unknown[] | undefined;
 *     return traces?.length ?? 0;
 *   });
 *   return <span>{traceCount} traces</span>;
 * }
 * ```
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';

import type { SerializedState } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

import { EnterstellarContext, Enterstellar_CONTEXT_NONE } from '../provider.js';
import { useContext } from 'react';

// ---------------------------------------------------------------------------
// Shallow Equality
// ---------------------------------------------------------------------------

/**
 * Shallow equality comparison for selector results.
 *
 * Prevents unnecessary re-renders when the selected value is structurally
 * identical to the previous value. Handles primitives, arrays, and plain
 * objects (one level deep).
 *
 * @param a - Previous selected value.
 * @param b - Current selected value.
 * @returns `true` if values are shallowly equal.
 *
 * @see Design Choice S4
 * @internal
 */
function shallowEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) {
        return true;
    }

    if (
        typeof a !== 'object' || a === null ||
        typeof b !== 'object' || b === null
    ) {
        return false;
    }

    // Array comparison
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!Object.is(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    // Plain object comparison (one level deep)
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
        return false;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
            return false;
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// Hook Overloads
// ---------------------------------------------------------------------------

/**
 * Returns the full serialized state from `EnterstellarStore`.
 *
 * **Init-phase behavior:** Throws during async provider initialization.
 * For init-safe access, use `useContext(EnterstellarContext)` directly.
 *
 * @returns The full `SerializedState` snapshot.
 * @throws {EnterstellarError} `ENS-3001` if called outside an `<Provider>`,
 *   or during async provider initialization when context is `null`.
 */
export function useEnterstellarStore(): SerializedState;

/**
 * Returns a derived slice of `EnterstellarStore` state via selector.
 *
 * Uses shallow equality to prevent re-renders when the selected
 * value hasn't changed.
 *
 * **Init-phase behavior:** Throws during async provider initialization.
 * For init-safe access, use `useContext(EnterstellarContext)` directly.
 *
 * @typeParam T - The type of the selected value.
 * @param selector - A function that extracts a value from the full state.
 * @returns The selected value.
 * @throws {EnterstellarError} `ENS-3001` if called outside an `<Provider>`,
 *   or during async provider initialization when context is `null`.
 */
export function useEnterstellarStore<T>(selector: (state: SerializedState) => T): T;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Hook to subscribe to `EnterstellarStore` state with optional selector.
 *
 * @see Design Choice RE11 — `useSyncExternalStore`
 * @see Design Choice S4 — shallow equality
 */
export function useEnterstellarStore<T = SerializedState>(
    selector?: (state: SerializedState) => T,
): T {
    const context = useContext(EnterstellarContext);

    if (context === null || context === Enterstellar_CONTEXT_NONE) {
        throw new EnterstellarError(
            'ENS-3001',
            'react',
            'useEnterstellarStore() must be used within an <Provider>. No EnterstellarContext found.',
            false,
        );
    }

    const { store } = context;

    /**
     * `subscribe` for `useSyncExternalStore`.
     * Wraps `store.subscribe()` which fires on actual value changes (S4).
     */
    const subscribe = useCallback(
        (onStoreChange: () => void): (() => void) => {
            return store.subscribe(onStoreChange);
        },
        [store],
    );

    /**
     * `getSnapshot` for `useSyncExternalStore`.
     * Returns the full serialized state.
     */
    const getSnapshot = useCallback(
        (): SerializedState => {
            return store.getSnapshot();
        },
        [store],
    );

    // Full state (no selector)
    const fullState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    // With selector: apply selector + shallow equality memoization
    const prevRef = useRef<T | undefined>(undefined);

    if (selector === undefined) {
        return fullState as unknown as T;
    }

    const nextValue = selector(fullState);

    // Shallow equality check — reuse previous reference if unchanged
    if (prevRef.current !== undefined && shallowEqual(prevRef.current, nextValue)) {
        return prevRef.current;
    }

    prevRef.current = nextValue;
    return nextValue;
}
