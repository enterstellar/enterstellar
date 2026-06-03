/**
 * @module @enterstellar-ai/react/__tests__/hooks/use-enterstellar-adapters.test
 * @description Unit tests for `useEnterstellarAdapters()`.
 *
 * Covers:
 * - Throws when used outside `<Provider>` (RE5).
 * - Returns empty adapters object by default (AD1).
 * - Returns adapters instance when provided via context.
 * - Returns the same reference as `useEnterstellar().adapters`.
 *
 * @see Design Choice AD1 — adapters in context.
 * @see Design Choice RE5 — throws outside provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useEnterstellarAdapters } from '../../src/hooks/use-adapters.js';
import { useEnterstellar } from '../../src/hooks/use-enterstellar.js';
import { EnterstellarContext, EnterstellarAgentContext } from '../../src/provider.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import type { EnterstellarContextValue } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock `EnterstellarContextValue` for testing.
 * Matches the pattern established in `use-enterstellar-context.test.tsx`.
 */
function mockEnterstellarContext(
    adaptersOverride?: EnterstellarContextValue['adapters'],
): EnterstellarContextValue {
    return {
        registry: {
            get: vi.fn(() => undefined),
            list: vi.fn(() => []),
            register: vi.fn(),
            unregister: vi.fn(() => false),
            getManifest: vi.fn(() => []),
            getSchema: vi.fn(() => undefined),
            getDesignTokens: vi.fn(),
            validate: vi.fn(() => ({ valid: true, violations: [] })),
            publish: vi.fn(),
            on: vi.fn(() => () => { }),
            size: 0,
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        compiler: {
            compile: vi.fn(async () => ({
                status: 'pass',
                componentName: 'Test',
                props: {},
                errors: [],
                selfCorrectionAttempts: 0,
            })),
            lint: vi.fn(async () => []),
            use: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        store: {
            get: vi.fn(() => undefined),
            set: vi.fn(),
            subscribe: vi.fn(() => () => { }),
            extend: vi.fn(),
            hasExtension: vi.fn(() => false),
            snapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: {} })),
            restore: vi.fn(),
            registerMigration: vi.fn(),
            getSnapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: {} })),
            destroy: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        telemetry: {
            record: vi.fn(),
            flush: vi.fn(),
            getStats: vi.fn(),
            dispose: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        rendererRegistry,
        cache: null,
        adapters: adaptersOverride ?? {},
    };
}

/**
 * Creates a test wrapper component that provides the Enterstellar context.
 */
function createWrapper(
    context: EnterstellarContextValue,
): ({ children }: { children: ReactNode }) => React.JSX.Element {
    return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
        return (
            <EnterstellarContext.Provider value={context}>
                <EnterstellarAgentContext.Provider value={{ connection: null }}>
                    {children}
                </EnterstellarAgentContext.Provider>
            </EnterstellarContext.Provider>
        );
    };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
    rendererRegistry.clear();
});

afterEach(() => {
    cleanup();
    rendererRegistry.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnterstellarAdapters()', () => {
    it('throws when used outside Provider (RE5)', () => {
        // Suppress console.error from React renderHook
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => {
            renderHook(() => useEnterstellarAdapters());
        }).toThrow();

        spy.mockRestore();
    });

    it('returns empty adapters object by default (AD1)', () => {
        const ctx = mockEnterstellarContext();

        const { result } = renderHook(() => useEnterstellarAdapters(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current).toBeDefined();
        expect(typeof result.current).toBe('object');
        expect(Object.keys(result.current).length).toBe(0);
    });

    it('returns adapters instance when provided via context', () => {
        const mockErrorAdapter = {
            shouldRetry: vi.fn(),
            sanitize: vi.fn(),
            report: vi.fn(),
        };
        const adapters = { error: mockErrorAdapter } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const ctx = mockEnterstellarContext(adapters);

        const { result } = renderHook(() => useEnterstellarAdapters(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current).toBe(adapters);
        expect(result.current.error).toBe(mockErrorAdapter);
    });

    it('returns the same reference as useEnterstellar().adapters', () => {
        const adapters = {
            error: { shouldRetry: vi.fn(), sanitize: vi.fn(), report: vi.fn() },
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const ctx = mockEnterstellarContext(adapters);

        // Render both hooks with the same context
        const { result: adaptersResult } = renderHook(() => useEnterstellarAdapters(), {
            wrapper: createWrapper(ctx),
        });
        const { result: contextResult } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        // They should reference the same object
        expect(adaptersResult.current).toBe(contextResult.current.adapters);
    });

    it('returns adapters with data adapter when provided', () => {
        const mockDataAdapter = {
            fetch: vi.fn(),
            subscribe: vi.fn(),
        };
        const adapters = { data: mockDataAdapter } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const ctx = mockEnterstellarContext(adapters);

        const { result } = renderHook(() => useEnterstellarAdapters(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current.data).toBe(mockDataAdapter);
    });
});
