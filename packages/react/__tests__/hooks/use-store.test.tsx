/**
 * @module @enterstellar-ai/react/__tests__/hooks/use-enterstellar-store.test
 * @description Unit tests for `useEnterstellarStore()`.
 *
 * Covers:
 * - Throws when used outside `<Provider>`.
 * - Returns full state when no selector is provided.
 * - Returns selected value with selector.
 * - Shallow equality prevents unnecessary re-renders (S4).
 * - Subscribes to store changes and re-renders on update.
 * - `useSyncExternalStore` integration (RE11).
 *
 * @see Design Choice RE11 — `useSyncExternalStore`
 * @see Design Choice S4 — shallow equality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useEnterstellarStore } from '../../src/hooks/use-store.js';
import { EnterstellarContext, EnterstellarAgentContext } from '../../src/provider.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import type { EnterstellarContextValue } from '../../src/types.js';
import type { SerializedState } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Mock Store with Subscription Support
// ---------------------------------------------------------------------------

/**
 * Creates a mock store that supports `subscribe`, `getSnapshot`, and
 * `set` with subscriber notification — required for `useSyncExternalStore`.
 */
function createMockStore(initialData: Record<string, unknown> = {}) {
    let data = { ...initialData };
    const subscribers = new Set<() => void>();

    /** Cached snapshot — recreated when data changes, same reference otherwise. */
    let cachedSnapshot = {
        schemaVersion: '1.0.0',
        zones: {},
        traceIds: [] as string[],
        session: { id: 'test-session' },
        extensions: { ...data },
    };

    function rebuildSnapshot() {
        cachedSnapshot = {
            schemaVersion: '1.0.0',
            zones: {},
            traceIds: [],
            session: { id: 'test-session' },
            extensions: { ...data },
        };
    }

    return {
        get: vi.fn(<T = unknown>(key: string): T | undefined => data[key] as T | undefined),
        set: vi.fn((key: string, value: unknown) => {
            data = { ...data, [key]: value };
            rebuildSnapshot();
            subscribers.forEach((cb) => { cb(); });
        }),
        subscribe: vi.fn((cb: () => void): (() => void) => {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(() => cachedSnapshot),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => cachedSnapshot),
        destroy: vi.fn(),
        // Test helpers
        _setData: (newData: Record<string, unknown>) => {
            data = { ...newData };
            rebuildSnapshot();
            subscribers.forEach((cb) => { cb(); });
        },
        _getSubscriberCount: () => subscribers.size,
    };
}

function createWrapper(store: ReturnType<typeof createMockStore>) {
    const ctx: EnterstellarContextValue = {
        registry: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        compiler: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        store: store as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        telemetry: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        rendererRegistry,
        cache: null,
        adapters: {},
    };

    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <EnterstellarContext.Provider value={ctx}>
                <EnterstellarAgentContext.Provider value={{ connection: null }}>
                    {children}
                </EnterstellarAgentContext.Provider>
            </EnterstellarContext.Provider>
        );
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnterstellarStore()', () => {
    beforeEach(() => {
        rendererRegistry.clear();
    });

    // -----------------------------------------------------------------------
    // Error Handling
    // -----------------------------------------------------------------------

    it('throws when used outside Provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => {
            renderHook(() => useEnterstellarStore());
        }).toThrow(
            'useEnterstellarStore() must be used within an <Provider>.',
        );

        spy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // Full State (no selector)
    // -----------------------------------------------------------------------

    describe('without selector (full state)', () => {
        it('returns the full serialized state', () => {
            const store = createMockStore({ counter: 0, name: 'test' });

            const { result } = renderHook(() => useEnterstellarStore(), {
                wrapper: createWrapper(store),
            });

            expect(result.current.schemaVersion).toBe('1.0.0');
            expect(result.current.extensions).toEqual({ counter: 0, name: 'test' });
        });

        it('updates when store changes', () => {
            const store = createMockStore({ counter: 0 });

            const { result } = renderHook(() => useEnterstellarStore(), {
                wrapper: createWrapper(store),
            });

            expect(result.current.extensions?.['counter']).toBe(0);

            act(() => {
                store._setData({ counter: 42 });
            });

            expect(result.current.extensions?.['counter']).toBe(42);
        });
    });

    // -----------------------------------------------------------------------
    // With Selector
    // -----------------------------------------------------------------------

    describe('with selector', () => {
        it('returns the selected value', () => {
            const store = createMockStore({ name: 'Alice', age: 30 });

            const { result } = renderHook(
                () => useEnterstellarStore((state: SerializedState) => state.extensions?.['name'] as string),
                { wrapper: createWrapper(store) },
            );

            expect(result.current).toBe('Alice');
        });

        it('re-renders when selected value changes', () => {
            const store = createMockStore({ counter: 0 });
            let renderCount = 0;

            const { result } = renderHook(
                () => {
                    renderCount++;
                    return useEnterstellarStore(
                        (state: SerializedState) => state.extensions?.['counter'] as number,
                    );
                },
                { wrapper: createWrapper(store) },
            );

            const initialRenderCount = renderCount;
            expect(result.current).toBe(0);

            act(() => {
                store._setData({ counter: 1 });
            });

            expect(result.current).toBe(1);
            expect(renderCount).toBeGreaterThan(initialRenderCount);
        });

        it('returns derived object from selector', () => {
            const store = createMockStore({ firstName: 'Alice', lastName: 'Smith' });

            const { result } = renderHook(
                () =>
                    useEnterstellarStore((state: SerializedState) => ({
                        full: `${state.extensions?.['firstName'] as string} ${state.extensions?.['lastName'] as string}`,
                    })),
                { wrapper: createWrapper(store) },
            );

            expect(result.current).toEqual({ full: 'Alice Smith' });
        });
    });

    // -----------------------------------------------------------------------
    // Subscription Management
    // -----------------------------------------------------------------------

    describe('subscription management', () => {
        it('subscribes to the store on mount', () => {
            const store = createMockStore({ x: 1 });

            renderHook(() => useEnterstellarStore(), {
                wrapper: createWrapper(store),
            });

            expect(store.subscribe).toHaveBeenCalled();
        });

        it('unsubscribes from the store on unmount', () => {
            const store = createMockStore({ x: 1 });

            const { unmount } = renderHook(() => useEnterstellarStore(), {
                wrapper: createWrapper(store),
            });

            const initialCount = store._getSubscriberCount();
            unmount();

            expect(store._getSubscriberCount()).toBeLessThan(initialCount);
        });
    });
});
