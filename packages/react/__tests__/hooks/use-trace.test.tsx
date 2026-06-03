/**
 * @module @enterstellar-ai/react/__tests__/hooks/use-enterstellar-trace.test
 * @description Unit tests for `useEnterstellarTrace()`.
 *
 * Covers:
 * - Throws when used outside `<Provider>`.
 * - Returns `null` when no traces exist.
 * - Returns the latest trace for the specified zone.
 * - Ignores traces from other zones.
 * - Returns the most recent trace when multiple exist.
 *
 * @see Design Choice RE10 — latest trace only
 * @see Principle L4 — every render is traceable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useEnterstellarTrace } from '../../src/hooks/use-trace.js';
import { EnterstellarContext, EnterstellarAgentContext } from '../../src/provider.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import type { EnterstellarContextValue } from '../../src/types.js';
import type { ZoneTrace } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Mock Store
// ---------------------------------------------------------------------------

function createMockStore(traces: readonly ZoneTrace[]) {
    const data: Record<string, unknown> = { traces };
    const subscribers = new Set<() => void>();

    return {
        get: vi.fn(<T = unknown>(key: string): T | undefined => data[key] as T | undefined),
        set: vi.fn(),
        subscribe: vi.fn((cb: () => void): (() => void) => {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
        }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(),
        destroy: vi.fn(),
    };
}

/** Creates a minimal mock trace for a given zone. */
function makeTrace(zone: string, id: string): ZoneTrace {
    return {
        id: `${zone}-${id}`,
        intent: {
            raw: 'TestComponent',
            component: 'TestComponent',
            confidence: 0.9,
        },
        compilation: {
            status: 'pass',
        },
        metrics: {
            totalMs: 42,
        },
        timestamp: new Date().toISOString(),
    } as unknown as ZoneTrace;
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

describe('useEnterstellarTrace()', () => {
    beforeEach(() => {
        rendererRegistry.clear();
    });

    it('throws when used outside Provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => {
            renderHook(() => useEnterstellarTrace('test-zone'));
        }).toThrow(
            'useEnterstellarTrace() must be used within an <Provider>.',
        );

        spy.mockRestore();
    });

    it('returns null when no traces exist', () => {
        const store = createMockStore([]);

        const { result } = renderHook(() => useEnterstellarTrace('test-zone'), {
            wrapper: createWrapper(store),
        });

        expect(result.current).toBeNull();
    });

    it('returns null when no traces match the zone', () => {
        const store = createMockStore([
            makeTrace('other-zone', 'trace-1'),
            makeTrace('another-zone', 'trace-2'),
        ]);

        const { result } = renderHook(() => useEnterstellarTrace('test-zone'), {
            wrapper: createWrapper(store),
        });

        expect(result.current).toBeNull();
    });

    it('returns the latest trace for the specified zone', () => {
        const traces = [
            makeTrace('test-zone', 'trace-old'),
            makeTrace('test-zone', 'trace-new'),
        ];
        const store = createMockStore(traces);

        const { result } = renderHook(() => useEnterstellarTrace('test-zone'), {
            wrapper: createWrapper(store),
        });

        // Returns the most recent (last) trace for this zone
        expect(result.current).not.toBeNull();
        expect(result.current?.id).toBe('test-zone-trace-new');
    });

    it('returns correct trace when multiple zones have traces', () => {
        const traces = [
            makeTrace('zone-a', 'trace-a1'),
            makeTrace('zone-b', 'trace-b1'),
            makeTrace('zone-a', 'trace-a2'),
            makeTrace('zone-b', 'trace-b2'),
        ];
        const store = createMockStore(traces);

        const { result: resultA } = renderHook(() => useEnterstellarTrace('zone-a'), {
            wrapper: createWrapper(store),
        });
        const { result: resultB } = renderHook(() => useEnterstellarTrace('zone-b'), {
            wrapper: createWrapper(store),
        });

        expect(resultA.current?.id).toBe('zone-a-trace-a2');
        expect(resultB.current?.id).toBe('zone-b-trace-b2');
    });

    it('returns single trace when only one exists for zone', () => {
        const store = createMockStore([
            makeTrace('test-zone', 'only-trace'),
        ]);

        const { result } = renderHook(() => useEnterstellarTrace('test-zone'), {
            wrapper: createWrapper(store),
        });

        expect(result.current?.id).toBe('test-zone-only-trace');
    });
});
