/**
 * @module @enterstellar-ai/react/__tests__/hooks/use-spatial-context.test
 * @description Unit tests for `useSpatialContext()`.
 *
 * Covers:
 * - Returns initial state (zeros, not visible).
 * - `captureContext()` returns a frozen snapshot.
 * - Snapshot includes zone name and `capturedAt` timestamp.
 * - ResizeObserver updates width/height.
 * - IntersectionObserver updates visibility.
 * - Gracefully handles null refs.
 *
 * Note: `ResizeObserver` and `IntersectionObserver` are polyfilled in
 * jsdom or mocked here. Focus tracking tested separately.
 *
 * @see Design Choice RE12 — ResizeObserver + IntersectionObserver, no mousemove
 * @see Appendix E P13 — passive default, active on demand
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSpatialContext } from '../../src/hooks/use-spatial-context.js';

// ---------------------------------------------------------------------------
// Mock Observer APIs (jsdom doesn't provide these)
// ---------------------------------------------------------------------------

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;
type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

let resizeObserverCallback: ResizeCallback | null = null;
let intersectionObserverCallback: IntersectionCallback | null = null;
let observedResizeElements: Element[] = [];
let observedIntersectionElements: Element[] = [];

class MockResizeObserver {
    constructor(callback: ResizeCallback) {
        resizeObserverCallback = callback;
    }
    observe = vi.fn((el: Element) => { observedResizeElements.push(el); });
    unobserve = vi.fn();
    disconnect = vi.fn(() => { observedResizeElements = []; });
}

class MockIntersectionObserver {
    constructor(callback: IntersectionCallback) {
        intersectionObserverCallback = callback;
    }
    observe = vi.fn((el: Element) => { observedIntersectionElements.push(el); });
    unobserve = vi.fn();
    disconnect = vi.fn(() => { observedIntersectionElements = []; });
}

// ---------------------------------------------------------------------------
// Setup/Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    resizeObserverCallback = null;
    intersectionObserverCallback = null;
    observedResizeElements = [];
    observedIntersectionElements = [];

    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSpatialContext()', () => {
    // -----------------------------------------------------------------------
    // Initial State
    // -----------------------------------------------------------------------

    it('returns initial state with zeros and not visible', () => {
        const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

        const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

        expect(result.current.zone).toBe('test-zone');
        expect(result.current.width).toBe(0);
        expect(result.current.height).toBe(0);
        expect(result.current.isVisible).toBe(false);
        expect(result.current.focusedElement).toBeUndefined();
    });

    it('returns zone name in the spatial context', () => {
        const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

        const { result } = renderHook(() => useSpatialContext('sidebar', mockRef));

        expect(result.current.zone).toBe('sidebar');
    });

    // -----------------------------------------------------------------------
    // captureContext() — Active Mode (P13)
    // -----------------------------------------------------------------------

    describe('captureContext()', () => {
        it('returns a frozen SpatialContextSnapshot', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            const snapshot = result.current.captureContext();

            expect(Object.isFrozen(snapshot)).toBe(true);
        });

        it('includes zone name in snapshot', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('header-zone', mockRef));

            const snapshot = result.current.captureContext();

            expect(snapshot.zone).toBe('header-zone');
        });

        it('includes capturedAt ISO timestamp', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            const before = new Date().toISOString();
            const snapshot = result.current.captureContext();
            const after = new Date().toISOString();

            expect(snapshot.capturedAt).toBeDefined();
            expect(snapshot.capturedAt >= before).toBe(true);
            expect(snapshot.capturedAt <= after).toBe(true);
        });

        it('captures current dimensions in snapshot', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            // Simulate ResizeObserver callback
            act(() => {
                resizeObserverCallback?.([
                    { contentRect: { width: 400, height: 300 } } as unknown as ResizeObserverEntry,
                ]);
            });

            const snapshot = result.current.captureContext();
            expect(snapshot.width).toBe(400);
            expect(snapshot.height).toBe(300);
        });
    });

    // -----------------------------------------------------------------------
    // ResizeObserver
    // -----------------------------------------------------------------------

    describe('ResizeObserver integration', () => {
        it('updates width and height from ResizeObserver', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            act(() => {
                resizeObserverCallback?.([
                    { contentRect: { width: 800, height: 600 } } as unknown as ResizeObserverEntry,
                ]);
            });

            expect(result.current.width).toBe(800);
            expect(result.current.height).toBe(600);
        });

        it('rounds dimensions to integers', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            act(() => {
                resizeObserverCallback?.([
                    { contentRect: { width: 399.7, height: 200.3 } } as unknown as ResizeObserverEntry,
                ]);
            });

            expect(result.current.width).toBe(400);
            expect(result.current.height).toBe(200);
        });
    });

    // -----------------------------------------------------------------------
    // IntersectionObserver
    // -----------------------------------------------------------------------

    describe('IntersectionObserver integration', () => {
        it('updates isVisible from IntersectionObserver', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            act(() => {
                intersectionObserverCallback?.([
                    { isIntersecting: true } as unknown as IntersectionObserverEntry,
                ]);
            });

            expect(result.current.isVisible).toBe(true);
        });

        it('sets isVisible to false when element leaves viewport', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', mockRef));

            // Enter viewport
            act(() => {
                intersectionObserverCallback?.([
                    { isIntersecting: true } as unknown as IntersectionObserverEntry,
                ]);
            });
            expect(result.current.isVisible).toBe(true);

            // Leave viewport
            act(() => {
                intersectionObserverCallback?.([
                    { isIntersecting: false } as unknown as IntersectionObserverEntry,
                ]);
            });
            expect(result.current.isVisible).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Null Ref Handling
    // -----------------------------------------------------------------------

    describe('null ref handling', () => {
        it('handles null ref gracefully', () => {
            const nullRef = { current: null } as React.RefObject<HTMLDivElement | null>;

            const { result } = renderHook(() => useSpatialContext('test-zone', nullRef));

            expect(result.current.zone).toBe('test-zone');
            expect(result.current.width).toBe(0);
            expect(result.current.height).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // captureContext() function stability
    // -----------------------------------------------------------------------

    describe('function stability', () => {
        it('captureContext is a stable function reference', () => {
            const mockRef = { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>;

            const { result, rerender } = renderHook(() => useSpatialContext('test-zone', mockRef));

            const firstCapture = result.current.captureContext;
            rerender();
            const secondCapture = result.current.captureContext;

            expect(firstCapture).toBe(secondCapture);
        });
    });
});
